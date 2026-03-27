import { Hono } from "hono";
import type { IBackupStatusStore } from "../../backup/backup-status-store.js";

export interface HealthRouteConfig {
  /** Service name returned in health responses (e.g., "wopr-platform", "silo") */
  serviceName: string;
  /** Factory to resolve the backup status store. Return null if unavailable. */
  storeFactory?: () => IBackupStatusStore | null;
}

/**
 * Create health check routes.
 *
 * Public, unauthenticated, used by load balancers and monitoring.
 */
export function createHealthRoutes(config: HealthRouteConfig): Hono {
  const routes = new Hono();
  const resolveStore = config.storeFactory ?? (() => null);

  routes.get("/", async (c) => {
    const health: {
      status: string;
      service: string;
      backups?: { staleCount: number; totalTracked: number };
    } = {
      status: "ok",
      service: config.serviceName,
    };

    const store = resolveStore();
    if (store) {
      try {
        const stale = await store.listStale();
        const total = await store.count();
        health.backups = { staleCount: stale.length, totalTracked: total };
        if (stale.length > 0) {
          health.status = "degraded";
        }
      } catch {
        // Backup DB query failed — don't crash the health endpoint
      }
    }

    return c.json(health);
  });

  return routes;
}
