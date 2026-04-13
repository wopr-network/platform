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

  constructor(
    private readonly queue: IOperationQueue,
    private readonly locator: IInstanceLocator,
    private readonly poolRepo: IPoolRepository | null,
    private readonly options: FleetOptions = {},
  ) {}

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

  async versionCheck(
    id: string,
  ): Promise<{ upToDate: boolean; currentImageId: string; latestImageId: string | null; tag: string } | null> {
    const located = await this.locator.locate(id);
    if (!located) return null;
    const name = containerNameFor({ id, productSlug: located.productSlug });
    try {
      return await this.queue.execute<{
        upToDate: boolean;
        currentImageId: string;
        latestImageId: string | null;
        tag: string;
      }>({
        type: "bot.versionCheck",
        target: located.nodeId,
        payload: { id, name },
      });
    } catch (err) {
      logger.warn("Fleet.versionCheck failed", {
        id,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  async roll(id: string): Promise<void> {
    const located = await this.locator.locate(id);
    if (!located) {
      // Fail loudly — reporting success for a no-op roll would let operators
      // think a fleet-wide rollout succeeded when nothing actually ran.
      throw new Error(`Fleet.roll: no owning node for instance ${id}`);
    }
    const name = containerNameFor({ id, productSlug: located.productSlug });
    await this.queue.execute({
      type: "bot.roll",
      target: located.nodeId,
      payload: { id, name },
    });
  }

  async remove(id: string, opts?: { removeVolumes?: boolean; nodeId?: string; productSlug?: string }): Promise<void> {
    // Lifecycle op — must run on the node that owns the container. If the
    // caller passed an explicit nodeId+productSlug (saga rollback path,
    // where bot_instances isn't written yet), use them. Otherwise look up
    // from the DB.
    let nodeId = opts?.nodeId;
    let productSlug = opts?.productSlug;
    if (!nodeId || !productSlug) {
      const located = await this.locator.locate(id);
      if (!located) {
        logger.warn("Fleet.remove: no owning node for instance", { id });
        return;
      }
      nodeId = nodeId ?? located.nodeId;
      productSlug = productSlug ?? located.productSlug;
    }
    const name = containerNameFor({ id, productSlug });
    await this.queue.execute({
      type: "bot.remove",
      target: nodeId,
      payload: { id, name, removeVolumes: opts?.removeVolumes === true },
    });
  }

  async getInstance(id: string): Promise<Instance> {
    const located = await this.locator.locate(id);
    if (!located) throw new Error(`Fleet.getInstance: no owning node for instance ${id}`);
    const { nodeId, productSlug } = located;
    // Recompute the deterministic container name from (productSlug, id) so
    // the proxy URL matches what the agent actually created on Docker.
    const name = containerNameFor({ id, productSlug });
    return new Instance({
      profile: { id, name, image: "", tenantId: "", productSlug, env: {} } as BotProfile,
      containerId: `${nodeId}:${name}`,
      containerName: name,
      url: `http://${name}:3100`,
      nodeId,
      instanceRepo: this.options.botInstanceRepo,
      eventEmitter: this.options.eventEmitter,
    });
  }

  async status(id: string): Promise<BotStatus> {
    const located = await this.locator.locate(id);
    if (!located) throw new Error(`Fleet.status: no owning node for instance ${id}`);
    const name = containerNameFor({ id, productSlug: located.productSlug });
    const result = await this.queue.execute<BotStatus>({
      type: "bot.inspect",
      target: located.nodeId,
      payload: { name },
    });
    return result;
  }

  async logs(id: string, opts?: { tail?: number }): Promise<string> {
    const located = await this.locator.locate(id);
    if (!located) throw new Error(`Fleet.logs: no owning node for instance ${id}`);
    const name = containerNameFor({ id, productSlug: located.productSlug });
    const result = await this.queue.execute<{ data?: string } | string>({
      type: "bot.logs",
      target: located.nodeId,
      payload: { name, tail: opts?.tail ?? 100 },
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

    // Orphan reconciliation runs in two directions:
    //
    //   1. DB → agent: for each pool_instances row, ask the agent whether
    //      the container still exists. If not, mark the row `dead` so it
    //      won't be claimed, then sweep dead rows at the end.
    //
    //   2. Agent → DB: for each container the agent reports, check whether
    //      there's a matching pool_instances row. If not, it's an orphan
    //      from a prior crash — enqueue a pinned `pool.cleanup` to remove it.
    //
    // We do both passes in a single loop per node: one `pool.list` op per
    // node, then walk both sides of the set difference. All queue ops are
    // pinned to the node because only the owning agent can inspect or
    // remove a container — Docker sockets are local to the host.

    // Group active (warm+claimed) rows by node so each agent gets one
    // `pool.list` op regardless of how many warm containers it hosts.
    const active = await this.poolRepo.listActive();
    if (active.length === 0) return;

    const byNode = new Map<string, typeof active>();
    for (const row of active) {
      const list = byNode.get(row.nodeId);
      if (list === undefined) {
        byNode.set(row.nodeId, [row]);
      } else {
        list.push(row);
      }
    }

    // Reconcile each node independently. A single dead node doesn't block
    // the others — we log and continue so a partial fleet outage doesn't
    // freeze the reconcile loop forever.
    for (const [nodeId, dbRows] of byNode) {
      let liveContainers: { id: string; name: string; running: boolean }[] = [];
      try {
        liveContainers = await this.queue.execute<{ id: string; name: string; running: boolean }[]>({
          type: "pool.list",
          target: nodeId,
          payload: {},
          timeoutMs: 30_000,
        });
      } catch (err) {
        logger.warn("Fleet.cleanupWarmPool: pool.list failed — skipping node", {
          nodeId,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      // Docker sometimes returns names with a leading slash ("/warm-slug-123").
      // Normalize both sides so the set comparison matches on the logical name.
      const liveNames = new Set(liveContainers.map((c) => stripLeadingSlash(c.name)));

      // Pass 1: DB → agent. Rows whose container is gone → markDead.
      for (const row of dbRows) {
        if (!liveNames.has(row.id)) {
          try {
            await this.poolRepo.markDead(row.id);
            logger.info("Fleet.cleanupWarmPool: marked dead (container missing)", {
              nodeId,
              id: row.id,
            });
          } catch (err) {
            logger.warn("Fleet.cleanupWarmPool: markDead failed", {
              nodeId,
              id: row.id,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }

      // Pass 2: agent → DB. Containers with no matching row → enqueue a
      // pinned cleanup to remove the orphan. A "warm-*" name prefix guards
      // against accidentally touching non-pool containers that happen to
      // live on the same host.
      const dbNames = new Set(dbRows.map((r) => r.id));
      for (const container of liveContainers) {
        const name = stripLeadingSlash(container.name);
        if (!name.startsWith("warm-")) continue;
        if (dbNames.has(name)) continue;
        try {
          await this.queue.execute({
            type: "pool.cleanup",
            target: nodeId,
            payload: { name },
            timeoutMs: 30_000,
          });
          logger.info("Fleet.cleanupWarmPool: removed orphan container", { nodeId, name });
        } catch (err) {
          logger.warn("Fleet.cleanupWarmPool: pool.cleanup failed", {
            nodeId,
            name,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // Finalize: purge any rows we (or an earlier sweep) marked dead. This
    // keeps pool_instances from accumulating tombstones.
    try {
      await this.poolRepo.deleteDead();
    } catch (err) {
      logger.warn("Fleet.cleanupWarmPool: deleteDead failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async warmCount(slug: string): Promise<number> {
    if (!this.poolRepo) return 0;
    return await this.poolRepo.warmCount(slug);
  }
}

/**
 * Strip a leading "/" from Docker container names. Docker returns names
 * with a leading slash (e.g. `/warm-slug-123`) in some APIs and without
 * in others; we normalize so reconcile set operations work consistently.
 */
function stripLeadingSlash(name: string): string {
  return name.startsWith("/") ? name.slice(1) : name;
}
