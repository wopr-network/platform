/**
 * IFleet — the unified interface for both per-node and aggregate fleet operations.
 *
 * This file is the contract for the Composite pattern (GoF) as applied to
 * fleet management. Read this before adding methods, before adding fields to
 * implementations, and especially before "simplifying" things by reaching
 * past the interface.
 *
 * ── The shape ──────────────────────────────────────────────────────────────
 *
 *                            IFleet
 *                       ─────────────────
 *                       create / remove / inspect / logs
 *                       claimWarm / replenishWarmPool / cleanupWarmPool
 *                       registerPoolSpec / warmCount / warmCountByNode
 *                              ▲
 *                    ┌─────────┴─────────┐
 *                    │                   │
 *               INodeFleet              Fleet
 *               (leaf)                  (composite)
 *               ─────────               ──────────
 *               FleetManager,           Holds N NodeFleets,
 *               bound to one nodeId,    presents the same IFleet
 *               talks to one Docker     by picking a node or
 *               via the command bus     fanning out
 *
 * ── The contract ───────────────────────────────────────────────────────────
 *
 * 1. **Every method on IFleet must have a sensible meaning at both layers.**
 *    - `inspect(id)` on a leaf reads its local container.
 *    - `inspect(id)` on the composite resolves the owning node via
 *      {@link IInstanceLocator} (DB lookup of bot_instances.node_id) and
 *      delegates to that leaf.
 *    - If a method only makes sense on one layer, it doesn't belong here.
 *      Put it on the concrete class instead. The leaf has its own `nodeId`
 *      field; the composite has its own ticker. Neither belongs on IFleet.
 *
 * 2. **The composite has NO leaf field.** No `defaultNode`, no `localNode`,
 *    no `if (this.nodes.length === 1)` shortcut. Every operation iterates
 *    or dispatches. The composite is the single-node case. The single-node
 *    case is the multi-node case. They're the same case.
 *
 *    This rule exists because we got it wrong once: HotPool had a
 *    `this.nodeId = "local"` placeholder from the original Docker-direct
 *    era. After moving to the command bus, the field looked like a harmless
 *    one-line default. It was actually a load-bearing assumption that
 *    single-node ≡ multi-node — the exact thing the refactor was trying to
 *    break. Multi-node would have appeared to "work" until the second node
 *    connected, at which point silent breakage would surface in production.
 *    The fix wasn't to add a NodeProvider abstraction; it was to delete the
 *    field and accept that the composite already exists, we just hadn't
 *    named it. The "brilliance" of the Composite pattern is the discipline,
 *    not the class hierarchy.
 *
 * 3. **Operations split into two dispatch flavors in the composite.**
 *
 *    Single-target (acts on one node):
 *    - `create(profile, opts?)` — placement strategy picks the node, OR
 *      `opts.nodeId` pins explicitly. Delegates to one leaf.
 *    - `remove(id)`, `inspect(id)`, `logs(id)` — instance locator finds the
 *      owning node from `bot_instances.node_id`. Delegates.
 *    - `claimWarm(slug)` — placement orders nodes by preference; first node
 *      with a warm container wins.
 *
 *    All-target (acts on every connected node):
 *    - `replenishWarmPool()`, `cleanupWarmPool()` — `Promise.all` over
 *      connected leaves. Disconnected nodes are skipped; the next tick
 *      picks them up when they reconnect.
 *    - `registerPoolSpec(slug, spec)` — pushed to every leaf so each refills
 *      its own slots from `spec.sizePerNode`.
 *
 * 4. **Membership is dynamic, not static.** The composite re-derives its
 *    leaf list from {@link IFleetMembership} on each call. When a node
 *    connects or disconnects at runtime, the next operation picks it up
 *    automatically — no special-case "what if a node went away" branches
 *    at any call site.
 *
 * 5. **Pool sizes are per-node, not global.** `PoolSpec.sizePerNode` means
 *    "maintain N warm containers on each node". With 3 nodes and
 *    `sizePerNode = 2`, you get 6 warm containers total. The composite
 *    fans replenishment out so each leaf hits its own target.
 *
 * ── What this saves callers ────────────────────────────────────────────────
 *
 * Before: every caller wrote variations of
 *   const nodes = nodeRegistry.list();
 *   const counts = await nodeRegistry.getContainerCounts();
 *   const targetNode = placementStrategy.selectNode(nodes, ctx);
 *   const result = await targetNode.fleet.create(profile);
 *
 * After:
 *   const result = await fleet.create(profile);
 *
 * Iteration, placement, dispatch, owner-by-DB-lookup, and pool spec
 * replication all live in one place. Callers write single-node code; the
 * composite makes it multi-node.
 *
 * ── See also ───────────────────────────────────────────────────────────────
 *
 * - `fleet.ts` — the {@link IFleet} composite implementation (Fleet class).
 * - `fleet-manager.ts` — the {@link INodeFleet} leaf (FleetManager class).
 * - `fleet-wiring.ts` — adapters: FleetMembershipAdapter (NodeRegistry →
 *   IFleetMembership) and DbInstanceLocator (botInstanceRepo → IInstanceLocator).
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
