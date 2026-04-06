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

  constructor(
    private docker: import("dockerode"),
    private repo: IPoolRepository,
    private config: HotPoolConfig,
  ) {}

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
      // Replenish in background to refill the slot
      this.replenish().catch((err) => {
        logger.error("Pool replenish after claim failed", { error: (err as Error).message });
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
    await this.cleanup();
    await this.replenish();
  }

  /**
   * Cleanup: verify every active DB row (warm + claimed) has a live container.
   * If the container is gone or dead, mark the row dead and delete it.
   * Then reconcile orphan Docker containers not tracked in the DB.
   */
  private async cleanup(): Promise<void> {
    const docker = this.docker;

    // 1. Check ALL active instances — mark dead if container is gone
    const activeInstances = await this.repo.listActive();
    const trackedContainerIds = new Set<string>();

    for (const instance of activeInstances) {
      trackedContainerIds.add(instance.containerId);
      try {
        const c = docker.getContainer(instance.containerId);
        const info = await c.inspect();
        const isRunning = info.State.Running && !info.State.Restarting;
        const restartCount = info.RestartCount ?? 0;
        const isCrashLooping = info.State.Restarting || restartCount > 2;
        if (!isRunning || isCrashLooping) {
          await this.repo.markDead(instance.id);
          await this.removeContainer(instance.containerId);
          logger.warn(`Hot pool: dead container ${instance.id} (was ${instance.status})`, {
            running: info.State.Running,
            restarting: info.State.Restarting,
            restartCount,
          });
        }
      } catch {
        await this.repo.markDead(instance.id);
        logger.warn(`Hot pool: missing container ${instance.id} (was ${instance.status})`);
      }
    }

    await this.repo.deleteDead();

    // 2. Orphan reconciliation — pool-* containers not tracked in DB
    try {
      const allContainers = await docker.listContainers({ all: true });
      for (const c of allContainers) {
        const name = (c.Names?.[0] ?? "").replace(/^\//, "");
        if (!name.startsWith("pool-")) continue;
        if (trackedContainerIds.has(c.Id)) continue;
        await this.removeContainer(c.Id);
        logger.info(`Hot pool: removed orphan container ${name}`);
      }
    } catch (err) {
      logger.warn("Hot pool: orphan reconciliation failed (non-fatal)", {
        error: (err as Error).message,
      });
    }
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

  /** Create a single warm container for the given spec. */
  private async createWarm(key: string, spec: PoolSpec): Promise<void> {
    const docker = this.docker;
    const { image, port, network } = spec;
    const { provisionSecret } = this.config;
    const id = crypto.randomUUID();
    const friendly = friendlyName(id);
    const containerName = `pool-${key}-${friendly}`;
    const volumeName = `pool-${key}-${friendly}`;

    try {
      // Pull image
      try {
        const auth = this.config.registryAuth;
        const [fromImage, tag] = image.includes(":") ? image.split(":") : [image, "latest"];
        logger.info(`Hot pool: pulling ${image} (auth: ${auth ? `${auth.username}@${auth.serveraddress}` : "none"})`);
        const authArg = auth
          ? { username: auth.username, password: auth.password, serveraddress: auth.serveraddress }
          : {};
        const stream: NodeJS.ReadableStream = await docker.createImage(authArg, { fromImage, tag });
        await new Promise<void>((resolve, reject) => {
          docker.modem.followProgress(stream, (err: Error | null) => (err ? reject(err) : resolve()));
        });
      } catch (pullErr) {
        logger.warn(`Hot pool: image pull failed for ${image}`, { key, error: (pullErr as Error).message });
      }

      // Init volume — clear stale embedded-PG data
      const init = await docker.createContainer({
        Image: image,
        Entrypoint: ["/bin/sh", "-c"],
        Cmd: ["rm -rf /data/* /data/.* 2>/dev/null; chown -R 999:999 /data || true"],
        User: "root",
        HostConfig: { Binds: [`${volumeName}:/data`] },
      });
      await init.start();
      await init.wait();
      await init.remove();

      // Wrap original entrypoint with cleanup
      const imageInfo = await docker.getImage(image).inspect();
      const rawEntrypoint = imageInfo.Config?.Entrypoint ?? [];
      const rawCmd = imageInfo.Config?.Cmd ?? [];
      const origEntrypoint: string[] = Array.isArray(rawEntrypoint) ? rawEntrypoint : [rawEntrypoint];
      const origCmd: string[] = Array.isArray(rawCmd) ? rawCmd : [rawCmd];
      const fullCmd = [...origEntrypoint, ...origCmd].join(" ");
      const cleanupAndExec = `rm -rf /paperclip/instances/default/db 2>/dev/null; exec ${fullCmd}`;

      const warmContainer = await docker.createContainer({
        Image: image,
        name: containerName,
        Entrypoint: ["/bin/sh", "-c"],
        Cmd: [cleanupAndExec],
        Env: [`PORT=${port}`, `WOPR_PROVISION_SECRET=${provisionSecret}`, "HOME=/data"],
        HostConfig: {
          Binds: [`${volumeName}:/data`],
          RestartPolicy: { Name: "on-failure", MaximumRetryCount: 3 },
        },
      });

      await warmContainer.start();

      // Connect to Docker network
      const targetNetwork = network || "platform";
      try {
        const net = docker.getNetwork(targetNetwork);
        await net.connect({ Container: warmContainer.id });
        logger.info(`Hot pool: connected ${containerName} to network ${targetNetwork}`);
      } catch (netErr) {
        logger.warn(`Hot pool: network connect failed for ${containerName}`, {
          error: (netErr as Error).message,
        });
      }

      await this.repo.insertWarm(id, warmContainer.id, key, image);
      logger.info(`Hot pool: created warm container ${containerName} (${id}) for "${key}"`);
    } catch (err) {
      logger.error("Hot pool: failed to create warm container", { key, error: (err as Error).message });
    }
  }

  /** Best-effort stop + remove a Docker container. */
  private async removeContainer(containerId: string): Promise<void> {
    try {
      const c = this.docker.getContainer(containerId);
      await c.stop().catch(() => {});
      await c.remove({ force: true });
    } catch {
      /* already gone */
    }
  }
}
