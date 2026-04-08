/**
 * PeriodicScheduler — leaderless periodic task fan-out via bucketed
 * idempotency keys.
 *
 * Every core replica runs one of these. On each tick, it enqueues a
 * `pending_operations` row for every registered task with an idempotency
 * key derived from the current bucket window. The `idx_pending_ops_idempotency`
 * unique partial index guarantees exactly one insertion wins per bucket —
 * every other replica's insert collides and short-circuits without creating
 * a duplicate. Whichever core queue worker claims the row runs the handler
 * exactly once.
 *
 * This replaces the previous `LeaderElection` subsystem. There's no leader
 * to elect, no lease to heartbeat, no singleton to pin. The DB is the
 * coordination point; the unique index is the election.
 *
 * See `docs/2026-04-08-db-queue-architecture.md` §9 (idempotency-key bucketing).
 *
 * ── Bucketing ──────────────────────────────────────────────────────────────
 *
 * Each task declares a `bucketSize`:
 *
 *   - `'day'`   → idempotency key = `type + ':' + YYYY-MM-DD` (UTC)
 *   - number    → idempotency key = `type + ':' + floor(now / bucketSize)`
 *
 * The tick interval is `min(bucketSize)`, so every bucket window is
 * observed at least once. Finer bucket intervals produce more enqueue
 * attempts but more responsive first-firing after boot.
 *
 * Fire-and-forget: the scheduler never awaits the terminal state of an
 * enqueued row. Success/failure lives on the row itself, visible via the
 * normal queue inspection paths. A bad handler fails its row; the next
 * bucket enqueues a fresh row on schedule.
 */

import { logger } from "../config/logger.js";
import type { IOperationQueue } from "./operation-queue.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Size of a bucketing window. */
export type BucketSize = "day" | number;

/** A single periodic task the scheduler fans out. */
export interface ScheduledTask {
  /** Operation type — must match a handler registered on the core worker. */
  type: string;
  /** Bucket window size. `'day'` aligns on UTC date; a number is milliseconds. */
  bucketSize: BucketSize;
  /** Optional payload passed to the handler. Defaults to `null`. */
  payload?: unknown;
}

export interface PeriodicSchedulerOptions {
  /**
   * Tick interval in ms. Default: the smallest non-`day` bucket across the
   * task list, or 60_000 if all tasks are daily. Every bucket window is
   * observed at least once per tick.
   */
  tickIntervalMs?: number;
  /**
   * Whether to fire an immediate tick on `start()` instead of waiting one
   * interval. Default `true` — a fresh replica should reconcile immediately.
   */
  fireOnStart?: boolean;
  /** Override the clock. Used by tests. Production uses `Date.now`. */
  now?: () => number;
}

// ---------------------------------------------------------------------------
// Bucket key
// ---------------------------------------------------------------------------

/**
 * Compute the bucket key for a task at the given time. Exposed for tests;
 * otherwise it's an implementation detail of `tick()`.
 */
export function bucketKey(task: ScheduledTask, nowMs: number): string {
  if (task.bucketSize === "day") {
    return `${task.type}:${new Date(nowMs).toISOString().slice(0, 10)}`;
  }
  return `${task.type}:${Math.floor(nowMs / task.bucketSize)}`;
}

// ---------------------------------------------------------------------------
// Scheduler
// ---------------------------------------------------------------------------

export class PeriodicScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly tickIntervalMs: number;
  private readonly fireOnStart: boolean;
  private readonly now: () => number;

  constructor(
    private readonly queue: IOperationQueue,
    private readonly tasks: readonly ScheduledTask[],
    options: PeriodicSchedulerOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.fireOnStart = options.fireOnStart ?? true;
    this.tickIntervalMs = options.tickIntervalMs ?? defaultTickInterval(tasks);
  }

  /** Begin ticking. Idempotent — calling twice is a no-op. */
  start(): void {
    if (this.timer !== null) return;
    if (this.fireOnStart) {
      void this.tick();
    }
    this.timer = setInterval(() => void this.tick(), this.tickIntervalMs);
    logger.info("PeriodicScheduler started", {
      tickIntervalMs: this.tickIntervalMs,
      taskCount: this.tasks.length,
      types: this.tasks.map((t) => t.type),
    });
  }

  /** Stop ticking. Idempotent. */
  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
    logger.info("PeriodicScheduler stopped");
  }

  /**
   * Run a single tick — enqueue every task with its current bucket key.
   * Exposed for tests; production callers just call `start()`.
   */
  async tick(): Promise<void> {
    const now = this.now();
    // Fire all tasks in parallel. Each is independent and the insert is cheap.
    await Promise.all(
      this.tasks.map(async (task) => {
        const key = bucketKey(task, now);
        try {
          await this.queue.enqueue({
            type: task.type,
            // `payload` is jsonb NOT NULL — use an empty object when the
            // task has no arguments (most periodic maintenance tasks).
            payload: task.payload ?? {},
            target: "core",
            idempotencyKey: key,
          });
        } catch (err) {
          // Enqueue failures are rare and mostly unique-index collisions at
          // the insert path are already swallowed by onConflictDoNothing.
          // Anything that leaks through is a DB issue; log and keep going.
          logger.warn("PeriodicScheduler enqueue failed", {
            type: task.type,
            key,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultTickInterval(tasks: readonly ScheduledTask[]): number {
  const numeric = tasks.map((t) => t.bucketSize).filter((s): s is number => typeof s === "number");
  if (numeric.length === 0) return 60_000;
  return Math.min(...numeric);
}
