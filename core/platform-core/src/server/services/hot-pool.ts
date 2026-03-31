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
  /** Product slugs to pre-warm. Each gets its own pool partition. */
  productSlugs?: string[];
  /** Registry auth for pulling sidecar images (dockerode needs explicit auth). */
  registryAuth?: { username: string; password: string; serveraddress: string };
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

interface WarmContainerOpts {
  containerImage: string;
  containerPort: number;
  dockerNetwork: string;
  productSlug: string;
}

async function createWarmContainer(
  container: PlatformContainer,
  repo: IPoolRepository,
  config: HotPoolConfig,
  opts: WarmContainerOpts,
): Promise<void> {
  if (!container.fleet) throw new Error("Fleet services required for hot pool");

  const { containerImage, containerPort, dockerNetwork, productSlug } = opts;
  const provisionSecret = config.provisionSecret;
  const docker = container.fleet.docker;
  const id = crypto.randomUUID();
  const containerName = `pool-${id.slice(0, 8)}`;
  const volumeName = `pool-${id.slice(0, 8)}`;

  try {
    // Pull image if not already available locally
    try {
      const auth = config.registryAuth;
      const [fromImage, tag] = containerImage.includes(":") ? containerImage.split(":") : [containerImage, "latest"];
      logger.info(
        `Hot pool: pulling ${containerImage} (auth: ${auth ? auth.username + "@" + auth.serveraddress : "none"})`,
      );
      // biome-ignore lint/complexity/noBannedTypes: dockerode createImage requires untyped call with auth as first arg
      const authArg = auth
        ? { username: auth.username, password: auth.password, serveraddress: auth.serveraddress }
        : {};
      const stream: NodeJS.ReadableStream = await docker.createImage(authArg, { fromImage, tag });
      await new Promise<void>((resolve, reject) => {
        docker.modem.followProgress(stream, (err: Error | null) => (err ? reject(err) : resolve()));
      });
    } catch (pullErr) {
      // Image may already be cached locally — continue and let createContainer fail if not
      logger.warn(`Hot pool: image pull failed for ${containerImage}`, {
        productSlug,
        error: (pullErr as Error).message,
      });
    }

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

    await repo.insertWarm(id, warmContainer.id, productSlug, containerImage);

    logger.info(`Hot pool: created warm container ${containerName} (${id}) for ${productSlug}`);
  } catch (err) {
    logger.error("Hot pool: failed to create warm container", {
      productSlug,
      error: (err as Error).message,
    });
  }
}

export async function replenishPool(
  container: PlatformContainer,
  repo: IPoolRepository,
  config: HotPoolConfig,
): Promise<void> {
  const slugs = config.productSlugs ?? [];

  if (slugs.length === 0) {
    // Legacy single-product mode — use boot-time product config
    const pc = container.productConfig;
    const slug = pc.product?.slug ?? "default";
    await replenishForProduct(container, repo, config, {
      containerImage: pc.fleet?.containerImage ?? "registry.wopr.bot/wopr:managed",
      containerPort: pc.fleet?.containerPort ?? 3100,
      dockerNetwork: pc.fleet?.dockerNetwork ?? "",
      productSlug: slug,
    });
    return;
  }

  // Multi-product mode — replenish each product's pool
  for (const slug of slugs) {
    const pc = await container.productConfigService.getBySlug(slug);
    if (!pc?.fleet) continue;
    await replenishForProduct(container, repo, config, {
      containerImage: pc.fleet.containerImage,
      containerPort: pc.fleet.containerPort,
      dockerNetwork: pc.fleet.dockerNetwork,
      productSlug: slug,
    });
  }
}

async function replenishForProduct(
  container: PlatformContainer,
  repo: IPoolRepository,
  config: HotPoolConfig,
  opts: WarmContainerOpts,
): Promise<void> {
  const desired = await repo.getPoolSize(opts.productSlug);
  const current = await repo.warmCount(opts.productSlug);
  const deficit = desired - current;

  if (deficit <= 0) return;

  logger.info(
    `Hot pool [${opts.productSlug}]: replenishing ${deficit} container(s) (have ${current}, want ${desired})`,
  );

  for (let i = 0; i < deficit; i++) {
    await createWarmContainer(container, repo, config, opts);
  }
}

async function cleanupDead(container: PlatformContainer, repo: IPoolRepository): Promise<void> {
  if (!container.fleet) return;

  const docker = container.fleet.docker;

  // 1. Check DB-tracked warm instances — mark dead if container is gone/stopped
  const warmInstances = await repo.listWarm();
  const trackedContainerIds = new Set<string>();

  for (const instance of warmInstances) {
    trackedContainerIds.add(instance.containerId);
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

  // 2. Reconcile orphan Docker containers — pool-* containers not tracked in DB
  try {
    const allContainers = await docker.listContainers({ all: true });
    for (const c of allContainers) {
      const name = (c.Names?.[0] ?? "").replace(/^\//, "");
      if (!name.startsWith("pool-")) continue;
      if (trackedContainerIds.has(c.Id)) continue;
      // Orphan — not in DB. Remove it.
      try {
        const orphan = docker.getContainer(c.Id);
        await orphan.stop().catch(() => {});
        await orphan.remove({ force: true });
        logger.info(`Hot pool: removed orphan container ${name}`);
      } catch {
        // Already gone
      }
    }
  } catch (err) {
    logger.warn("Hot pool: orphan reconciliation failed (non-fatal)", { error: (err as Error).message });
  }
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
