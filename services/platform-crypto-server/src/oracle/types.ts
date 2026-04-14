/** Assets with Chainlink price feeds. */
export type PriceAsset = string;

/** Thrown when no source supports a given asset (not a transient failure). */
export class AssetNotSupportedError extends Error {
  constructor(asset: string) {
    super(`No price source supports asset: ${asset}`);
    this.name = "AssetNotSupportedError";
  }
}

/** Result from a price source query. */
export interface PriceResult {
  /** Microdollars per 1 unit of asset (integer, 10^-6 USD). */
  priceMicros: number;
  /** When the price was last updated at the source. */
  updatedAt: Date;
}

/**
 * External price source — Chainlink on-chain feeds, CoinGecko REST, etc.
 *
 * The hot path does NOT call this. Only the `PriceRefresher` consults
 * `IPriceSource` implementations, once an hour, in priority order, writing
 * the first success to the `prices` DB table. Watchers and /charges read
 * the DB via `IPriceReader` (see src/plugin/interfaces.ts).
 */
export interface IPriceSource {
  /**
   * Get the current USD price for an asset.
   * @param asset — token symbol (e.g. "BTC", "DOGE")
   * @param feedAddress — optional Chainlink feed address override
   */
  getPrice(asset: PriceAsset, feedAddress?: `0x${string}`): Promise<PriceResult>;
}
