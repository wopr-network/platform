import { describe, expect, it, vi } from "vitest";
import { CoinGeckoOracle } from "../coingecko.js";

/** DB-driven token IDs — mirrors what entry.ts loads from payment_methods.oracle_asset_id */
const TOKEN_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  DOGE: "dogecoin",
  LTC: "litecoin",
};

/** Mock /simple/price response for a given {coinId: usd} set. */
function mockBatchFetch(prices: Record<string, number>) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, { usd: v }]))),
  });
}

describe("CoinGeckoOracle", () => {
  it("returns price in microdollars from batch fetch", async () => {
    const oracle = new CoinGeckoOracle({
      tokenIds: () => TOKEN_IDS,
      fetchFn: mockBatchFetch({
        bitcoin: 84_532.17,
        ethereum: 3_500,
        dogecoin: 0.17,
        litecoin: 92,
      }) as unknown as typeof fetch,
    });
    const result = await oracle.getPrice("BTC");
    expect(result.priceMicros).toBe(84_532_170_000);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it("batches ALL known token ids into ONE HTTP request — even when many tokens are queried in sequence", async () => {
    // The whole point of this file after PR #88: the CoinGecko free tier
    // 429s on bursts of ~15 requests, so the refresher blowing through
    // 20 tokens at 150ms intervals used to fall over on every tick.
    // Now: ONE request, regardless of how many tokens are asked about.
    const fn = mockBatchFetch({ bitcoin: 84_532, ethereum: 3_500, dogecoin: 0.17, litecoin: 92 });
    const oracle = new CoinGeckoOracle({
      tokenIds: () => TOKEN_IDS,
      fetchFn: fn as unknown as typeof fetch,
      cacheTtlMs: 60_000,
    });
    await oracle.getPrice("BTC");
    await oracle.getPrice("ETH");
    await oracle.getPrice("DOGE");
    await oracle.getPrice("LTC");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("CoinGecko URL includes ALL known ids in a single `ids=` query param", async () => {
    const fn = mockBatchFetch({ bitcoin: 1, ethereum: 1, dogecoin: 1, litecoin: 1 });
    const oracle = new CoinGeckoOracle({
      tokenIds: () => TOKEN_IDS,
      fetchFn: fn as unknown as typeof fetch,
    });
    await oracle.getPrice("BTC");
    const url = fn.mock.calls[0][0] as string;
    expect(url).toContain("ids=");
    // All four ids should appear in the batched request (order not guaranteed, but presence is).
    for (const coinId of ["bitcoin", "ethereum", "dogecoin", "litecoin"]) {
      expect(url).toContain(coinId);
    }
  });

  it("concurrent getPrice() calls share the same in-flight batch — no thundering herd", async () => {
    // Simulate a tick that asks for multiple tokens concurrently. The
    // implementation must dedupe into a single HTTP request, not fire one
    // per concurrent caller.
    let resolveFetch: ((v: Response) => void) | null = null;
    const fn = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const oracle = new CoinGeckoOracle({
      tokenIds: () => TOKEN_IDS,
      fetchFn: fn as unknown as typeof fetch,
    });

    const results = Promise.all([oracle.getPrice("BTC"), oracle.getPrice("ETH"), oracle.getPrice("DOGE")]);
    await new Promise((r) => setTimeout(r, 10));
    expect(fn).toHaveBeenCalledTimes(1);

    (resolveFetch as unknown as (v: Response) => void)({
      ok: true,
      json: () => Promise.resolve({ bitcoin: { usd: 1 }, ethereum: { usd: 1 }, dogecoin: { usd: 1 } }),
    } as Response);
    await results;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("caches batched prices within TTL", async () => {
    const fn = mockBatchFetch({ bitcoin: 84_532, ethereum: 3_500, dogecoin: 0.17, litecoin: 92 });
    const oracle = new CoinGeckoOracle({
      tokenIds: () => TOKEN_IDS,
      fetchFn: fn as unknown as typeof fetch,
      cacheTtlMs: 60_000,
    });
    await oracle.getPrice("BTC");
    await oracle.getPrice("BTC");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after cache expires", async () => {
    const fn = mockBatchFetch({ bitcoin: 84_532, ethereum: 3_500, dogecoin: 0.17, litecoin: 92 });
    const oracle = new CoinGeckoOracle({
      tokenIds: () => TOKEN_IDS,
      fetchFn: fn as unknown as typeof fetch,
      cacheTtlMs: 0,
    });
    await oracle.getPrice("BTC");
    await oracle.getPrice("BTC");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws AssetNotSupportedError for token not in DB mapping", async () => {
    const oracle = new CoinGeckoOracle({
      tokenIds: () => TOKEN_IDS,
      fetchFn: mockBatchFetch({ bitcoin: 100 }) as unknown as typeof fetch,
    });
    await expect(oracle.getPrice("UNKNOWN")).rejects.toThrow("No price source supports asset: UNKNOWN");
  });

  it("propagates batch HTTP error — refresher priority fallthrough handles it", async () => {
    const fn = vi.fn().mockResolvedValue({ ok: false, status: 429, statusText: "Too Many Requests" });
    const oracle = new CoinGeckoOracle({ tokenIds: () => TOKEN_IDS, fetchFn: fn as unknown as typeof fetch });
    await expect(oracle.getPrice("BTC")).rejects.toThrow("CoinGecko batch error: 429");
  });

  it("silently skips a token when batch response has zero or missing usd — falls through to AssetNotSupportedError", async () => {
    // Rather than throwing on bad data for one token, the batch leaves that
    // token's cache slot empty. The refresher then gets AssetNotSupported
    // and walks to the next source in priority order. Other tokens in the
    // same batch still get populated cleanly.
    const fn = mockBatchFetch({ bitcoin: 0, ethereum: 3_500, dogecoin: 0.17, litecoin: 92 });
    const oracle = new CoinGeckoOracle({ tokenIds: () => TOKEN_IDS, fetchFn: fn as unknown as typeof fetch });
    await expect(oracle.getPrice("BTC")).rejects.toThrow("No price source supports asset: BTC");
    // ETH was in the same batch and is cached fine.
    const eth = await oracle.getPrice("ETH");
    expect(eth.priceMicros).toBe(3_500_000_000);
  });

  it("no HTTP request made when tokenIds is empty (no enabled payment methods)", async () => {
    const fn = vi.fn();
    const oracle = new CoinGeckoOracle({ tokenIds: () => ({}), fetchFn: fn as unknown as typeof fetch });
    await expect(oracle.getPrice("BTC")).rejects.toThrow("No price source supports asset: BTC");
    expect(fn).not.toHaveBeenCalled();
  });
});
