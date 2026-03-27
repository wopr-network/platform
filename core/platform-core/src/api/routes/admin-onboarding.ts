import { Hono } from "hono";
import type { AuthEnv } from "../../auth/index.js";
import { logger } from "../../config/logger.js";
import type { IOnboardingScriptRepository } from "../../onboarding/drizzle-onboarding-script-repository.js";
import type { AdminAuditLogger } from "./admin-audit-helper.js";
import { safeAuditLog } from "./admin-audit-helper.js";

type RepoFactory = () => IOnboardingScriptRepository;

export function createAdminOnboardingRoutes(getRepo: RepoFactory, auditLogger?: () => AdminAuditLogger): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();

  routes.get("/current", async (c) => {
    const repo = getRepo();
    const script = await repo.findCurrent();
    if (!script) {
      return c.json({ error: "No onboarding script found" }, 404);
    }
    return c.json(script);
  });

  routes.get("/history", async (c) => {
    const repo = getRepo();
    const limitParam = c.req.query("limit");
    const limit = limitParam ? Math.min(50, Math.max(1, Number(limitParam) || 10)) : 10;
    const history = await repo.findHistory(limit);
    return c.json(history);
  });

  routes.post("/", async (c) => {
    const repo = getRepo();
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch (err: unknown) {
      logger.debug("Failed to parse onboarding script JSON body", { error: err });
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const content = body.content;
    if (typeof content !== "string" || !content.trim()) {
      return c.json({ error: "content is required and must be non-empty" }, 400);
    }

    const user = c.get("user");
    const adminUser = (user as { id?: string } | undefined)?.id ?? "unknown";
    const script = await repo.insert({
      content,
      updatedBy: adminUser !== "unknown" ? adminUser : null,
    });

    safeAuditLog(auditLogger, {
      adminUser,
      action: "onboarding.script_updated",
      category: "config",
      details: { version: script.version },
      outcome: "success",
    });

    return c.json(script, 201);
  });

  return routes;
}
