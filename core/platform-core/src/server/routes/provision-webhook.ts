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
 * Create delegates to InstanceService (single path for instance lifecycle).
 * Destroy and budget remain here as thin HTTP handlers.
 */

import { timingSafeEqual } from "node:crypto";
import { deprovisionContainer, updateBudget } from "@wopr-network/provision-client";
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
  // Delegates to InstanceService — the single path for instance lifecycle.
  // ------------------------------------------------------------------
  app.post("/create", async (c) => {
    if (!assertSecret(c.req.header("authorization"), config.provisionSecret)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (!container.instanceService) {
      return c.json({ error: "Instance service not configured" }, 501);
    }

    const body = await c.req.json();
    const { tenantId, subdomain, adminUser, agents, product: bodyProduct } = body;

    if (!tenantId || !subdomain) {
      return c.json({ error: "Missing required fields: tenantId, subdomain" }, 422);
    }

    const productSlug = bodyProduct ?? c.req.header("x-product") ?? null;
    if (!productSlug) {
      return c.json({ error: "Product slug required (X-Product header or request body)" }, 400);
    }

    // Resolve product config — InstanceService needs it for image, port, domain
    const productConfig = container.productConfigService
      ? await container.productConfigService.getBySlug(productSlug)
      : null;
    if (!productConfig) {
      return c.json({ error: `Unknown product: ${productSlug}` }, 400);
    }

    try {
      const result = await container.instanceService.create({
        tenantId,
        userId: adminUser?.id ?? tenantId,
        userEmail: adminUser?.email ?? `${subdomain}@platform.local`,
        name: subdomain,
        productSlug,
        productConfig,
        extra: {
          ceoName: agents?.[0]?.name,
          agents,
        },
      });

      logger.info("Provision webhook: instance created", {
        instanceId: result.id,
        subdomain,
        nodeId: result.nodeId,
        provisioned: result.provisioned,
      });

      return c.json(
        {
          ok: true,
          instanceId: result.id,
          subdomain,
          containerUrl: result.containerUrl,
          nodeId: result.nodeId,
          provisioned: result.provisioned,
        },
        201,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Provision webhook: create failed", { tenantId, subdomain, productSlug, error: message });
      if (message.includes("Insufficient credits")) return c.json({ error: message }, 402);
      if (message.includes("Instance limit")) return c.json({ error: message }, 403);
      return c.json({ error: message }, 500);
    }
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
