import { describe, expect, it, vi } from "vitest";
import { EvmLikeEvmWatcher } from "../evm-watcher.js";
import type { RpcCall } from "../types.js";
import { TRANSFER_TOPIC } from "../types.js";

/**
 * Parity tests against the existing crypto-plugins/evm/watcher.ts.
 * Covers the same cents scenarios the old test file covers (LINK + USDC),
 * plus spot-check of full PaymentEvent shape.
 */

function buildLog(toAddr: string, amount: bigint, blockNumber: number, contract: string) {
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

function mkRpc(table: Record<string, unknown>): RpcCall & ReturnType<typeof vi.fn> {
  return vi.fn(async (method: string, _params: unknown[]) => table[method]) as RpcCall & ReturnType<typeof vi.fn>;
}

function mkOpts(rpc: RpcCall, priceMicros: number) {
  return {
    rpcUrl: "http://unused",
    rpcHeaders: {},
    rpc,
    priceReader: { getPrice: vi.fn().mockResolvedValue({ priceMicros }) },
    cursorStore: {
      get: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      getConfirmationCount: vi.fn().mockResolvedValue(null),
      saveConfirmationCount: vi.fn().mockResolvedValue(undefined),
    },
    chain: "ethereum" as const,
    confirmations: 0,
  };
}

describe("EvmLikeEvmWatcher cents math + shape parity", () => {
  it("volatile LINK @ $8.85: 1.13 LINK → 1000 cents", async () => {
    const linkContract = "0x514910771af9ca656af840dff83e8264ecf986ca";
    const toAddr = `0x${"cc".repeat(20)}`;
    const rpc = mkRpc({
      eth_blockNumber: "0x65",
      eth_getLogs: [buildLog(toAddr, 1_130_000_000_000_000_000n, 100, linkContract)],
    });

    const watcher = new EvmLikeEvmWatcher({
      ...mkOpts(rpc, 8_850_000),
      token: "LINK",
      contractAddress: linkContract,
      decimals: 18,
    });
    await watcher.init();
    watcher.setWatchedAddresses([toAddr]);

    const events = await watcher.poll();
    expect(events).toHaveLength(1);
    expect(events[0].amountUsdCents).toBe(1000);
    expect(events[0].rawAmount).toBe("1130000000000000000");
  });

  it("stablecoin USDC @ $1.00: 10 USDC → 1000 cents", async () => {
    const usdcContract = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const toAddr = `0x${"dd".repeat(20)}`;
    const rpc = mkRpc({
      eth_blockNumber: "0x65",
      eth_getLogs: [buildLog(toAddr, 10_000_000n, 100, usdcContract)],
    });

    const watcher = new EvmLikeEvmWatcher({
      ...mkOpts(rpc, 1_000_000),
      token: "USDC",
      contractAddress: usdcContract,
      decimals: 6,
    });
    await watcher.init();
    watcher.setWatchedAddresses([toAddr]);

    const events = await watcher.poll();
    expect(events).toHaveLength(1);
    expect(events[0].amountUsdCents).toBe(1000);
  });

  it("PaymentEvent shape: all fields match the old EvmWatcher's emission", async () => {
    const usdcContract = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
    const toAddr = `0x${"dd".repeat(20)}`;
    const rpc = mkRpc({
      eth_blockNumber: "0x65",
      eth_getLogs: [buildLog(toAddr, 10_000_000n, 100, usdcContract)],
    });

    const watcher = new EvmLikeEvmWatcher({
      ...mkOpts(rpc, 1_000_000),
      token: "USDC",
      contractAddress: usdcContract,
      decimals: 6,
      confirmations: 1,
    });
    await watcher.init();
    watcher.setWatchedAddresses([toAddr]);

    const [ev] = await watcher.poll();
    expect(ev).toEqual({
      chain: "ethereum",
      token: "USDC",
      from: `0x${"ab".repeat(20)}`,
      to: toAddr.toLowerCase(),
      rawAmount: "10000000",
      amountUsdCents: 1000,
      txHash: `0x${"ff".repeat(32)}`,
      blockNumber: 100,
      confirmations: 1, // latest=0x65=101, block=100 → 1 conf
      confirmationsRequired: 1,
    });
  });
});
