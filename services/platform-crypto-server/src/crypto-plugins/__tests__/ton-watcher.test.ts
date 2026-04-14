import { describe, expect, it, vi } from "vitest";
import type { JettonTransferV3, TonTransaction } from "../ton/types.js";
import { TonWatcher } from "../ton/watcher.js";

/** Create mock WatcherOpts with a fake TON Center API. */
function createMockOpts(transactions: Record<string, TonTransaction[]>) {
  const mockFetch = vi.fn(async (url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    // TON Center API: /getTransactions?address=X&limit=20&archival=true
    if (urlStr.includes("getTransactions")) {
      const parsed = new URL(urlStr);
      const address = parsed.searchParams.get("address") ?? "";
      const txs = transactions[address] ?? [];
      return new Response(JSON.stringify({ ok: true, result: txs }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: false, error: "unknown method" }), { status: 404 });
  });

  // biome-ignore lint/suspicious/noExplicitAny: test mock override
  (globalThis as any).fetch = mockFetch;

  return {
    rpcUrl: "https://toncenter.com/api/v2",
    rpcHeaders: {},
    priceReader: { getPrice: vi.fn().mockResolvedValue({ priceMicros: 3_500_000 }) },
    cursorStore: {
      get: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      getConfirmationCount: vi.fn().mockResolvedValue(null),
      saveConfirmationCount: vi.fn().mockResolvedValue(undefined),
    },
    token: "TON",
    chain: "ton",
    decimals: 9,
    confirmations: 1,
    _mockFetch: mockFetch,
  };
}

const watchedAddr = "UQAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaab";
const senderAddr = "UQBbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

describe("TonWatcher", () => {
  it("returns empty when no watched addresses", async () => {
    const opts = createMockOpts({});
    const watcher = new TonWatcher(opts);
    await watcher.init();
    const events = await watcher.poll();
    expect(events).toHaveLength(0);
  });

  it("returns empty when no transactions exist", async () => {
    const opts = createMockOpts({ [watchedAddr]: [] });
    const watcher = new TonWatcher(opts);
    await watcher.init();
    watcher.setWatchedAddresses([watchedAddr]);
    const events = await watcher.poll();
    expect(events).toHaveLength(0);
  });

  it("matches destination regardless of address format variant (regression)", async () => {
    // TON Center can return addresses in different user-friendly variants
    // (mainnet bounceable EQ..., testnet non-bounceable 0Q..., etc.) for
    // the SAME underlying account. Watcher must normalize before comparing
    // or it silently misses payments on testnet.
    const testnetAddr = "0QAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-akS";
    const mainnetBounceableSameAccount = "EQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-U9d";

    const tx: TonTransaction = {
      utime: 1700000000,
      transaction_id: { lt: "100", hash: "cross-format" },
      fee: "1000000",
      in_msg: {
        source: senderAddr,
        // API returns the mainnet-bounceable form of the same account
        destination: mainnetBounceableSameAccount,
        value: "1000000000",
      },
    };

    const opts = createMockOpts({ [testnetAddr]: [tx] });
    const watcher = new TonWatcher(opts);
    await watcher.init();
    // We watch the testnet form
    watcher.setWatchedAddresses([testnetAddr]);

    const events = await watcher.poll();
    expect(events).toHaveLength(1);
    expect(events[0].txHash).toBe("cross-format");
    // Event reports the watched form (what the charge was issued with)
    expect(events[0].to).toBe(testnetAddr);
  });

  it("detects incoming TON transfer", async () => {
    const tx: TonTransaction = {
      utime: 1700000000,
      transaction_id: { lt: "100", hash: "abc123def456" },
      fee: "1000000",
      in_msg: {
        source: senderAddr,
        destination: watchedAddr,
        value: "2000000000", // 2 TON in nanoton
      },
    };

    const opts = createMockOpts({ [watchedAddr]: [tx] });
    const watcher = new TonWatcher(opts);
    await watcher.init();
    watcher.setWatchedAddresses([watchedAddr]);

    const events = await watcher.poll();
    expect(events).toHaveLength(1);
    expect(events[0].txHash).toBe("abc123def456");
    expect(events[0].to).toBe(watchedAddr);
    expect(events[0].from).toBe(senderAddr);
    expect(events[0].rawAmount).toBe("2000000000");
    expect(events[0].chain).toBe("ton");
    expect(events[0].token).toBe("TON");
    expect(events[0].blockNumber).toBe(100);
  });

  it("skips outgoing transactions (no in_msg)", async () => {
    const tx: TonTransaction = {
      utime: 1700000000,
      transaction_id: { lt: "200", hash: "outgoing123" },
      fee: "1000000",
      out_msgs: [{ source: watchedAddr, destination: senderAddr, value: "500000000" }],
    };

    const opts = createMockOpts({ [watchedAddr]: [tx] });
    const watcher = new TonWatcher(opts);
    await watcher.init();
    watcher.setWatchedAddresses([watchedAddr]);

    const events = await watcher.poll();
    expect(events).toHaveLength(0);
  });

  it("skips zero-value incoming messages", async () => {
    const tx: TonTransaction = {
      utime: 1700000000,
      transaction_id: { lt: "300", hash: "zero123" },
      fee: "1000000",
      in_msg: {
        source: senderAddr,
        destination: watchedAddr,
        value: "0",
      },
    };

    const opts = createMockOpts({ [watchedAddr]: [tx] });
    const watcher = new TonWatcher(opts);
    await watcher.init();
    watcher.setWatchedAddresses([watchedAddr]);

    const events = await watcher.poll();
    expect(events).toHaveLength(0);
  });

  it("advances cursor and skips already-processed transactions", async () => {
    const tx1: TonTransaction = {
      utime: 1700000000,
      transaction_id: { lt: "100", hash: "first123" },
      fee: "1000000",
      in_msg: { source: senderAddr, destination: watchedAddr, value: "1000000000" },
    };
    const tx2: TonTransaction = {
      utime: 1700000010,
      transaction_id: { lt: "200", hash: "second456" },
      fee: "1000000",
      in_msg: { source: senderAddr, destination: watchedAddr, value: "3000000000" },
    };

    const opts = createMockOpts({ [watchedAddr]: [tx1, tx2] });
    const watcher = new TonWatcher(opts);
    await watcher.init();
    watcher.setWatchedAddresses([watchedAddr]);

    // First poll — gets both
    const events1 = await watcher.poll();
    expect(events1).toHaveLength(2);
    expect(watcher.getCursor()).toBe(200);

    // Cursor was saved
    expect(opts.cursorStore.save).toHaveBeenCalledWith("ton:ton:TON", 200);

    // Second poll with same data — should skip both (cursor = 200)
    const events2 = await watcher.poll();
    expect(events2).toHaveLength(0);
  });

  it("restores cursor from store on init", async () => {
    const tx: TonTransaction = {
      utime: 1700000000,
      transaction_id: { lt: "50", hash: "old-tx" },
      fee: "1000000",
      in_msg: { source: senderAddr, destination: watchedAddr, value: "1000000000" },
    };

    const opts = createMockOpts({ [watchedAddr]: [tx] });
    opts.cursorStore.get = vi.fn().mockResolvedValue(100); // cursor already past lt=50
    const watcher = new TonWatcher(opts);
    await watcher.init();
    watcher.setWatchedAddresses([watchedAddr]);

    const events = await watcher.poll();
    expect(events).toHaveLength(0); // skipped — lt 50 <= cursor 100
  });

  it("stops polling when stop() is called", async () => {
    const tx: TonTransaction = {
      utime: 1700000000,
      transaction_id: { lt: "100", hash: "stop-test" },
      fee: "1000000",
      in_msg: { source: senderAddr, destination: watchedAddr, value: "1000000000" },
    };

    const opts = createMockOpts({ [watchedAddr]: [tx] });
    const watcher = new TonWatcher(opts);
    await watcher.init();
    watcher.setWatchedAddresses([watchedAddr]);
    watcher.stop();

    const events = await watcher.poll();
    expect(events).toHaveLength(0);
  });

  it("calculates USD amount via oracle", async () => {
    const tx: TonTransaction = {
      utime: 1700000000,
      transaction_id: { lt: "100", hash: "price-test" },
      fee: "1000000",
      in_msg: { source: senderAddr, destination: watchedAddr, value: "1000000000" }, // 1 TON
    };

    const opts = createMockOpts({ [watchedAddr]: [tx] });
    // Oracle returns $3.50 = 3,500,000 microdollars
    opts.priceReader.getPrice = vi.fn().mockResolvedValue({ priceMicros: 3_500_000 });

    const watcher = new TonWatcher(opts);
    await watcher.init();
    watcher.setWatchedAddresses([watchedAddr]);

    const events = await watcher.poll();
    expect(events).toHaveLength(1);
    // 1 TON (1e9 nanoton) * 3,500,000 micros / (10,000 * 1e9) = 350 cents = $3.50
    expect(events[0].amountUsdCents).toBe(350);
  });

  it("fails loudly when the price reader has no row (invariant: /charges should have gated)", async () => {
    // Before the DB-backed pricing refactor (PR #87), this test asserted a
    // zero-cent fallback was "graceful." That was the exact failure mode of
    // the 2026-04-13 incident. New contract: priceReader.getPrice() throwing
    // is an invariant violation — the whole poll fails so logs surface it,
    // and no zero-cent event ever reaches the ledger.
    const tx: TonTransaction = {
      utime: 1700000000,
      transaction_id: { lt: "100", hash: "oracle-fail" },
      fee: "1000000",
      in_msg: { source: senderAddr, destination: watchedAddr, value: "1000000000" },
    };

    const opts = createMockOpts({ [watchedAddr]: [tx] });
    opts.priceReader.getPrice = vi.fn().mockRejectedValue(new Error("no price row"));

    const watcher = new TonWatcher(opts);
    await watcher.init();
    watcher.setWatchedAddresses([watchedAddr]);

    await expect(watcher.poll()).rejects.toThrow(/no price row/);
  });

  it("fails loudly on non-positive priceMicros (catches bad oracle data at the seam)", async () => {
    const tx: TonTransaction = {
      utime: 1700000000,
      transaction_id: { lt: "100", hash: "zero-price" },
      fee: "1000000",
      in_msg: { source: senderAddr, destination: watchedAddr, value: "1000000000" },
    };
    const opts = createMockOpts({ [watchedAddr]: [tx] });
    opts.priceReader.getPrice = vi.fn().mockResolvedValue({ priceMicros: 0 });

    const watcher = new TonWatcher(opts);
    await watcher.init();
    watcher.setWatchedAddresses([watchedAddr]);

    await expect(watcher.poll()).rejects.toThrow(/non-positive priceMicros/);
  });

  // ---------------------------------------------------------------------
  // Error handling + lt precision guard (regression gates for #80)
  // ---------------------------------------------------------------------

  it("skips txs misdirected to another address", async () => {
    const tx: TonTransaction = {
      utime: 1700000000,
      transaction_id: { lt: "400", hash: "misdirected" },
      fee: "1000000",
      in_msg: { source: senderAddr, destination: "UQSOMEONE_ELSE_ELSEWHEREXX", value: "1000000000" },
    };
    const opts = createMockOpts({ [watchedAddr]: [tx] });
    const watcher = new TonWatcher(opts);
    await watcher.init();
    watcher.setWatchedAddresses([watchedAddr]);
    expect(await watcher.poll()).toHaveLength(0);
  });

  it("polls multiple watched addresses independently", async () => {
    const addrA = "UQAddrAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx1";
    const addrB = "UQAddrBxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx2";
    const txs: Record<string, TonTransaction[]> = {
      [addrA]: [
        {
          utime: 1,
          transaction_id: { lt: "100", hash: "to-a" },
          fee: "0",
          in_msg: { source: "S1", destination: addrA, value: "1000000000" },
        },
      ],
      [addrB]: [
        {
          utime: 1,
          transaction_id: { lt: "200", hash: "to-b" },
          fee: "0",
          in_msg: { source: "S2", destination: addrB, value: "2000000000" },
        },
      ],
    };
    const opts = createMockOpts(txs);
    const watcher = new TonWatcher(opts);
    await watcher.init();
    watcher.setWatchedAddresses([addrA, addrB]);

    const events = await watcher.poll();
    expect(events.map((e) => e.txHash).sort()).toEqual(["to-a", "to-b"]);
    expect(watcher.getCursor()).toBe(200);
  });

  it("RPC failure warns and continues — doesn't crash poll for other addresses", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failingAddr = "UQFailingAddr_____________________________________";
    const workingAddr = "UQWorkingAddr_____________________________________";

    // Bootstrap default opts first (it also installs a mock), then override.
    const opts = createMockOpts({});

    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      const addr = new URL(u).searchParams.get("address") ?? "";
      if (addr === failingAddr) {
        return new Response(JSON.stringify({ ok: false, error: "upstream dead" }), { status: 500 });
      }
      return new Response(
        JSON.stringify({
          ok: true,
          result: [
            {
              utime: 1,
              transaction_id: { lt: "300", hash: "survived" },
              fee: "0",
              in_msg: { source: "S", destination: workingAddr, value: "1000000000" },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    // biome-ignore lint/suspicious/noExplicitAny: test mock override
    (globalThis as any).fetch = mockFetch;

    const watcher = new TonWatcher(opts);
    await watcher.init();
    watcher.setWatchedAddresses([failingAddr, workingAddr]);

    const events = await watcher.poll();
    // Failing address skipped, working one still emitted
    expect(events).toHaveLength(1);
    expect(events[0].txHash).toBe("survived");
    expect(warnSpy).toHaveBeenCalled();
    const warned = warnSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(warned).toMatch(/upstream dead|ton-watcher/);
    warnSpy.mockRestore();
  });

  it("refuses lt values that lose precision as Number — warns, does not corrupt cursor", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // 2^54 + 1 cannot be represented exactly in Number.
    const unsafeLt = "18014398509481985";
    const tx: TonTransaction = {
      utime: 1,
      transaction_id: { lt: unsafeLt, hash: "precision-loss" },
      fee: "0",
      in_msg: { source: senderAddr, destination: watchedAddr, value: "1000000000" },
    };
    const opts = createMockOpts({ [watchedAddr]: [tx] });
    const watcher = new TonWatcher(opts);
    await watcher.init();
    watcher.setWatchedAddresses([watchedAddr]);

    const events = await watcher.poll();
    // parseLt throws → error branch → warn + return []
    expect(events).toEqual([]);
    expect(watcher.getCursor()).toBe(0); // cursor NOT corrupted
    expect(warnSpy).toHaveBeenCalled();
    const warned = warnSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(warned).toMatch(/bigint|safe|precision/i);
    warnSpy.mockRestore();
  });

  it("rejects negative or non-finite lt values", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const tx: TonTransaction = {
      utime: 1,
      transaction_id: { lt: "not-a-number", hash: "bogus-lt" },
      fee: "0",
      in_msg: { source: senderAddr, destination: watchedAddr, value: "1000000000" },
    };
    const opts = createMockOpts({ [watchedAddr]: [tx] });
    const watcher = new TonWatcher(opts);
    await watcher.init();
    watcher.setWatchedAddresses([watchedAddr]);

    const events = await watcher.poll();
    expect(events).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ===========================================================================
// Jetton (USDT-on-TON) path
// ===========================================================================

describe("TonWatcher — Jetton path (USDT on TON)", () => {
  const WATCHED = "UQJettonReceiver___________________________________";
  const USDT_MASTER = "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs";

  function jettonTx(
    lt: string,
    hash: string,
    destination: string,
    amount: string,
    opts: Partial<JettonTransferV3> = {},
  ): JettonTransferV3 {
    return {
      query_id: "0",
      source: "SourceAddr",
      destination,
      amount,
      source_wallet: "SrcWallet",
      jetton_master: USDT_MASTER,
      transaction_hash: hash,
      transaction_lt: lt,
      transaction_now: 1700000000,
      transaction_aborted: false,
      response_destination: "",
      forward_payload: null,
      ...opts,
    };
  }

  function installJettonMock(transfersByOwner: Record<string, JettonTransferV3[]>) {
    const mockFetch = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/api/v3/jetton/transfers")) {
        const owner = new URL(u).searchParams.get("owner_address") ?? "";
        return new Response(JSON.stringify({ jetton_transfers: transfersByOwner[owner] ?? [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("{}", { status: 200 });
    });
    // biome-ignore lint/suspicious/noExplicitAny: test mock override
    (globalThis as any).fetch = mockFetch;
    return mockFetch;
  }

  function jettonOpts(overrides: Record<string, unknown> = {}) {
    return {
      rpcUrl: "https://toncenter.com/api/v2",
      rpcHeaders: {},
      priceReader: { getPrice: vi.fn().mockResolvedValue({ priceMicros: 1_000_000 }) }, // $1.00
      cursorStore: {
        get: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockResolvedValue(undefined),
        getConfirmationCount: vi.fn().mockResolvedValue(null),
        saveConfirmationCount: vi.fn().mockResolvedValue(undefined),
      },
      token: "USDT",
      chain: "ton",
      decimals: 6,
      confirmations: 1,
      contractAddress: USDT_MASTER,
      ...overrides,
    };
  }

  it("routes to Jetton path when contractAddress is set (not v2 getTransactions)", async () => {
    const fetchMock = installJettonMock({ [WATCHED]: [] });
    const w = new TonWatcher(jettonOpts());
    await w.init();
    w.setWatchedAddresses([WATCHED]);
    await w.poll();

    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("/api/v3/jetton/transfers"))).toBe(true);
    expect(urls.some((u) => u.includes("/api/v2/getTransactions"))).toBe(false);
  });

  it("emits Jetton payment event with correct cents (25 USDT @ $1 → 2500¢)", async () => {
    installJettonMock({
      [WATCHED]: [jettonTx("200", "jt-1", WATCHED, "25000000")],
    });

    const w = new TonWatcher(jettonOpts());
    await w.init();
    w.setWatchedAddresses([WATCHED]);

    const events = await w.poll();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      chain: "ton",
      token: "USDT",
      to: WATCHED,
      rawAmount: "25000000",
      amountUsdCents: 2500,
      txHash: "jt-1",
      blockNumber: 200,
    });
  });

  it("advances cursor to max transaction_lt across Jetton transfers", async () => {
    installJettonMock({
      [WATCHED]: [
        jettonTx("100", "a", WATCHED, "1000000"),
        jettonTx("500", "b", WATCHED, "1000000"),
        jettonTx("300", "c", WATCHED, "1000000"),
      ],
    });

    const opts = jettonOpts();
    const w = new TonWatcher(opts);
    await w.init();
    w.setWatchedAddresses([WATCHED]);

    await w.poll();
    expect(w.getCursor()).toBe(500);
    expect(opts.cursorStore.save).toHaveBeenCalledWith("ton:ton:USDT", 500);
  });

  it("skips aborted Jetton transactions", async () => {
    installJettonMock({
      [WATCHED]: [jettonTx("100", "aborted", WATCHED, "1000000", { transaction_aborted: true })],
    });
    const w = new TonWatcher(jettonOpts());
    await w.init();
    w.setWatchedAddresses([WATCHED]);
    expect(await w.poll()).toEqual([]);
  });

  it("skips zero-amount Jetton transfers", async () => {
    installJettonMock({
      [WATCHED]: [jettonTx("100", "zero", WATCHED, "0")],
    });
    const w = new TonWatcher(jettonOpts());
    await w.init();
    w.setWatchedAddresses([WATCHED]);
    expect(await w.poll()).toEqual([]);
  });

  it("Jetton RPC failure is caught, logged, does not crash", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mockFetch = vi.fn(async () => new Response("v3 down", { status: 500 }));
    // biome-ignore lint/suspicious/noExplicitAny: test mock override
    (globalThis as any).fetch = mockFetch;

    const w = new TonWatcher(jettonOpts());
    await w.init();
    w.setWatchedAddresses([WATCHED]);

    const events = await w.poll();
    expect(events).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
