import { Hono } from "hono";
import type { ILedger } from "../../credits/ledger.js";
import { checkInstanceQuota, DEFAULT_INSTANCE_LIMITS } from "../../monetization/quotas/quota-check.js";
import { buildResourceLimits, DEFAULT_RESOURCE_CONFIG } from "../../monetization/quotas/resource-limits.js";

/**
 * Create quota routes.
 *
 * @param ledgerFactory - Factory returning the credit ledger
 */
export function createQuotaRoutes(ledgerFactory: () => ILedger): Hono {
  const routes = new Hono();

  /**
   * GET /
   *
   * Returns the authenticated tenant's credit balance and resource limits.
   */
  routes.get("/", async (c) => {
    const tenantId = c.req.query("tenant");
    if (!tenantId) {
      return c.json({ error: "tenant query param is required" }, 400);
    }

    const activeRaw = c.req.query("activeInstances");
    const activeInstances = activeRaw != null ? Number.parseInt(activeRaw, 10) : 0;

    if (Number.isNaN(activeInstances) || activeInstances < 0) {
      return c.json({ error: "Invalid activeInstances parameter" }, 400);
    }

    const balance = await ledgerFactory().balance(tenantId);

    return c.json({
      balanceCents: balance.toCentsRounded(),
      instances: {
        current: activeInstances,
        max: DEFAULT_INSTANCE_LIMITS.maxInstances,
        remaining:
          DEFAULT_INSTANCE_LIMITS.maxInstances === 0
            ? -1
            : Math.max(0, DEFAULT_INSTANCE_LIMITS.maxInstances - activeInstances),
      },
      resources: DEFAULT_RESOURCE_CONFIG,
    });
  });

  /**
   * POST /check
   *
   * Check whether an instance creation would be allowed.
   */
  routes.post("/check", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const tenantId = body.tenant as string;
    if (!tenantId) {
      return c.json({ error: "tenant is required" }, 400);
    }

    const activeInstances = Number(body.activeInstances ?? 0);
    const softCap = Boolean(body.softCap);

    if (Number.isNaN(activeInstances) || activeInstances < 0) {
      return c.json({ error: "Invalid activeInstances" }, 400);
    }

    // Check credit balance
    const balance = await ledgerFactory().balance(tenantId);
    if (balance.isNegative() || balance.isZero()) {
      return c.json(
        {
          allowed: false,
          reason: "Insufficient credit balance",
          currentBalanceCents: balance.toCentsRounded(),
          purchaseUrl: "/settings/billing",
        },
        402,
      );
    }

    const result = checkInstanceQuota(DEFAULT_INSTANCE_LIMITS, activeInstances, {
      softCapEnabled: softCap,
      gracePeriodMs: 7 * 24 * 60 * 60 * 1000,
    });

    const status = result.allowed ? 200 : 403;
    return c.json(result, status);
  });

  /**
   * GET /balance/:tenant
   *
   * Get a tenant's credit balance.
   */
  routes.get("/balance/:tenant", async (c) => {
    const tenantId = c.req.param("tenant");
    const balance = await ledgerFactory().balance(tenantId);
    return c.json({ tenantId, balanceCents: balance.toCentsRounded() });
  });

  /**
   * GET /history/:tenant
   *
   * Get a tenant's credit transaction history.
   */
  routes.get("/history/:tenant", async (c) => {
    const tenantId = c.req.param("tenant");
    const limitRaw = c.req.query("limit");
    const offsetRaw = c.req.query("offset");
    const type = c.req.query("type");

    const limit = limitRaw != null ? Number.parseInt(limitRaw, 10) : 50;
    const offset = offsetRaw != null ? Number.parseInt(offsetRaw, 10) : 0;

    const transactions = await ledgerFactory().history(tenantId, { limit, offset, type: type || undefined });
    return c.json({ transactions });
  });

  /**
   * GET /resource-limits
   *
   * Get default Docker resource constraints for bot containers.
   */
  routes.get("/resource-limits", (c) => {
    const limits = buildResourceLimits();
    return c.json(limits);
  });

  return routes;
}
