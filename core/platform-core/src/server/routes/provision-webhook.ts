/**
 * Provision webhook routes — instance lifecycle management.
 *
 * POST /create  — spin up a new container and configure it
 * POST /destroy — tear down a container
 * PUT  /budget  — update a container's spending budget
 *
 * Extracted from product-specific implementations into platform-core so
 * every product gets the same timing-safe auth and DI-based fleet access
 * without copy-pasting.
 *
 * Uses NodeRegistry + ContainerPlacementStrategy for multi-node placement.
 * All env var names are generic (no product-specific prefixes).
 */

import { timingSafeEqual } from "node:crypto";
import { checkHealth, deprovisionContainer, provisionContainer, updateBudget } from "@wopr-network/provision-client";
import { Hono } from "hono";

import { logger } from "../../config/logger.js";
import type { PlatformContainer } from "../container.js";

// ---------------------------------------------------------------------------
// Config accepted at mount time
// ---------------------------------------------------------------------------

export interface ProvisionWebhookConfig {
  provisionSecret: string;
  /** Fallback Docker image (used when product config lookup fails). */
  instanceImage: string;
  /** Fallback container port. */
  containerPort: number;
  /** Fallback max instances per tenant (0 = unlimited). */
  maxInstancesPerTenant: number;
  /** URL of the metered inference gateway (passed to provisioned containers). */
  gatewayUrl?: string;
  /** Fallback container prefix for naming (e.g. "wopr" → "wopr-<subdomain>"). */
  containerPrefix?: string;
}

// ---------------------------------------------------------------------------
// Timing-safe secret validation (same pattern as crypto-webhook)
// ---------------------------------------------------------------------------

function assertSecret(authHeader: string | undefined, secret: string): boolean {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice("Bearer ".length).trim();
  if (token.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(secret));
}

// ---------------------------------------------------------------------------
// Health check wait loop
// ---------------------------------------------------------------------------

async function waitForHealth(containerUrl: string, retries = 10, intervalMs = 2000): Promise<boolean> {
  for (let i = 0; i < retries; i++) {
    if (await checkHealth(containerUrl)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create the provision webhook Hono sub-app.
 *
 * Mount it at `/api/provision` (or wherever the product prefers).
 *
 * ```ts
 * app.route("/api/provision", createProvisionWebhookRoutes(container, config));
 * ```
 */
export function createProvisionWebhookRoutes(container: PlatformContainer, config: ProvisionWebhookConfig): Hono {
  const app = new Hono();

  // ------------------------------------------------------------------
  // POST /create — create a new managed instance
  // ------------------------------------------------------------------
  app.post("/create", async (c) => {
    if (!assertSecret(c.req.header("authorization"), config.provisionSecret)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (!container.fleet) {
      return c.json({ error: "Fleet management not configured" }, 501);
    }

    const body = await c.req.json();
    const { tenantId, subdomain, adminUser, agents, budgetCents, apiKey, product: bodyProduct } = body;

    if (!tenantId || !subdomain) {
      return c.json({ error: "Missing required fields: tenantId, subdomain" }, 422);
    }

    // Resolve product fleet config per-request.
    // Priority: request body "product" → X-Product header → boot-time fallback.
    const productSlug = bodyProduct ?? c.req.header("x-product") ?? null;
    let instanceImage = config.instanceImage;
    let containerPort = config.containerPort;
    let maxInstances = config.maxInstancesPerTenant;
    if (!productSlug) {
      return c.json({ error: "Product slug required (X-Product header or request body)" }, 400);
    }
    if (productSlug && container.productConfigService) {
      const productConfig = await container.productConfigService.getBySlug(productSlug);
      if (productConfig?.fleet) {
        instanceImage = productConfig.fleet.containerImage || instanceImage;
        containerPort = productConfig.fleet.containerPort || containerPort;
        maxInstances = productConfig.fleet.maxInstances ?? maxInstances;
      }
    }

    // Billing gate — require positive credit balance before provisioning
    const balance = await container.creditLedger.balance(tenantId);
    if (typeof balance === "object" && "isZero" in balance) {
      const bal = balance as { isZero(): boolean; isNegative(): boolean };
      if (bal.isZero() || bal.isNegative()) {
        return c.json({ error: "Insufficient credits: add funds before creating an instance" }, 402);
      }
    }

    // Instance limit gate
    const { profileStore, nodeRegistry, placementStrategy, fleetResolver, serviceKeyRepo } = container.fleet;

    if (maxInstances > 0) {
      const profiles = await profileStore.list();
      const tenantInstances = profiles.filter((p) => p.tenantId === tenantId);
      if (tenantInstances.length >= maxInstances) {
        return c.json({ error: `Instance limit reached: maximum ${maxInstances} per tenant` }, 403);
      }
    }

    // Select target node via placement strategy
    const nodes = nodeRegistry.list();
    const containerCounts = nodeRegistry.getContainerCounts();
    const targetNode = placementStrategy.selectNode(nodes, containerCounts);
    const fleet = targetNode.fleet;

    logger.info(`Placing container on node: ${targetNode.config.name} (${targetNode.config.id})`);

    // Create the Docker container — image comes from product config
    if (!productSlug) {
      return c.json({ error: "Product slug is required: set 'product' in body or X-Product header" }, 422);
    }
    const instance = await fleet.create({
      tenantId,
      name: subdomain,
      description: `Managed instance for ${subdomain}`,
      image: instanceImage,
      productSlug,
      env: {
        PORT: String(containerPort),
        PROVISION_SECRET: config.provisionSecret,
        HOSTED_MODE: "true",
        DEPLOYMENT_MODE: "hosted_proxy",
        DEPLOYMENT_EXPOSURE: "private",
        MIGRATION_AUTO_APPLY: "true",
      },
      restartPolicy: "unless-stopped",
      releaseChannel: "stable",
      updatePolicy: "manual",
    });

    // Start the container and get the Instance handle
    const inst = await fleet.getInstance(instance.id);
    await inst.start();

    // Track container → node assignment
    nodeRegistry.assignContainer(instance.id, targetNode.config.id);

    // Register proxy route — container name comes from the Instance (single source of truth)
    const upstreamHost = nodeRegistry.resolveUpstreamHost(instance.id, inst.containerName);
    await fleetResolver.registerRoute(instance.id, subdomain, upstreamHost, containerPort);

    // Wait for container to become healthy
    const containerUrl = `http://${upstreamHost}:${containerPort}`;
    const healthy = await waitForHealth(containerUrl);
    if (!healthy) {
      logger.warn(`Container not healthy after creation: ${subdomain}`);
      // Clean up — remove container, route, and gateway key
      await serviceKeyRepo.revokeByInstance(instance.id);
      try {
        await fleet.remove(instance.id);
      } catch (err) {
        logger.warn("Cleanup after unhealthy container failed", { err });
      }
      nodeRegistry.unassignContainer(instance.id);
      await fleetResolver.removeRoute(instance.id);
      return c.json({ error: "Container failed health check" }, 503);
    }

    // Generate a gateway service key for this instance (product + tenant + instance)
    const gatewayKey = serviceKeyRepo
      ? await serviceKeyRepo.generate(tenantId, instance.id, productSlug ?? undefined)
      : (apiKey ?? "");

    // Configure via provision-client (company, admin user, starter agents)
    const tenantName = body.tenantName ?? subdomain;
    const result = await provisionContainer(containerUrl, config.provisionSecret, {
      tenantId,
      tenantName,
      gatewayUrl: config.gatewayUrl ?? "",
      apiKey: gatewayKey,
      budgetCents: budgetCents ?? 0,
      adminUser: adminUser ?? {
        id: tenantId,
        email: `${subdomain}@platform.local`,
        name: subdomain,
      },
      agents,
    });

    logger.info(`Created instance: ${subdomain} (${instance.id}) on node ${targetNode.config.name}`);

    return c.json(
      {
        ok: true,
        instanceId: instance.id,
        subdomain,
        containerUrl,
        nodeId: targetNode.config.id,
        ...result,
      },
      201,
    );
  });

  // ------------------------------------------------------------------
  // POST /destroy — tear down a managed instance
  // ------------------------------------------------------------------
  app.post("/destroy", async (c) => {
    if (!assertSecret(c.req.header("authorization"), config.provisionSecret)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (!container.fleet) {
      return c.json({ error: "Fleet management not configured" }, 501);
    }

    const body = await c.req.json();
    const { instanceId, tenantEntityId } = body;

    if (!instanceId) {
      return c.json({ error: "Missing required field: instanceId" }, 422);
    }

    const { nodeRegistry, fleetResolver, serviceKeyRepo } = container.fleet;

    // Resolve which node this container is on
    const nodeId = nodeRegistry.getContainerNode(instanceId);
    const fleet = nodeId ? nodeRegistry.getFleetManager(nodeId) : nodeRegistry.list()[0].fleet;

    // Deprovision the instance first (graceful teardown)
    if (tenantEntityId) {
      try {
        const status = await fleet.status(instanceId);
        if (status.state === "running") {
          const containerName = `wopr-${status.name}`;
          const upstreamHost = nodeRegistry.resolveUpstreamHost(instanceId, containerName);
          const containerUrl = `http://${upstreamHost}:${config.containerPort}`;
          await deprovisionContainer(containerUrl, config.provisionSecret, tenantEntityId);
        }
      } catch (err) {
        logger.warn(`Deprovision call failed for ${instanceId}`, { err });
        // Continue — container may already be gone
      }
    }

    // Revoke gateway service key
    await serviceKeyRepo.revokeByInstance(instanceId);

    // Remove the Docker container
    try {
      await fleet.remove(instanceId);
    } catch {
      // Container may already be gone — continue cleanup
    }

    // Remove from tracking and proxy route table
    nodeRegistry.unassignContainer(instanceId);
    await fleetResolver.removeRoute(instanceId);

    logger.info(`Destroyed instance: ${instanceId}`);
    return c.json({ ok: true });
  });

  // ------------------------------------------------------------------
  // PUT /budget — update a container's spending budget
  // ------------------------------------------------------------------
  app.put("/budget", async (c) => {
    if (!assertSecret(c.req.header("authorization"), config.provisionSecret)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (!container.fleet) {
      return c.json({ error: "Fleet management not configured" }, 501);
    }

    const body = await c.req.json();
    const { instanceId, tenantEntityId, budgetCents, perAgentCents } = body;

    if (!instanceId || !tenantEntityId || budgetCents === undefined) {
      return c.json({ error: "Missing required fields: instanceId, tenantEntityId, budgetCents" }, 422);
    }

    const { nodeRegistry } = container.fleet;

    // Resolve which node this container is on
    const nodeId = nodeRegistry.getContainerNode(instanceId);
    const fleet = nodeId ? nodeRegistry.getFleetManager(nodeId) : nodeRegistry.list()[0].fleet;

    const status = await fleet.status(instanceId);
    if (status.state !== "running") {
      return c.json({ error: "Instance not running" }, 503);
    }

    const containerName = `wopr-${status.name}`;
    const upstreamHost = nodeRegistry.resolveUpstreamHost(instanceId, containerName);
    const containerUrl = `http://${upstreamHost}:${config.containerPort}`;

    await updateBudget(containerUrl, config.provisionSecret, tenantEntityId, budgetCents, perAgentCents);

    return c.json({ ok: true });
  });

  return app;
}
