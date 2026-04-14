import { describe, expect, it, vi } from "vitest";
import { EvmWatcher } from "../evm/watcher.js";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function mockTransferLog(toAddr: string, amount: bigint, blockNumber: number, contract: string) {
  return {
    address: contract.toLowerCase(),
    topics: [
      TRANSFER_TOPIC,
      `0x${"00".repeat(12)}${"ab".repeat(20)}`,
      `0x${"00".repeat(12)}${toAddr.slice(2).toLowerCase()}`,
    ],
    data: `0x${amount.toString(16).padStart(64, "0")}`,
    blockNumber: `0x${blockNumber.toString(16)}`,
    transactionHash: `0x${"ff".repeat(32)}`,
    logIndex: "0x0",
  };
}

/** Minimal watcher opts with an injected fetch mock returning per-method results. */
function createMockOpts(rpcResponses: Map<string, unknown>, priceMicros: number) {
  const mockFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse((init?.body as string) ?? "{}") as { method: string; id: number };
    const result = rpcResponses.get(body.method);
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });
  (globalThis as any).fetch = mockFetch;

  return {
    rpcUrl: "http://localhost:8545",
    rpcHeaders: {},
    priceReader: { getPrice: vi.fn().mockResolvedValue({ priceMicros }) },
    cursorStore: {
      get: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      getConfirmationCount: vi.fn().mockResolvedValue(null),
      saveConfirmationCount: vi.fn().mockResolvedValue(undefined),
    },
    chain: "ethereum",
    confirmations: 0,
  };
}

describe("EvmWatcher (plugin) cents math", () => {
  it("uses oracle priceMicros for volatile token (LINK @ $8.85)", async () => {
    // Regression: previously hardcoded 1:1 USD peg. 1.13 LINK was reported
    // as 113 cents instead of the real ~$10 it is worth.
    const linkContract = "0x514910771af9ca656af840dff83e8264ecf986ca";
    const toAddr = `0x${"cc".repeat(20)}`;

    const rpc = new Map<string, unknown>();
    rpc.set("eth_blockNumber", "0x65"); // 101
    // 1.13 LINK = 1.13 * 10^18 base units
    rpc.set("eth_getLogs", [mockTransferLog(toAddr, 1_130_000_000_000_000_000n, 100, linkContract)]);

    const opts = createMockOpts(rpc, 8_850_000); // $8.85
    const watcher = new EvmWatcher({
      ...opts,
      token: "LINK",
      contractAddress: linkContract,
      decimals: 18,
    });
    await watcher.init();
    watcher.setWatchedAddresses([toAddr]);

    const events = await watcher.poll();
    expect(events).toHaveLength(1);
    // 1.13 LINK * $8.85 = $10.0005 → 1000 cents (truncated).
    expect(events[0].amountUsdCents).toBe(1000);
    expect(events[0].rawAmount).toBe("1130000000000000000");
  });

  it("still reports correct cents for stablecoin (USDC @ $1.00)", async () => {
    const usdcContract = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const toAddr = `0x${"dd".repeat(20)}`;

    const rpc = new Map<string, unknown>();
    rpc.set("eth_blockNumber", "0x65");
    // 10 USDC = 10_000_000 (6 decimals)
    rpc.set("eth_getLogs", [mockTransferLog(toAddr, 10_000_000n, 100, usdcContract)]);

    const opts = createMockOpts(rpc, 1_000_000); // $1.00
    const watcher = new EvmWatcher({
      ...opts,
      token: "USDC",
      contractAddress: usdcContract,
      decimals: 6,
    });
    await watcher.init();
    watcher.setWatchedAddresses([toAddr]);

    const events = await watcher.poll();
    expect(events).toHaveLength(1);
    expect(events[0].amountUsdCents).toBe(1000); // 10 USDC → $10.00
  });
});
