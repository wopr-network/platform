/**
 * OperationQueue — the Drizzle-backed durable operation queue.
 *
 * This is the one-and-only channel for in-flight work in the DB-as-channel
 * architecture. Requests are inserted into `pending_operations`, workers claim
 * them with `SELECT … FOR UPDATE SKIP LOCKED`, run the handler, and write the
 * terminal state back. Callers of `execute()` park on a waiter that resolves
 * when either a LISTEN NOTIFY fires or the poll fallback re-reads the row —
 * whichever happens first. The Promise returned by `execute()` is the only
 * operation handle any caller sees.
 *
 * Design constraints:
 * - **Drizzle only** for data access. INSERTs, UPDATEs, SELECTs all go
 *   through the Drizzle query builder — no `sql\`...\`` in application logic.
 * - **NOTIFYs come from the database.** A trigger on `pending_operations`
 *   fires `pg_notify('op_complete', id)` and `pg_notify('op_enqueued', target)`.
 *   The application never issues NOTIFY commands.
 * - **LISTENs go through a NotificationSource abstraction** so the queue
 *   doesn't import pg directly. Production wires the pg.Pool-backed source;
 *   tests wire an in-memory fake.
 * - **Polling is the fallback.** If no NotificationSource is attached, or
 *   the listener is mid-reconnect, or a NOTIFY is dropped, the per-request
 *   poll timer still reaches the terminal state within `pollIntervalMs`.
 * - **No in-memory source of truth.** The waiter Map holds per-request
 *   wake-up callbacks, not operation state. Losing the Map loses the
 *   wait, not the work.
 *
 * See `docs/2026-04-08-db-queue-architecture.md` §4–§6.
 */

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import type { DrizzleDb } from "../db/index.js";
import { type PendingOperationRow, pendingOperations } from "../db/schema/pending-operations.js";
import type { NotificationSource } from "./notification-source.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One operation request, the input to `execute()`. */
export interface OperationRequest {
  /** Operation type — maps to a handler registered in a worker. */
  type: string;
  /** Arbitrary JSON-serialisable payload passed to the handler. */
  payload: unknown;
  /**
   * Which worker pool drains this row.
   * - `"core"` = any core replica's core-worker
   * - node id = that specific agent's worker
   * - `null`   = any worker (unused today; reserved)
   */
  target: string | null;
  /**
   * Caller-supplied idempotency key. If a row already exists with this key,
   * the caller will join the wait for that row instead of inserting a duplicate.
   */
  idempotencyKey?: string;
  /**
   * How long `execute()` will wait for a terminal state before giving up and
   * throwing. Defaults to 300_000ms (5 minutes). Independent from the row's
   * `timeout_s`, which the janitor uses to reset stuck `processing` rows.
   */
  timeoutMs?: number;
  /**
   * Poll interval while waiting for a terminal state. Defaults to 500ms.
   * Lower = lower latency, higher DB load; higher = less DB churn.
   */
  pollIntervalMs?: number;
}

/** What the worker returns when it claims a row. */
export type ClaimedOperation = PendingOperationRow;

/** A summary of what a janitor sweep touched, for logging and metrics. */
export interface JanitorSweepResult {
  /** Number of processing rows reset to pending. */
  reset: number;
}

/** A summary of what a retention purge deleted, for logging and metrics. */
export interface PurgeResult {
  /** Number of terminal rows deleted. */
  deleted: number;
}

/**
 * The queue interface. Used by `execute()` callers (which await completion)
 * and by workers (which claim/complete/fail rows).
 */
export interface IOperationQueue {
  /**
   * Enqueue an operation and await its terminal state. Resolves with the
   * worker's return value; rejects with the worker's error or a timeout.
   *
   * The Promise is the only handle. No operation ID, no status endpoint,
   * no subscription — just `await queue.execute(...)`.
   */
  execute<T>(req: OperationRequest): Promise<T>;

  /**
   * Insert an operation row without awaiting its terminal state. Returns the
   * row id (either a newly inserted row or the pre-existing row matched by
   * `idempotencyKey`).
   *
   * Used by the periodic scheduler to race bucketed idempotency keys across
   * every replica — all replicas call `enqueue()`, the unique partial index
   * ensures only one row per bucket lands, and the winning row is drained
   * by whichever core worker claims it first. No await, no timeout, no
   * completion handler. Fire-and-forget.
   *
   * If a non-periodic caller needs the result, they should use `execute()`.
   */
  enqueue(req: OperationRequest): Promise<{ id: string }>;

  /**
   * Claim the oldest pending row for a given target. Transitions it to
   * `processing` and marks `claimed_by`/`claimed_at`. Returns the row if
   * one was claimed, or `null` if no work is available.
   *
   * When `options.includeNullTarget` is set, the claim also picks up rows
   * whose `target IS NULL` — used by agent workers to drain creation-class
   * ops that any agent can fulfill (`bot.start`, `pool.warm`). The winning
   * agent stamps its own nodeId into the handler result. Core workers pass
   * `includeNullTarget: false` (the default) so they only drain their own
   * `target = 'core'` rows.
   *
   * Uses `SELECT … FOR UPDATE SKIP LOCKED` so concurrent workers never
   * collide on the same row.
   */
  claim(target: string, workerId: string, options?: { includeNullTarget?: boolean }): Promise<ClaimedOperation | null>;

  /** Mark a claimed row as succeeded with a result payload. */
  complete(id: string, result: unknown): Promise<void>;

  /** Mark a claimed row as failed with an error message. */
  fail(id: string, error: Error): Promise<void>;

  /**
   * Janitor sweep: find `processing` rows whose `claimed_at + timeout_s` is
   * in the past and reset them to `pending` so another worker can pick them up.
   * Safe to call on a schedule; idempotent.
   */
  janitorSweep(nowMs?: number): Promise<JanitorSweepResult>;

  /**
   * Retention purge: delete terminal rows (`succeeded` or `failed`) whose
   * `completed_at` is older than `olderThanMs`. Runs on a schedule to keep
   * `pending_operations` from growing unbounded — especially now that all
   * periodic maintenance tasks live in this table as bucketed idempotent
   * rows. Safe to call repeatedly; idempotent.
   */
  purge(olderThanMs: number, nowMs?: number): Promise<PurgeResult>;

  /**
   * Attach a NotificationSource so `execute()` callers wake up immediately
   * on `op_complete` NOTIFYs instead of waiting for the next poll tick.
   * Optional: the queue works poll-only if this is never called.
   */
  startListener(source: NotificationSource): Promise<void>;

  /** Detach and close the NotificationSource. Safe to call multiple times. */
  stopListener(): Promise<void>;

  /**
   * Subscribe to `op_enqueued` NOTIFYs for a given target. Used by workers
   * to wake their drain loop instead of polling on an idle timer. Requires
   * `startListener()` to have been called first.
   */
  subscribeEnqueued(target: string, onEnqueued: () => void): Promise<void>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 300_000; // 5 minutes
const DEFAULT_POLL_INTERVAL_MS = 500;

export interface OperationQueueOptions {
  /**
   * Default execute() wait timeout in ms. Also drives the row's `timeout_s`
   * column (the janitor uses it to reset stuck rows) — the caller's patience
   * and the janitor's deadline are the same concept in different units.
   */
  defaultExecuteTimeoutMs?: number;
  /** Default execute() poll interval in ms. */
  defaultPollIntervalMs?: number;
  /**
   * Override the clock. Used by tests to deterministically advance time for
   * janitor assertions. Production always uses `Date.now`.
   */
  now?: () => number;
  /** Override the UUID generator. Used by tests. Production uses `randomUUID`. */
  uuid?: () => string;
  /** Override the sleep primitive. Used by tests to fast-forward polling. */
  sleep?: (ms: number) => Promise<void>;
}

export class OperationQueue implements IOperationQueue {
  private readonly now: () => number;
  private readonly uuid: () => string;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly defaultExecuteTimeoutMs: number;
  private readonly defaultPollIntervalMs: number;

  /**
   * Per-request wake-up callbacks. Keys are row ids; values are functions
   * that unblock a pending `awaitTerminal` call so it re-reads the DB.
   *
   * This is NOT a source of truth — it's a dispatch table for the LISTEN
   * event handler. Losing the Map (process restart) loses the wake, not
   * the work; the polling fallback in `awaitTerminal` catches everything.
   */
  private readonly waiters = new Map<string, Set<() => void>>();

  /**
   * The attached NotificationSource, if any. When null, `awaitTerminal` runs
   * on polling only.
   */
  private listener: NotificationSource | null = null;

  constructor(
    private readonly db: DrizzleDb,
    options: OperationQueueOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.uuid = options.uuid ?? randomUUID;
    this.sleep = options.sleep ?? defaultSleep;
    this.defaultExecuteTimeoutMs = options.defaultExecuteTimeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.defaultPollIntervalMs = options.defaultPollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  }

  // ---- startListener() / stopListener() ------------------------------------

  async startListener(source: NotificationSource): Promise<void> {
    if (this.listener !== null) {
      throw new Error("OperationQueue: listener already started");
    }
    this.listener = source;
    await source.listen("op_complete", (payload) => this.handleCompletionNotify(payload));
  }

  async stopListener(): Promise<void> {
    if (this.listener === null) return;
    const source = this.listener;
    this.listener = null;
    // Wake every remaining waiter so their current poll tick resolves instead
    // of hanging on a now-dead notification channel.
    for (const set of this.waiters.values()) {
      for (const wake of set) wake();
    }
    this.waiters.clear();
    await source.close();
  }

  async subscribeEnqueued(target: string, onEnqueued: () => void): Promise<void> {
    if (this.listener === null) {
      throw new Error("OperationQueue: subscribeEnqueued requires startListener()");
    }
    await this.listener.listen("op_enqueued", (payload) => {
      // The trigger fires with the row's `target` as the payload. An empty
      // string means the row had `target = NULL` (future "any worker" case);
      // we'll just ignore those for now since subscribeEnqueued callers
      // always pin a specific target.
      if (payload === target) onEnqueued();
    });
  }

  /**
   * LISTEN handler for `op_complete`. Wakes every per-request waiter parked
   * on this id so they re-read the terminal row.
   */
  private handleCompletionNotify(rowId: string): void {
    const set = this.waiters.get(rowId);
    if (set === undefined) return;
    for (const wake of set) wake();
  }

  // ---- execute() -----------------------------------------------------------

  async execute<T>(req: OperationRequest): Promise<T> {
    const id = await this.enqueueOrJoin(req);
    const timeoutMs = req.timeoutMs ?? this.defaultExecuteTimeoutMs;
    const pollIntervalMs = req.pollIntervalMs ?? this.defaultPollIntervalMs;
    return this.awaitTerminal<T>(id, timeoutMs, pollIntervalMs);
  }

  async enqueue(req: OperationRequest): Promise<{ id: string }> {
    const id = await this.enqueueOrJoin(req);
    return { id };
  }

  /**
   * Insert a new row, or if an idempotency key collides, return the id of
   * the existing row so the caller joins its wait. Returns the row id in
   * both cases.
   */
  private async enqueueOrJoin(req: OperationRequest): Promise<string> {
    // Idempotency fast-path: if the key already exists, return that row's id.
    // This check before insert avoids a gratuitous unique violation on the
    // common case. The insert still uses onConflictDoNothing as a race guard.
    if (req.idempotencyKey !== undefined) {
      const existing = await this.db
        .select({ id: pendingOperations.id })
        .from(pendingOperations)
        .where(eq(pendingOperations.idempotencyKey, req.idempotencyKey))
        .limit(1);
      if (existing.length > 0) return existing[0].id;
    }

    const id = this.uuid();
    const rowTimeoutS = Math.max(1, Math.ceil((req.timeoutMs ?? this.defaultExecuteTimeoutMs) / 1000));

    const inserted = await this.db
      .insert(pendingOperations)
      .values({
        id,
        type: req.type,
        payload: req.payload as never,
        target: req.target,
        idempotencyKey: req.idempotencyKey ?? null,
        timeoutS: rowTimeoutS,
      })
      .onConflictDoNothing()
      .returning({ id: pendingOperations.id });

    if (inserted.length > 0) return inserted[0].id;

    // Conflict — someone else inserted the same idempotency key between our
    // check and our insert. Look it up and join.
    if (req.idempotencyKey !== undefined) {
      const existing = await this.db
        .select({ id: pendingOperations.id })
        .from(pendingOperations)
        .where(eq(pendingOperations.idempotencyKey, req.idempotencyKey))
        .limit(1);
      if (existing.length > 0) return existing[0].id;
    }
    throw new Error("OperationQueue: insert conflict without idempotency match — unexpected");
  }

  /**
   * Wait for the row to reach a terminal state. Races the NOTIFY-driven wake
   * (via the waiter Map) against the poll fallback — whichever resolves first
   * causes the next DB read to run.
   *
   * This is the hot path, so the shape matters:
   * - Every iteration does exactly one DB read.
   * - Between reads, we sleep on a Promise that resolves when EITHER the
   *   poll timer fires OR `handleCompletionNotify` wakes us.
   * - If no listener is attached, the wake-up set stays empty and the poll
   *   timer is the only thing that resolves the sleep — identical to the
   *   poll-only behavior.
   */
  private async awaitTerminal<T>(id: string, timeoutMs: number, pollIntervalMs: number): Promise<T> {
    const deadline = this.now() + timeoutMs;
    for (;;) {
      const rows = await this.db.select().from(pendingOperations).where(eq(pendingOperations.id, id)).limit(1);
      const row = rows[0];
      if (row === undefined) {
        throw new Error(`OperationQueue: row ${id} vanished before completion`);
      }
      if (row.status === "succeeded") {
        return row.result as T;
      }
      if (row.status === "failed") {
        throw new Error(row.errorMessage ?? `Operation ${row.type} (${id}) failed`);
      }
      const remainingMs = deadline - this.now();
      if (remainingMs <= 0) {
        throw new Error(`OperationQueue: operation ${row.type} (${id}) timed out after ${timeoutMs}ms`);
      }
      await this.waitForWakeOrPoll(id, Math.min(pollIntervalMs, remainingMs));
    }
  }

  /**
   * Sleep for `maxMs` OR until a NOTIFY-driven wake-up fires for this row id,
   * whichever happens first. The wake-up entry is cleaned up on every resolve
   * path so the Map can't leak.
   *
   * The `sleep` primitive is injectable (default: setTimeout-based) so tests
   * can fast-forward time. If LISTEN wakes first, the still-pending sleep
   * resolves later and its wake() call is a no-op thanks to `settled`.
   */
  private waitForWakeOrPoll(id: string, maxMs: number): Promise<void> {
    return new Promise((resolve) => {
      let settled = false;
      const set = this.getOrCreateWaiterSet(id);
      const wake = (): void => {
        if (settled) return;
        settled = true;
        set.delete(wake);
        if (set.size === 0) this.waiters.delete(id);
        resolve();
      };
      // Register the wake-up callback so NOTIFY dispatch can find us. If no
      // listener is active, nothing will ever call this — the sleep wins.
      set.add(wake);
      // Start the sleep. When it resolves, fire the same wake() — guarded
      // by `settled` so double-wakes are harmless.
      void this.sleep(maxMs).then(wake);
    });
  }

  private getOrCreateWaiterSet(id: string): Set<() => void> {
    let set = this.waiters.get(id);
    if (set === undefined) {
      set = new Set();
      this.waiters.set(id, set);
    }
    return set;
  }

  // ---- claim() -------------------------------------------------------------

  async claim(
    target: string,
    workerId: string,
    options?: { includeNullTarget?: boolean },
  ): Promise<ClaimedOperation | null> {
    const includeNull = options?.includeNullTarget === true;
    return await this.db.transaction(async (tx) => {
      // Predicate: either `target` matches exactly, or (for agents)
      // `target IS NULL` (creation-class ops). The `idx_pending_ops_claim`
      // partial index covers this efficiently because it's keyed on
      // `(target, enqueued_at) WHERE status = 'pending'`.
      const targetPredicate = includeNull
        ? or(isNull(pendingOperations.target), eq(pendingOperations.target, target))
        : eq(pendingOperations.target, target);
      const rows = await tx
        .select()
        .from(pendingOperations)
        .where(and(eq(pendingOperations.status, "pending"), targetPredicate))
        .orderBy(asc(pendingOperations.enqueuedAt))
        .limit(1)
        .for("update", { skipLocked: true });
      if (rows.length === 0) return null;
      const row = rows[0];
      const claimedAt = new Date(this.now()).toISOString();
      await tx
        .update(pendingOperations)
        .set({
          status: "processing",
          claimedBy: workerId,
          claimedAt,
        })
        .where(eq(pendingOperations.id, row.id));
      // Return the post-claim snapshot so the caller doesn't need a second read.
      return {
        ...row,
        status: "processing",
        claimedBy: workerId,
        claimedAt,
      };
    });
  }

  // ---- complete() / fail() -------------------------------------------------

  async complete(id: string, result: unknown): Promise<void> {
    const completedAt = new Date(this.now()).toISOString();
    await this.db
      .update(pendingOperations)
      .set({
        status: "succeeded",
        result: (result ?? null) as never,
        completedAt,
      })
      .where(and(eq(pendingOperations.id, id), eq(pendingOperations.status, "processing")));
  }

  async fail(id: string, error: Error): Promise<void> {
    const completedAt = new Date(this.now()).toISOString();
    await this.db
      .update(pendingOperations)
      .set({
        status: "failed",
        errorMessage: error.message,
        completedAt,
      })
      .where(and(eq(pendingOperations.id, id), eq(pendingOperations.status, "processing")));
  }

  // ---- janitorSweep() ------------------------------------------------------

  /**
   * Reset `processing` rows whose deadline has passed back to `pending`. The
   * deadline is `claimed_at + timeout_s` — rows past that deadline are assumed
   * to belong to a worker that crashed mid-handler. Comparison happens in JS
   * because `claimed_at` is text and the set of stuck rows is bounded by the
   * worker count, so iterating is cheap.
   */
  async janitorSweep(nowMs?: number): Promise<JanitorSweepResult> {
    const now = nowMs ?? this.now();
    // Find all processing rows — the index filters by status for us.
    const processing = await this.db
      .select({
        id: pendingOperations.id,
        claimedAt: pendingOperations.claimedAt,
        timeoutS: pendingOperations.timeoutS,
      })
      .from(pendingOperations)
      .where(eq(pendingOperations.status, "processing"));

    let reset = 0;
    for (const row of processing) {
      if (row.claimedAt === null) continue;
      const claimedAtMs = Date.parse(row.claimedAt);
      if (Number.isNaN(claimedAtMs)) continue;
      const deadlineMs = claimedAtMs + row.timeoutS * 1000;
      if (now < deadlineMs) continue;
      // Deadline passed — attempt to reset. Guard on status to avoid racing
      // a worker that's completing the row right now.
      const updated = await this.db
        .update(pendingOperations)
        .set({ status: "pending", claimedBy: null, claimedAt: null })
        .where(and(eq(pendingOperations.id, row.id), eq(pendingOperations.status, "processing")))
        .returning({ id: pendingOperations.id });
      if (updated.length > 0) reset++;
    }
    return { reset };
  }

  // ---- purge() -------------------------------------------------------------

  async purge(olderThanMs: number, nowMs?: number): Promise<PurgeResult> {
    const now = nowMs ?? this.now();
    const cutoffIso = new Date(now - olderThanMs).toISOString();
    const deleted = await this.db
      .delete(pendingOperations)
      .where(
        and(
          inArray(pendingOperations.status, ["succeeded", "failed"]),
          isNotNull(pendingOperations.completedAt),
          lt(pendingOperations.completedAt, cutoffIso),
        ),
      )
      .returning({ id: pendingOperations.id });
    return { deleted: deleted.length };
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
