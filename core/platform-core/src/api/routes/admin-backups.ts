import { Hono } from "hono";
import type { AuthEnv } from "../../auth/index.js";
import type { IBackupStatusStore } from "../../backup/backup-status-store.js";
import type { SpacesClient } from "../../backup/spaces-client.js";
import { logger } from "../../config/logger.js";
import type { AdminAuditLogger } from "./admin-audit-helper.js";
import { safeAuditLog } from "./admin-audit-helper.js";

/**
 * Validate that a remotePath belongs to the given container.
 * Normalizes the path, rejects traversal segments, and checks that the containerId
 * appears as the leading non-empty segment.
 */
export function isRemotePathOwnedBy(remotePath: string, containerId: string): boolean {
  const normalized = remotePath.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length === 0) return false;
  if (segments.some((s) => s === ".." || s === ".")) return false;
  return segments[0] === containerId;
}

/**
 * Create admin backup routes.
 *
 * @param storeFactory - factory for the backup status store
 * @param spacesFactory - factory for the S3/Spaces client
 * @param auditLogger - optional admin audit logger
 */
export function createAdminBackupRoutes(
  storeFactory: () => IBackupStatusStore,
  spacesFactory: () => SpacesClient,
  auditLogger?: () => AdminAuditLogger,
): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();

  routes.get("/", async (c) => {
    const store = storeFactory();
    const staleOnly = c.req.query("stale") === "true";
    const entries = staleOnly ? await store.listStale() : await store.listAll();
    return c.json({
      backups: entries,
      total: entries.length,
      staleCount: entries.filter((e) => e.isStale).length,
    });
  });

  routes.get("/alerts/stale", async (c) => {
    const store = storeFactory();
    const stale = await store.listStale();
    return c.json({
      alerts: stale.map((e) => ({
        containerId: e.containerId,
        nodeId: e.nodeId,
        lastBackupAt: e.lastBackupAt,
        lastBackupSuccess: e.lastBackupSuccess,
        lastBackupError: e.lastBackupError,
      })),
      count: stale.length,
    });
  });

  routes.get("/:containerId", async (c) => {
    const store = storeFactory();
    const containerId = c.req.param("containerId");
    const entry = await store.get(containerId);
    if (!entry) {
      return c.json({ error: "No backup status found for this container" }, 404);
    }
    return c.json(entry);
  });

  routes.get("/:containerId/snapshots", async (c) => {
    const store = storeFactory();
    const containerId = c.req.param("containerId");
    const entry = await store.get(containerId);
    if (!entry) {
      return c.json({ error: "No backup status found for this container" }, 404);
    }

    try {
      const spaces = spacesFactory();
      const prefix = `nightly/${entry.nodeId}/${containerId}/`;
      const objects = await spaces.list(prefix);
      return c.json({
        containerId,
        snapshots: objects.map((o) => ({
          path: o.path,
          date: o.date,
          sizeMb: Math.round((o.size / (1024 * 1024)) * 100) / 100,
        })),
      });
    } catch (err) {
      logger.error(`Failed to list snapshots for ${containerId}`, { err });
      return c.json({ error: "Failed to list backup snapshots" }, 500);
    }
  });

  routes.post("/:containerId/restore", async (c) => {
    const containerId = c.req.param("containerId");

    let body: { remotePath?: string; targetNodeId?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.remotePath) {
      return c.json({ error: "remotePath is required" }, 400);
    }

    if (!isRemotePathOwnedBy(body.remotePath, containerId)) {
      return c.json({ error: "remotePath does not belong to this container" }, 403);
    }

    safeAuditLog(auditLogger, {
      adminUser: (c.get("user") as { id?: string } | undefined)?.id ?? "unknown",
      action: "backup.restore",
      category: "config",
      details: { containerId, remotePath: body.remotePath, targetNodeId: body.targetNodeId ?? "auto" },
      outcome: "success",
    });

    return c.json({
      ok: true,
      message: `Restore initiated for ${containerId} from ${body.remotePath}`,
      containerId,
      remotePath: body.remotePath,
      targetNodeId: body.targetNodeId ?? "auto",
    });
  });

  return routes;
}
