import { Hono } from "hono";
import type { AdminAuditLog } from "../../admin/index.js";
import type { AuthEnv } from "../../auth/index.js";

function parseIntParam(value: string | undefined): number | undefined {
  if (value == null || value === "") return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Create admin audit API routes with an injectable audit log service.
 *
 * Routes:
 *   GET / — query admin audit log entries with filters
 *   GET /export — export filtered entries as CSV
 *
 * @param auditLogFactory - factory returning an AdminAuditLog instance
 */
export function createAdminAuditApiRoutes(auditLogFactory: () => AdminAuditLog): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();

  routes.get("/", async (c) => {
    const filters = {
      admin: c.req.query("admin") ?? undefined,
      action: c.req.query("action") ?? undefined,
      category: c.req.query("category") ?? undefined,
      tenant: c.req.query("tenant") ?? undefined,
      from: parseIntParam(c.req.query("from")),
      to: parseIntParam(c.req.query("to")),
      limit: parseIntParam(c.req.query("limit")),
      offset: parseIntParam(c.req.query("offset")),
    };

    try {
      const result = await auditLogFactory().query(filters);
      return c.json(result);
    } catch {
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  routes.get("/export", async (c) => {
    const filters = {
      admin: c.req.query("admin") ?? undefined,
      action: c.req.query("action") ?? undefined,
      category: c.req.query("category") ?? undefined,
      tenant: c.req.query("tenant") ?? undefined,
      from: parseIntParam(c.req.query("from")),
      to: parseIntParam(c.req.query("to")),
    };

    try {
      const csv = await auditLogFactory().exportCsv(filters);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": 'attachment; filename="audit-log.csv"',
        },
      });
    } catch {
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  return routes;
}
