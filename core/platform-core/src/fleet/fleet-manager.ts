/**
 * FleetManager — the leaf in the IFleet composite. Bound to ONE node.
 *
 * All Docker operations go through the node agent via INodeCommandBus —
 * there is no direct Docker access. Both instance lifecycle and warm-pool
 * operations live here, scoped to this node. The Fleet composite holds N
 * FleetManagers and presents the same IFleet interface for cluster-wide ops.
 *
 * Implements INodeFleet (the leaf shape). The composite is `fleet.ts`.
 */

import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { logger } from "../config/logger.js";
import type { BotMetricsTracker } from "../gateway/bot-metrics-tracker.js";
import type { IOperationQueue } from "../queue/operation-queue.js";
import type { IPoolRepository } from "../server/services/pool-repository.js";
import type { IBotInstanceRepository } from "./bot-instance-repository.js";
import type { BotEventType, FleetEventEmitter } from "./fleet-event-emitter.js";
import { friendlyName } from "./friendly-names.js";
import type { CreateOptions, INodeFleet, PoolClaim, PoolSpec } from "./i-fleet.js";
import { Instance } from "./instance.js";
import type { CommandResult, INodeCommandBus } from "./node-command-bus.js";
import type { IProfileStore } from "./profile-store.js";
import { type BotProfile, type BotStatus, containerNameFor } from "./types.js";

/** Shared per-node config for warm pool operations. */
export interface NodeFleetPoolConfig {
  /** Shared secret injected into warm containers for provision auth. */
  provisionSecret: string;
  /** Registry auth for pulling private images. */
  registryAuth?: { username: string; password: string; serveraddress: string };
}

export class FleetManager implements INodeFleet {
  /** The node this FleetManager manages. All commands go to this node. */
  readonly nodeId: string;
  private commandBus: INodeCommandBus | null = null;
  /**
   * DB-as-channel queue. When wired (Phase 2.3b cut-over), `sendCommand`
   * routes through `queue.execute({ target: this.nodeId })` instead of the
   * legacy WebSocket bus. The agent on the target node must be running its
   * AgentWorker (`startAgentQueueWorker`) for the call to ever resolve, so
   * this dep is only wired when `bootConfig.features.agentQueueDispatch`
   * is on AND every node has an AgentWorker started.
   */
  private operationQueue: IOperationQueue | null = null;
  private readonly store: IProfileStore;
  private instanceRepo: IBotInstanceRepository | undefined;
  private botMetricsTracker: BotMetricsTracker | undefined;
  private eventEmitter: FleetEventEmitter | undefined;
  private poolRepo: IPoolRepository | null = null;
  private poolConfig: NodeFleetPoolConfig | null = null;
  /** Per-node pool spec registry. The composite Fleet pushes specs here. */
  private readonly poolSpecs = new Map<string, PoolSpec>();
  /** Mutex on warm-pool tick (cleanup + replenish) so concurrent ticks can't pile up. */
  private warmTicking = false;
  private locks = new Map<string, Promise<void>>();

  /** Resolve upstream host for a container. Injected from NodeRegistry. */
  private resolveHost: ((nodeId: string | null, containerName: string) => string) | null = null;

  setResolveHost(fn: (nodeId: string | null, containerName: string) => string): void {
    this.resolveHost = fn;
  }

  /** Inject the command bus after construction (breaks circular dep with NodeConnectionManager). */
  setCommandBus(bus: INodeCommandBus): void {
    this.commandBus = bus;
  }

  /** Inject optional dependencies after construction. */
  setDeps(deps: {
    instanceRepo?: IBotInstanceRepository;
    botMetricsTracker?: BotMetricsTracker;
    eventEmitter?: FleetEventEmitter;
    poolRepo?: IPoolRepository;
    poolConfig?: NodeFleetPoolConfig;
    /**
     * Optional DB-as-channel queue. When set, all `sendCommand` calls route
     * through it instead of the WS command bus. Only inject this when every
     * agent in the cluster is running an AgentWorker.
     */
    operationQueue?: IOperationQueue;
  }): void {
    if (deps.instanceRepo) this.instanceRepo = deps.instanceRepo;
    if (deps.botMetricsTracker) this.botMetricsTracker = deps.botMetricsTracker;
    if (deps.eventEmitter) this.eventEmitter = deps.eventEmitter;
    if (deps.poolRepo) this.poolRepo = deps.poolRepo;
    if (deps.poolConfig) this.poolConfig = deps.poolConfig;
    if (deps.operationQueue) this.operationQueue = deps.operationQueue;
  }

  constructor(nodeId: string, store: IProfileStore) {
    this.nodeId = nodeId;
    this.store = store;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Create a new bot: persist profile, send bot.start to node via command bus.
   * Pool claim attempted first — DB claim + rename command.
   * Rolls back profile on failure.
   */
  async create(params: Omit<BotProfile, "id"> & { id?: string }, _opts?: CreateOptions): Promise<Instance> {
    // _opts.nodeId is honored by the Fleet composite, not by the leaf — the
    // leaf only ever creates on its own node. The composite has already done
    // the routing if it called us.
    const id = params.id ?? randomUUID();
    const hasExplicitId = "id" in params && params.id !== undefined;
    logger.info("Fleet.create: starting", {
      id,
      nodeId: this.nodeId,
      productSlug: params.productSlug,
      image: params.image,
      hasPool: this.poolSpecs.has(params.productSlug ?? ""),
    });

    const doCreate = async (): Promise<Instance> => {
      const profile: BotProfile = { ...params, id };

      if (hasExplicitId && (await this.store.get(id))) {
        throw new Error(`Bot with id ${id} already exists`);
      }

      // Saga rollback: every state change pushes its undo. On any failure,
      // undos run in reverse so the system returns to a clean state — no
      // orphan containers, no half-written rows, no leaked profiles.
      const undos: { name: string; fn: () => Promise<void> }[] = [];
      const rollback = async (cause: unknown): Promise<void> => {
        logger.error("Fleet.create: failed, rolling back", {
          id,
          nodeId: this.nodeId,
          err: cause instanceof Error ? cause.message : String(cause),
          steps: undos.map((u) => u.name),
        });
        for (const u of [...undos].reverse()) {
          try {
            await u.fn();
          } catch (cleanupErr) {
            logger.warn(`Fleet.create rollback step "${u.name}" failed`, {
              id,
              err: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
            });
          }
        }
      };

      try {
        await this.store.save(profile);
        undos.push({
          name: "delete-profile",
          fn: () => this.store.delete(profile.id).then(() => undefined),
        });

        let poolClaimed = false;
        if (this.poolRepo && params.productSlug) {
          const claimed = await this.claimWarm(params.productSlug);
          if (claimed) {
            // Pool DB row is consumed irrevocably; if anything else fails we
            // must remove this container so it doesn't leak.
            undos.push({
              name: "remove-claimed-container",
              fn: () => this.sendCommand("bot.remove", { name: claimed.containerId }).then(() => undefined),
            });

            const cname = containerNameFor({ id, productSlug: params.productSlug });
            logger.info("Fleet.create: pool claimed, renaming", {
              id,
              containerId: claimed.containerId,
              newName: cname,
            });
            await this.sendCommand("bot.update", {
              name: cname,
              containerId: claimed.containerId,
              rename: true,
            });
            poolClaimed = true;
          }
        }

        if (!poolClaimed) {
          const cname = containerNameFor(profile);
          logger.info("Fleet.create: sending bot.start to node", { id, nodeId: this.nodeId });
          await this.sendCommand("bot.start", {
            name: cname,
            image: profile.image,
            env: profile.env,
            restart: profile.restartPolicy,
          });
          undos.push({
            name: "remove-cold-started-container",
            fn: () => this.sendCommand("bot.remove", { name: cname }).then(() => undefined),
          });
        }

        const instance = this.buildInstance(profile);
        instance.emitCreated();

        // bot_instances is owned by InstanceService — it has the full field
        // set (nodeId, containerPort, billingState, createdByUserId). The
        // FleetManager only owns profiles + containers. Single source of
        // truth for the row, no double-write race.

        return instance;
      } catch (err) {
        await rollback(err);
        throw err;
      }
    };

    return hasExplicitId ? this.withLock(id, doCreate) : doCreate();
  }

  /**
   * Get an Instance handle for an existing bot by ID.
   */
  async getInstance(id: string): Promise<Instance> {
    const profile = await this.store.get(id);
    if (!profile) throw new BotNotFoundError(id);
    return this.buildInstance(profile);
  }

  /**
   * Remove a bot: send bot.remove to node, clean up DB.
   */
  async remove(id: string, removeVolumes = false): Promise<void> {
    return this.withLock(id, async () => {
      const profile = await this.store.get(id);
      if (!profile) throw new BotNotFoundError(id);

      try {
        await this.sendCommand("bot.remove", { name: containerNameFor(profile), removeVolumes });
      } catch {
        // Container may already be gone — not fatal for fleet-level cleanup
      }

      if (this.instanceRepo) {
        // Throws on real DB errors. "not found" / 0 rows is fine — orphan
        // reconciliation may have already cleaned this up, or the caller is
        // calling remove() twice.
        await this.instanceRepo.deleteById(id);
      }

      await this.store.delete(id);
      logger.info(`Removed bot ${id}`);
      this.emitEvent("bot.removed", id, profile.tenantId);
    });
  }

  /**
   * Update a bot profile. Sends bot.update to the node if container-relevant
   * fields changed.
   */
  async update(id: string, updates: Partial<Omit<BotProfile, "id">>): Promise<BotProfile> {
    return this.withLock(id, async () => {
      const existing = await this.store.get(id);
      if (!existing) throw new BotNotFoundError(id);

      const updated: BotProfile = { ...existing, ...updates };
      const needsRecreate = Object.keys(updates).some((k) => CONTAINER_FIELDS.has(k));

      await this.store.save(updated);

      if (needsRecreate) {
        try {
          await this.sendCommand("bot.update", {
            name: containerNameFor(updated),
            image: updated.image,
            env: updated.env,
            restart: updated.restartPolicy,
          });
        } catch (err) {
          logger.error(`Fleet.update: failed for bot ${id}, rolling back`, { err });
          await this.store.save(existing);
          throw err;
        }
      }

      return updated;
    });
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  async status(id: string): Promise<BotStatus> {
    const profile = await this.store.get(id);
    if (!profile) throw new BotNotFoundError(id);
    return this.statusForProfile(profile);
  }

  async listAll(): Promise<BotStatus[]> {
    const profiles = await this.store.list();
    return Promise.all(profiles.map((p) => this.statusForProfile(p)));
  }

  async listByTenant(tenantId: string): Promise<BotStatus[]> {
    const profiles = await this.store.list();
    return Promise.all(profiles.filter((p) => p.tenantId === tenantId).map((p) => this.statusForProfile(p)));
  }

  async logs(id: string, opts?: { tail?: number }): Promise<string> {
    const profile = await this.store.get(id);
    if (!profile) throw new BotNotFoundError(id);
    const result = await this.sendCommand("bot.logs", { name: containerNameFor(profile), tail: opts?.tail ?? 100 });
    return typeof result.data === "string" ? result.data : "";
  }

  async logStream(id: string, opts: { since?: string; tail?: number }): Promise<NodeJS.ReadableStream> {
    const profile = await this.store.get(id);
    if (!profile) throw new BotNotFoundError(id);
    const result = await this.sendCommand("bot.logs", { name: containerNameFor(profile), tail: opts.tail ?? 100 });
    const pt = new PassThrough();
    pt.end(typeof result.data === "string" ? result.data : "");
    return pt;
  }

  async getVolumeUsage(id: string): Promise<{ usedBytes: number; totalBytes: number; availableBytes: number } | null> {
    try {
      const profile = await this.store.get(id);
      if (!profile) return null;
      const result = await this.sendCommand("bot.inspect", { name: containerNameFor(profile) });
      return (
        (result.data as { volumeUsage?: { usedBytes: number; totalBytes: number; availableBytes: number } })
          ?.volumeUsage ?? null
      );
    } catch {
      return null;
    }
  }

  get profiles(): IProfileStore {
    return this.store;
  }

  // ---------------------------------------------------------------------------
  // FleetView (composite-friendly introspection)
  // ---------------------------------------------------------------------------

  nodeIds(): string[] {
    return [this.nodeId];
  }

  connectedNodeIds(): string[] {
    // The leaf doesn't track its own connection state — only the composite
    // (which has the NodeRegistry) does. From a leaf's perspective, if you're
    // calling it, it's "connected enough". Composite filters before delegating.
    return [this.nodeId];
  }

  // ---------------------------------------------------------------------------
  // Warm pool (per-node leaf operations)
  // ---------------------------------------------------------------------------

  registerPoolSpec(slug: string, spec: PoolSpec): void {
    this.poolSpecs.set(slug, { ...spec });
  }

  async unregisterPoolSpec(slug: string): Promise<void> {
    this.poolSpecs.delete(slug);
    if (!this.poolRepo) return;
    const instances = await this.poolRepo.listActive(slug);
    for (const inst of instances) {
      if (inst.nodeId !== this.nodeId) continue;
      await this.poolRepo.markDead(inst.id);
      await this.removeWarmContainer(inst.containerId);
    }
    await this.poolRepo.deleteDead();
  }

  poolSpecKeys(): string[] {
    return [...this.poolSpecs.keys()];
  }

  /**
   * Claim a warm container for the given product slug from THIS node.
   * Returns null if this node has no warm container for the slug.
   */
  async claimWarm(slug: string, _opts?: { nodeId?: string }): Promise<PoolClaim | null> {
    if (!this.poolRepo) return null;
    return this.poolRepo.claim(slug, this.nodeId);
  }

  /**
   * Refill THIS node's warm pool to spec.sizePerNode for every registered spec.
   * Mutex'd: skips if a tick is already running so concurrent ticks can't pile up.
   */
  async replenishWarmPool(): Promise<void> {
    if (!this.poolRepo) return;
    if (this.warmTicking) {
      logger.debug(`FleetManager(${this.nodeId}): pool tick already running, skipping replenish`);
      return;
    }
    this.warmTicking = true;
    try {
      for (const [slug, spec] of this.poolSpecs) {
        const counts = await this.poolRepo.warmCountByNode(slug);
        const current = counts.get(this.nodeId) ?? 0;
        const deficit = spec.sizePerNode - current;
        if (deficit <= 0) continue;
        logger.info(
          `FleetManager(${this.nodeId})[${slug}]: replenishing ${deficit} (have ${current}, want ${spec.sizePerNode})`,
        );
        for (let i = 0; i < deficit; i++) {
          await this.createWarm(slug, spec);
        }
      }
    } finally {
      this.warmTicking = false;
    }
  }

  /**
   * Reconcile this node's pool: mark dead any DB row whose container is gone,
   * remove any orphan pool container not tracked in the DB. Cleanup runs
   * orphan removal in parallel — bounded by docker stop time, not N * stop time.
   */
  async cleanupWarmPool(): Promise<void> {
    if (!this.poolRepo || !this.commandBus) return;

    let nodeContainers: { id: string; name: string; running: boolean }[] = [];
    try {
      const result = await this.commandBus.send(this.nodeId, { type: "pool.list", payload: {} });
      nodeContainers = (result.data as { id: string; name: string; running: boolean }[]) ?? [];
    } catch (err) {
      logger.warn(`FleetManager(${this.nodeId}): pool.list failed`, {
        error: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const onNodeIds = new Set(nodeContainers.map((c) => c.id));

    // 1. Reconcile DB rows pinned to this node
    const activeInstances = await this.poolRepo.listActive();
    const tracked = new Set<string>();
    for (const inst of activeInstances) {
      if (inst.nodeId !== this.nodeId) continue;
      tracked.add(inst.containerId);
      if (!onNodeIds.has(inst.containerId)) {
        await this.poolRepo.markDead(inst.id);
        logger.warn(`FleetManager(${this.nodeId}): missing container ${inst.id} (was ${inst.status})`);
        continue;
      }
      const nodeContainer = nodeContainers.find((c) => c.id === inst.containerId);
      if (!nodeContainer?.running) {
        await this.poolRepo.markDead(inst.id);
        await this.removeWarmContainer(nodeContainer?.name ?? inst.containerId);
        logger.warn(`FleetManager(${this.nodeId}): dead container ${inst.id}`);
      }
    }
    await this.poolRepo.deleteDead();

    // 2. Orphan reconciliation — pool containers on node not tracked in DB.
    // Run removals in parallel to bound cleanup time.
    const orphans = nodeContainers.filter((c) => !tracked.has(c.id));
    await Promise.all(
      orphans.map(async (container) => {
        await this.removeWarmContainer(container.name);
        logger.info(`FleetManager(${this.nodeId}): removed orphan ${container.name}`);
      }),
    );
  }

  async warmCount(slug: string): Promise<number> {
    if (!this.poolRepo) return 0;
    const counts = await this.poolRepo.warmCountByNode(slug);
    return counts.get(this.nodeId) ?? 0;
  }

  async warmCountByNode(slug: string): Promise<Map<string, number>> {
    // Leaf returns a single-entry map for this node only.
    if (!this.poolRepo) return new Map();
    const counts = await this.poolRepo.warmCountByNode(slug);
    const result = new Map<string, number>();
    const c = counts.get(this.nodeId);
    if (c !== undefined) result.set(this.nodeId, c);
    return result;
  }

  /** Create a single warm container on this node via the command bus. */
  private async createWarm(slug: string, spec: PoolSpec): Promise<void> {
    if (!this.commandBus || !this.poolRepo || !this.poolConfig) {
      logger.warn(`FleetManager(${this.nodeId}): cannot create warm container — missing deps`);
      return;
    }
    const id = randomUUID();
    const friendly = friendlyName(id);
    const containerName = `pool-${slug}-${friendly}`;

    try {
      const result = await this.commandBus.send(this.nodeId, {
        type: "pool.warm",
        payload: {
          name: containerName,
          image: spec.image,
          port: spec.port,
          network: spec.network || "platform-overlay",
          provisionSecret: this.poolConfig.provisionSecret,
          ...(this.poolConfig.registryAuth ? { registryAuth: this.poolConfig.registryAuth } : {}),
        },
      });
      const containerId = typeof result.data === "string" ? result.data : containerName;
      await this.poolRepo.insertWarm(id, containerId, this.nodeId, slug, spec.image);
      logger.info(`FleetManager(${this.nodeId}): created warm container ${containerName} for "${slug}"`);
    } catch (err) {
      logger.error(`FleetManager(${this.nodeId}): failed to create warm container`, {
        slug,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Best-effort stop + remove a pool container. */
  private async removeWarmContainer(containerIdOrName: string): Promise<void> {
    if (!this.commandBus) return;
    try {
      await this.commandBus.send(this.nodeId, {
        type: "pool.cleanup",
        payload: { name: containerIdOrName },
      });
    } catch {
      /* already gone */
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /**
   * Send a command to this node and return a CommandResult-shaped object.
   *
   * Prefers the DB-as-channel queue when `operationQueue` is wired (Phase
   * 2.3b cut-over). Falls back to the legacy WebSocket command bus otherwise.
   * Both transports converge on the same result shape so call sites that
   * read `result.data` work identically regardless of which path ran:
   *   - WS bus: agent's `sendResult` already returns this shape.
   *   - Queue:  the handler returns the raw value, and we wrap it here.
   */
  private async sendCommand(type: string, payload: Record<string, unknown>): Promise<CommandResult> {
    if (this.operationQueue) {
      const data = await this.operationQueue.execute<unknown>({
        type,
        target: this.nodeId,
        payload,
      });
      return {
        id: `queue-${this.nodeId}`,
        type: "command_result",
        command: type,
        success: true,
        data,
      };
    }
    if (!this.commandBus) {
      throw new Error(
        `FleetManager(${this.nodeId}): no transport configured — call setCommandBus() or setDeps({ operationQueue })`,
      );
    }
    return await this.commandBus.send(this.nodeId, { type, payload });
  }

  /** Build an Instance from a profile (no Docker inspect — uses DB data). */
  private buildInstance(profile: BotProfile): Instance {
    const containerName = containerNameFor(profile);
    const upstreamHost = this.resolveHost?.(this.nodeId, containerName) ?? containerName;
    const url = `http://${upstreamHost}:3100`;

    return new Instance({
      profile,
      nodeId: this.nodeId,
      containerId: `${this.nodeId}:${containerName}`,
      containerName,
      url,
      instanceRepo: this.instanceRepo,
      eventEmitter: this.eventEmitter,
      botMetricsTracker: this.botMetricsTracker,
    });
  }

  private async statusForProfile(profile: BotProfile): Promise<BotStatus> {
    try {
      const result = await this.sendCommand("bot.inspect", { name: containerNameFor(profile) });
      const data = result.data as Record<string, unknown> | undefined;
      const state = (data?.state as string) ?? "running";
      const validStates = [
        "running",
        "stopped",
        "paused",
        "error",
        "pulling",
        "created",
        "restarting",
        "exited",
        "dead",
      ] as const;
      return {
        id: profile.id,
        name: profile.name,
        description: profile.description,
        image: profile.image,
        containerId: (data?.containerId as string) ?? null,
        state: (validStates as readonly string[]).includes(state) ? (state as BotStatus["state"]) : "running",
        health: (data?.health as string) ?? null,
        uptime: (data?.uptime as string) ?? null,
        startedAt: (data?.startedAt as string) ?? null,
        createdAt: (data?.createdAt as string) ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        stats: null,
        applicationMetrics: null,
      };
    } catch {
      const now = new Date().toISOString();
      return {
        id: profile.id,
        name: profile.name,
        description: profile.description,
        image: profile.image,
        containerId: null,
        state: "stopped",
        health: null,
        uptime: null,
        startedAt: null,
        createdAt: now,
        updatedAt: now,
        stats: null,
        applicationMetrics: null,
      };
    }
  }

  private emitEvent(type: BotEventType, botId: string, tenantId?: string): void {
    if (!this.eventEmitter) return;
    if (!tenantId) return;
    this.eventEmitter.emit({ type, botId, tenantId, timestamp: new Date().toISOString() });
  }

  private async withLock<T>(botId: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(botId) ?? Promise.resolve();
    let resolve!: () => void;
    const next = new Promise<void>((r) => {
      resolve = r;
    });
    this.locks.set(botId, next);
    try {
      await prev;
      return await fn();
    } finally {
      resolve();
      if (this.locks.get(botId) === next) this.locks.delete(botId);
    }
  }
}

const CONTAINER_FIELDS = new Set<string>(["image", "env", "restartPolicy", "volumeName", "name", "network"]);

export class BotNotFoundError extends Error {
  constructor(id: string) {
    super(`Bot not found: ${id}`);
    this.name = "BotNotFoundError";
  }
}
