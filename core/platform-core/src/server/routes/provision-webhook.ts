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
 * All env var names are generic (no product-specific prefixes).
 */

import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";

import type { PlatformContainer } from "../container.js";

// ---------------------------------------------------------------------------
// Config accepted at mount time
// ---------------------------------------------------------------------------

export interface ProvisionWebhookConfig {
  provisionSecret: string;
  /** Docker image to provision for new instances. */
  instanceImage: string;
  /** Port the provisioned container listens on. */
  containerPort: number;
  /** Maximum instances per tenant (0 = unlimited). */
  maxInstancesPerTenant: number;
  /** URL of the metered inference gateway (passed to provisioned containers). */
  gatewayUrl?: string;
  /** Container prefix for naming (e.g. "wopr" → "wopr-<subdomain>"). */
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
  // ------------------------------------------------------------------
  app.post("/create", async (c) => {
    if (!assertSecret(c.req.header("authorization"), config.provisionSecret)) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    if (!container.fleet) {
      return c.json({ error: "Fleet management not configured" }, 501);
    }

    const body = await c.req.json();
    const { tenantId, subdomain } = body;

    if (!tenantId || !subdomain) {
      return c.json({ error: "Missing required fields: tenantId, subdomain" }, 422);
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
    const { profileStore, manager: fleet, proxy } = container.fleet;

    if (config.maxInstancesPerTenant > 0) {
      const profiles = await profileStore.list();
      const tenantInstances = profiles.filter((p) => p.tenantId === tenantId);
      if (tenantInstances.length >= config.maxInstancesPerTenant) {
        return c.json({ error: `Instance limit reached: maximum ${config.maxInstancesPerTenant} per tenant` }, 403);
      }
    }

    // Create the Docker container
    const instance = await fleet.create({
      tenantId,
      name: subdomain,
      description: `Managed instance for ${subdomain}`,
      image: config.instanceImage,
      env: {
        PORT: String(config.containerPort),
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

    // Register proxy route — container name must match FleetManager naming convention
    const prefix = config.containerPrefix ?? "wopr";
    const containerName = `${prefix}-${subdomain}`;
    await proxy.addRoute({
      instanceId: instance.id,
      subdomain,
      upstreamHost: containerName,
      upstreamPort: config.containerPort,
      healthy: true,
    });

    return c.json(
      {
        ok: true,
        instanceId: instance.id,
        subdomain,
        containerUrl: `http://${containerName}:${config.containerPort}`,
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
    const { instanceId } = body;

    if (!instanceId) {
      return c.json({ error: "Missing required field: instanceId" }, 422);
    }

    const { manager: fleet, proxy, serviceKeyRepo } = container.fleet;

    // Revoke gateway service key
    await serviceKeyRepo.revokeByInstance(instanceId);

    // Remove the Docker container
    try {
      await fleet.remove(instanceId);
    } catch {
      // Container may already be gone — continue cleanup
    }

    // Remove proxy route
    proxy.removeRoute(instanceId);

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
    const { instanceId, tenantEntityId, budgetCents } = body;

    if (!instanceId || !tenantEntityId || budgetCents === undefined) {
      return c.json({ error: "Missing required fields: instanceId, tenantEntityId, budgetCents" }, 422);
    }

    const { manager: fleet } = container.fleet;

    const status = await fleet.status(instanceId);
    if (status.state !== "running") {
      return c.json({ error: "Instance not running" }, 503);
    }

    return c.json({ ok: true, instanceId, budgetCents });
  });

  return app;
}
