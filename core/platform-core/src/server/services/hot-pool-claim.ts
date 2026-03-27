/**
 * Atomic hot pool claiming.
 *
 * Uses IPoolRepository for all DB operations. No raw pool.query().
 */

import { randomBytes } from "node:crypto";

import { logger } from "../../config/logger.js";
import type { PlatformContainer } from "../container.js";
import { replenishPool } from "./hot-pool.js";
import type { IPoolRepository } from "./pool-repository.js";

export interface ClaimConfig {
  /** Shared secret for provision auth. */
  provisionSecret: string;
  /** Container name prefix. Default: "wopr". */
  containerPrefix?: string;
}

export interface ClaimAdminUser {
  id: string;
  email: string;
  name: string;
}

export interface ClaimResult {
  id: string;
  name: string;
  subdomain: string;
}

/**
 * Claim a warm pool instance, rename it, create a fleet profile,
 * and register the proxy route.
 *
 * Returns the claim result on success, or null if the pool is empty.
 */
export async function claimPoolInstance(
  container: PlatformContainer,
  repo: IPoolRepository,
  name: string,
  tenantId: string,
  _adminUser: ClaimAdminUser,
  config?: ClaimConfig,
): Promise<ClaimResult | null> {
  if (!container.fleet) throw new Error("Fleet services required for pool claim");

  const pc = container.productConfig;
  const containerPort = pc.fleet?.containerPort ?? 3100;
  const containerImage = pc.fleet?.containerImage ?? "ghcr.io/wopr-network/platform:latest";
  const platformDomain = pc.product?.domain ?? "localhost";
  const prefix = config?.containerPrefix ?? "wopr";

  // ---- Step 1: Atomically claim a warm instance ----
  const claimed = await repo.claimWarm(tenantId, name);
  if (!claimed) return null;

  const { id: instanceId, containerId } = claimed;

  // ---- Step 2: Rename Docker container ----
  const docker = container.fleet.docker;
  const containerName = `${prefix}-${name}`;

  try {
    const c = docker.getContainer(containerId);
    await c.rename({ name: containerName });
    logger.info(`Pool claim: renamed container to ${containerName}`);
  } catch (err) {
    logger.error("Pool claim: rename failed", { error: (err as Error).message });
    await repo.markDead(instanceId);
    return null;
  }

  // ---- Step 3: Create fleet profile ----
  const serviceKeyRepo = container.fleet.serviceKeyRepo;
  const gatewayKey = serviceKeyRepo ? await serviceKeyRepo.generate(tenantId, instanceId) : crypto.randomUUID();

  const store = container.fleet.profileStore;
  const profile = {
    id: instanceId,
    name,
    tenantId,
    image: containerImage,
    description: `Managed instance: ${name}`,
    env: {
      PORT: String(containerPort),
      HOST: "0.0.0.0",
      NODE_ENV: "production",
      PROVISION_SECRET: config?.provisionSecret ?? "",
      BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
      DATA_HOME: "/data",
      HOSTED_MODE: "true",
      DEPLOYMENT_MODE: "hosted_proxy",
      DEPLOYMENT_EXPOSURE: "private",
      MIGRATION_AUTO_APPLY: "true",
      GATEWAY_KEY: gatewayKey,
    },
    restartPolicy: "unless-stopped" as const,
    releaseChannel: "stable" as const,
    updatePolicy: "manual" as const,
  };

  await store.save(profile);
  logger.info(`Pool claim: saved fleet profile for ${name} (${instanceId})`);

  // ---- Step 4: Register proxy route ----
  try {
    if (container.fleet.proxy.addRoute) {
      await container.fleet.proxy.addRoute({
        instanceId,
        subdomain: name,
        upstreamHost: containerName,
        upstreamPort: containerPort,
        healthy: true,
      });
      logger.info(`Pool claim: registered proxy route ${name}.${platformDomain}`);
    }
  } catch (err) {
    logger.error("Pool claim: proxy route registration failed", { error: (err as Error).message });
  }

  // ---- Step 5: Replenish pool in background ----
  replenishPool(container, repo, { provisionSecret: config?.provisionSecret ?? "" }).catch((err) => {
    logger.error("Pool replenish after claim failed", { error: (err as Error).message });
  });

  const subdomain = `${name}.${platformDomain}`;
  return { id: instanceId, name, subdomain };
}
