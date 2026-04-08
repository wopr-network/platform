/**
 * IFleet — the single fleet interface, after the null-target refactor.
 *
 * Earlier versions of this file described a Composite pattern with per-node
 * FleetManager leaves and a placement strategy picking which leaf would
 * fulfill a `create`. That pattern was a holdover from the WebSocket-bus
 * era when core had to pick a specific agent's WS endpoint before sending.
 *
 * In the DB-as-channel world, core doesn't route work to a specific agent
 * at all. It enqueues a row in `pending_operations` and lets the agents
 * self-select via `SELECT … FOR UPDATE SKIP LOCKED`. The "which node
 * fulfilled this" question is answered AFTER the fact, by reading the
 * winning agent's `nodeId` out of the result payload.
 *
 * ── Two classes of operations ──────────────────────────────────────────────
 *
 * **Creation-class** (stateless, placement-flexible):
 *   - `create(profile)` — cold start a new container
 *   - Pool replenishment (`pool.warm` under the hood)
 *
 * These enqueue with `target = null` in `pending_operations`. Any agent
 * claims. The winning agent creates the container on its own host and
 * stamps its own `nodeId` into the result. The caller reads that `nodeId`
 * from the returned `Instance` and persists it (e.g., to
 * `bot_instances.node_id`).
 *
 * **Lifecycle-class** (stateful, pinned):
 *   - `remove(id)`, `getInstance(id)`, `status(id)`, `logs(id)` — act on
 *     an existing container
 *   - Pool cleanup, pool claim-and-rename
 *
 * These look up `bot_instances.node_id` (or `pool_instances.node_id`) and
 * enqueue with `target = <that node id>`. Only the owning agent claims.
 * The container's home is pinned from the moment it's created — Docker's
 * daemon is local to one host, so stop/logs/inspect must execute where the
 * container lives.
 *
 * ── What this replaces ─────────────────────────────────────────────────────
 *
 * - `ContainerPlacementStrategy` (deleted): creation is placement-free.
 * - Per-node `FleetManager` leaves (deleted): there's one Fleet class.
 * - `NodeRegistry` in-memory iteration (deleted): the queue is the only
 *   place where "which nodes exist" matters, and it's a set of consumers
 *   rather than a list we enumerate.
 * - `IFleetMembership` / `FleetMembershipAdapter` (deleted): there's no
 *   membership to enumerate.
 * - `INodeFleet` / `nodeIds()` / `connectedNodeIds()` (deleted): core has
 *   no per-node handles.
 * - `PoolSpec.sizePerNode` → `PoolSpec.size` (cluster-wide target).
 * - `warmCountByNode(slug)` (deleted): we only care about the cluster
 *   total; per-node breakdown was only used by the deleted placement code.
 *
 * ── See also ───────────────────────────────────────────────────────────────
 *
 * - `fleet.ts` — the single Fleet implementation.
 * - `fleet-wiring.ts` — `DbInstanceLocator` (resolves instanceId → nodeId
 *   via bot_instances for lifecycle dispatch).
 */

import type { Instance } from "./instance.js";
import type { BotProfile, BotStatus } from "./types.js";

/** Spec for a warm pool partition. Cluster-wide, not per-node. */
export interface PoolSpec {
  /** Docker image to pre-warm. */
  image: string;
  /** Port the warm container listens on. */
  port: number;
  /** Docker network to attach warm containers to. */
  network: string;
  /** Target warm container count across the whole cluster. */
  size: number;
}

/** Successful warm-pool claim. */
export interface PoolClaim {
  id: string;
  containerId: string;
  /**
   * The node that hosts the claimed warm container. Used by the caller to
   * target a `bot.update` (rename) op at the specific agent that owns the
   * container — the rename must execute where the container lives.
   */
  nodeId: string;
}

/** Optional hints for create(). Kept for future use; unused today. */
export interface CreateOptions {
  /**
   * Pin the container to a specific node. Rarely used — the default is to
   * let any agent claim the null-target row. Provided as an escape hatch
   * for tests and for operations that genuinely need to pin (e.g., recovery
   * flows that want to land work on a specific replacement node).
   */
  nodeId?: string;
}

/**
 * The fleet interface. One implementation (`Fleet`), no leaves, no composite.
 * Production, tests, everyone uses the same shape.
 */
export interface IFleet {
  // ---- Instance lifecycle ---------------------------------------------------

  /**
   * Create a new instance. Enqueues `bot.start` with `target = null` so
   * any agent claims. The winning agent stamps its own nodeId into the
   * result; the returned `Instance` carries that nodeId. The caller
   * persists it to `bot_instances.node_id` for subsequent lifecycle ops.
   */
  create(profile: Omit<BotProfile, "id"> & { id?: string }, opts?: CreateOptions): Promise<Instance>;

  /**
   * Remove an instance by ID. Looks up `bot_instances.node_id` to learn
   * which agent owns the container, then enqueues `bot.remove` pinned to
   * that agent.
   *
   * When `opts.nodeId` is provided, the DB lookup is skipped and the op
   * is enqueued directly at that node. Used by the create saga's rollback
   * path: after `create()` returns but before `bot_instances` is persisted,
   * the rollback closure captures the nodeId from the create result and
   * passes it explicitly — there's no bot_instances row to look up yet.
   */
  remove(id: string, opts?: { removeVolumes?: boolean; nodeId?: string }): Promise<void>;

  /** Get an Instance handle by ID. Backed by `bot_instances`. */
  getInstance(id: string): Promise<Instance>;

  /** Inspect raw container status by ID. Pinned to the owning node. */
  status(id: string): Promise<BotStatus>;

  /** Recent log lines. Pinned to the owning node (Docker log socket is local). */
  logs(id: string, opts?: { tail?: number }): Promise<string>;

  // ---- Warm pool ------------------------------------------------------------

  /** Register a pool spec. One spec per product slug, cluster-wide. */
  registerPoolSpec(slug: string, spec: PoolSpec): void;

  /** Unregister a spec and drain its warm containers. */
  unregisterPoolSpec(slug: string): Promise<void>;

  /** All currently registered spec keys. */
  poolSpecKeys(): string[];

  /** Return a registered pool spec, or undefined. */
  getPoolSpec(slug: string): PoolSpec | undefined;

  /** Update the cluster-wide target size for a registered pool spec. */
  resizePool(slug: string, size: number): void;

  /**
   * Claim a warm container for the given product slug. Picks any warm row
   * from `pool_instances` (no node preference). Returns null if the pool
   * is empty. The returned `nodeId` tells the caller which agent hosts the
   * container so they can enqueue a pinned `bot.update` (rename) op.
   */
  claimWarm(slug: string): Promise<PoolClaim | null>;

  /**
   * Refill the warm pool until it hits `spec.size` cluster-wide. Enqueues
   * `pool.warm` rows with `target = null` — any agent claims and creates
   * the container on its own host.
   */
  replenishWarmPool(): Promise<void>;

  /**
   * Reconcile warm pool rows against actual container state. For each
   * slug, looks at `pool_instances` and enqueues pinned `pool.cleanup`
   * ops for rows whose container is gone.
   */
  cleanupWarmPool(): Promise<void>;

  /** Total warm container count cluster-wide for a given slug. */
  warmCount(slug: string): Promise<number>;
}

/**
 * Resolves an instance ID to its owning node and product slug. Used by
 * `Fleet` to dispatch lifecycle ops (remove, status, logs, inspect) to
 * the agent that hosts the container, and to recompute the deterministic
 * container name (`containerNameFor({ id, productSlug })`) so the proxy
 * URL matches what the agent actually created on Docker.
 *
 * Backed by the `bot_instances` DB table, where `node_id` and
 * `product_slug` are persisted after `create()` returns.
 */
export interface InstanceLocation {
  nodeId: string;
  productSlug: string;
}

export interface IInstanceLocator {
  /** Returns the owning node + product slug, or null if not found. */
  locate(instanceId: string): Promise<InstanceLocation | null>;
}
