import { describe, expect, it, vi } from "vitest";
import { tronToHex } from "../tron/address-convert.js";
import { TronEvmWatcher } from "../tron/watcher.js";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function mockTransferLog(toHex: string, amount: bigint, blockNumber: number, contract: string) {
  const senderHex = `0x${"ab".repeat(20)}`;
  return {
    address: contract.toLowerCase(),
    topics: [
      TRANSFER_TOPIC,
      `0x${"00".repeat(12)}${senderHex.slice(2)}`,
      `0x${"00".repeat(12)}${toHex.slice(2).toLowerCase()}`,
    ],
    data: `0x${amount.toString(16).padStart(64, "0")}`,
    blockNumber: `0x${blockNumber.toString(16)}`,
    transactionHash: `0x${"ff".repeat(32)}`,
    logIndex: "0x0",
  };
}

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
    rpcUrl: "http://localhost:8090",
    rpcHeaders: {},
    priceReader: { getPrice: vi.fn().mockResolvedValue({ priceMicros }) },
    cursorStore: {
      get: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      getConfirmationCount: vi.fn().mockResolvedValue(null),
      saveConfirmationCount: vi.fn().mockResolvedValue(undefined),
    },
    chain: "tron",
    confirmations: 0,
  };
}

describe("TronEvmWatcher cents math", () => {
  it("uses oracle priceMicros for volatile TRC-20 token", async () => {
    // Regression: Tron previously mirrored the EVM 1:1 peg assumption, which
    // was fine for USDT-TRC20 but wrong for any volatile TRC-20 token.
    const tronAddr = "TDTkBJWfXqfCPhNAgHxmgPNHigJEg4ghww";
    const toHex = tronToHex(tronAddr);
    const contractHex = `0x${"11".repeat(20)}`;

    const rpc = new Map<string, unknown>();
    rpc.set("eth_blockNumber", "0x65");
    // 2 tokens with 18 decimals
    rpc.set("eth_getLogs", [mockTransferLog(toHex, 2_000_000_000_000_000_000n, 100, contractHex)]);

    const opts = createMockOpts(rpc, 5_000_000); // $5.00 per whole token
    const watcher = new TronEvmWatcher({
      ...opts,
      token: "SUNOLD",
      contractAddress: contractHex,
      decimals: 18,
    });
    await watcher.init();
    watcher.setWatchedAddresses([tronAddr]);

    const events = await watcher.poll();
    expect(events).toHaveLength(1);
    // 2 * $5 = $10.00 → 1000 cents
    expect(events[0].amountUsdCents).toBe(1000);
    expect(events[0].to).toBe(tronAddr); // hex converted back to T...
  });

  it("still reports correct cents for USDT-TRC20 @ $1.00", async () => {
    const tronAddr = "TDTkBJWfXqfCPhNAgHxmgPNHigJEg4ghww";
    const toHex = tronToHex(tronAddr);
    const usdtContract = `0x${"22".repeat(20)}`;

    const rpc = new Map<string, unknown>();
    rpc.set("eth_blockNumber", "0x65");
    // 25 USDT = 25_000_000 (6 decimals)
    rpc.set("eth_getLogs", [mockTransferLog(toHex, 25_000_000n, 100, usdtContract)]);

    const opts = createMockOpts(rpc, 1_000_000);
    const watcher = new TronEvmWatcher({
      ...opts,
      token: "USDT",
      contractAddress: usdtContract,
      decimals: 6,
    });
    await watcher.init();
    watcher.setWatchedAddresses([tronAddr]);

    const events = await watcher.poll();
    expect(events).toHaveLength(1);
    expect(events[0].amountUsdCents).toBe(2500); // $25.00
  });
});
