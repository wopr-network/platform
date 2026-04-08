/**
 * PgNotificationSource — the production LISTEN/NOTIFY implementation.
 *
 * Checks out a dedicated client from a pg.Pool, issues LISTEN for each
 * subscribed channel, and dispatches `notification` events to the registered
 * handlers. The client is never released back to the pool until close() —
 * a LISTEN'ing connection can't be shared for queries.
 *
 * Reconnection strategy: if the client errors out, we reconnect with
 * exponential backoff and re-issue LISTEN for every previously subscribed
 * channel. While the connection is down, the queue's polling fallback
 * (see OperationQueue.awaitTerminal) keeps completion detection working —
 * NOTIFY is a latency optimization, not a correctness requirement.
 */

import type { Pool, PoolClient } from "pg";
import type { NotificationSource, NotifyHandler } from "./notification-source.js";

export interface PgNotificationSourceOptions {
  /** Initial reconnect delay (ms). Default 500. */
  initialBackoffMs?: number;
  /** Maximum reconnect delay (ms). Default 30_000. */
  maxBackoffMs?: number;
  /** Optional logger; defaults to a no-op. */
  logger?: {
    info(msg: string, meta?: Record<string, unknown>): void;
    warn(msg: string, meta?: Record<string, unknown>): void;
    error(msg: string, meta?: Record<string, unknown>): void;
  };
}

export class PgNotificationSource implements NotificationSource {
  private client: PoolClient | null = null;
  private readonly handlers = new Map<string, NotifyHandler[]>();
  private closed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private currentBackoffMs: number;
  private readonly initialBackoffMs: number;
  private readonly maxBackoffMs: number;
  private readonly logger: NonNullable<PgNotificationSourceOptions["logger"]>;

  constructor(
    private readonly pool: Pool,
    options: PgNotificationSourceOptions = {},
  ) {
    this.initialBackoffMs = options.initialBackoffMs ?? 500;
    this.maxBackoffMs = options.maxBackoffMs ?? 30_000;
    this.currentBackoffMs = this.initialBackoffMs;
    this.logger = options.logger ?? {
      info: () => {},
      warn: () => {},
      error: () => {},
    };
  }

  async listen(channel: string, onNotify: NotifyHandler): Promise<void> {
    if (this.closed) throw new Error("PgNotificationSource: closed");

    const existing = this.handlers.get(channel) ?? [];
    existing.push(onNotify);
    this.handlers.set(channel, existing);

    const client = await this.ensureClient();
    await client.query(`LISTEN "${sanitizeChannel(channel)}"`);
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.client !== null) {
      try {
        // Remove all listeners to avoid re-entering handleError during release.
        this.client.removeAllListeners("notification");
        this.client.removeAllListeners("error");
        this.client.release(true);
      } catch {
        // Ignore — we're closing anyway.
      }
      this.client = null;
    }
    this.handlers.clear();
  }

  // ---- internals -----------------------------------------------------------

  /**
   * Return the live LISTEN'ing client, opening it if necessary. Binds the
   * notification + error handlers on first checkout.
   */
  private async ensureClient(): Promise<PoolClient> {
    if (this.closed) throw new Error("PgNotificationSource: closed");
    if (this.client !== null) return this.client;

    const client = await this.pool.connect();
    client.on("notification", (msg) => {
      if (msg.channel === undefined) return;
      const list = this.handlers.get(msg.channel);
      if (list === undefined) return;
      const payload = msg.payload ?? "";
      for (const handler of list) {
        try {
          handler(payload);
        } catch (err) {
          this.logger.warn("PgNotificationSource: handler threw", {
            channel: msg.channel,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });
    client.on("error", (err) => this.handleError(err));
    this.client = client;
    this.currentBackoffMs = this.initialBackoffMs;
    return client;
  }

  /**
   * Called when the dedicated client emits an error. Release it, schedule a
   * reconnect, and re-issue LISTEN for every previously subscribed channel.
   */
  private handleError(err: Error): void {
    if (this.closed) return;
    this.logger.warn("PgNotificationSource: listener client error, reconnecting", {
      error: err.message,
      backoffMs: this.currentBackoffMs,
    });
    if (this.client !== null) {
      try {
        this.client.removeAllListeners("notification");
        this.client.removeAllListeners("error");
        this.client.release(true);
      } catch {
        // Ignore — already broken.
      }
      this.client = null;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectTimer !== null) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnect().catch((err) => {
        this.logger.error("PgNotificationSource: reconnect failed", {
          error: err instanceof Error ? err.message : String(err),
        });
        this.currentBackoffMs = Math.min(this.currentBackoffMs * 2, this.maxBackoffMs);
        this.scheduleReconnect();
      });
    }, this.currentBackoffMs);
  }

  private async reconnect(): Promise<void> {
    const client = await this.ensureClient();
    for (const channel of this.handlers.keys()) {
      await client.query(`LISTEN "${sanitizeChannel(channel)}"`);
    }
    this.logger.info("PgNotificationSource: reconnected", {
      channels: Array.from(this.handlers.keys()),
    });
  }
}

/**
 * Scrub a channel name down to a safe identifier. Postgres allows quoted
 * identifiers to contain arbitrary characters, but the queue only uses fixed
 * lowercase ASCII names — reject anything else at construction time so a
 * future typo can't turn into SQL injection.
 */
function sanitizeChannel(channel: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(channel)) {
    throw new Error(`PgNotificationSource: invalid channel name '${channel}'`);
  }
  return channel;
}
