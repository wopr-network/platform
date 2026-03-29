/**
 * Lifecycle management — background services and graceful shutdown.
 *
 * Products currently handle background tasks in their serve() callbacks.
 * This module provides a standard interface for starting and stopping
 * those tasks so bootPlatformServer can manage them uniformly.
 */

import { logger } from "../config/logger.js";
import type { PlatformContainer } from "./container.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackgroundHandles {
  intervals: ReturnType<typeof setInterval>[];
  unsubscribes: (() => void)[];
}

// ---------------------------------------------------------------------------
// startBackgroundServices
// ---------------------------------------------------------------------------

/**
 * Start background services that run after the server is listening.
 *
 * Currently a thin scaffold — the hooks exist so products can migrate their
 * background tasks (fleet updater, notification worker, caddy hydration,
 * health monitor) incrementally without changing the boot contract.
 */
export async function startBackgroundServices(container: PlatformContainer): Promise<BackgroundHandles> {
  const handles: BackgroundHandles = { intervals: [], unsubscribes: [] };

  // Caddy proxy hydration (if fleet + proxy are enabled)
  if (container.fleet?.proxy) {
    try {
      await container.fleet.proxy.start?.();
    } catch {
      // Non-fatal — proxy sync will retry on next health tick
    }
  }

  // Backfill bot_instances from YAML profiles (one-time sync on startup)
  if (container.fleet) {
    try {
      const { DrizzleBotInstanceRepository } = await import("../fleet/drizzle-bot-instance-repository.js");
      const botInstanceRepo = new DrizzleBotInstanceRepository(container.db);
      const profiles = await container.fleet.profileStore.list();
      let synced = 0;
      for (const profile of profiles) {
        const existing = await botInstanceRepo.getById(profile.id);
        if (!existing) {
          try {
            await botInstanceRepo.register(profile.id, profile.tenantId, profile.name);
            synced++;
          } catch {
            // Ignore duplicates / constraint violations
          }
        }
      }
      if (synced > 0) {
        logger.info(`Backfilled ${synced} bot instances from profiles into DB`);
      }
    } catch (err) {
      logger.warn("Failed to backfill bot_instances (non-fatal)", { error: String(err) });
    }
  }

  // Hot pool manager (if enabled)
  if (container.hotPool) {
    try {
      const poolHandles = await container.hotPool.start();
      handles.unsubscribes.push(poolHandles.stop);
    } catch {
      // Non-fatal — pool will be empty but claiming falls back to cold create
    }
  }

  // Runtime billing cron — daily $0.17/bot deduction (requires fleet + creditLedger)
  if (container.fleet && container.creditLedger) {
    try {
      const { DrizzleBotInstanceRepository } = await import("../fleet/drizzle-bot-instance-repository.js");
      const { DrizzleTenantAddonRepository } = await import("../monetization/addons/addon-repository.js");
      const { startRuntimeScheduler } = await import("../monetization/credits/runtime-scheduler.js");

      const botInstanceRepo = new DrizzleBotInstanceRepository(container.db);
      const tenantAddonRepo = new DrizzleTenantAddonRepository(container.db);

      const scheduler = startRuntimeScheduler({
        ledger: container.creditLedger,
        botInstanceRepo,
        tenantAddonRepo,
      });
      handles.unsubscribes.push(scheduler.stop);

      // Run immediately on startup (idempotent — skips if already billed today)
      const { runRuntimeDeductions, buildResourceTierCosts } = await import("../monetization/credits/runtime-cron.js");
      const { buildAddonCosts } = await import("../monetization/addons/addon-cron.js");
      const today = new Date().toISOString().slice(0, 10);
      void runRuntimeDeductions({
        ledger: container.creditLedger,
        date: today,
        getActiveBotCount: async (tenantId) => {
          const bots = await botInstanceRepo.listByTenant(tenantId);
          return bots.filter((b) => b.billingState === "active").length;
        },
        getResourceTierCosts: buildResourceTierCosts(botInstanceRepo, async (tenantId) => {
          const bots = await botInstanceRepo.listByTenant(tenantId);
          return bots.filter((b) => b.billingState === "active").map((b) => b.id);
        }),
        getAddonCosts: buildAddonCosts(tenantAddonRepo),
      })
        .then((result) => logger.info("Initial runtime deductions complete", result))
        .catch((err) => logger.error("Initial runtime deductions failed", { error: String(err) }));

      logger.info("Runtime billing scheduler started (daily $0.17/bot deduction)");
    } catch (err) {
      logger.warn("Failed to start runtime billing scheduler (non-fatal)", { error: String(err) });
    }
  }

  return handles;
}

// ---------------------------------------------------------------------------
// gracefulShutdown
// ---------------------------------------------------------------------------

/**
 * Graceful shutdown: clear intervals, call unsubscribe hooks, close the
 * database connection pool.
 */
export async function gracefulShutdown(container: PlatformContainer, handles: BackgroundHandles): Promise<void> {
  for (const interval of handles.intervals) {
    clearInterval(interval);
  }
  for (const unsub of handles.unsubscribes) {
    unsub();
  }
  await container.pool.end();
}
