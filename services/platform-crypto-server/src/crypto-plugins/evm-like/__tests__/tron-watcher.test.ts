import { describe, expect, it, vi } from "vitest";
import { hexToTron, tronToHex } from "../../tron/address-convert.js";
import { TronEvmWatcher } from "../../tron/watcher.js";
import { EvmLikeTronWatcher } from "../tron-watcher.js";
import type { RpcCall } from "../types.js";
import { TRANSFER_TOPIC } from "../types.js";

function buildLog(toHex: string, amount: bigint, blockNumber: number, contract: string) {
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

function mkRpc(table: Record<string, unknown>): RpcCall & ReturnType<typeof vi.fn> {
  return vi.fn(async (method: string, _params: unknown[]) => table[method]) as RpcCall & ReturnType<typeof vi.fn>;
}

function mkOpts(rpc: RpcCall, priceMicros: number) {
  return {
    rpcUrl: "http://unused",
    rpcHeaders: {},
    rpc,
    oracle: { getPrice: vi.fn().mockResolvedValue({ priceMicros }) },
    cursorStore: {
      get: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockResolvedValue(undefined),
      getConfirmationCount: vi.fn().mockResolvedValue(null),
      saveConfirmationCount: vi.fn().mockResolvedValue(undefined),
    },
    chain: "tron" as const,
    confirmations: 0,
  };
}

const TRON_ADDR = "TDTkBJWfXqfCPhNAgHxmgPNHigJEg4ghww";

describe("EvmLikeTronWatcher", () => {
  it("T-address watched → topic filter uses hex equivalent", async () => {
    const rpc = mkRpc({ eth_blockNumber: "0x10", eth_getLogs: [] });
    const watcher = new EvmLikeTronWatcher({
      ...mkOpts(rpc, 1_000_000),
      token: "USDT",
      contractAddress: `0x${"22".repeat(20)}`,
      decimals: 6,
    });
    watcher.setWatchedAddresses([TRON_ADDR]);
    await watcher.poll();
    const call = rpc.mock.calls.find((c) => c[0] === "eth_getLogs");
    const filter = (call?.[1] as Array<{ topics: unknown[] }>)[0].topics[2] as string[];
    const expectedHex = tronToHex(TRON_ADDR).toLowerCase();
    expect(filter[0]).toBe(`0x000000000000000000000000${expectedHex.slice(2)}`);
  });

  it("converts event from/to hex addresses back to T... format", async () => {
    const toHex = tronToHex(TRON_ADDR);
    const contractHex = `0x${"22".repeat(20)}`;
    const rpc = mkRpc({
      eth_blockNumber: "0x65",
      eth_getLogs: [buildLog(toHex, 1_000_000n, 100, contractHex)],
    });
    const watcher = new EvmLikeTronWatcher({
      ...mkOpts(rpc, 1_000_000),
      token: "USDT",
      contractAddress: contractHex,
      decimals: 6,
    });
    watcher.setWatchedAddresses([TRON_ADDR]);

    const [ev] = await watcher.poll();
    expect(ev.to).toBe(TRON_ADDR);
    // from is decoded directly from hex (no caller-supplied T to preserve)
    expect(ev.from).toBe(hexToTron(`0x${"ab".repeat(20)}`));
  });

  it("volatile TRC-20 @ $5: 2 tokens (18 decimals) → 1000 cents", async () => {
    const toHex = tronToHex(TRON_ADDR);
    const contractHex = `0x${"11".repeat(20)}`;
    const rpc = mkRpc({
      eth_blockNumber: "0x65",
      eth_getLogs: [buildLog(toHex, 2_000_000_000_000_000_000n, 100, contractHex)],
    });
    const watcher = new EvmLikeTronWatcher({
      ...mkOpts(rpc, 5_000_000),
      token: "SUNOLD",
      contractAddress: contractHex,
      decimals: 18,
    });
    watcher.setWatchedAddresses([TRON_ADDR]);

    const [ev] = await watcher.poll();
    expect(ev.amountUsdCents).toBe(1000);
    expect(ev.to).toBe(TRON_ADDR);
  });

  it("stablecoin USDT-TRC20 @ $1: 25 USDT → 2500 cents", async () => {
    const toHex = tronToHex(TRON_ADDR);
    const usdtContract = `0x${"22".repeat(20)}`;
    const rpc = mkRpc({
      eth_blockNumber: "0x65",
      eth_getLogs: [buildLog(toHex, 25_000_000n, 100, usdtContract)],
    });
    const watcher = new EvmLikeTronWatcher({
      ...mkOpts(rpc, 1_000_000),
      token: "USDT",
      contractAddress: usdtContract,
      decimals: 6,
    });
    watcher.setWatchedAddresses([TRON_ADDR]);

    const [ev] = await watcher.poll();
    expect(ev.amountUsdCents).toBe(2500);
  });

  it("emits byte-identical PaymentEvent shape to the legacy TronEvmWatcher", async () => {
    const toHex = tronToHex(TRON_ADDR);
    const usdtContract = `0x${"22".repeat(20)}`;
    const rpcResponses: Record<string, unknown> = {
      eth_blockNumber: "0x65",
      eth_getLogs: [buildLog(toHex, 25_000_000n, 100, usdtContract)],
    };

    // Drive both watchers with the same mock.
    const rpcNew = mkRpc(rpcResponses);
    const newW = new EvmLikeTronWatcher({
      ...mkOpts(rpcNew, 1_000_000),
      token: "USDT",
      contractAddress: usdtContract,
      decimals: 6,
      confirmations: 1,
    });
    newW.setWatchedAddresses([TRON_ADDR]);
    const [newEv] = await newW.poll();

    // Legacy watcher uses globalThis.fetch — patch it in.
    const legacyFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse((init?.body as string) ?? "{}") as { method: string; id: number };
      const result = rpcResponses[body.method];
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    (globalThis as { fetch: typeof fetch }).fetch = legacyFetch as unknown as typeof fetch;

    const legacyW = new TronEvmWatcher({
      rpcUrl: "http://unused",
      rpcHeaders: {},
      oracle: { getPrice: vi.fn().mockResolvedValue({ priceMicros: 1_000_000 }) },
      cursorStore: {
        get: vi.fn().mockResolvedValue(null),
        save: vi.fn().mockResolvedValue(undefined),
        getConfirmationCount: vi.fn().mockResolvedValue(null),
        saveConfirmationCount: vi.fn().mockResolvedValue(undefined),
      },
      chain: "tron",
      token: "USDT",
      contractAddress: usdtContract,
      decimals: 6,
      confirmations: 1,
    });
    legacyW.setWatchedAddresses([TRON_ADDR]);
    const [legacyEv] = await legacyW.poll();

    expect(newEv).toEqual(legacyEv);
  });
});
