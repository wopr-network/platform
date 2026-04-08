/**
 * Container placement strategies — decide which node receives new containers.
 *
 * Strategies are stateless functions that pick from available nodes based
 * on current load, memory, and health signals.
 */

import { logger } from "../config/logger.js";
import type { NodeEntry } from "./node-registry.js";

/** Runtime node metrics from the DB (heartbeat data). */
export interface NodeMetrics {
  /** Total memory capacity in MB (0 = unknown). */
  capacityMb: number;
  /** Currently used memory in MB. */
  usedMb: number;
  /** Unix timestamp of last heartbeat (null = never). */
  lastHeartbeatAt: number | null;
  /** Current node status. */
  status: string;
}

/** Placement context passed to strategies. */
export interface PlacementContext {
  /** Container counts per node (from bot_instances). */
  containerCounts: Map<string, number>;
  /** Runtime metrics per node (from nodes table). */
  nodeMetrics: Map<string, NodeMetrics>;
  /** Tenant ID for the new container (for locality preference). */
  tenantId?: string;
  /** Existing tenant node assignments (for locality preference). */
  tenantNodes?: Set<string>;
}

export interface ContainerPlacementStrategy {
  /** Select a node for a new container. Throws if no node is available. */
  selectNode(nodes: NodeEntry[], context: PlacementContext): NodeEntry;
}

/** Minimum placement score — nodes below this are considered full. */
const MIN_SCORE = 0.1;

/** Heartbeat staleness threshold (60 seconds). */
const HEARTBEAT_FRESH_MS = 60_000;

/**
 * Weighted scoring placement strategy.
 *
 * Combines memory, slot, and health signals into a single score per node.
 * Prefers nodes where the tenant already has containers (data locality).
 *
 * score = (freeMemoryPct * 0.5) + (freeSlotsPct * 0.3) + (healthBonus * 0.2)
 */
export class WeightedScoringStrategy implements ContainerPlacementStrategy {
  selectNode(nodes: NodeEntry[], context: PlacementContext): NodeEntry {
    const { containerCounts, nodeMetrics, tenantNodes } = context;
    let best: NodeEntry | null = null;
    let bestScore = -1;

    for (const node of nodes) {
      const nodeId = node.config.id;
      const count = containerCounts.get(nodeId) ?? 0;
      const max = node.config.maxContainers ?? 0;

      // Hard cap: skip nodes at capacity (0 = unlimited)
      if (max > 0 && count >= max) continue;

      const metrics = nodeMetrics.get(nodeId);

      // Memory score (0-1): percentage of memory still free
      let memoryScore = 1.0;
      if (metrics && metrics.capacityMb > 0) {
        memoryScore = Math.max(0, (metrics.capacityMb - metrics.usedMb) / metrics.capacityMb);
      }

      // Slot score (0-1): percentage of container slots still free
      let slotScore = 1.0;
      if (max > 0) {
        slotScore = Math.max(0, (max - count) / max);
      }

      // Health score (0-1): based on status + heartbeat freshness
      let healthScore = 0;
      if (metrics) {
        const isActive = metrics.status === "active";
        const isFresh = metrics.lastHeartbeatAt && Date.now() - metrics.lastHeartbeatAt * 1000 < HEARTBEAT_FRESH_MS;
        if (isActive && isFresh) healthScore = 1.0;
        else if (isActive) healthScore = 0.5;
        // unhealthy/draining/offline = 0
      } else {
        // No metrics = local node (always healthy)
        healthScore = 1.0;
      }

      const score = memoryScore * 0.5 + slotScore * 0.3 + healthScore * 0.2;

      // Locality bonus: prefer nodes where tenant already has containers
      const localityBonus = tenantNodes?.has(nodeId) ? 0.05 : 0;

      const finalScore = score + localityBonus;

      logger.debug("Placement score", { nodeId, memoryScore, slotScore, healthScore, localityBonus, finalScore });

      if (finalScore > bestScore) {
        best = node;
        bestScore = finalScore;
      }
    }

    if (!best || bestScore < MIN_SCORE) {
      throw new Error(`No available nodes: all nodes at capacity or unhealthy (best score: ${bestScore.toFixed(2)})`);
    }

    logger.info("Placement selected", { nodeId: best.config.id, score: bestScore.toFixed(2) });
    return best;
  }
}

/**
 * Least-loaded placement: pick the node with the fewest containers.
 * Respects maxContainers limits. Ties broken by registration order.
 * Ignores memory and health signals — use WeightedScoringStrategy instead.
 */
export class LeastLoadedStrategy implements ContainerPlacementStrategy {
  selectNode(nodes: NodeEntry[], context: PlacementContext): NodeEntry {
    const { containerCounts } = context;
    let best: NodeEntry | null = null;
    let bestCount = Number.POSITIVE_INFINITY;

    for (const node of nodes) {
      const count = containerCounts.get(node.config.id) ?? 0;
      const max = node.config.maxContainers ?? 0;
      if (max > 0 && count >= max) continue;
      if (count < bestCount) {
        best = node;
        bestCount = count;
      }
    }

    if (!best) {
      throw new Error("No available nodes: all nodes are at capacity");
    }
    return best;
  }
}

/**
 * Round-robin placement: distribute containers evenly across nodes.
 * Respects maxContainers limits. Stateful — tracks last-used index.
 */
export class RoundRobinStrategy implements ContainerPlacementStrategy {
  private lastIndex = -1;

  selectNode(nodes: NodeEntry[], context: PlacementContext): NodeEntry {
    const { containerCounts } = context;
    const available = nodes.filter((node) => {
      const count = containerCounts.get(node.config.id) ?? 0;
      const max = node.config.maxContainers ?? 0;
      return max === 0 || count < max;
    });

    if (available.length === 0) {
      throw new Error("No available nodes: all nodes are at capacity");
    }

    this.lastIndex = (this.lastIndex + 1) % available.length;
    return available[this.lastIndex];
  }
}

/** Create a container placement strategy by name. */
export function createContainerPlacementStrategy(name: string): ContainerPlacementStrategy {
  switch (name) {
    case "round-robin":
      return new RoundRobinStrategy();
    case "least-loaded":
      return new LeastLoadedStrategy();
    default:
      return new WeightedScoringStrategy();
  }
}
