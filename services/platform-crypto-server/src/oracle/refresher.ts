import type { IPriceStore } from "../stores/price-store.js";
import type { IPriceSource, PriceAsset } from "./types.js";

export interface PriceTokenConfig {
  token: PriceAsset;
  /** Optional Chainlink feed address for on-chain sources. */
  feedAddress?: `0x${string}`;
}

export interface PriceRefresherOpts {
  /** DB-backed destination for refreshed prices. */
  store: IPriceStore;
  /**
   * Priority-ordered list of `(name, oracle)` pairs. First successful source
   * per token wins; later sources are only consulted if earlier ones throw.
   * Name is persisted to `prices.source` for traceability.
   */
  sources: { name: string; source: IPriceSource }[];
  /**
   * Tokens to refresh on each tick. Resolved lazily so payment methods added
   * via the admin API after boot are picked up on the next tick instead of
   * requiring a service restart. Return the full enabled-token set each call;
   * the refresher is idempotent in tokens.
   */
  tokens: () => Promise<PriceTokenConfig[]>;
  /** Refresh interval. Default: 1 hour. */
  intervalMs?: number;
  /** Spacing between per-token fetches within a tick. Default: 150ms (polite). */
  spacingMs?: number;
  /** Optional hook called once per tick with per-token outcome. */
  onTick?: (report: RefreshReport) => void;
  /**
   * Optional logger. Defaults to silent — the refresher is library code and
   * will not emit log lines unless the caller wires one up. `entry.ts` passes
   * a console-backed logger; tests pass nothing (silent) or a mock.
   */
  log?: PriceRefresherLog;
}

export interface PriceRefresherLog {
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
  error(msg: string, meta?: unknown): void;
}

const SILENT_LOG: PriceRefresherLog = {
  info() {},
  warn() {},
  error() {},
};

export interface RefreshReport {
  at: Date;
  results: Array<{
    token: string;
    outcome: "updated" | "all-sources-failed";
    source?: string;
    priceMicros?: number;
    error?: string;
  }>;
}

/**
 * Scheduled job that populates the `prices` table.
 *
 * The hot path (watchers, /charges) never calls an oracle. It reads from the
 * DB. This refresher is the ONLY thing that calls IPriceSource implementations.
 *
 * Behaviour:
 *   - On start: one immediate `refreshAll()` so cold boots seed quickly.
 *   - Every `intervalMs` (default 1h): another `refreshAll()`.
 *   - Per token, walks `sources` in priority order; first success upserts.
 *   - All sources failing for a token is logged but non-fatal. The previous
 *     row in `prices` stays intact — "any recorded price is valid."
 */
export class PriceRefresher {
  private readonly intervalMs: number;
  private readonly spacingMs: number;
  private readonly log: PriceRefresherLog;
  private timer: NodeJS.Timeout | null = null;
  private inFlight: Promise<void> | null = null;

  constructor(private readonly opts: PriceRefresherOpts) {
    this.intervalMs = opts.intervalMs ?? 60 * 60 * 1000;
    this.spacingMs = opts.spacingMs ?? 150;
    this.log = opts.log ?? SILENT_LOG;
  }

  async start(): Promise<void> {
    await this.tick();
    // In-flight guard: if a tick is still running when the next interval
    // fires (slow RPC, hung HTTP, DB contention), skip. Two concurrent
    // refreshers would race on `prices` upserts and waste source quotas.
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
  }

  /**
   * Stop the scheduled ticks and await any in-flight tick. Awaitable so that
   * callers (entry.ts shutdown handler) can drain a partial refresh before
   * closing the pg pool underneath it.
   */
  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.inFlight) await this.inFlight;
  }

  private async tick(): Promise<void> {
    if (this.inFlight) {
      this.log.warn("[price-refresher] previous tick still running; skipping this interval");
      return;
    }
    this.inFlight = this.doTick();
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }

  private async doTick(): Promise<void> {
    try {
      await this.refreshAll();
    } catch (err) {
      this.log.error("[price-refresher] tick failed", err);
    }
  }

  async refreshAll(): Promise<RefreshReport> {
    const report: RefreshReport = { at: new Date(), results: [] };
    const tokens = await this.opts.tokens();

    for (let i = 0; i < tokens.length; i++) {
      const { token, feedAddress } = tokens[i];
      const result = await this.refreshOne(token, feedAddress);
      report.results.push(result);
      if (i < tokens.length - 1 && this.spacingMs > 0) {
        await new Promise((r) => setTimeout(r, this.spacingMs));
      }
    }

    this.opts.onTick?.(report);
    return report;
  }

  private async refreshOne(token: string, feedAddress?: `0x${string}`): Promise<RefreshReport["results"][number]> {
    const errors: string[] = [];
    for (const { name, source } of this.opts.sources) {
      try {
        const { priceMicros } = await source.getPrice(token, feedAddress);
        if (priceMicros > 0) {
          await this.opts.store.upsert(token, priceMicros, name);
          this.log.info(`[price-refresher] ${token} = ${priceMicros}µ$ via ${name}`);
          return { token, outcome: "updated", source: name, priceMicros };
        }
        errors.push(`${name}: non-positive price (${priceMicros})`);
      } catch (err) {
        errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    this.log.warn(`[price-refresher] ${token} — all sources failed: ${errors.join(" | ")}`);
    return { token, outcome: "all-sources-failed", error: errors.join(" | ") };
  }
}
