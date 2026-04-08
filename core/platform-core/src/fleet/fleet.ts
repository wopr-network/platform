/**
 * Fleet — the single IFleet implementation, post null-target refactor.
 *
 * This file used to be a GoF Composite that held N per-node `NodeFleet`
 * leaves and dispatched work via a placement strategy. That layer is gone.
 * Core doesn't own node identity anymore — the queue does. For creation
 * ops core enqueues with `target = null` and the winning agent stamps its
 * own nodeId into the result. For lifecycle ops core looks up the owning
 * node from `bot_instances` (via `IInstanceLocator`) and enqueues pinned.
 *
 * See `docs/2026-04-08-db-queue-architecture.md` and `i-fleet.ts`.
 */

import { randomUUID } from "node:crypto";
import { logger } from "../config/logger.js";
import type { IOperationQueue } from "../queue/operation-queue.js";
import type { IPoolRepository } from "../server/services/pool-repository.js";
import type { IBotInstanceRepository } from "./bot-instance-repository.js";
import type { FleetEventEmitter } from "./fleet-event-emitter.js";
import type { CreateOptions, IFleet, IInstanceLocator, PoolClaim, PoolSpec } from "./i-fleet.js";
import { Instance } from "./instance.js";
import { type BotProfile, type BotStatus, containerNameFor } from "./types.js";

export interface FleetOptions {
  /** Replenish + cleanup ticker interval in ms. Default 60_000. */
  replenishIntervalMs?: number;
  /**
   * Optional event emitter — passed through to Instance for lifecycle events.
   */
  eventEmitter?: FleetEventEmitter;
  /**
   * Optional bot instance repository — passed through to Instance for
   * billing-state transitions.
   */
  botInstanceRepo?: IBotInstanceRepository;
}

/**
 * Shape of the payload the agent's `bot.start` handler returns. The agent
 * stamps its own `nodeId` so the caller learns which agent won the claim.
 * The other fields mirror what `DockerManager.startBot` produces today.
 */
interface BotStartResult {
  nodeId: string;
  containerId?: string;
  containerName?: string;
  url?: string;
  [key: string]: unknown;
}

/**
 * Shape of the payload the agent's `pool.warm` handler returns. Same idea
 * as BotStartResult but without a profile.
 */
interface PoolWarmResult {
  nodeId: string;
  containerId?: string;
  name?: string;
  [key: string]: unknown;
}

export class Fleet implements IFleet {
  private readonly specs = new Map<string, PoolSpec>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly queue: IOperationQueue,
    private readonly locator: IInstanceLocator,
    private readonly poolRepo: IPoolRepository | null,
    private readonly options: FleetOptions = {},
  ) {}

  // ---------------------------------------------------------------------------
  // Lifecycle ticker
  // ---------------------------------------------------------------------------

  async start(): Promise<{ stop: () => void }> {
    // Run one sweep immediately so a fresh boot doesn't wait 60s before the
    // first replenish. Errors are logged but don't block startup.
    await this.tick().catch((err) => {
      logger.warn("Fleet initial tick failed (non-fatal)", {
        error: err instanceof Error ? err.message : String(err),
      });
    });
    const intervalMs = this.options.replenishIntervalMs ?? 60_000;
    this.timer = setInterval(() => {
      this.tick().catch((err) => {
        logger.error("Fleet tick failed", { error: err instanceof Error ? err.message : String(err) });
      });
    }, intervalMs);
    logger.info("Fleet started", { intervalMs, specs: [...this.specs.keys()] });
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
  // Instance lifecycle
  // ---------------------------------------------------------------------------

  async create(profile: Omit<BotProfile, "id"> & { id?: string }, opts?: CreateOptions): Promise<Instance> {
    const id = profile.id ?? randomUUID();
    const fullProfile: BotProfile = { ...profile, id } as BotProfile;
    const name = containerNameFor(fullProfile);

    // Enqueue `bot.start` with null target unless the caller pinned explicitly.
    // The winning agent stamps its own nodeId into the result.
    const result = await this.queue.execute<BotStartResult>({
      type: "bot.start",
      target: opts?.nodeId ?? null,
      payload: {
        name,
        image: fullProfile.image,
        env: fullProfile.env ?? {},
        restart: fullProfile.restartPolicy ?? "unless-stopped",
        profileId: id,
      },
    });

    if (!result || typeof result.nodeId !== "string" || result.nodeId === "") {
      throw new Error(`Fleet.create: agent did not return a nodeId for instance ${id}`);
    }

    return new Instance({
      profile: fullProfile,
      containerId: result.containerId ?? `${result.nodeId}:${name}`,
      containerName: result.containerName ?? name,
      url: result.url ?? `http://${name}:3100`,
      nodeId: result.nodeId,
      instanceRepo: this.options.botInstanceRepo,
      eventEmitter: this.options.eventEmitter,
    });
  }

  async remove(id: string, opts?: { removeVolumes?: boolean; nodeId?: string }): Promise<void> {
    // Lifecycle op — must run on the node that owns the container. If the
    // caller passed an explicit nodeId (saga rollback path, where bot_instances
    // isn't written yet), use it. Otherwise look up from the DB.
    const nodeId = opts?.nodeId ?? (await this.locator.findNodeFor(id));
    if (!nodeId) {
      logger.warn("Fleet.remove: no owning node for instance", { id });
      return;
    }
    // Construct the name deterministically — bot_instances doesn't store it
    // verbatim, but containerNameFor is stable given the instance id and
    // product slug. For the rollback path the caller may not have the
    // productSlug handy, so we accept the id-based naming convention used
    // throughout the codebase.
    await this.queue.execute({
      type: "bot.remove",
      target: nodeId,
      payload: { id, name: id, removeVolumes: opts?.removeVolumes === true },
    });
  }

  async getInstance(id: string): Promise<Instance> {
    const nodeId = await this.locator.findNodeFor(id);
    if (!nodeId) throw new Error(`Fleet.getInstance: no owning node for instance ${id}`);
    // Minimal Instance handle built from the DB. Callers that need deeper
    // inspection (runtime status, logs) use `.status()` / `.logs()` which
    // enqueue pinned ops.
    const name = id; // bot_instances doesn't store the container name separately
    return new Instance({
      profile: { id, name, image: "", tenantId: "", productSlug: "", env: {} } as BotProfile,
      containerId: `${nodeId}:${name}`,
      containerName: name,
      url: `http://${name}:3100`,
      nodeId,
      instanceRepo: this.options.botInstanceRepo,
      eventEmitter: this.options.eventEmitter,
    });
  }

  async status(id: string): Promise<BotStatus> {
    const nodeId = await this.locator.findNodeFor(id);
    if (!nodeId) throw new Error(`Fleet.status: no owning node for instance ${id}`);
    const result = await this.queue.execute<BotStatus>({
      type: "bot.inspect",
      target: nodeId,
      payload: { name: id },
    });
    return result;
  }

  async logs(id: string, opts?: { tail?: number }): Promise<string> {
    const nodeId = await this.locator.findNodeFor(id);
    if (!nodeId) throw new Error(`Fleet.logs: no owning node for instance ${id}`);
    const result = await this.queue.execute<{ data?: string } | string>({
      type: "bot.logs",
      target: nodeId,
      payload: { name: id, tail: opts?.tail ?? 100 },
    });
    if (typeof result === "string") return result;
    return typeof result?.data === "string" ? result.data : "";
  }

  // ---------------------------------------------------------------------------
  // Warm pool
  // ---------------------------------------------------------------------------

  registerPoolSpec(slug: string, spec: PoolSpec): void {
    this.specs.set(slug, { ...spec });
    logger.info(`Fleet: registered pool spec "${slug}"`, { image: spec.image, size: spec.size });
  }

  async unregisterPoolSpec(slug: string): Promise<void> {
    this.specs.delete(slug);
    if (!this.poolRepo) return;
    // Drain: cleanup pass removes orphans whose specs are gone.
    await this.cleanupWarmPool();
  }

  poolSpecKeys(): string[] {
    return [...this.specs.keys()];
  }

  getPoolSpec(slug: string): PoolSpec | undefined {
    const spec = this.specs.get(slug);
    return spec ? { ...spec } : undefined;
  }

  resizePool(slug: string, size: number): void {
    const spec = this.specs.get(slug);
    if (!spec) throw new Error(`Fleet: pool spec "${slug}" is not registered`);
    spec.size = size;
    logger.info(`Fleet: resized pool "${slug}" → size=${size}`);
  }

  async claimWarm(slug: string): Promise<PoolClaim | null> {
    if (!this.poolRepo) return null;
    const claim = await this.poolRepo.claim(slug);
    if (!claim) return null;
    // The row already has a nodeId — the pool.warm winner wrote it when
    // the warm container was created. The caller uses this nodeId to
    // enqueue a pinned `bot.update` (rename) op at that same agent.
    return claim;
  }

  async replenishWarmPool(): Promise<void> {
    if (!this.poolRepo) return;
    for (const [slug, spec] of this.specs) {
      const current = await this.poolRepo.warmCount(slug);
      const needed = Math.max(0, spec.size - current);
      if (needed === 0) continue;
      logger.info("Fleet: replenishing warm pool", { slug, current, target: spec.size, needed });
      // Fire each pool.warm enqueue in parallel. Agents claim concurrently;
      // SKIP LOCKED ensures no two agents grab the same row.
      await Promise.all(
        Array.from({ length: needed }, async (_, i) => {
          const name = `warm-${slug}-${Date.now()}-${i}`;
          try {
            const result = await this.queue.execute<PoolWarmResult>({
              type: "pool.warm",
              target: null,
              payload: {
                name,
                image: spec.image,
                port: spec.port,
                network: spec.network,
              },
            });
            // Record the warm container in pool_instances with the winner's
            // nodeId. Fleet (core) owns the DB write so there's one place
            // where pool state converges.
            if (this.poolRepo && typeof result?.nodeId === "string" && result.nodeId !== "") {
              await this.poolRepo.insertWarm(name, result.containerId ?? name, result.nodeId, slug, spec.image);
            }
          } catch (err) {
            logger.warn("Fleet: pool.warm failed", {
              slug,
              name,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }),
      );
    }
  }

  async cleanupWarmPool(): Promise<void> {
    if (!this.poolRepo) return;
    // Orphan reconciliation: the old per-node FleetManager had a `listPool`
    // op it fired at each agent to compare Docker state to DB state. In the
    // refactor that cross-checking moves to a later commit — for now we
    // rely on the queue's janitor to recover stuck processing rows, and
    // `markDead` + `deleteDead` are callable by operators as needed.
    //
    // TODO(phase-4): enqueue `pool.list` pinned at each node with a row
    // per node, reconcile with listActive() → markDead for missing rows,
    // enqueue pinned pool.cleanup for dead rows.
  }

  async warmCount(slug: string): Promise<number> {
    if (!this.poolRepo) return 0;
    return await this.poolRepo.warmCount(slug);
  }
}
