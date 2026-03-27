/**
 * Hot pool manager — pre-provisions warm containers for instant claiming.
 *
 * Reads desired pool size from DB (`pool_config` table) via IPoolRepository.
 * Periodically replenishes the pool and cleans up dead containers.
 *
 * All config is DB-driven — no env vars for pool size, container image,
 * or port. Admin API updates pool_config, this reads it.
 */

import { logger } from "../../config/logger.js";
import type { PlatformContainer } from "../container.js";
import type { IPoolRepository } from "./pool-repository.js";

export interface HotPoolConfig {
  /** Shared secret for provision auth between platform and managed instances. */
  provisionSecret: string;
  /** Replenish interval in ms. Default: 60_000. */
  replenishIntervalMs?: number;
}

export interface HotPoolHandles {
  replenishTimer: ReturnType<typeof setInterval>;
  stop: () => void;
}

// ---------------------------------------------------------------------------
// Pool size — delegates to repository
// ---------------------------------------------------------------------------

export async function getPoolSize(repo: IPoolRepository): Promise<number> {
  return repo.getPoolSize();
}

export async function setPoolSize(repo: IPoolRepository, size: number): Promise<void> {
  return repo.setPoolSize(size);
}

// ---------------------------------------------------------------------------
// Warm container management
// ---------------------------------------------------------------------------

async function createWarmContainer(
  container: PlatformContainer,
  repo: IPoolRepository,
  config: HotPoolConfig,
): Promise<void> {
  if (!container.fleet) throw new Error("Fleet services required for hot pool");

  const pc = container.productConfig;
  const containerImage = pc.fleet?.containerImage ?? "ghcr.io/wopr-network/platform:latest";
  const containerPort = pc.fleet?.containerPort ?? 3100;
  const provisionSecret = config.provisionSecret;
  const dockerNetwork = pc.fleet?.dockerNetwork ?? "";
  const docker = container.fleet.docker;
  const id = crypto.randomUUID();
  const containerName = `pool-${id.slice(0, 8)}`;
  const volumeName = `pool-${id.slice(0, 8)}`;

  try {
    // Init volume permissions
    const init = await docker.createContainer({
      Image: containerImage,
      Entrypoint: ["/bin/sh", "-c"],
      Cmd: ["chown -R 999:999 /data"],
      User: "root",
      HostConfig: { Binds: [`${volumeName}:/data`] },
    });
    await init.start();
    await init.wait();
    await init.remove();

    const warmContainer = await docker.createContainer({
      Image: containerImage,
      name: containerName,
      Env: [`PORT=${containerPort}`, `PROVISION_SECRET=${provisionSecret}`, "HOME=/data"],
      HostConfig: {
        Binds: [`${volumeName}:/data`],
        RestartPolicy: { Name: "unless-stopped" },
      },
    });

    await warmContainer.start();

    if (dockerNetwork) {
      const network = docker.getNetwork(dockerNetwork);
      await network.connect({ Container: warmContainer.id });
    }

    await repo.insertWarm(id, warmContainer.id);

    logger.info(`Hot pool: created warm container ${containerName} (${id})`);
  } catch (err) {
    logger.error("Hot pool: failed to create warm container", {
      error: (err as Error).message,
    });
  }
}

export async function replenishPool(
  container: PlatformContainer,
  repo: IPoolRepository,
  config: HotPoolConfig,
): Promise<void> {
  const desired = await repo.getPoolSize();
  const current = await repo.warmCount();
  const deficit = desired - current;

  if (deficit <= 0) return;

  logger.info(`Hot pool: replenishing ${deficit} container(s) (have ${current}, want ${desired})`);

  for (let i = 0; i < deficit; i++) {
    await createWarmContainer(container, repo, config);
  }
}

async function cleanupDead(container: PlatformContainer, repo: IPoolRepository): Promise<void> {
  if (!container.fleet) return;

  const docker = container.fleet.docker;
  const warmInstances = await repo.listWarm();

  for (const instance of warmInstances) {
    try {
      const c = docker.getContainer(instance.containerId);
      const info = await c.inspect();
      if (!info.State.Running) {
        await repo.markDead(instance.id);
        try {
          await c.remove({ force: true });
        } catch {
          /* already gone */
        }
        logger.warn(`Hot pool: marked dead container ${instance.id}`);
      }
    } catch {
      await repo.markDead(instance.id);
      logger.warn(`Hot pool: marked missing container ${instance.id} as dead`);
    }
  }

  await repo.deleteDead();
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export async function startHotPool(
  container: PlatformContainer,
  repo: IPoolRepository,
  config: HotPoolConfig,
): Promise<HotPoolHandles> {
  await cleanupDead(container, repo);
  await replenishPool(container, repo, config);

  const intervalMs = config.replenishIntervalMs ?? 60_000;
  const replenishTimer = setInterval(async () => {
    try {
      await cleanupDead(container, repo);
      await replenishPool(container, repo, config);
    } catch (err) {
      logger.error("Hot pool tick failed", { error: (err as Error).message });
    }
  }, intervalMs);

  logger.info("Hot pool manager started");

  return {
    replenishTimer,
    stop: () => clearInterval(replenishTimer),
  };
}
