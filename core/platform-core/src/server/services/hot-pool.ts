/**
 * HotPool — manages a pool of pre-warmed Docker containers for instant claiming.
 *
 * The pool is container-aware but product-agnostic. Callers register container
 * specs (image, port, network) under opaque keys. The pool keeps warm containers
 * for each registered spec and lets callers claim them atomically.
 *
 * Registration is dynamic — add a new product to the DB, register it with
 * the pool, and warm containers appear on the next tick.
 *
 * All pool state (instances, sizes) is persisted via IPoolRepository.
 */

import { logger } from "../../config/logger.js";
import { friendlyName } from "../../fleet/friendly-names.js";
import type { INodeCommandBus } from "../../fleet/node-command-bus.js";
import type { IPoolRepository } from "./pool-repository.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Container spec registered with the pool. */
export interface PoolSpec {
  /** Docker image to pre-warm. */
  image: string;
  /** Port the container listens on. */
  port: number;
  /** Docker network to connect containers to. */
  network: string;
  /** Desired number of warm containers to maintain. */
  size: number;
}

/** Shared config for all pool operations (not per-spec). */
export interface HotPoolConfig {
  /** Shared secret injected into warm containers for provision auth. */
  provisionSecret: string;
  /** Registry auth for pulling images. */
  registryAuth?: { username: string; password: string; serveraddress: string };
  /** Cleanup + replenish interval in ms. Default: 60_000. */
  replenishIntervalMs?: number;
}

/** Result of a successful claim. */
export interface PoolClaim {
  id: string;
  containerId: string;
}

// ---------------------------------------------------------------------------
// HotPool
// ---------------------------------------------------------------------------

export class HotPool {
  private specs = new Map<string, PoolSpec>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private commandBus: INodeCommandBus | null = null;
  /** Node ID for warm container creation. Defaults to "local". */
  private nodeId = "local";
  /** Mutex: skip a tick if one is still in progress (prevents concurrent cleanup passes). */
  private ticking = false;

  constructor(
    private repo: IPoolRepository,
    private config: HotPoolConfig,
  ) {}

  /** Inject command bus after construction. Required for pool operations. */
  setCommandBus(bus: INodeCommandBus, nodeId = "local"): void {
    this.commandBus = bus;
    this.nodeId = nodeId;
  }

  // ---- Registration --------------------------------------------------------

  /** Register a container spec. The pool will start warming containers for it. */
  register(key: string, spec: PoolSpec): void {
    this.specs.set(key, { ...spec });
    // Persist desired size to DB for durability across restarts
    this.repo.setPoolSize(spec.size, key).catch((err) => {
      logger.warn(`Hot pool: failed to persist size for "${key}"`, { error: (err as Error).message });
    });
    logger.info(`Hot pool: registered "${key}" (${spec.image}, size=${spec.size})`);
  }

  /** Unregister a spec and drain its containers. */
  async unregister(key: string): Promise<void> {
    this.specs.delete(key);
    // Mark all instances for this key as dead and clean up containers
    const instances = await this.repo.listActive(key);
    for (const instance of instances) {
      await this.repo.markDead(instance.id);
      await this.removeContainer(instance.containerId);
    }
    await this.repo.deleteDead();
    logger.info(`Hot pool: unregistered spec "${key}", drained ${instances.length} container(s)`);
  }

  /** All currently registered spec keys. */
  registeredKeys(): string[] {
    return [...this.specs.keys()];
  }

  // ---- Lifecycle -----------------------------------------------------------

  async start(): Promise<{ stop: () => void }> {
    await this.tick();
    const intervalMs = this.config.replenishIntervalMs ?? 60_000;
    this.timer = setInterval(async () => {
      try {
        await this.tick();
      } catch (err) {
        logger.error("Hot pool tick failed", { error: (err as Error).message });
      }
    }, intervalMs);
    logger.info("Hot pool started");
    return { stop: () => this.stop() };
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // ---- Operations ----------------------------------------------------------

  /** Atomically claim a warm container for the given key. Returns null if pool is empty. */
  async claim(key: string): Promise<PoolClaim | null> {
    const result = await this.repo.claim(key);
    if (result) {
      // Trigger a tick in background to refill the slot.
      // tick() respects the mutex — skips if one is already running.
      this.tick().catch((err) => {
        logger.error("Pool tick after claim failed", { error: (err as Error).message });
      });
    }
    return result;
  }

  /** Current desired pool size for a key. */
  size(key: string): number {
    return this.specs.get(key)?.size ?? 0;
  }

  /** Update desired pool size for a key. Persists to DB. */
  async resize(key: string, size: number): Promise<void> {
    const spec = this.specs.get(key);
    if (spec) spec.size = size;
    await this.repo.setPoolSize(size, key);
  }

  // ---- Internals -----------------------------------------------------------

  private async tick(): Promise<void> {
    if (this.ticking) {
      logger.debug("Hot pool: tick already in progress, skipping");
      return;
    }
    this.ticking = true;
    try {
      await this.cleanup();
      await this.replenish();
    } finally {
      this.ticking = false;
    }
  }

  /**
   * Cleanup: reconcile DB state against the node's actual pool containers.
   *
   * 1. Fetch pool containers from the node via pool.list
   * 2. Mark dead any DB row whose container is missing or not running
   * 3. Remove any orphan pool containers not tracked in DB
   */
  private async cleanup(): Promise<void> {
    if (!this.commandBus) return;

    // Get actual pool containers from the node
    let nodeContainers: { id: string; name: string; running: boolean }[] = [];
    try {
      const result = await this.commandBus.send(this.nodeId, {
        type: "pool.list",
        payload: {},
      });
      nodeContainers = (result.data as { id: string; name: string; running: boolean }[]) ?? [];
    } catch (err) {
      logger.warn("Hot pool: failed to list node containers", { nodeId: this.nodeId, error: (err as Error).message });
      return;
    }

    const nodeByIdSet = new Set(nodeContainers.map((c) => c.id));

    // 1. Check DB-tracked instances
    const activeInstances = await this.repo.listActive();
    const trackedContainerIds = new Set<string>();

    for (const instance of activeInstances) {
      trackedContainerIds.add(instance.containerId);
      const onNode = nodeByIdSet.has(instance.containerId);
      if (!onNode) {
        await this.repo.markDead(instance.id);
        logger.warn(`Hot pool: missing container ${instance.id} (was ${instance.status})`);
        continue;
      }
      // Find matching node container by ID
      const nodeContainer = nodeContainers.find((c) => c.id === instance.containerId);
      if (!nodeContainer?.running) {
        await this.repo.markDead(instance.id);
        await this.removeContainer(nodeContainer?.name ?? instance.containerId);
        logger.warn(`Hot pool: dead container ${instance.id}`);
      }
    }

    await this.repo.deleteDead();

    // 2. Orphan reconciliation — pool containers on node not in DB.
    // Run removals in parallel: each docker stop takes ~10s, so sequential
    // cleanup of N orphans takes 10*N seconds. Parallel keeps it bounded.
    const orphans = nodeContainers.filter((c) => !trackedContainerIds.has(c.id));
    await Promise.all(
      orphans.map(async (container) => {
        await this.removeContainer(container.name);
        logger.info(`Hot pool: removed orphan ${container.name}`);
      }),
    );
  }

  /** Replenish warm containers for every registered spec. */
  private async replenish(): Promise<void> {
    for (const [key, spec] of this.specs) {
      const current = await this.repo.warmCount(key);
      const deficit = spec.size - current;
      if (deficit <= 0) continue;

      logger.info(`Hot pool [${key}]: replenishing ${deficit} (have ${current}, want ${spec.size})`);
      for (let i = 0; i < deficit; i++) {
        await this.createWarm(key, spec);
      }
    }
  }

  /** Create a single warm container via the node command bus. */
  private async createWarm(key: string, spec: PoolSpec): Promise<void> {
    if (!this.commandBus) {
      logger.warn("Hot pool: command bus not set, skipping warm container creation");
      return;
    }

    const { image, port, network } = spec;
    const { provisionSecret } = this.config;
    const id = crypto.randomUUID();
    const friendly = friendlyName(id);
    const containerName = `pool-${key}-${friendly}`;

    try {
      const result = await this.commandBus.send(this.nodeId, {
        type: "pool.warm",
        payload: {
          name: containerName,
          image,
          port,
          network: network || "platform-overlay",
          provisionSecret,
          ...(this.config.registryAuth ? { registryAuth: this.config.registryAuth } : {}),
        },
      });

      const containerId = typeof result.data === "string" ? result.data : containerName;
      await this.repo.insertWarm(id, containerId, this.nodeId, key, image);
      logger.info(`Hot pool: created warm container ${containerName} (${id}) for "${key}" on node ${this.nodeId}`);
    } catch (err) {
      logger.error("Hot pool: failed to create warm container", {
        key,
        nodeId: this.nodeId,
        error: (err as Error).message,
      });
    }
  }

  /** Best-effort stop + remove a container via command bus. */
  private async removeContainer(containerId: string): Promise<void> {
    if (!this.commandBus) return;
    try {
      await this.commandBus.send(this.nodeId, {
        type: "pool.cleanup",
        payload: { name: containerId },
      });
    } catch {
      /* already gone */
    }
  }
}
