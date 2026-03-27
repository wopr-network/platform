/**
 * Instance lifecycle routes — provision, destroy, budget.
 *
 * POST /api/provision/create  — spin up a managed container and configure it
 * POST /api/provision/destroy — tear down a managed container
 * PUT  /api/provision/budget  — update a container's spending budget
 *
 * Uses:
 * - platform-core FleetManager for Docker container lifecycle
 * - @wopr-network/provision-client for configuring containers via /internal/provision
 * - NodeRegistry + PlacementStrategy for multi-node container placement
 */

import { timingSafeEqual } from "node:crypto";

import { logger } from "@wopr-network/platform-core/config/logger";
import type { ILedger } from "@wopr-network/platform-core/credits";
import type { IProfileStore } from "@wopr-network/platform-core/fleet/profile-store";
import type { IServiceKeyRepository } from "@wopr-network/platform-core/gateway/service-key-repository";
import type { ProductConfig } from "@wopr-network/platform-core/product-config";
import { checkHealth, deprovisionContainer, provisionContainer, updateBudget } from "@wopr-network/provision-client";
import { Hono } from "hono";
import type { NodeRegistry } from "../fleet/node-registry.js";
import type { PlacementStrategy } from "../fleet/placement.js";
import { registerRoute, removeRoute } from "../proxy/fleet-resolver.js";

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface ProvisionWebhookDeps {
  creditLedger: ILedger | null;
  profileStore: IProfileStore;
  productConfig: ProductConfig;
  nodeRegistry: NodeRegistry;
  placementStrategy: PlacementStrategy;
  serviceKeyRepo: IServiceKeyRepository | null;
}

let _deps: ProvisionWebhookDeps | null = null;

export function setProvisionWebhookDeps(d: ProvisionWebhookDeps): void {
  _deps = d;
}

function deps(): ProvisionWebhookDeps {
  if (!_deps) throw new Error("ProvisionWebhook deps not initialized — call setProvisionWebhookDeps() first");
  return _deps;
}

export const provisionWebhookRoutes = new Hono();

/** Validate the internal provision secret (timing-safe). */
function assertSecret(authHeader: string | undefined): boolean {
  const secret = process.env.PROVISION_SECRET ?? "";
  if (!secret) return false;
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length).trim();
  if (token.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
}

/**
 * POST /api/provision/create — create a new managed instance.
 *
 * Flow:
 * 1. Select target node via placement strategy
 * 2. FleetManager.create() → Docker container with the managed image
 * 3. FleetManager.start() → start the container
 * 4. Register proxy route → subdomain → container
 * 5. Wait for health check
 * 6. provision-client → configure the instance (company, users, agents)
 */
provisionWebhookRoutes.post("/create", async (c) => {
  if (!assertSecret(c.req.header("authorization"))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { tenantId, subdomain, adminUser, agents, budgetCents, apiKey } = body;

  if (!tenantId || !subdomain) {
    return c.json({ error: "Missing required fields: tenantId, subdomain" }, 422);
  }

  const pc = deps().productConfig;
  const maxInstances = pc.fleet?.maxInstances ?? Number(process.env.MAX_INSTANCES_PER_TENANT ?? 5);
  const containerPort = pc.fleet?.containerPort ?? Number(process.env.CONTAINER_PORT ?? 3100);
  const containerImage =
    pc.fleet?.containerImage ?? process.env.CONTAINER_IMAGE ?? "ghcr.io/wopr-network/platform:latest";
  const provisionSecret = process.env.PROVISION_SECRET ?? "";
  const gatewayUrl = process.env.GATEWAY_URL ?? "";
  const registry = deps().nodeRegistry;

  // Billing gate — require positive credit balance before provisioning
  const ledger = deps().creditLedger;
  if (ledger) {
    const balance = await ledger.balance(tenantId);
    if (balance.isZero() || balance.isNegative()) {
      return c.json({ error: "Insufficient credits: add funds before creating an instance" }, 402);
    }
  }

  // Instance limit gate — cap instances per tenant
  const store = deps().profileStore;
  const profiles = await store.list();
  const tenantInstances = profiles.filter((p) => p.tenantId === tenantId);
  if (tenantInstances.length >= maxInstances) {
    return c.json({ error: `Instance limit reached: maximum ${maxInstances} per tenant` }, 403);
  }

  // Select target node via placement strategy
  const strategy = deps().placementStrategy;
  const nodes = registry.list();
  const containerCounts = registry.getContainerCounts();
  const targetNode = strategy.selectNode(nodes, containerCounts);
  const fleet = targetNode.fleet;

  logger.info(`Placing container on node: ${targetNode.config.name} (${targetNode.config.id})`);

  // 1. Create the Docker container via FleetManager on the target node
  const profile = await fleet.create({
    tenantId,
    name: subdomain,
    description: `Managed instance: ${subdomain}`,
    image: containerImage,
    env: {
      PORT: String(containerPort),
      WOPR_PROVISION_SECRET: provisionSecret,
    },
    restartPolicy: "unless-stopped",
    releaseChannel: "stable",
    updatePolicy: "manual",
  });

  // 2. Start the container
  const instance = await fleet.getInstance(profile.id);
  await instance.start();

  // Track container → node assignment
  registry.assignContainer(profile.id, targetNode.config.id);

  // 3. Register proxy route — use node-appropriate upstream host
  const containerName = `wopr-${subdomain}`;
  const upstreamHost = registry.resolveUpstreamHost(profile.id, containerName);
  await registerRoute(profile.id, subdomain, upstreamHost, containerPort);

  // 4. Wait for container to become healthy
  const containerUrl = `http://${upstreamHost}:${containerPort}`;
  const healthy = await waitForHealth(containerUrl);
  if (!healthy) {
    logger.warn(`Container not healthy after creation: ${subdomain}`);
    // Clean up — remove container, route, and gateway key
    const keyRepo = deps().serviceKeyRepo;
    if (keyRepo) await keyRepo.revokeByInstance(profile.id);
    try {
      await fleet.remove(profile.id);
    } catch (err) {
      logger.warn("Cleanup after unhealthy container failed", { err });
    }
    registry.unassignContainer(profile.id);
    await removeRoute(profile.id);
    return c.json({ error: "Container failed health check" }, 503);
  }

  // 5. Configure via provision-client (company, admin user, starter agents)
  const tenantName = body.tenantName ?? subdomain;
  const result = await provisionContainer(containerUrl, provisionSecret, {
    tenantId,
    tenantName,
    gatewayUrl,
    apiKey: apiKey ?? "",
    budgetCents: budgetCents ?? 0,
    adminUser: adminUser ?? {
      id: tenantId,
      email: `${subdomain}@platform.local`,
      name: subdomain,
    },
    agents,
  });

  logger.info(`Created instance: ${subdomain} (${profile.id}) on node ${targetNode.config.name}`);

  return c.json(
    {
      ok: true,
      instanceId: profile.id,
      subdomain,
      containerUrl,
      nodeId: targetNode.config.id,
      ...result,
    },
    201,
  );
});

/**
 * POST /api/provision/destroy — tear down a managed instance.
 */
provisionWebhookRoutes.post("/destroy", async (c) => {
  if (!assertSecret(c.req.header("authorization"))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { instanceId, tenantEntityId } = body;

  if (!instanceId) {
    return c.json({ error: "Missing required field: instanceId" }, 422);
  }

  const pc = deps().productConfig;
  const destroyContainerPort = pc.fleet?.containerPort ?? Number(process.env.CONTAINER_PORT ?? 3100);
  const destroyProvisionSecret = process.env.PROVISION_SECRET ?? "";
  const registry = deps().nodeRegistry;

  // Resolve which node this container is on
  const nodeId = registry.getContainerNode(instanceId);
  const fleet = nodeId ? registry.getFleetManager(nodeId) : registry.list()[0].fleet;

  // Deprovision the instance first (graceful teardown)
  if (tenantEntityId) {
    try {
      const status = await fleet.status(instanceId);
      if (status.state === "running") {
        const containerName = `wopr-${status.name}`;
        const upstreamHost = registry.resolveUpstreamHost(instanceId, containerName);
        const containerUrl = `http://${upstreamHost}:${destroyContainerPort}`;
        await deprovisionContainer(containerUrl, destroyProvisionSecret, tenantEntityId);
      }
    } catch (err) {
      logger.warn(`Deprovision call failed for ${instanceId}`, { err });
      // Continue — container may already be gone
    }
  }

  // Revoke this instance's gateway service key
  const keyRepo = deps().serviceKeyRepo;
  if (keyRepo) await keyRepo.revokeByInstance(instanceId);

  // Remove the Docker container
  try {
    await fleet.remove(instanceId);
  } catch (err) {
    logger.warn(`Fleet remove failed for ${instanceId}`, { err });
  }

  // Remove from tracking and proxy route table
  registry.unassignContainer(instanceId);
  await removeRoute(instanceId);

  logger.info(`Destroyed instance: ${instanceId}`);
  return c.json({ ok: true });
});

/**
 * PUT /api/provision/budget — update a container's spending budget.
 */
provisionWebhookRoutes.put("/budget", async (c) => {
  if (!assertSecret(c.req.header("authorization"))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json();
  const { instanceId, tenantEntityId, budgetCents, perAgentCents } = body;

  if (!instanceId || !tenantEntityId || budgetCents === undefined) {
    return c.json({ error: "Missing required fields: instanceId, tenantEntityId, budgetCents" }, 422);
  }

  const pcBudget = deps().productConfig;
  const budgetContainerPort = pcBudget.fleet?.containerPort ?? Number(process.env.CONTAINER_PORT ?? 3100);
  const budgetProvisionSecret = process.env.PROVISION_SECRET ?? "";
  const registry = deps().nodeRegistry;

  // Resolve which node this container is on
  const nodeId = registry.getContainerNode(instanceId);
  const fleet = nodeId ? registry.getFleetManager(nodeId) : registry.list()[0].fleet;

  const status = await fleet.status(instanceId);
  if (status.state !== "running") {
    return c.json({ error: "Instance not running" }, 503);
  }

  const containerName = `wopr-${status.name}`;
  const upstreamHost = registry.resolveUpstreamHost(instanceId, containerName);
  const containerUrl = `http://${upstreamHost}:${budgetContainerPort}`;

  await updateBudget(containerUrl, budgetProvisionSecret, tenantEntityId, budgetCents, perAgentCents);

  return c.json({ ok: true });
});

/**
 * Wait for a container to pass its health check.
 * Retries up to 10 times with 2-second intervals.
 */
async function waitForHealth(containerUrl: string, retries = 10, intervalMs = 2000): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    if (await checkHealth(containerUrl)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}
