import { describe, expect, it, vi } from "vitest";
import type { IPriceStore } from "../../stores/price-store.js";
import { PriceRefresher } from "../refresher.js";
import type { IPriceSource } from "../types.js";

function mockStore(): IPriceStore & { _upserts: Array<[string, number, string]> } {
  const upserts: Array<[string, number, string]> = [];
  return {
    _upserts: upserts,
    get: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    async upsert(token: string, priceMicros: number, source: string) {
      upserts.push([token, priceMicros, source]);
    },
  };
}

function workingSource(priceMicros: number): IPriceSource {
  return {
    async getPrice() {
      return { priceMicros, updatedAt: new Date() };
    },
  };
}

function failingSource(msg: string): IPriceSource {
  return {
    async getPrice() {
      throw new Error(msg);
    },
  };
}

describe("PriceRefresher", () => {
  it("first source wins; fallback not called", async () => {
    const store = mockStore();
    const secondSpy = vi.fn();
    const refresher = new PriceRefresher({
      store,
      sources: [
        { name: "primary", source: workingSource(65_000_000_000) },
        { name: "fallback", source: { getPrice: secondSpy } },
      ],
      tokens: async () => [{ token: "BTC" }],
      spacingMs: 0,
    });
    const report = await refresher.refreshAll();
    expect(report.results[0].outcome).toBe("updated");
    expect(report.results[0].source).toBe("primary");
    expect(store._upserts).toEqual([["BTC", 65_000_000_000, "primary"]]);
    expect(secondSpy).not.toHaveBeenCalled();
  });

  it("falls through failed sources in priority order", async () => {
    const store = mockStore();
    const refresher = new PriceRefresher({
      store,
      sources: [
        { name: "chainlink", source: failingSource("stale feed") },
        { name: "coingecko", source: failingSource("429 rate limit") },
        { name: "stablecoin", source: workingSource(1_000_000) },
      ],
      tokens: async () => [{ token: "USDC" }],
      spacingMs: 0,
    });
    const report = await refresher.refreshAll();
    expect(report.results[0].outcome).toBe("updated");
    expect(report.results[0].source).toBe("stablecoin");
    expect(store._upserts).toEqual([["USDC", 1_000_000, "stablecoin"]]);
  });

  it("leaves DB row untouched when every source fails", async () => {
    const store = mockStore();
    const refresher = new PriceRefresher({
      store,
      sources: [
        { name: "a", source: failingSource("down") },
        { name: "b", source: failingSource("also down") },
      ],
      tokens: async () => [{ token: "TON" }],
      spacingMs: 0,
    });
    const report = await refresher.refreshAll();
    expect(report.results[0].outcome).toBe("all-sources-failed");
    expect(report.results[0].error).toContain("a: down");
    expect(report.results[0].error).toContain("b: also down");
    expect(store._upserts).toEqual([]);
  });

  it("rejects non-positive prices and falls through", async () => {
    const store = mockStore();
    const zeroSource: IPriceSource = {
      async getPrice() {
        return { priceMicros: 0, updatedAt: new Date() };
      },
    };
    const refresher = new PriceRefresher({
      store,
      sources: [
        { name: "zero", source: zeroSource },
        { name: "real", source: workingSource(3_500_000) },
      ],
      tokens: async () => [{ token: "TON" }],
      spacingMs: 0,
    });
    const report = await refresher.refreshAll();
    expect(report.results[0].source).toBe("real");
    expect(store._upserts).toEqual([["TON", 3_500_000, "real"]]);
  });

  it("refreshes multiple tokens independently", async () => {
    const store = mockStore();
    const refresher = new PriceRefresher({
      store,
      sources: [{ name: "src", source: workingSource(1_234_567) }],
      tokens: async () => [{ token: "BTC" }, { token: "ETH" }, { token: "TON" }],
      spacingMs: 0,
    });
    await refresher.refreshAll();
    expect(store._upserts.map(([t]) => t)).toEqual(["BTC", "ETH", "TON"]);
  });

  it("passes feedAddress through to sources", async () => {
    const store = mockStore();
    const spy = vi.fn().mockResolvedValue({ priceMicros: 65_000_000_000, updatedAt: new Date() });
    const refresher = new PriceRefresher({
      store,
      sources: [{ name: "chainlink", source: { getPrice: spy } }],
      tokens: async () => [{ token: "BTC", feedAddress: "0xCAFE" as `0x${string}` }],
      spacingMs: 0,
    });
    await refresher.refreshAll();
    expect(spy).toHaveBeenCalledWith("BTC", "0xCAFE");
  });

  it("resolves tokens per tick so admin-added payment methods are picked up without restart", async () => {
    // The refresher config is NOT snapshotted at boot. A new token inserted
    // via the admin API after the service is already running must be seen on
    // the very next tick, otherwise /charges would keep 503ing for that
    // token until a restart. Here we mutate the underlying list between
    // ticks and assert the new token is refreshed.
    const store = mockStore();
    const tokens = [{ token: "BTC" }];
    const refresher = new PriceRefresher({
      store,
      sources: [{ name: "src", source: workingSource(100_000) }],
      tokens: async () => [...tokens],
      spacingMs: 0,
    });

    await refresher.refreshAll();
    expect(store._upserts.map(([t]) => t)).toEqual(["BTC"]);

    tokens.push({ token: "TON" });
    await refresher.refreshAll();
    expect(store._upserts.map(([t]) => t)).toEqual(["BTC", "BTC", "TON"]);
  });

  it("stop() awaits in-flight tick so shutdown drains pending upserts", async () => {
    // If the pg pool is closed while a tick is mid-upsert, those writes fail
    // partway and the DB ends up in an inconsistent state for that tick.
    // stop() must return only after any in-flight tick has finished.
    const store = mockStore();
    let resolveSlow: (() => void) | null = null;
    const slowSource: IPriceSource = {
      getPrice: () =>
        new Promise((resolve) => {
          resolveSlow = () => resolve({ priceMicros: 1_000_000, updatedAt: new Date() });
        }),
    };
    const refresher = new PriceRefresher({
      store,
      sources: [{ name: "slow", source: slowSource }],
      tokens: async () => [{ token: "TON" }],
      spacingMs: 0,
      intervalMs: 1_000_000, // don't let the interval fire during the test
    });

    const starting = refresher.start();
    await new Promise((r) => setTimeout(r, 10));

    const stopping = refresher.stop();
    let stopped = false;
    void stopping.then(() => {
      stopped = true;
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(stopped).toBe(false);

    (resolveSlow as unknown as () => void)();
    await starting;
    await stopping;
    expect(stopped).toBe(true);
    expect(store._upserts).toEqual([["TON", 1_000_000, "slow"]]);
  });
});
