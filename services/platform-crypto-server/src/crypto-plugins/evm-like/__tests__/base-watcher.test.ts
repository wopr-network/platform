import type { IWatcherCursorStore } from "@wopr-network/platform-crypto-server/plugin";
import { describe, expect, it, vi } from "vitest";
import { EvmLikeEvmWatcher } from "../evm-watcher.js";
import type { RpcCall } from "../types.js";
import { TRANSFER_TOPIC } from "../types.js";

/**
 * Shared base-class behavior tests. Exercised through EvmLikeEvmWatcher since
 * the base class is abstract; Tron-specific cases live in tron-watcher.test.ts.
 *
 * All tests use an injected RpcCall mock (vi.fn) rather than monkey-patching
 * globalThis.fetch — that's the test-smell fix the reviewer called out.
 */

const CONTRACT = "0x514910771af9ca656af840dff83e8264ecf986ca";
const TO = `0x${"cc".repeat(20)}`;
const FROM = `0x${"ab".repeat(20)}`;
const TX = `0x${"ff".repeat(32)}`;

function buildLog(overrides: { block: number; txHash?: string; logIndex?: string; amount?: bigint; to?: string }) {
  const to = overrides.to ?? TO;
  return {
    address: CONTRACT,
    topics: [
      TRANSFER_TOPIC,
      `0x${"00".repeat(12)}${FROM.slice(2)}`,
      `0x${"00".repeat(12)}${to.slice(2).toLowerCase()}`,
    ],
    data: `0x${(overrides.amount ?? 1_000_000n).toString(16).padStart(64, "0")}`,
    blockNumber: `0x${overrides.block.toString(16)}`,
    transactionHash: overrides.txHash ?? TX,
    logIndex: overrides.logIndex ?? "0x0",
  };
}

interface RpcMockTable {
  eth_blockNumber?: string;
  eth_getLogs?: unknown;
}

type MockedRpc = RpcCall & ReturnType<typeof vi.fn>;

function mkRpc(table: RpcMockTable): MockedRpc {
  return vi.fn(async (method: string, _params: unknown[]) => {
    if (method in table) return (table as Record<string, unknown>)[method];
    throw new Error(`unmocked rpc: ${method}`);
  }) as MockedRpc;
}

type MockedCursorStore = IWatcherCursorStore & {
  get: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  getConfirmationCount: ReturnType<typeof vi.fn>;
  saveConfirmationCount: ReturnType<typeof vi.fn>;
};

function mkCursorStore(
  overrides: Partial<{
    get: ReturnType<typeof vi.fn>;
    getConfirmationCount: ReturnType<typeof vi.fn>;
  }> = {},
): MockedCursorStore {
  return {
    get: overrides.get ?? vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
    getConfirmationCount: overrides.getConfirmationCount ?? vi.fn().mockResolvedValue(null),
    saveConfirmationCount: vi.fn().mockResolvedValue(undefined),
  } as MockedCursorStore;
}

function mkPriceReader(priceMicros = 1_000_000) {
  return { getPrice: vi.fn().mockResolvedValue({ priceMicros }) };
}

function mkWatcher(opts: {
  rpc: RpcCall;
  priceReader?: ReturnType<typeof mkPriceReader>;
  cursorStore?: MockedCursorStore;
  confirmations?: number;
  token?: string;
  decimals?: number;
}) {
  return new EvmLikeEvmWatcher({
    rpcUrl: "http://unused",
    rpcHeaders: {},
    rpc: opts.rpc,
    priceReader: opts.priceReader ?? mkPriceReader(),
    cursorStore: opts.cursorStore ?? mkCursorStore(),
    chain: "ethereum",
    token: opts.token ?? "USDC",
    contractAddress: CONTRACT,
    decimals: opts.decimals ?? 6,
    confirmations: opts.confirmations ?? 0,
  });
}

describe("BaseEvmLikeWatcher via EvmLikeEvmWatcher", () => {
  it("init() loads cursor from store", async () => {
    const store = mkCursorStore({ get: vi.fn().mockResolvedValue(42) });
    const w = mkWatcher({ rpc: mkRpc({}), cursorStore: store });
    await w.init();
    expect(w.getCursor()).toBe(42);
    expect(store.get).toHaveBeenCalledWith("evm:ethereum:USDC");
  });

  it("init() leaves cursor at 0 if store returns null", async () => {
    const w = mkWatcher({ rpc: mkRpc({}) });
    await w.init();
    expect(w.getCursor()).toBe(0);
  });

  it("setWatchedAddresses round-trips (lowercase) and empty set short-circuits poll", async () => {
    const rpc = mkRpc({ eth_blockNumber: "0x10" });
    const w = mkWatcher({ rpc });
    // empty
    expect(await w.poll()).toEqual([]);
    expect(rpc).not.toHaveBeenCalled();

    w.setWatchedAddresses([TO.toUpperCase()]);
    const rpc2 = mkRpc({ eth_blockNumber: "0x10", eth_getLogs: [] });
    const w2 = mkWatcher({ rpc: rpc2, confirmations: 0 });
    w2.setWatchedAddresses([TO.toUpperCase()]);
    await w2.poll();
    // topic filter should contain the lowercased address
    const call = rpc2.mock.calls.find((c) => c[0] === "eth_getLogs");
    expect(call).toBeDefined();
    const filter = (call?.[1] as Array<{ topics: unknown[] }>)[0].topics[2] as string[];
    expect(filter[0]).toBe(`0x000000000000000000000000${TO.slice(2).toLowerCase()}`);
  });

  it("oracle called exactly once per poll even when many logs returned", async () => {
    const logs = [
      buildLog({ block: 10, txHash: `0x${"11".repeat(32)}`, logIndex: "0x0" }),
      buildLog({ block: 10, txHash: `0x${"11".repeat(32)}`, logIndex: "0x1" }),
      buildLog({ block: 11, txHash: `0x${"22".repeat(32)}`, logIndex: "0x0" }),
      buildLog({ block: 12, txHash: `0x${"33".repeat(32)}`, logIndex: "0x0" }),
      buildLog({ block: 12, txHash: `0x${"33".repeat(32)}`, logIndex: "0x1" }),
      buildLog({ block: 13, txHash: `0x${"44".repeat(32)}`, logIndex: "0x0" }),
    ];
    const rpc = mkRpc({ eth_blockNumber: "0x20", eth_getLogs: logs });
    const priceReader = mkPriceReader(1_000_000);
    const w = mkWatcher({ rpc, priceReader });
    w.setWatchedAddresses([TO]);

    const events = await w.poll();
    expect(events).toHaveLength(6);
    expect(priceReader.getPrice).toHaveBeenCalledTimes(1);
  });

  it("getConfirmationCount dedup: same conf skipped, higher conf emitted", async () => {
    // latest=20, block=18, confs=2. Store says last emitted at conf=2 -> skip.
    const logs = [buildLog({ block: 18 })];
    const rpc = mkRpc({ eth_blockNumber: "0x14", eth_getLogs: logs });
    const store = mkCursorStore({ getConfirmationCount: vi.fn().mockResolvedValue(2) });
    const w = mkWatcher({ rpc, cursorStore: store });
    w.setWatchedAddresses([TO]);
    const events = await w.poll();
    expect(events).toHaveLength(0);
    expect(store.saveConfirmationCount).not.toHaveBeenCalled();

    // Now latest=21 → confs=3, should emit.
    const rpc2 = mkRpc({ eth_blockNumber: "0x15", eth_getLogs: logs });
    const store2 = mkCursorStore({ getConfirmationCount: vi.fn().mockResolvedValue(2) });
    const w2 = mkWatcher({ rpc: rpc2, cursorStore: store2 });
    w2.setWatchedAddresses([TO]);
    const events2 = await w2.poll();
    expect(events2).toHaveLength(1);
    expect(events2[0].confirmations).toBe(3);
    expect(store2.saveConfirmationCount).toHaveBeenCalledWith("evm:ethereum:USDC", expect.stringContaining(":"), 3);
  });

  it("saveConfirmationCount called with the new conf value for fresh log", async () => {
    const logs = [buildLog({ block: 95 })];
    const rpc = mkRpc({ eth_blockNumber: "0x64", eth_getLogs: logs }); // latest=100
    const store = mkCursorStore();
    const w = mkWatcher({ rpc, cursorStore: store });
    w.setWatchedAddresses([TO]);
    await w.poll();
    expect(store.saveConfirmationCount).toHaveBeenCalledTimes(1);
    const [, , cnt] = store.saveConfirmationCount.mock.calls[0];
    expect(cnt).toBe(5);
  });

  it("cursor advances past fully-confirmed blocks only, not pending", async () => {
    // latest=100, confirmations=3 → confirmed=97.
    // logs in blocks 96 (confirmed), 98 (pending), 99 (pending).
    const logs = [
      buildLog({ block: 96, txHash: `0x${"01".repeat(32)}` }),
      buildLog({ block: 98, txHash: `0x${"02".repeat(32)}` }),
      buildLog({ block: 99, txHash: `0x${"03".repeat(32)}` }),
    ];
    const rpc = mkRpc({ eth_blockNumber: "0x64", eth_getLogs: logs });
    const store = mkCursorStore();
    const w = mkWatcher({ rpc, cursorStore: store, confirmations: 3 });
    w.setWatchedAddresses([TO]);
    await w.poll();
    // Only block 96 is past the confirmed horizon → cursor = 97.
    expect(w.getCursor()).toBe(97);
  });

  it("no logs but confirmed blocks exist: cursor jumps to confirmed+1", async () => {
    const rpc = mkRpc({ eth_blockNumber: "0x64", eth_getLogs: [] }); // latest=100
    const store = mkCursorStore();
    const w = mkWatcher({ rpc, cursorStore: store, confirmations: 3 });
    w.setWatchedAddresses([TO]);
    await w.poll();
    expect(w.getCursor()).toBe(98); // confirmed=97, +1
    expect(store.save).toHaveBeenCalledWith("evm:ethereum:USDC", 98);
  });

  it("latest < cursor: poll returns [] and does nothing", async () => {
    const rpc = mkRpc({ eth_blockNumber: "0x5" }); // latest=5
    const store = mkCursorStore({ get: vi.fn().mockResolvedValue(100) });
    const w = mkWatcher({ rpc, cursorStore: store });
    await w.init();
    w.setWatchedAddresses([TO]);
    const events = await w.poll();
    expect(events).toEqual([]);
    // only eth_blockNumber was called; no getLogs, no price
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["eth_blockNumber"]);
  });

  it("stop() prevents subsequent polls from emitting", async () => {
    const rpc = mkRpc({ eth_blockNumber: "0x64", eth_getLogs: [buildLog({ block: 50 })] });
    const w = mkWatcher({ rpc });
    w.setWatchedAddresses([TO]);
    w.stop();
    const events = await w.poll();
    expect(events).toEqual([]);
    // poll should short-circuit before ANY RPC calls
    expect(rpc).not.toHaveBeenCalled();
  });

  it("constructor falls back to URL-based RpcCall when rpc not injected (legacy path still works)", () => {
    // Just confirm no throw — we don't want to invoke fetch here.
    const w = new EvmLikeEvmWatcher({
      rpcUrl: "http://localhost:8545",
      rpcHeaders: {},
      priceReader: mkPriceReader(),
      cursorStore: mkCursorStore(),
      chain: "ethereum",
      token: "USDC",
      contractAddress: CONTRACT,
      decimals: 6,
      confirmations: 0,
    });
    expect(w.getCursor()).toBe(0);
  });
});
