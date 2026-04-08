/**
 * QueueWorker — the drain loop for the OperationQueue.
 *
 * One worker instance per (queue, target) pair. Workers claim pending rows,
 * look up the handler registered for the row's `type`, run it, and write the
 * result back to the queue. The same base class runs on every core replica
 * (target = "core") and on every node agent (target = its node id).
 *
 * Concurrency model: one row at a time per worker. If you need more parallelism,
 * run more workers. (Matches today's sequential WebSocket command handling.)
 *
 * Wake-up: if the queue has a NotificationSource attached, the worker can
 * subscribe to `op_enqueued` NOTIFYs so `claim() == null` parks on a
 * wake-or-timeout race instead of a blind idle poll. If the queue has no
 * listener, the drain loop falls back to the plain idle poll and behaves
 * exactly like the poll-only configuration.
 *
 * Lifecycle: call `start()` to begin draining, `stop()` to end the loop after
 * the in-flight handler (if any) returns. Neither method blocks.
 *
 * See `docs/2026-04-08-db-queue-architecture.md` §4.2.
 */

import type { ClaimedOperation, IOperationQueue } from "./operation-queue.js";

/**
 * A handler runs one operation. It receives the row payload and returns a
 * JSON-serialisable result. Throwing causes the row to be marked failed with
 * the thrown error's message.
 */
export type OperationHandler = (payload: unknown) => Promise<unknown>;

/** Minimal logger contract the worker will emit to. */
export interface WorkerLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface QueueWorkerOptions {
  /**
   * How long to sleep when `claim()` returns null (no work available).
   * Default 1000ms. In the no-NOTIFY design this is the main driver of
   * idle→busy latency — lower values = more responsive, higher DB churn.
   */
  idlePollMs?: number;
  /**
   * Optional sleep override for tests.
   */
  sleep?: (ms: number) => Promise<void>;
  /**
   * Optional logger. Defaults to a no-op so tests don't have to provide one.
   */
  logger?: WorkerLogger;
}

const DEFAULT_IDLE_POLL_MS = 1_000;

/**
 * Abstract drain loop. Subclasses register their own handler map in the
 * constructor and let the base class handle claim/dispatch/complete.
 */
export abstract class QueueWorker {
  private running = false;
  private loopPromise: Promise<void> | null = null;
  private readonly idlePollMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly logger: WorkerLogger;

  /**
   * When the worker is idle (no work to claim), it parks on this Promise.
   * The promise resolves when either the idle poll timer fires OR an
   * `op_enqueued` NOTIFY arrives for our target.
   */
  private wakePromise: Promise<void> | null = null;
  private wakeResolve: (() => void) | null = null;

  /**
   * Whether `subscribeEnqueued` has been wired. Set on start() when the
   * queue has a listener; gates the wake-on-notify fast path.
   */
  private notifySubscribed = false;

  constructor(
    protected readonly queue: IOperationQueue,
    protected readonly target: string,
    protected readonly workerId: string,
    protected readonly handlers: Map<string, OperationHandler>,
    options: QueueWorkerOptions = {},
  ) {
    this.idlePollMs = options.idlePollMs ?? DEFAULT_IDLE_POLL_MS;
    this.sleep = options.sleep ?? defaultSleep;
    this.logger = options.logger ?? noopLogger;
  }

  /**
   * Begin draining. Returns immediately; the loop runs in the background.
   * Call `stop()` to end it.
   *
   * If the queue has a NotificationSource attached, subscribe to
   * `op_enqueued` NOTIFYs so the idle path wakes up immediately on new
   * work. `subscribeEnqueued` throws when the queue has no listener —
   * that's expected in poll-only configurations, so we swallow it and
   * fall back to the plain sleep.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    // Fire-and-forget subscription. If it throws (no listener), log and
    // carry on — the loop still works, just on idle polling.
    this.trySubscribeEnqueued().catch((err) => {
      this.logger.debug("QueueWorker: subscribeEnqueued unavailable, poll-only", {
        target: this.target,
        workerId: this.workerId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
    this.loopPromise = this.drainLoop().catch((err) => {
      this.logger.error("QueueWorker: drain loop crashed", {
        target: this.target,
        workerId: this.workerId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }

  private async trySubscribeEnqueued(): Promise<void> {
    // Throws when no listener is attached to the queue — the caller catches
    // that and keeps notifySubscribed = false, which means the drain loop
    // stays in poll-only mode.
    await this.queue.subscribeEnqueued(this.target, () => this.wake());
    this.notifySubscribed = true;
  }

  /**
   * Request the loop to stop. Resolves when the in-flight handler (if any)
   * finishes and the loop exits.
   */
  async stop(): Promise<void> {
    this.running = false;
    // Kick the loop out of its idle sleep so stop() doesn't have to wait
    // for the full idle poll interval.
    this.wake();
    if (this.loopPromise) {
      await this.loopPromise;
      this.loopPromise = null;
    }
  }

  /**
   * Drain exactly one row if one is available. Returns true if work was done,
   * false if the queue was empty. Exposed for tests to drive deterministic
   * progress without running a background loop.
   */
  async tickOnce(): Promise<boolean> {
    const row = await this.queue.claim(this.target, this.workerId);
    if (row === null) return false;
    await this.runRow(row);
    return true;
  }

  // ---- internals -----------------------------------------------------------

  private async drainLoop(): Promise<void> {
    while (this.running) {
      let row: ClaimedOperation | null;
      try {
        row = await this.queue.claim(this.target, this.workerId);
      } catch (err) {
        // Claim itself failed (likely a transient DB error). Log and back off.
        this.logger.error("QueueWorker: claim failed", {
          target: this.target,
          workerId: this.workerId,
          error: err instanceof Error ? err.message : String(err),
        });
        await this.idleWait();
        continue;
      }
      if (row === null) {
        await this.idleWait();
        continue;
      }
      await this.runRow(row);
    }
  }

  /**
   * Park the loop until either the idle poll fires or a NOTIFY wakes us.
   * Whichever resolves first clears the wake slot and returns control.
   */
  private async idleWait(): Promise<void> {
    if (this.notifySubscribed) {
      // Race sleep vs. wake. Recreating the wakePromise each call is
      // intentional — a wake that arrives while we're running the handler
      // is consumed before it reaches the next parked state, which is fine
      // because on return claim() will find the freshly enqueued row.
      this.wakePromise = new Promise<void>((resolve) => {
        this.wakeResolve = resolve;
      });
      const wakeFirst = this.wakePromise;
      await Promise.race([this.sleep(this.idlePollMs), wakeFirst]);
      this.wakePromise = null;
      this.wakeResolve = null;
    } else {
      await this.sleep(this.idlePollMs);
    }
  }

  /**
   * Resolve the current wake promise, if any. Called by the NOTIFY handler
   * and by stop() to break out of idle wait.
   */
  private wake(): void {
    const resolve = this.wakeResolve;
    if (resolve === null) return;
    this.wakeResolve = null;
    this.wakePromise = null;
    resolve();
  }

  private async runRow(row: ClaimedOperation): Promise<void> {
    const handler = this.handlers.get(row.type);
    if (handler === undefined) {
      await this.queue.fail(row.id, new Error(`No handler registered for operation type '${row.type}'`));
      this.logger.warn("QueueWorker: no handler for row, marked failed", {
        target: this.target,
        workerId: this.workerId,
        type: row.type,
        id: row.id,
      });
      return;
    }
    this.logger.debug("QueueWorker: running row", {
      target: this.target,
      workerId: this.workerId,
      type: row.type,
      id: row.id,
    });
    try {
      const result = await handler(row.payload);
      await this.queue.complete(row.id, result ?? null);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      await this.queue.fail(row.id, error);
      this.logger.warn("QueueWorker: handler failed, row marked failed", {
        target: this.target,
        workerId: this.workerId,
        type: row.type,
        id: row.id,
        error: error.message,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const noopLogger: WorkerLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};
