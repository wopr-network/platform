/**
 * AgentWorker — the agent-side drain loop for the DB-as-channel queue.
 *
 * Each agent runs one of these targeted at its own node id, draining
 * `pending_operations` rows where `target = <this node id>`. The worker
 * reuses the exact same handler map as the legacy WebSocket dispatch
 * (`buildAgentOperationHandlers`), so adding the queue path doesn't
 * fork agent-side behavior — there's still one source of truth for
 * "what does this command do".
 *
 * Phase 2.3a is intentionally minimal:
 *   - The agent connects to Postgres directly via a `dbUrl` from config.
 *     For now this is a single shared role (no per-node credentials, no
 *     RLS). Phase 2.3c will mint per-node credentials at registration time.
 *   - Both transports (WS bus + queue worker) run side-by-side. Nothing
 *     in core has been switched to enqueue agent ops yet, so the queue
 *     worker is dormant in production until Phase 2.3b.
 *
 * See `docs/2026-04-08-db-queue-architecture.md` §8.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { logger } from "../config/logger.js";
import type { DrizzleDb } from "../db/index.js";
import * as schema from "../db/schema/index.js";
import { OperationQueue } from "../queue/operation-queue.js";
import { PgNotificationSource } from "../queue/pg-notification-source.js";
import { type OperationHandler, QueueWorker } from "../queue/queue-worker.js";

export interface AgentQueueWorkerOptions {
  /** Postgres connection string. The agent uses a dedicated pool. */
  dbUrl: string;
  /** This agent's node id — used as the worker's `target` when claiming rows. */
  nodeId: string;
  /** A unique worker identity, written to `pending_operations.claimed_by`. */
  workerId: string;
  /** The handler map shared with the WS bus dispatch. */
  handlers: Map<string, OperationHandler>;
}

export interface RunningAgentQueueWorker {
  worker: QueueWorker;
  queue: OperationQueue;
  pool: Pool;
  /** Stop the worker, close the listener, end the pool. Idempotent. */
  stop: () => Promise<void>;
}

/**
 * Construct and start the agent-side queue worker. Returns the running
 * handles so the caller can stop them on shutdown.
 *
 * Boot sequence:
 *   1. Open a dedicated pg.Pool for the agent (separate from any other
 *      Postgres clients in the agent process — there are none today).
 *   2. Wrap it in a Drizzle DB.
 *   3. Construct an OperationQueue and start its NOTIFY listener.
 *   4. Construct a QueueWorker pinned to this agent's node id and the
 *      shared handler map.
 *   5. Start draining.
 */
export async function startAgentQueueWorker(opts: AgentQueueWorkerOptions): Promise<RunningAgentQueueWorker> {
  const pool = new Pool({ connectionString: opts.dbUrl });
  const db = drizzle(pool, { schema }) as unknown as DrizzleDb;
  const queue = new OperationQueue(db);

  const source = new PgNotificationSource(pool, {
    logger: {
      info: (msg, meta) => logger.info(msg, meta),
      warn: (msg, meta) => logger.warn(msg, meta),
      error: (msg, meta) => logger.error(msg, meta),
    },
  });

  try {
    await queue.startListener(source);
    logger.info("Agent operation queue listener started", { nodeId: opts.nodeId });
  } catch (err) {
    logger.warn("Agent operation queue listener failed to start (poll-only fallback)", {
      nodeId: opts.nodeId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const worker = new QueueWorker(queue, opts.nodeId, opts.workerId, opts.handlers, {
    logger: {
      debug: (msg, meta) => logger.debug(msg, meta),
      info: (msg, meta) => logger.info(msg, meta),
      warn: (msg, meta) => logger.warn(msg, meta),
      error: (msg, meta) => logger.error(msg, meta),
    },
  });
  worker.start();
  logger.info("Agent queue worker started", { nodeId: opts.nodeId, workerId: opts.workerId });

  let stopped = false;
  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    await worker.stop();
    await queue.stopListener();
    await pool.end();
    logger.info("Agent queue worker stopped", { nodeId: opts.nodeId });
  };

  return { worker, queue, pool, stop };
}
