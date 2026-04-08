/**
 * Lifecycle management — background services, leader election, and graceful shutdown.
 *
 * Background services are split into two categories:
 *
 * 1. **All-instance services** — safe to run on every platform-core instance
 *    (proxy hydration, profile backfill). Started immediately.
 *
 * 2. **Leader-only services** — singletons that must run on exactly one instance
 *    (hot pool, billing cron, health sweeps). Started/stopped by leader election.
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
// startLeaderServices — only run on the leader instance
// ---------------------------------------------------------------------------

async function startLeaderServices(container: PlatformContainer): Promise<BackgroundHandles> {
  const handles: BackgroundHandles = { intervals: [], unsubscribes: [] };
  logger.info("Starting leader-only background services");

  // Fleet composite ticker — runs cleanup + replenish across all connected
  // nodes. Gated by leader election so non-leader replicas don't double-fire.
  if (container.fleetComposite) {
    try {
      const fleetHandles = await container.fleetComposite.start();
      handles.unsubscribes.push(fleetHandles.stop);
    } catch (err) {
      logger.warn("Fleet ticker start failed (non-fatal)", { error: (err as Error)?.message ?? err });
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

function stopLeaderServices(handles: BackgroundHandles): void {
  for (const interval of handles.intervals) clearInterval(interval);
  for (const unsub of handles.unsubscribes) unsub();
  handles.intervals.length = 0;
  handles.unsubscribes.length = 0;
  logger.info("Stopped leader-only background services");
}

// ---------------------------------------------------------------------------
// startBackgroundServices
// ---------------------------------------------------------------------------

/**
 * Start background services after the server is listening.
 *
 * All-instance work runs immediately. Leader-only singletons are started
 * and stopped by the leader election callback — if this instance wins the
 * lease, it starts them; if it loses, it stops them.
 */
export async function startBackgroundServices(container: PlatformContainer): Promise<BackgroundHandles> {
  const handles: BackgroundHandles = { intervals: [], unsubscribes: [] };
  let leaderHandles: BackgroundHandles | null = null;

  // -- All-instance services (safe on every replica) --

  // DB-as-channel queue: start the LISTEN-side notification source over the
  // shared pg.Pool, then start the core worker's drain loop. Both are
  // symmetric across replicas — Postgres SKIP LOCKED guarantees only one
  // claims each row. If LISTEN setup fails (rare; likely a missing trigger
  // migration), we log and fall back to poll-only mode automatically.
  try {
    const { PgNotificationSource } = await import("../queue/pg-notification-source.js");
    const source = new PgNotificationSource(container.pool, {
      logger: {
        info: (msg, meta) => logger.info(msg, meta),
        warn: (msg, meta) => logger.warn(msg, meta),
        error: (msg, meta) => logger.error(msg, meta),
      },
    });
    await container.operationQueue.startListener(source);
    logger.info("Operation queue listener started");
  } catch (err) {
    logger.warn("Operation queue listener failed to start (poll-only fallback)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  container.coreQueueWorker.start();
  logger.info("Core queue worker started");
  handles.unsubscribes.push(() => {
    void container.coreQueueWorker.stop();
    void container.operationQueue.stopListener();
  });

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

  // -- Leader election: gates singleton services --

  const election = container.leaderElection;

  election.onPromoted(async () => {
    leaderHandles = await startLeaderServices(container);
  });

  election.onDemoted(() => {
    if (leaderHandles) {
      stopLeaderServices(leaderHandles);
      leaderHandles = null;
    }
  });

  election.start();
  handles.unsubscribes.push(() => {
    void election.stop();
    if (leaderHandles) stopLeaderServices(leaderHandles);
  });

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
