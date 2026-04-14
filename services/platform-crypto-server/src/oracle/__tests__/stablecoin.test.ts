import { describe, expect, it } from "vitest";
import { FixedRateStablecoinSource } from "../stablecoin.js";
import { AssetNotSupportedError } from "../types.js";

describe("FixedRateStablecoinSource", () => {
  it("returns $1.00 for recognized stablecoins", async () => {
    const src = new FixedRateStablecoinSource();
    for (const token of ["USDC", "USDT", "DAI"]) {
      const result = await src.getPrice(token);
      expect(result.priceMicros).toBe(1_000_000);
    }
  });

  it("is case-insensitive on input", async () => {
    const src = new FixedRateStablecoinSource();
    expect((await src.getPrice("usdc")).priceMicros).toBe(1_000_000);
  });

  it("throws AssetNotSupportedError for unrecognized tokens so refresher can fall through", async () => {
    const src = new FixedRateStablecoinSource();
    await expect(src.getPrice("BTC")).rejects.toBeInstanceOf(AssetNotSupportedError);
  });

  it("supports custom stablecoin list", async () => {
    const src = new FixedRateStablecoinSource(["USDC", "GUSD"]);
    expect((await src.getPrice("GUSD")).priceMicros).toBe(1_000_000);
    await expect(src.getPrice("DAI")).rejects.toBeInstanceOf(AssetNotSupportedError);
  });
});
