/**
 * IFleet — the unified interface for both per-node and aggregate fleet operations.
 *
 * Composite pattern (GoF): a single interface for "one node" and "many nodes",
 * so callers don't write `for (const node of nodes)` loops.
 *
 * - {@link INodeFleet} is the leaf — bound to a single node.
 * - {@link IFleet} is both: it includes everything a leaf does, plus aggregate
 *   ops that fan out across all nodes. The composite implementation in
 *   `fleet.ts` resolves single-target ops by picking a node (via placement or
 *   instance-locator lookup) and delegating.
 *
 * The point of having one interface: every operation has a sensible meaning
 * whether you have one node or many. `inspect(id)` on a leaf reads its local
 * Docker; on the composite it finds the owning node first and then delegates.
 * If a method only makes sense on the leaf (or only on the composite), it
 * doesn't belong here — it belongs on the concrete class.
 */

import type { Instance } from "./instance.js";
import type { BotProfile, BotStatus } from "./types.js";

/** Spec for a warm pool partition. Same shape on every node. */
export interface PoolSpec {
  /** Docker image to pre-warm. */
  image: string;
  /** Port the warm container listens on. */
  port: number;
  /** Docker network to attach warm containers to. */
  network: string;
  /** Target warm container count PER NODE — not global. */
  sizePerNode: number;
}

/** Successful warm-pool claim. */
export interface PoolClaim {
  id: string;
  containerId: string;
}

/** Optional placement hints for create(). */
export interface CreateOptions {
  /** Pin the container to this node. If omitted, the composite uses placement. */
  nodeId?: string;
}

/** Read-only fleet introspection. */
export interface FleetView {
  /** All known node IDs (composite) or just this one (leaf). */
  nodeIds(): string[];
  /** Connected (WS-live) node IDs only. */
  connectedNodeIds(): string[];
}

/**
 * The unified fleet interface.
 *
 * Implementations:
 * - `NodeFleet` (current `FleetManager`) — bound to one node, the leaf.
 * - `Fleet` (the composite) — holds many NodeFleets, fans out or delegates.
 */
export interface IFleet extends FleetView {
  // ---- Instance lifecycle (single-target) ----------------------------------

  /**
   * Create a new instance. On the leaf, creates on this node. On the composite,
   * `opts.nodeId` pins to a node, otherwise placement picks one.
   */
  create(profile: Omit<BotProfile, "id"> & { id?: string }, opts?: CreateOptions): Promise<Instance>;

  /** Remove an instance by ID. Composite resolves the owning node automatically. */
  remove(id: string, removeVolumes?: boolean): Promise<void>;

  /** Get an Instance handle by ID. Composite resolves the owning node. */
  getInstance(id: string): Promise<Instance>;

  /** Inspect raw container status by ID. */
  status(id: string): Promise<BotStatus>;

  /** Stream of recent log lines. */
  logs(id: string, opts?: { tail?: number }): Promise<string>;

  // ---- Warm pool (composite + per-node) ------------------------------------

  /**
   * Register a pool spec. On the leaf, the spec applies to this node only.
   * On the composite, the spec applies to every node.
   */
  registerPoolSpec(slug: string, spec: PoolSpec): void;

  /** Unregister a spec and drain its containers (per-node or fan-out). */
  unregisterPoolSpec(slug: string): Promise<void>;

  /** All currently registered spec keys. */
  poolSpecKeys(): string[];

  /**
   * Claim a warm container for the given product slug.
   *
   * On the leaf: claim from THIS node's pool only. Returns null if empty.
   * On the composite: pick the most-preferred node (via placement) that has a
   * warm container ready and delegate. Returns null if no node has one.
   */
  claimWarm(slug: string, opts?: { nodeId?: string }): Promise<PoolClaim | null>;

  /**
   * Refill the warm pool to the per-node target.
   *
   * On the leaf: refill THIS node's slots up to spec.sizePerNode.
   * On the composite: fan out — every node refills in parallel.
   */
  replenishWarmPool(): Promise<void>;

  /**
   * Reconcile the warm pool against the actual node state.
   *
   * On the leaf: list THIS node's containers, mark dead any DB row whose
   * container is gone, remove any orphan container not tracked in the DB.
   * On the composite: fan out to every node.
   */
  cleanupWarmPool(): Promise<void>;

  /** Number of warm containers. Leaf: this node's count. Composite: sum. */
  warmCount(slug: string): Promise<number>;

  /** Per-node breakdown — used by placement to prefer nodes that have warm. */
  warmCountByNode(slug: string): Promise<Map<string, number>>;
}

/**
 * Marker subtype for the leaf — useful when a caller specifically needs a
 * single-node handle (e.g. internal fan-out from the composite). Has no
 * additional methods; semantics are "this fleet operates on exactly one node".
 */
export interface INodeFleet extends IFleet {
  /** The single node this fleet is bound to. */
  readonly nodeId: string;
}

/**
 * Resolves an instance ID to its owning node. The composite uses this to
 * dispatch single-target operations (remove, inspect, logs) to the right
 * NodeFleet without iterating.
 *
 * Backed by the bot_instances DB table, where node_id is persisted at create
 * time. No in-memory cache — that was the containerNodeMap mistake.
 */
export interface IInstanceLocator {
  /** Returns the node ID that owns this instance, or null if not found. */
  findNodeFor(instanceId: string): Promise<string | null>;
}
