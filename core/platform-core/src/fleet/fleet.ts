/**
 * Fleet — the composite implementation of IFleet.
 *
 * Holds N NodeFleets (per-node leaves) and presents the same IFleet interface
 * for cluster-wide operations. Composite pattern (GoF): callers see one fleet,
 * never write `for (const node of nodes)` loops.
 *
 * Single-target ops (create, remove, inspect, logs, claimWarm) resolve a node:
 * - create with `opts.nodeId` → that node directly
 * - create without nodeId → placement strategy picks
 * - remove/inspect/logs → IInstanceLocator looks up the owning node
 * - claimWarm → placement strategy orders nodes by preference, first hit wins
 *
 * All-target ops (replenishWarmPool, cleanupWarmPool, registerPoolSpec) fan
 * out to every connected node. Disconnected nodes are skipped — the next tick
 * picks them up when they reconnect.
 *
 * Owns the spec registry and the replenish/cleanup ticker.
 */

import { logger } from "../config/logger.js";
import type { ContainerPlacementStrategy, PlacementContext } from "./container-placement.js";
import type { CreateOptions, IFleet, IInstanceLocator, INodeFleet, PoolClaim, PoolSpec } from "./i-fleet.js";
import type { Instance } from "./instance.js";
import type { BotProfile, BotStatus } from "./types.js";

/**
 * Connection-aware view of the cluster. Implementations:
 * - NodeRegistry (already exists, knows about all NodeFleets)
 * - Test doubles (in-memory list)
 *
 * Keeping this small lets the Fleet composite stay decoupled from
 * NodeConnectionManager / NodeRegistry implementation details.
 */
export interface IFleetMembership {
  /** All NodeFleets currently registered. */
  list(): INodeFleet[];
  /** Whether a node has a live WebSocket connection to its agent. */
  isConnected(nodeId: string): boolean;
  /** Containers tracked per node (for placement decisions). */
  getContainerCounts(): Promise<Map<string, number>>;
  /** Per-node runtime metrics (memory, last heartbeat, status). */
  getNodeMetrics(): Promise<Map<string, { capacityMb: number; usedMb: number; status: string }>>;
}

export interface FleetOptions {
  /** Cleanup + replenish interval in ms. Default: 60_000. */
  replenishIntervalMs?: number;
}

export class Fleet implements IFleet {
  private readonly specs = new Map<string, PoolSpec>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly membership: IFleetMembership,
    private readonly locator: IInstanceLocator,
    private readonly placement: ContainerPlacementStrategy,
    private readonly options: FleetOptions = {},
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle (composite ticker)
  // ---------------------------------------------------------------------------

  async start(): Promise<{ stop: () => void }> {
    await this.tick();
    const intervalMs = this.options.replenishIntervalMs ?? 60_000;
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        logger.error("Fleet tick failed", { error: err instanceof Error ? err.message : String(err) });
      });
    }, intervalMs);
    logger.info("Fleet started", { nodeCount: this.membership.list().length, intervalMs });
    return { stop: () => this.stop() };
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    await this.cleanupWarmPool();
    await this.replenishWarmPool();
  }

  // ---------------------------------------------------------------------------
  // FleetView
  // ---------------------------------------------------------------------------

  nodeIds(): string[] {
    return this.membership.list().map((n) => n.nodeId);
  }

  connectedNodeIds(): string[] {
    return this.membership
      .list()
      .map((n) => n.nodeId)
      .filter((id) => this.membership.isConnected(id));
  }

  /** Connected leaves only — most operations should iterate this, not list(). */
  private connectedLeaves(): INodeFleet[] {
    return this.membership.list().filter((n) => this.membership.isConnected(n.nodeId));
  }

  // ---------------------------------------------------------------------------
  // Instance lifecycle (single-target dispatch)
  // ---------------------------------------------------------------------------

  async create(profile: Omit<BotProfile, "id"> & { id?: string }, opts?: CreateOptions): Promise<Instance> {
    const node = opts?.nodeId ? this.byId(opts.nodeId) : await this.pickNodeForCreate(profile);
    return node.create(profile);
  }

  async remove(id: string, removeVolumes?: boolean): Promise<void> {
    const node = await this.resolveOwner(id);
    return node.remove(id, removeVolumes);
  }

  async getInstance(id: string): Promise<Instance> {
    const node = await this.resolveOwner(id);
    return node.getInstance(id);
  }

  async status(id: string): Promise<BotStatus> {
    const node = await this.resolveOwner(id);
    return node.status(id);
  }

  async logs(id: string, opts?: { tail?: number }): Promise<string> {
    const node = await this.resolveOwner(id);
    return node.logs(id, opts);
  }

  // ---------------------------------------------------------------------------
  // Warm pool (composite — fan-out + spec registry)
  // ---------------------------------------------------------------------------

  registerPoolSpec(slug: string, spec: PoolSpec): void {
    this.specs.set(slug, { ...spec });
    // Push to every leaf so newly-replenished containers use the right config.
    for (const node of this.membership.list()) {
      node.registerPoolSpec(slug, spec);
    }
    logger.info(`Fleet: registered pool spec "${slug}"`, { image: spec.image, sizePerNode: spec.sizePerNode });
  }

  async unregisterPoolSpec(slug: string): Promise<void> {
    this.specs.delete(slug);
    await Promise.all(
      this.connectedLeaves().map((n) =>
        n.unregisterPoolSpec(slug).catch((err) => {
          logger.warn(`Fleet: unregisterPoolSpec on ${n.nodeId} failed`, {
            slug,
            err: err instanceof Error ? err.message : String(err),
          });
        }),
      ),
    );
  }

  poolSpecKeys(): string[] {
    return [...this.specs.keys()];
  }

  /** Return the spec for a slug, or undefined. Used by admin endpoints. */
  getPoolSpec(slug: string): PoolSpec | undefined {
    const spec = this.specs.get(slug);
    return spec ? { ...spec } : undefined;
  }

  /**
   * Update the per-node target size for a registered pool spec. Convergence
   * happens on the next tick — leaves create or drain warm containers as needed.
   */
  resizePool(slug: string, sizePerNode: number): void {
    const spec = this.specs.get(slug);
    if (!spec) throw new Error(`Fleet: pool spec "${slug}" is not registered`);
    spec.sizePerNode = sizePerNode;
    // Re-push the updated spec to every leaf so per-node replenish targets the new size.
    for (const node of this.membership.list()) {
      node.registerPoolSpec(slug, spec);
    }
    logger.info(`Fleet: resized pool "${slug}" → sizePerNode=${sizePerNode}`);
  }

  /**
   * Claim a warm container. Picks the most-preferred node that has one.
   * Order is determined by placement strategy + warm-count bias — nodes with
   * existing warm containers for this slug are preferred.
   */
  async claimWarm(slug: string, opts?: { nodeId?: string }): Promise<PoolClaim | null> {
    if (opts?.nodeId) {
      return this.byId(opts.nodeId).claimWarm(slug);
    }

    // Iterate connected nodes in order of placement preference. The placement
    // strategy already considers warm-count as a tiebreaker, so the first node
    // it returns is the right one to claim from.
    const ordered = await this.orderedNodesForClaim(slug);
    for (const node of ordered) {
      const claim = await node.claimWarm(slug);
      if (claim) return claim;
    }
    return null;
  }

  async replenishWarmPool(): Promise<void> {
    const leaves = this.connectedLeaves();
    if (leaves.length === 0) return;
    await Promise.all(
      leaves.map((n) =>
        n.replenishWarmPool().catch((err) => {
          logger.warn(`Fleet: replenishWarmPool on ${n.nodeId} failed`, {
            err: err instanceof Error ? err.message : String(err),
          });
        }),
      ),
    );
  }

  async cleanupWarmPool(): Promise<void> {
    const leaves = this.connectedLeaves();
    if (leaves.length === 0) return;
    await Promise.all(
      leaves.map((n) =>
        n.cleanupWarmPool().catch((err) => {
          logger.warn(`Fleet: cleanupWarmPool on ${n.nodeId} failed`, {
            err: err instanceof Error ? err.message : String(err),
          });
        }),
      ),
    );
  }

  async warmCount(slug: string): Promise<number> {
    const counts = await this.warmCountByNode(slug);
    let total = 0;
    for (const c of counts.values()) total += c;
    return total;
  }

  async warmCountByNode(slug: string): Promise<Map<string, number>> {
    // Any leaf can answer this — they all share the same DB. Pick the first
    // connected node and ask it for the full breakdown.
    const leaves = this.connectedLeaves();
    if (leaves.length === 0) return new Map();
    return leaves[0].warmCountByNode(slug);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private byId(nodeId: string): INodeFleet {
    const node = this.membership.list().find((n) => n.nodeId === nodeId);
    if (!node) throw new Error(`Fleet: unknown node ${nodeId}`);
    return node;
  }

  private async resolveOwner(instanceId: string): Promise<INodeFleet> {
    const nodeId = await this.locator.findNodeFor(instanceId);
    if (!nodeId) {
      throw new Error(`Fleet: no owning node for instance ${instanceId}`);
    }
    return this.byId(nodeId);
  }

  /** Run placement to pick a node for a new instance. */
  private async pickNodeForCreate(profile: Omit<BotProfile, "id"> & { id?: string }): Promise<INodeFleet> {
    const ctx = await this.buildPlacementContext(profile);
    // The current placement strategy expects NodeEntry objects from NodeRegistry.
    // We adapt by passing the leaves themselves — they implement INodeFleet which
    // exposes nodeId, and the strategy only reads nodeId + the context maps.
    const candidates = this.connectedLeaves();
    if (candidates.length === 0) {
      throw new Error("Fleet: no connected nodes available for placement");
    }
    // Adapter to match the placement strategy's NodeEntry shape.
    const nodeEntries = candidates.map((n) => ({
      config: { id: n.nodeId, name: n.nodeId },
      fleet: n,
    }));
    const selected = this.placement.selectNode(nodeEntries as never, ctx);
    return (selected as { fleet: INodeFleet }).fleet;
  }

  /** Order connected nodes by claim preference for a given slug. */
  private async orderedNodesForClaim(slug: string): Promise<INodeFleet[]> {
    const candidates = this.connectedLeaves();
    if (candidates.length <= 1) return candidates;
    const counts = await this.warmCountByNode(slug);
    // Prefer nodes with at least one warm container; among those, prefer the
    // ones with more warm (load balancing). Among ties, fall through to
    // placement order (which already considers locality + capacity).
    return [...candidates].sort((a, b) => {
      const ca = counts.get(a.nodeId) ?? 0;
      const cb = counts.get(b.nodeId) ?? 0;
      if (ca !== cb) return cb - ca;
      return 0;
    });
  }

  private async buildPlacementContext(profile: Omit<BotProfile, "id"> & { id?: string }): Promise<PlacementContext> {
    const containerCounts = await this.membership.getContainerCounts();
    const nodeMetrics = await this.membership.getNodeMetrics();
    const warmContainersByNode = profile.productSlug ? await this.warmCountByNode(profile.productSlug) : undefined;
    return {
      containerCounts,
      nodeMetrics: nodeMetrics as never,
      warmContainersByNode,
      tenantId: profile.tenantId,
      tenantNodes: undefined,
    };
  }
}
