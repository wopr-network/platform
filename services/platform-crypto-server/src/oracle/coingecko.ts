import type { IPriceSource, PriceAsset, PriceResult } from "./types.js";
import { AssetNotSupportedError } from "./types.js";

/** Default cache TTL. Matches CoinGecko's update cadence; lower risks blowing the
 *  rate limit, higher risks serving a stale price. 60s is the sweet spot. */
const DEFAULT_CACHE_TTL_MS = 60_000;

interface CachedPrice {
  priceMicros: number;
  updatedAt: Date;
  fetchedAt: number;
}

export interface CoinGeckoOracleOpts {
  /**
   * Token→CoinGecko ID mapping, resolved per call. Populated from
   * payment_methods.oracle_asset_id. Supplied as a function so new payment
   * methods added via the admin API are picked up without a service restart.
   */
  tokenIds: () => Promise<Record<string, string>> | Record<string, string>;
  /** Cache TTL in ms. Default: 60s. */
  cacheTtlMs?: number;
  /** Custom fetch function (for testing). */
  fetchFn?: typeof fetch;
}

/**
 * CoinGecko price oracle — free API, no key required.
 *
 * Batches all known token IDs into a single /simple/price request per cache
 * window. The PR #87 refresher previously called getPrice() once per token,
 * which burst-fired ~20 requests in 3 seconds and tripped the free-tier 429
 * rate limit every tick. This implementation issues ONE request per tick
 * regardless of how many tokens are asked about — the refresher can fan out
 * across as many tokens as it wants without touching the rate limit.
 *
 * Token→CoinGecko ID mapping is DB-driven (payment_methods.oracle_asset_id).
 * Adding a new chain = adding a DB row with the CoinGecko slug. No code deploy.
 */
export class CoinGeckoOracle implements IPriceSource {
  private readonly getIds: () => Promise<Record<string, string>> | Record<string, string>;
  private readonly cacheTtlMs: number;
  private readonly fetchFn: typeof fetch;

  /** Per-asset cache. All entries populated together by a single batch fetch. */
  private readonly cache = new Map<string, CachedPrice>();
  /** Shared in-flight batch promise so concurrent getPrice() calls share one HTTP request. */
  private inFlightBatch: Promise<void> | null = null;
  /** Timestamp of the last successful batch. */
  private lastBatchAt = 0;

  constructor(opts: CoinGeckoOracleOpts) {
    this.getIds = opts.tokenIds;
    this.cacheTtlMs = opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.fetchFn = opts.fetchFn ?? fetch;
  }

  async getPrice(asset: PriceAsset, _feedAddress?: `0x${string}`): Promise<PriceResult> {
    // Warm cache hit — no network, no waiting on batch.
    const cached = this.cache.get(asset);
    if (cached && Date.now() - cached.fetchedAt < this.cacheTtlMs) {
      return { priceMicros: cached.priceMicros, updatedAt: cached.updatedAt };
    }

    // Cache miss or stale — ensure a batch fetch has happened for this window.
    // Concurrent callers during the same tick share one HTTP request via the
    // inFlightBatch promise, which is the whole point of this implementation.
    await this.ensureBatch();

    const fresh = this.cache.get(asset);
    if (fresh) {
      return { priceMicros: fresh.priceMicros, updatedAt: fresh.updatedAt };
    }

    // Asset isn't in the CoinGecko id map. Fail the specific assertion the
    // refresher's priority fallthrough expects; callers can try another source.
    throw new AssetNotSupportedError(asset);
  }

  private async ensureBatch(): Promise<void> {
    // If another caller already kicked off the batch fetch for this window,
    // join their promise instead of firing a second HTTP request.
    if (this.inFlightBatch) {
      await this.inFlightBatch;
      return;
    }
    // If the cache is warm enough, a batch was just completed elsewhere and
    // we don't need to do anything.
    if (Date.now() - this.lastBatchAt < this.cacheTtlMs) return;

    this.inFlightBatch = this.doBatch();
    try {
      await this.inFlightBatch;
    } finally {
      this.inFlightBatch = null;
    }
  }

  private async doBatch(): Promise<void> {
    const ids = await this.getIds();
    const entries = Object.entries(ids);
    if (entries.length === 0) return;

    // Request every known id in one call. 500+ ids fit comfortably in a
    // query string; CoinGecko's free tier supports this natively.
    const coinIds = entries.map(([, id]) => id).join(",");
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(coinIds)}&vs_currencies=usd`;

    try {
      const res = await this.fetchFn(url);
      if (!res.ok) {
        throw new Error(`CoinGecko batch error: ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as Record<string, { usd?: number }>;

      const fetchedAt = Date.now();
      const updatedAt = new Date(fetchedAt);
      for (const [asset, coinId] of entries) {
        const usd = data[coinId]?.usd;
        if (usd === undefined || usd <= 0) {
          // Asset present in ids map but CoinGecko didn't return a price.
          // Leave the cache entry unchanged — refresher's priority fallthrough
          // handles it, and stale-but-present beats zero-valued.
          continue;
        }
        const priceMicros = Math.round(usd * 1_000_000);
        this.cache.set(asset, { priceMicros, updatedAt, fetchedAt });
      }
      this.lastBatchAt = fetchedAt;
    } finally {
      // Transient batch failure (thrown): don't flip the window, don't clear
      // existing cache entries. Next getPrice() will retry the batch. The
      // refresher treats a per-token failure as "try the next source."
    }
  }
}
