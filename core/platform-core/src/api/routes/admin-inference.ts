import { Hono } from "hono";
import type { AuthEnv } from "../../auth/index.js";
import type { ISessionUsageRepository } from "../../inference/session-usage-repository.js";

/**
 * Create admin inference dashboard routes.
 *
 * Routes:
 *   GET /          — Summary: daily costs, session count, avg cost, cache hit rate
 *   GET /daily     — Daily cost breakdown
 *   GET /pages     — Per-page cost breakdown
 *   GET /cache     — Cache hit rate
 *   GET /session/:sessionId — Per-session usage detail
 *
 * @param repoFactory - factory for the session usage repository (lazy init)
 */
export function createAdminInferenceRoutes(repoFactory: () => ISessionUsageRepository): Hono<AuthEnv> {
  const routes = new Hono<AuthEnv>();

  routes.get("/", async (c) => {
    const repo = repoFactory();
    const daysParam = c.req.query("days");
    const days = Math.min(90, Math.max(1, Number.isNaN(Number(daysParam)) ? 7 : Number(daysParam)));
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    try {
      const [dailyCosts, pageCosts, cacheHitRate] = await Promise.all([
        repo.aggregateByDay(since),
        repo.aggregateByPage(since),
        repo.cacheHitRate(since),
      ]);

      const totalCostUsd = dailyCosts.reduce((sum, d) => sum + d.totalCostUsd, 0);
      const totalSessions = dailyCosts.reduce((sum, d) => sum + d.sessionCount, 0);
      const avgCostPerSession = totalSessions > 0 ? totalCostUsd / totalSessions : 0;

      return c.json({
        period: { days, since },
        summary: {
          totalCostUsd,
          totalSessions,
          avgCostPerSessionUsd: avgCostPerSession,
          cacheHitRate: cacheHitRate.hitRate,
        },
        dailyCosts,
        pageCosts,
      });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
    }
  });

  routes.get("/daily", async (c) => {
    const repo = repoFactory();
    const daysParam = c.req.query("days");
    const days = Math.min(90, Math.max(1, Number.isNaN(Number(daysParam)) ? 30 : Number(daysParam)));
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    try {
      const dailyCosts = await repo.aggregateByDay(since);
      return c.json({ days, dailyCosts });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
    }
  });

  routes.get("/pages", async (c) => {
    const repo = repoFactory();
    const daysParam = c.req.query("days");
    const days = Math.min(90, Math.max(1, Number.isNaN(Number(daysParam)) ? 7 : Number(daysParam)));
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    try {
      const pageCosts = await repo.aggregateByPage(since);
      return c.json({ days, pageCosts });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
    }
  });

  routes.get("/cache", async (c) => {
    const repo = repoFactory();
    const daysParam = c.req.query("days");
    const days = Math.min(90, Math.max(1, Number.isNaN(Number(daysParam)) ? 7 : Number(daysParam)));
    const since = Date.now() - days * 24 * 60 * 60 * 1000;

    try {
      const cacheStats = await repo.cacheHitRate(since);
      return c.json({ days, cacheStats });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
    }
  });

  routes.get("/session/:sessionId", async (c) => {
    const repo = repoFactory();
    const sessionId = c.req.param("sessionId");

    try {
      const records = await repo.findBySessionId(sessionId);
      const totalCostUsd = records.reduce((sum, r) => sum + r.costUsd, 0);
      return c.json({ sessionId, totalCostUsd, records });
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
    }
  });

  return routes;
}
