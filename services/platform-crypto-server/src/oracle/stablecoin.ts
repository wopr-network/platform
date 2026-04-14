import type { IPriceSource, PriceAsset, PriceResult } from "./types.js";
import { AssetNotSupportedError } from "./types.js";

/**
 * Always-$1.00 source for recognised stablecoin tokens.
 *
 * Stablecoins don't need an external price feed — by design they're pegged
 * to USD. Seeding them via a source (rather than a hardcoded special case
 * in `/charges`) keeps the hot path uniform: the DB has a row for every
 * sellable token, and `priceStore.get()` is the only lookup.
 *
 * Priority: place this source LAST in the refresher pipeline. A real price
 * source that quotes a stablecoin at anything other than $1.00 should win;
 * this is the fallback for tokens no other source understands.
 */
export class FixedRateStablecoinSource implements IPriceSource {
  private readonly stablecoins: Set<string>;

  constructor(stablecoins: string[] = ["USDC", "USDT", "DAI", "PYUSD", "USDP", "USDe", "FDUSD", "TUSD", "GUSD"]) {
    this.stablecoins = new Set(stablecoins.map((s) => s.toUpperCase()));
  }

  async getPrice(asset: PriceAsset, _feedAddress?: `0x${string}`): Promise<PriceResult> {
    if (!this.stablecoins.has(asset.toUpperCase())) {
      throw new AssetNotSupportedError(asset);
    }
    return { priceMicros: 1_000_000, updatedAt: new Date() };
  }
}
