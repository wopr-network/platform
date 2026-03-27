import { Hono } from "hono";
import { z } from "zod";
import type { AuthEnv } from "../../auth/index.js";
import { logger } from "../../config/logger.js";
import type { AdminAuditLogger } from "./admin-audit-helper.js";
import { safeAuditLog } from "./admin-audit-helper.js";

export interface MigrationOrchestrator {
  migrate(botId: string, targetNodeId?: string): Promise<{ success: boolean; error?: string }>;
}

const migrateInputSchema = z.object({
  targetNodeId: z.string().min(1).optional(),
});

export function createAdminMigrationRoutes(
  getOrchestrator: () => MigrationOrchestrator,
  auditLogger?: () => AdminAuditLogger,
): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();

  routes.post("/:botId", async (c) => {
    const botId = c.req.param("botId") as string;

    let body: z.infer<typeof migrateInputSchema> = {};
    try {
      body = migrateInputSchema.parse(await c.req.json());
    } catch {
      // No body is fine — auto-select target
    }

    try {
      const result = await getOrchestrator().migrate(botId, body.targetNodeId);

      safeAuditLog(auditLogger, {
        adminUser: (c.get("user") as { id?: string } | undefined)?.id ?? "unknown",
        action: "bot.migrate",
        category: "config",
        details: { botId, targetNodeId: body.targetNodeId, success: result.success },
        outcome: result.success ? "success" : "failure",
      });

      if (result.success) {
        return c.json({ success: true, result });
      }
      return c.json({ success: false, result }, 400);
    } catch (err) {
      logger.error("Migration failed", { botId, err });
      safeAuditLog(auditLogger, {
        adminUser: (c.get("user") as { id?: string } | undefined)?.id ?? "unknown",
        action: "bot.migrate",
        category: "config",
        details: { botId, targetNodeId: body.targetNodeId },
        outcome: "failure",
      });
      return c.json({ success: false, error: err instanceof Error ? err.message : "Unknown error" }, 500);
    }
  });

  return routes;
}
