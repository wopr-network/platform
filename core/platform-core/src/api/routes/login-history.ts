import { Hono } from "hono";
import type { AuthEnv } from "../../auth/index.js";
import type { ILoginHistoryRepository } from "../../auth/login-history-repository.js";

/**
 * Create login history routes.
 *
 * Returns recent login sessions for the authenticated user.
 * Query params:
 *   - limit: max results (default 20, max 100)
 */
export function createLoginHistoryRoutes(repoFactory: () => ILoginHistoryRepository): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();

  routes.get("/", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const limitRaw = c.req.query("limit");
    const limit = limitRaw ? Math.min(Math.max(1, Number.parseInt(limitRaw, 10) || 20), 100) : 20;

    const repo = repoFactory();
    const entries = await repo.findByUserId(user.id, limit);
    return c.json(entries);
  });

  return routes;
}
