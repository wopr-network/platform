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
  /** Tokens to refresh on each tick. Typically built from enabled payment methods. */
  tokens: PriceTokenConfig[];
  /** Refresh interval. Default: 1 hour. */
  intervalMs?: number;
  /** Spacing between per-token fetches within a tick. Default: 150ms (polite). */
  spacingMs?: number;
  /** Optional hook called once per tick with per-token outcome. */
  onTick?: (report: RefreshReport) => void;
}

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
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly opts: PriceRefresherOpts) {
    this.intervalMs = opts.intervalMs ?? 60 * 60 * 1000;
    this.spacingMs = opts.spacingMs ?? 150;
  }

  async start(): Promise<void> {
    await this.refreshAll();
    this.timer = setInterval(() => {
      this.refreshAll().catch((err) => {
        console.error("[price-refresher] tick failed:", err);
      });
    }, this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async refreshAll(): Promise<RefreshReport> {
    const report: RefreshReport = { at: new Date(), results: [] };

    for (let i = 0; i < this.opts.tokens.length; i++) {
      const { token, feedAddress } = this.opts.tokens[i];
      const result = await this.refreshOne(token, feedAddress);
      report.results.push(result);
      if (i < this.opts.tokens.length - 1 && this.spacingMs > 0) {
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
          console.log(`[price-refresher] ${token} = ${priceMicros}µ$ via ${name}`);
          return { token, outcome: "updated", source: name, priceMicros };
        }
        errors.push(`${name}: non-positive price (${priceMicros})`);
      } catch (err) {
        errors.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    console.warn(`[price-refresher] ${token} — all sources failed: ${errors.join(" | ")}`);
    return { token, outcome: "all-sources-failed", error: errors.join(" | ") };
  }
}
