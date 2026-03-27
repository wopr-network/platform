import type { Context } from "hono";
import { Hono } from "hono";
import { DrizzleAuditLogRepository, type IAuditLogRepository } from "../../audit/audit-log-repository.js";
import { countAuditLog, queryAuditLog } from "../../audit/query.js";
import { purgeExpiredEntriesForUser } from "../../audit/retention.js";
import type { AuditEnv } from "../../audit/types.js";
import type { DrizzleDb } from "../../db/index.js";

async function handleUserAudit(c: Context<AuditEnv>, repo: IAuditLogRepository) {
  const user = c.get("user");
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  void purgeExpiredEntriesForUser(repo, user.id).catch(() => {
    /* purge is best-effort — must not break request */
  });

  const sinceRaw = c.req.query("since") ? Number(c.req.query("since")) : undefined;
  const untilRaw = c.req.query("until") ? Number(c.req.query("until")) : undefined;
  const limitRaw = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
  const offsetRaw = c.req.query("offset") ? Number(c.req.query("offset")) : undefined;

  const filters = {
    userId: user.id,
    action: c.req.query("action") ?? undefined,
    resourceType: c.req.query("resourceType") ?? undefined,
    resourceId: c.req.query("resourceId") ?? undefined,
    since: sinceRaw !== undefined && Number.isFinite(sinceRaw) ? sinceRaw : undefined,
    until: untilRaw !== undefined && Number.isFinite(untilRaw) ? untilRaw : undefined,
    limit: limitRaw !== undefined && Number.isFinite(limitRaw) ? limitRaw : undefined,
    offset: offsetRaw !== undefined && Number.isFinite(offsetRaw) ? offsetRaw : undefined,
  };

  try {
    const [entries, total] = await Promise.all([queryAuditLog(repo, filters), countAuditLog(repo, filters)]);
    return c.json({ entries, total });
  } catch {
    return c.json({ error: "Internal server error" }, 500);
  }
}

async function handleAdminAudit(c: Context<AuditEnv>, repo: IAuditLogRepository) {
  const user = c.get("user");
  if (!user?.isAdmin) return c.json({ error: "Forbidden" }, 403);

  const sinceRaw = c.req.query("since") ? Number(c.req.query("since")) : undefined;
  const untilRaw = c.req.query("until") ? Number(c.req.query("until")) : undefined;
  const limitRaw = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
  const offsetRaw = c.req.query("offset") ? Number(c.req.query("offset")) : undefined;

  const filters = {
    userId: c.req.query("userId") ?? undefined,
    action: c.req.query("action") ?? undefined,
    resourceType: c.req.query("resourceType") ?? undefined,
    resourceId: c.req.query("resourceId") ?? undefined,
    since: sinceRaw !== undefined && Number.isFinite(sinceRaw) ? sinceRaw : undefined,
    until: untilRaw !== undefined && Number.isFinite(untilRaw) ? untilRaw : undefined,
    limit: limitRaw !== undefined && Number.isFinite(limitRaw) ? limitRaw : undefined,
    offset: offsetRaw !== undefined && Number.isFinite(offsetRaw) ? offsetRaw : undefined,
  };

  try {
    const [entries, total] = await Promise.all([queryAuditLog(repo, filters), countAuditLog(repo, filters)]);
    return c.json({ entries, total });
  } catch {
    return c.json({ error: "Internal server error" }, 500);
  }
}

type DbOrFactory = DrizzleDb | (() => DrizzleDb);

function resolveRepo(dbOrFactory: DbOrFactory): IAuditLogRepository {
  const db = typeof dbOrFactory === "function" ? dbOrFactory() : dbOrFactory;
  return new DrizzleAuditLogRepository(db);
}

/**
 * Create audit log API routes.
 *
 * Pass a `DrizzleDb` directly or a `() => DrizzleDb` factory for lazy init.
 * Expects `c.get("user")` to provide `{ id: string }`.
 */
export function createAuditRoutes(db: DbOrFactory): Hono<AuditEnv> {
  let repo: IAuditLogRepository | null = typeof db === "function" ? null : resolveRepo(db);
  const routes = new Hono<AuditEnv>();
  routes.get("/", (c) => {
    if (!repo) repo = resolveRepo(db);
    return handleUserAudit(c, repo);
  });
  return routes;
}

/**
 * Create admin audit log API routes.
 *
 * Pass a `DrizzleDb` directly or a `() => DrizzleDb` factory for lazy init.
 * Expects `c.get("user")` to provide `{ id: string, isAdmin: boolean }`.
 */
export function createAdminAuditRoutes(db: DbOrFactory): Hono<AuditEnv> {
  let repo: IAuditLogRepository | null = typeof db === "function" ? null : resolveRepo(db);
  const routes = new Hono<AuditEnv>();
  routes.get("/", (c) => {
    if (!repo) repo = resolveRepo(db);
    return handleAdminAudit(c, repo);
  });
  return routes;
}
