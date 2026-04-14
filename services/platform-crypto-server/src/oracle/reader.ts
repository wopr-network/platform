import type { IPriceReader } from "../plugin/interfaces.js";
import type { IPriceStore } from "../stores/price-store.js";

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
 * transient failure to catch. Fail loudly.
 */
export class DbPriceReader implements IPriceReader {
  constructor(private readonly store: IPriceStore) {}

  async getPrice(token: string, _feedAddress?: string): Promise<{ priceMicros: number }> {
    const row = await this.store.get(token);
    if (row === null) {
      throw new Error(`[price-reader] no price for ${token} in DB — gating at /charges should have prevented this`);
    }
    return { priceMicros: row.priceMicros };
  }
}
