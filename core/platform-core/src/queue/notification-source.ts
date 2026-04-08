/**
 * NotificationSource — the LISTEN/NOTIFY escape hatch for the queue.
 *
 * LISTEN and NOTIFY are Postgres protocol commands, not data queries —
 * no ORM (Drizzle included) wraps them, because the listening connection
 * can't be reused for queries. This file is the one place in the queue
 * subsystem that deals with that protocol-level concern.
 *
 * The interface is deliberately tiny so production (pg.Pool-backed) and
 * tests (in-memory fake) can both satisfy it without any coupling between
 * the queue and `pg`.
 */

/** Callback fired when a NOTIFY arrives on a subscribed channel. */
export type NotifyHandler = (payload: string) => void;

/**
 * A live listener connection. Subscribe once per channel. Close when done.
 *
 * Implementations must be **always-on**: once `listen()` resolves, any NOTIFY
 * sent on that channel by any process using the same database MUST invoke
 * the handler. Reconnect-on-disconnect is the implementation's problem.
 */
export interface NotificationSource {
  /**
   * Start delivering NOTIFY payloads on `channel` to `onNotify`. Resolves
   * once the underlying LISTEN has been issued. Calling `listen()` twice
   * on the same channel is undefined behavior — implementations are free
   * to either add handlers or replace them.
   */
  listen(channel: string, onNotify: NotifyHandler): Promise<void>;

  /** Release the listener connection. After close, no more NOTIFYs fire. */
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// In-memory implementation — used by unit tests.
// ---------------------------------------------------------------------------

/**
 * A trivial in-memory NotificationSource. Tests construct one, wire it into
 * the OperationQueue, and call `deliver()` to simulate a NOTIFY arriving.
 *
 * This isn't "production minus pg" — it's a deliberate test double. Unit tests
 * use it to exercise the `execute()` wake-up path without needing a real
 * Postgres connection.
 */
export class InMemoryNotificationSource implements NotificationSource {
  private readonly handlers = new Map<string, NotifyHandler[]>();
  private closed = false;

  async listen(channel: string, onNotify: NotifyHandler): Promise<void> {
    if (this.closed) throw new Error("InMemoryNotificationSource: closed");
    const list = this.handlers.get(channel) ?? [];
    list.push(onNotify);
    this.handlers.set(channel, list);
  }

  async close(): Promise<void> {
    this.closed = true;
    this.handlers.clear();
  }

  /** Test-only: pretend a NOTIFY arrived on `channel` with `payload`. */
  deliver(channel: string, payload: string): void {
    if (this.closed) return;
    const list = this.handlers.get(channel);
    if (list === undefined) return;
    for (const handler of list) {
      // Fire asynchronously so callers can `await deliver(...)` and let the
      // handler's own microtask queue flush in a deterministic order.
      queueMicrotask(() => handler(payload));
    }
  }
}
