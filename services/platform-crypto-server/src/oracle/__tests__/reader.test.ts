import { describe, expect, it, vi } from "vitest";
import type { IPriceStore } from "../../stores/price-store.js";
import { DbPriceReader, PriceNotSeededError } from "../reader.js";

describe("DbPriceReader", () => {
  it("returns priceMicros from the DB row", async () => {
    const store: IPriceStore = {
      get: vi.fn().mockResolvedValue({ token: "TON", priceMicros: 3_500_000, source: "coingecko", updatedAt: "now" }),
      list: vi.fn(),
      upsert: vi.fn(),
    };
    const reader = new DbPriceReader(store);
    const result = await reader.getPrice("TON");
    expect(result).toEqual({ priceMicros: 3_500_000 });
  });

  it("throws PriceNotSeededError with token context when the row is missing", async () => {
    const store: IPriceStore = {
      get: vi.fn().mockResolvedValue(null),
      list: vi.fn(),
      upsert: vi.fn(),
    };
    const reader = new DbPriceReader(store);
    await expect(reader.getPrice("TON")).rejects.toBeInstanceOf(PriceNotSeededError);
    await expect(reader.getPrice("TON")).rejects.toMatchObject({ token: "TON" });
  });

  it("ignores the legacy feedAddress parameter", async () => {
    const get = vi
      .fn()
      .mockResolvedValue({ token: "BTC", priceMicros: 65_000_000_000, source: "chainlink", updatedAt: "now" });
    const reader = new DbPriceReader({ get, list: vi.fn(), upsert: vi.fn() });
    await reader.getPrice("BTC", "0xCAFE");
    expect(get).toHaveBeenCalledWith("BTC");
  });
});
