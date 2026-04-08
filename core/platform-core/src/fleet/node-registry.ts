/**
 * Node registry — tracks Docker hosts available for container placement.
 *
 * Each node has its own Dockerode connection and FleetManager instance.
 * The registry tracks which containers live on which nodes to route
 * lifecycle operations (start/stop/remove) to the correct host.
 *
 * Single-node deployments use a single "local" node (backwards compatible).
 */

import Docker from "dockerode";
import { logger } from "../config/logger.js";
import type { DrizzleDb } from "../db/index.js";
import { nodes } from "../db/schema/nodes.js";
import type { IBotInstanceRepository } from "./bot-instance-repository.js";
import type { NodeMetrics } from "./container-placement.js";
import { FleetManager } from "./fleet-manager.js";
import type { INodeRepository } from "./node-repository.js";
import type { IProfileStore } from "./profile-store.js";

export interface NodeConfig {
  /** Unique node identifier. */
  id: string;
  /** Human-readable name. */
  name: string;
  /**
   * Hostname or IP used to reach containers on this node.
   * For local nodes, container names are used instead (Docker DNS).
   * For remote nodes, this is the address the proxy routes traffic to.
   */
  host: string;
  /**
   * Docker API URL. Omit for local socket (/var/run/docker.sock).
   * For remote: "tcp://host:2376" or "ssh://user@host".
   */
  dockerUrl?: string;
  /** Maximum containers this node should host. 0 = unlimited. */
  maxContainers?: number;
  /**
   * Whether this node uses Docker DNS for container routing.
   * When true, upstream host = container name (e.g., "wopr-alice").
   * When false, upstream host = node.host (requires published ports or overlay network).
   * Defaults to true for the local node, false for remote nodes.
   */
  useContainerNames?: boolean;
}

export interface NodeEntry {
  config: NodeConfig;
  docker: Docker;
  fleet: FleetManager;
}

/** Sentinel node ID for the default local Docker host. */
export const LOCAL_NODE_ID = "local";

export class NodeRegistry {
  private nodes = new Map<string, NodeEntry>();
  private botInstanceRepo: IBotInstanceRepository | null = null;
  private nodeRepo: INodeRepository | null = null;

  /** Inject repositories for DB-backed queries. */
  setRepos(botInstanceRepo: IBotInstanceRepository, nodeRepo: INodeRepository): void {
    this.botInstanceRepo = botInstanceRepo;
    this.nodeRepo = nodeRepo;
  }

  /**
   * Register a Docker host node.
   * Creates a Dockerode instance and FleetManager for the node.
   */
  register(config: NodeConfig, store: IProfileStore): void {
    if (this.nodes.has(config.id)) {
      throw new Error(`Node already registered: ${config.id}`);
    }

    const docker = config.dockerUrl
      ? new Docker({ host: new URL(config.dockerUrl).hostname, port: Number(new URL(config.dockerUrl).port) || 2376 })
      : new Docker();

    const fleet = new FleetManager(
      docker,
      store,
      undefined, // no platformDiscovery
      undefined, // no networkPolicy
      undefined, // no proxyManager — routes managed separately
      undefined, // no commandBus
      undefined, // no instanceRepo
    );

    this.nodes.set(config.id, { config, docker, fleet });
    logger.info(`Registered node: ${config.name} (${config.id})`, {
      host: config.host,
      dockerUrl: config.dockerUrl ?? "local socket",
      maxContainers: config.maxContainers ?? "unlimited",
    });
  }

  /** Unregister a node. Fails if containers are still assigned to it. */
  async unregister(nodeId: string): Promise<void> {
    if (this.botInstanceRepo) {
      const assigned = await this.botInstanceRepo.listByNode(nodeId);
      if (assigned.length > 0) {
        throw new Error(`Cannot unregister node ${nodeId}: ${assigned.length} containers still assigned`);
      }
    }
    this.nodes.delete(nodeId);
  }

  /** List all registered nodes. */
  list(): NodeEntry[] {
    return Array.from(this.nodes.values());
  }

  /** Get a specific node. */
  get(nodeId: string): NodeEntry | undefined {
    return this.nodes.get(nodeId);
  }

  /** Get Docker client for a node. */
  getDocker(nodeId: string): Docker {
    const entry = this.nodes.get(nodeId);
    if (!entry) throw new Error(`Unknown node: ${nodeId}`);
    return entry.docker;
  }

  /** Get FleetManager for a node. */
  getFleetManager(nodeId: string): FleetManager {
    const entry = this.nodes.get(nodeId);
    if (!entry) throw new Error(`Unknown node: ${nodeId}`);
    return entry.fleet;
  }

  /**
   * Get container counts per node (for placement decisions).
   * Queries the DB — no in-memory cache.
   */
  async getContainerCounts(): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    // Initialize all nodes with 0
    for (const nodeId of this.nodes.keys()) {
      counts.set(nodeId, 0);
    }
    if (!this.botInstanceRepo) return counts;
    // Count from DB
    for (const nodeId of this.nodes.keys()) {
      const instances = await this.botInstanceRepo.listByNode(nodeId);
      counts.set(nodeId, instances.length);
    }
    return counts;
  }

  /**
   * Get runtime metrics for all nodes (for placement decisions).
   * Queries the nodes table via INodeRepository.
   */
  async getNodeMetrics(): Promise<Map<string, NodeMetrics>> {
    const metrics = new Map<string, NodeMetrics>();
    if (!this.nodeRepo) return metrics;
    const allNodes = await this.nodeRepo.list();
    for (const node of allNodes) {
      metrics.set(node.id, {
        capacityMb: node.capacityMb,
        usedMb: node.usedMb,
        lastHeartbeatAt: node.lastHeartbeatAt,
        status: node.status,
      });
    }
    return metrics;
  }

  /** Whether the registry has more than one node. */
  get isMultiNode(): boolean {
    return this.nodes.size > 1;
  }

  /** Number of registered nodes. */
  get size(): number {
    return this.nodes.size;
  }

  /**
   * Resolve the upstream host for a container given its node assignment.
   *
   * Local/overlay nodes use the container name (Docker DNS).
   * Remote nodes use the node's host address.
   * If nodeId is null/unknown, falls back to container name (safe for local).
   */
  resolveUpstreamHost(nodeId: string | null, containerName: string): string {
    if (!nodeId) return containerName;

    const entry = this.nodes.get(nodeId);
    if (!entry) return containerName;

    const useContainerNames = entry.config.useContainerNames ?? nodeId === LOCAL_NODE_ID;
    return useContainerNames ? containerName : entry.config.host;
  }

  /**
   * Load fleet nodes from the `nodes` DB table and register each one.
   *
   * If the table is empty, inserts a default "local" row (localhost,
   * local Docker socket) so day-1 single-box deployments just work.
   *
   * This is the ONLY way nodes get registered — no in-memory fallbacks.
   */
  async loadFromDb(db: DrizzleDb, store: IProfileStore): Promise<void> {
    const rows = await db.select().from(nodes);

    // Day 1: no rows yet — seed the local node
    if (rows.length === 0) {
      const now = Math.floor(Date.now() / 1000);
      await db.insert(nodes).values({
        id: LOCAL_NODE_ID,
        host: "localhost",
        status: "active",
        capacityMb: 0,
        registeredAt: now,
        updatedAt: now,
      });
      // biome-ignore lint/suspicious/noExplicitAny: partial row for in-memory seed — only id/host/dockerUrl used downstream
      rows.push({ id: LOCAL_NODE_ID, host: "localhost", status: "active", dockerUrl: null } as any);
      logger.info("Seeded default local fleet node in DB");
    }

    for (const row of rows) {
      if (row.status === "offline" || row.status === "failed") continue;
      try {
        this.register(
          {
            id: row.id,
            name: row.label ?? row.id,
            host: row.host,
            dockerUrl: row.dockerUrl ?? undefined,
            maxContainers: row.maxContainers ?? undefined,
            useContainerNames: row.id === LOCAL_NODE_ID ? true : Boolean(row.useContainerNames ?? false),
          },
          store,
        );
      } catch (err) {
        logger.warn(`Failed to register node ${row.id} from DB`, { error: String(err) });
      }
    }
  }

  /**
   * @deprecated Use loadFromDb() instead — nodes come from the DB, not memory.
   * Kept temporarily for test compatibility.
   */
  ensureDefaultNode(store: IProfileStore): void {
    if (this.nodes.size > 0) return;
    this.register({ id: LOCAL_NODE_ID, name: "local", host: "localhost", useContainerNames: true }, store);
  }
}
