import { Hono } from "hono";
import { z } from "zod";
import type { AuthEnv } from "../../auth/index.js";
import type { ILedger } from "../../credits/index.js";
import { Credit, InsufficientBalanceError } from "../../credits/index.js";
import type { AdminAuditLogger } from "./admin-audit-helper.js";
import { safeAuditLog } from "./admin-audit-helper.js";

const tenantIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9_-]+$/);

const TENANT_ID_ERROR = "tenantId must be 1-128 alphanumeric characters, hyphens, or underscores";

function parseTenantId(c: { req: { param: (k: string) => string } }): { ok: true; tenant: string } | { ok: false } {
  const result = tenantIdSchema.safeParse(c.req.param("tenantId"));
  if (!result.success) return { ok: false };
  return { ok: true, tenant: result.data };
}

function parseIntParam(value: string | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Create admin credit API routes.
 * Pass a ledger directly or a factory for lazy init.
 */
export function createAdminCreditApiRoutes(
  ledgerOrFactory: ILedger | (() => ILedger),
  auditLogger?: () => AdminAuditLogger,
): Hono<AuthEnv> {
  const ledgerFactory = typeof ledgerOrFactory === "function" ? ledgerOrFactory : () => ledgerOrFactory;
  const routes = new Hono<AuthEnv>();

  routes.post("/:tenantId/grant", async (c) => {
    const ledger = ledgerFactory();
    const parsed = parseTenantId(c);
    if (!parsed.ok) return c.json({ error: TENANT_ID_ERROR }, 400);
    const tenant = parsed.tenant;

    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const amountCents = body.amount_cents;
    const reason = body.reason;

    if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents <= 0) {
      return c.json({ error: "amount_cents must be a positive integer" }, 400);
    }

    if (typeof reason !== "string" || !reason.trim()) {
      return c.json({ error: "reason is required and must be non-empty" }, 400);
    }

    try {
      const user = c.get("user");
      const adminUser = user?.id ?? "unknown";
      let result: Awaited<ReturnType<typeof ledger.credit>>;
      try {
        result = await ledger.credit(tenant, Credit.fromCents(amountCents), "admin_grant", {
          description: reason,
          createdBy: adminUser,
        });
      } catch (err) {
        safeAuditLog(auditLogger, {
          adminUser,
          action: "credits.grant",
          category: "credits",
          targetTenant: tenant,
          details: { amount_cents: amountCents, reason, error: String(err) },
          outcome: "failure",
        });
        throw err;
      }
      safeAuditLog(auditLogger, {
        adminUser,
        action: "credits.grant",
        category: "credits",
        targetTenant: tenant,
        details: { amount_cents: amountCents, reason },
        outcome: "success",
      });
      return c.json(result, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
    }
  });

  routes.post("/:tenantId/refund", async (c) => {
    const ledger = ledgerFactory();
    const parsed = parseTenantId(c);
    if (!parsed.ok) return c.json({ error: TENANT_ID_ERROR }, 400);
    const tenant = parsed.tenant;

    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const amountCents = body.amount_cents;
    const reason = body.reason;

    if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents <= 0) {
      return c.json({ error: "amount_cents must be a positive integer" }, 400);
    }

    if (typeof reason !== "string" || !reason.trim()) {
      return c.json({ error: "reason is required and must be non-empty" }, 400);
    }

    try {
      const user = c.get("user");
      const adminUser = user?.id ?? "unknown";
      let result: Awaited<ReturnType<typeof ledger.credit>>;
      try {
        result = await ledger.credit(tenant, Credit.fromCents(amountCents), "admin_grant", { description: reason });
      } catch (err) {
        safeAuditLog(auditLogger, {
          adminUser,
          action: "credits.refund",
          category: "credits",
          targetTenant: tenant,
          details: { amount_cents: amountCents, reason, error: String(err) },
          outcome: "failure",
        });
        throw err;
      }
      safeAuditLog(auditLogger, {
        adminUser,
        action: "credits.refund",
        category: "credits",
        targetTenant: tenant,
        details: { amount_cents: amountCents, reason },
        outcome: "success",
      });
      return c.json(result, 201);
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        return c.json({ error: err.message, current_balance: err.currentBalance }, 400);
      }
      return c.json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
    }
  });

  routes.post("/:tenantId/correction", async (c) => {
    const ledger = ledgerFactory();
    const parsed = parseTenantId(c);
    if (!parsed.ok) return c.json({ error: TENANT_ID_ERROR }, 400);
    const tenant = parsed.tenant;

    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const amountCents = body.amount_cents;
    const reason = body.reason;

    if (typeof amountCents !== "number" || !Number.isInteger(amountCents) || amountCents === 0) {
      return c.json({ error: "amount_cents must be a non-zero integer" }, 400);
    }

    if (typeof reason !== "string" || !reason.trim()) {
      return c.json({ error: "reason is required and must be non-empty" }, 400);
    }

    try {
      const user = c.get("user");
      const adminUser = user?.id ?? "unknown";
      let result: Awaited<ReturnType<typeof ledger.credit>>;
      try {
        if (amountCents >= 0) {
          result = await ledger.credit(tenant, Credit.fromCents(amountCents), "correction", { description: reason });
        } else {
          result = await ledger.debit(tenant, Credit.fromCents(Math.abs(amountCents)), "correction", {
            description: reason,
          });
        }
      } catch (err) {
        safeAuditLog(auditLogger, {
          adminUser,
          action: "credits.correction",
          category: "credits",
          targetTenant: tenant,
          details: { amount_cents: amountCents, reason, error: String(err) },
          outcome: "failure",
        });
        throw err;
      }
      safeAuditLog(auditLogger, {
        adminUser,
        action: "credits.correction",
        category: "credits",
        targetTenant: tenant,
        details: { amount_cents: amountCents, reason },
        outcome: "success",
      });
      return c.json(result, 201);
    } catch (err) {
      if (err instanceof InsufficientBalanceError) {
        return c.json({ error: err.message, current_balance: err.currentBalance }, 400);
      }
      return c.json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
    }
  });

  routes.get("/:tenantId/balance", async (c) => {
    const ledger = ledgerFactory();
    const parsed = parseTenantId(c);
    if (!parsed.ok) return c.json({ error: TENANT_ID_ERROR }, 400);
    const tenant = parsed.tenant;

    try {
      const balance = await ledger.balance(tenant);
      return c.json({ tenant, balance_credits: balance });
    } catch {
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  routes.get("/:tenantId/transactions", async (c) => {
    const ledger = ledgerFactory();
    const parsed = parseTenantId(c);
    if (!parsed.ok) return c.json({ error: TENANT_ID_ERROR }, 400);
    const tenant = parsed.tenant;
    const typeParam = c.req.query("type");

    const filters = {
      type: typeParam,
      limit: parseIntParam(c.req.query("limit")),
      offset: parseIntParam(c.req.query("offset")),
    };

    try {
      const entries = await ledger.history(tenant, filters);
      return c.json({ entries, total: entries.length });
    } catch {
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  routes.get("/:tenantId/adjustments", async (c) => {
    const ledger = ledgerFactory();
    const parsed = parseTenantId(c);
    if (!parsed.ok) return c.json({ error: TENANT_ID_ERROR }, 400);
    const tenant = parsed.tenant;
    const typeParam = c.req.query("type");

    const filters = {
      type: typeParam,
      limit: parseIntParam(c.req.query("limit")),
      offset: parseIntParam(c.req.query("offset")),
    };

    try {
      const entries = await ledger.history(tenant, filters);
      return c.json({ entries, total: entries.length });
    } catch {
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  return routes;
}
