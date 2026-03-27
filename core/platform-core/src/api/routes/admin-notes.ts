import { Hono } from "hono";
import type { AuthEnv } from "../../auth/index.js";
import type { AdminAuditLogger } from "./admin-audit-helper.js";
import { safeAuditLog } from "./admin-audit-helper.js";

/** Minimal interface for admin notes storage — implemented by concrete stores. */
export interface IAdminNotesRepository {
  create(input: { tenantId: string; authorId: string; content: string; isPinned: boolean }): Promise<{ id: string }>;
  list(filters: { tenantId: string; limit?: number; offset?: number }): Promise<{ entries: unknown[]; total: number }>;
  update(
    noteId: string,
    tenantId: string,
    updates: { content?: string; isPinned?: boolean },
  ): Promise<{ id: string } | null>;
  delete(noteId: string, tenantId: string): Promise<boolean>;
}

function parseIntParam(value: string | undefined): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Create admin notes API routes.
 * Pass a store factory and optional audit logger for DI.
 */
export function createAdminNotesApiRoutes(
  storeFactory: () => IAdminNotesRepository,
  auditLogger?: () => AdminAuditLogger,
): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();

  // GET /:tenantId -- list notes
  routes.get("/:tenantId", async (c) => {
    const store = storeFactory();
    const tenantId = c.req.param("tenantId");
    const filters = {
      tenantId,
      limit: parseIntParam(c.req.query("limit")),
      offset: parseIntParam(c.req.query("offset")),
    };
    try {
      const result = await store.list(filters);
      return c.json(result);
    } catch {
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  // POST /:tenantId -- create note
  routes.post("/:tenantId", async (c) => {
    const store = storeFactory();
    const tenantId = c.req.param("tenantId");
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const content = body.content;
    if (typeof content !== "string" || !content.trim()) {
      return c.json({ error: "content is required and must be non-empty" }, 400);
    }
    try {
      const user = c.get("user");
      const note = await store.create({
        tenantId,
        authorId: user?.id ?? "unknown",
        content,
        isPinned: body.isPinned === true,
      });
      safeAuditLog(auditLogger, {
        adminUser: user?.id ?? "unknown",
        action: "note.create",
        category: "support",
        targetTenant: tenantId,
        details: { noteId: note.id },
        outcome: "success",
      });
      return c.json(note, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
    }
  });

  // PATCH /:tenantId/:noteId -- update note
  routes.patch("/:tenantId/:noteId", async (c) => {
    const store = storeFactory();
    const tenantId = c.req.param("tenantId");
    const noteId = c.req.param("noteId");
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const updates: { content?: string; isPinned?: boolean } = {};
    if (typeof body.content === "string") updates.content = body.content;
    if (typeof body.isPinned === "boolean") updates.isPinned = body.isPinned;
    try {
      const note = await store.update(noteId, tenantId, updates);
      if (note === null) {
        return c.json({ error: "Forbidden" }, 403);
      }
      const user = c.get("user");
      safeAuditLog(auditLogger, {
        adminUser: user?.id ?? "unknown",
        action: "note.update",
        category: "support",
        targetTenant: tenantId,
        details: { noteId, hasContentChange: !!updates.content, hasPinChange: updates.isPinned !== undefined },
        outcome: "success",
      });
      return c.json(note);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
    }
  });

  // DELETE /:tenantId/:noteId -- delete note
  routes.delete("/:tenantId/:noteId", async (c) => {
    const store = storeFactory();
    const tenantId = c.req.param("tenantId");
    const noteId = c.req.param("noteId");
    try {
      const deleted = await store.delete(noteId, tenantId);
      if (!deleted) return c.json({ error: "Forbidden" }, 403);
      const user = c.get("user");
      safeAuditLog(auditLogger, {
        adminUser: user?.id ?? "unknown",
        action: "note.delete",
        category: "support",
        targetTenant: tenantId,
        details: { noteId },
        outcome: "success",
      });
      return c.json({ ok: true });
    } catch {
      return c.json({ error: "Internal server error" }, 500);
    }
  });

  return routes;
}
