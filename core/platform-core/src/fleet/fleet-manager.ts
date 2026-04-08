/**
 * FleetManager — orchestrates bot container lifecycle via the node command bus.
 *
 * All Docker operations are delegated to the node agent through INodeCommandBus.
 * There is NO direct Docker access. The local node is treated identically to
 * remote nodes — same command protocol, same code path.
 *
 * Each FleetManager is bound to a specific node (nodeId). NodeRegistry creates
 * one FleetManager per registered node.
 */

import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { logger } from "../config/logger.js";
import type { BotMetricsTracker } from "../gateway/bot-metrics-tracker.js";
import type { ContainerResourceLimits } from "../monetization/quotas/resource-limits.js";
import type { ProxyManagerInterface } from "../proxy/types.js";
import type { IBotInstanceRepository } from "./bot-instance-repository.js";
import type { BotEventType, FleetEventEmitter } from "./fleet-event-emitter.js";
import { Instance } from "./instance.js";
import type { INodeCommandBus } from "./node-command-bus.js";
import type { IProfileStore } from "./profile-store.js";
import { type BotProfile, type BotStatus, containerNameFor } from "./types.js";

export class FleetManager {
  /** The node this FleetManager manages. All commands go to this node. */
  readonly nodeId: string;
  private commandBus: INodeCommandBus | null = null;
  private readonly store: IProfileStore;
  private proxyManager: ProxyManagerInterface | undefined;
  private instanceRepo: IBotInstanceRepository | undefined;
  private botMetricsTracker: BotMetricsTracker | undefined;
  private eventEmitter: FleetEventEmitter | undefined;
  private pool: {
    claim(key: string, nodeId?: string): Promise<{ id: string; containerId: string } | null>;
  } | null = null;
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
    proxyManager?: ProxyManagerInterface;
    instanceRepo?: IBotInstanceRepository;
    botMetricsTracker?: BotMetricsTracker;
    eventEmitter?: FleetEventEmitter;
    pool?: { claim(key: string, nodeId?: string): Promise<{ id: string; containerId: string } | null> };
  }): void {
    if (deps.proxyManager) this.proxyManager = deps.proxyManager;
    if (deps.instanceRepo) this.instanceRepo = deps.instanceRepo;
    if (deps.botMetricsTracker) this.botMetricsTracker = deps.botMetricsTracker;
    if (deps.eventEmitter) this.eventEmitter = deps.eventEmitter;
    if (deps.pool) this.pool = deps.pool;
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
  async create(
    params: Omit<BotProfile, "id"> & { id?: string },
    _resourceLimits?: ContainerResourceLimits,
  ): Promise<Instance> {
    const id = params.id ?? randomUUID();
    const hasExplicitId = "id" in params && params.id !== undefined;
    logger.info("Fleet.create: starting", {
      id,
      nodeId: this.nodeId,
      productSlug: params.productSlug,
      image: params.image,
      hasPool: !!this.pool,
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
        if (this.pool && params.productSlug) {
          const claimed = await this.pool.claim(params.productSlug, this.nodeId);
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

        if (this.instanceRepo) {
          try {
            await this.instanceRepo.register(id, profile.tenantId, profile.name);
          } catch (err) {
            // Non-fatal: cleanup loop reconciles bot_instances rows from DB state.
            logger.warn("Failed to register bot instance in DB (non-fatal)", { id, err });
          }
        }

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
        try {
          await this.instanceRepo.deleteById(id);
        } catch (err) {
          logger.warn("Failed to delete bot instance from DB (non-fatal)", { id, err });
        }
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

  async logs(id: string, tail = 100): Promise<string> {
    const profile = await this.store.get(id);
    if (!profile) throw new BotNotFoundError(id);
    const result = await this.sendCommand("bot.logs", { name: containerNameFor(profile), tail });
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
  // Private
  // ---------------------------------------------------------------------------

  /** Send a command to this node and return the result. */
  private sendCommand(type: string, payload: Record<string, unknown>) {
    if (!this.commandBus)
      throw new Error(`FleetManager(${this.nodeId}): command bus not set — call setCommandBus() first`);
    return this.commandBus.send(this.nodeId, { type, payload });
  }

  /** Build an Instance from a profile (no Docker inspect — uses DB data). */
  private buildInstance(profile: BotProfile): Instance {
    const containerName = containerNameFor(profile);
    const upstreamHost = this.resolveHost?.(this.nodeId, containerName) ?? containerName;
    const url = `http://${upstreamHost}:3100`;

    return new Instance({
      profile,
      containerId: `${this.nodeId}:${containerName}`,
      containerName,
      url,
      instanceRepo: this.instanceRepo,
      proxyManager: this.proxyManager,
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
