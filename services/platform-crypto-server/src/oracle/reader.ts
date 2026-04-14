import type { IPriceReader } from "../plugin/interfaces.js";
import type { IPriceStore } from "../stores/price-store.js";

/**
 * Thrown when `DbPriceReader.getPrice()` finds no row for the requested
 * token. This is an invariant violation, not a transient condition — it
 * means something bypassed the `/charges` gate, or the refresher has never
 * successfully seeded this asset. Typed so log pipelines and watcher
 * error-reporting can correlate on `token`.
 */
export class PriceNotSeededError extends Error {
  readonly token: string;
  constructor(token: string) {
    super(
      `[price-reader] no price row for ${token} — /charges gating should have prevented this; check the refresher seeded this token`,
    );
    this.name = "PriceNotSeededError";
    this.token = token;
  }
}

/**
 * The hot path's price lookup: read the `prices` table. That is the entire
 * implementation. No fallback. No network. One call, one return, always.
 *
 * The `prices` table is populated by {@link ../oracle/refresher.PriceRefresher}.
 * `/charges` creation checks this reader before issuing a deposit address, so
 * by the time a watcher reads for a confirmed payment, the row is guaranteed
 * to exist.
 *
 * If `get()` returns null here, that is a system-invariant violation — not a
 * transient failure to catch. Fail loudly with {@link PriceNotSeededError}.
 */
export class DbPriceReader implements IPriceReader {
  constructor(private readonly store: IPriceStore) {}

  async getPrice(token: string, _feedAddress?: string): Promise<{ priceMicros: number }> {
    const row = await this.store.get(token);
    if (row === null) throw new PriceNotSeededError(token);
    return { priceMicros: row.priceMicros };
  }
}
