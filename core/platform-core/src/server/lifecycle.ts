/**
 * Lifecycle management — background services and graceful shutdown.
 *
 * There's no leader election anymore. Every replica starts the same set of
 * background services:
 *
 * 1. **Operation queue listener** — LISTEN `op_complete` / `op_enqueued` to
 *    wake `execute()` waiters and worker drain loops without polling.
 *
 * 2. **Core queue worker** — claim and process `core`-targeted rows from
 *    `pending_operations`. Multi-replica safe via `SKIP LOCKED`.
 *
 * 3. **PeriodicScheduler** — fan out bucketed idempotency-key rows for
 *    periodic maintenance tasks (janitor sweep, queue purge, fleet
 *    reconciliation, runtime billing). Every replica enqueues; the unique
 *    partial index on `idempotency_key` guarantees exactly one row per
 *    bucket lands. See `queue/periodic-scheduler.ts`.
 *
 * 4. **Proxy hydration** — Caddy route sync (if enabled).
 *
 * 5. **bot_instances backfill** — one-time sync of YAML profiles into the
 *    DB on startup.
 */

import { logger } from "../config/logger.js";
import { PeriodicScheduler, type ScheduledTask } from "../queue/periodic-scheduler.js";
import type { PlatformContainer } from "./container.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BackgroundHandles {
  intervals: ReturnType<typeof setInterval>[];
  unsubscribes: (() => void)[];
}

// ---------------------------------------------------------------------------
// Periodic tasks
// ---------------------------------------------------------------------------

/**
 * The standard set of periodic maintenance tasks. Handlers are registered
 * on the core queue worker in `container.ts` — this list is the cadence.
 *
 * Bucket sizes are intentional:
 *   - `core.janitor.sweep` (30s) — short deadline so stuck rows recover fast.
 *   - `core.fleet.reconcile` (60s) — matches the old fleet ticker cadence.
 *   - `core.runtime.billing.tick` (day) — daily deduction, UTC aligned.
 *   - `core.queue.purge` (day) — retention sweep, once per UTC day is plenty.
 */
function buildScheduledTasks(container: PlatformContainer): ScheduledTask[] {
  const tasks: ScheduledTask[] = [
    { type: "core.janitor.sweep", bucketSize: 30_000 },
    { type: "core.queue.purge", bucketSize: "day" },
  ];
  if (container.fleetComposite) {
    tasks.push({ type: "core.fleet.reconcile", bucketSize: 60_000 });
  }
  if (container.fleet && container.creditLedger) {
    tasks.push({ type: "core.runtime.billing.tick", bucketSize: "day" });
  }
  return tasks;
}

// ---------------------------------------------------------------------------
// startBackgroundServices
// ---------------------------------------------------------------------------

/**
 * Start background services after the server is listening. Every service
 * here runs on every replica — coordination happens at the DB layer via
 * `pending_operations` claim/idempotency semantics, not at the process layer.
 */
export async function startBackgroundServices(container: PlatformContainer): Promise<BackgroundHandles> {
  const handles: BackgroundHandles = { intervals: [], unsubscribes: [] };

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

  // Periodic scheduler — enqueues bucketed rows on every replica. The DB's
  // unique partial index on `idempotency_key` collapses duplicate inserts
  // down to one row per bucket, so the underlying work runs exactly once.
  const scheduler = new PeriodicScheduler(container.operationQueue, buildScheduledTasks(container));
  scheduler.start();
  handles.unsubscribes.push(() => scheduler.stop());

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
