import { describe, expect, it, vi } from "vitest";
import { createMockCursorStore, createMockOracle } from "../shared/test-helpers/index.js";
import type { RpcCall } from "../shared/utxo/types.js";
import { UtxoWatcher } from "../shared/utxo/watcher.js";

function createTestWatcher(rpc: RpcCall, opts?: { confirmations?: number; token?: string; chain?: string }) {
	const cursorStore = createMockCursorStore();
	const oracle = createMockOracle();
	const watcher = new UtxoWatcher({
		rpc,
		token: opts?.token ?? "BTC",
		chain: opts?.chain ?? "bitcoin",
		decimals: 8,
		confirmations: opts?.confirmations ?? 3,
		oracle,
		cursorStore,
	});
	return { watcher, cursorStore, oracle };
}

describe("UtxoWatcher", () => {
	it("returns empty array when no addresses are watched", async () => {
		const rpc = vi.fn();
		const { watcher } = createTestWatcher(rpc);
		const events = await watcher.poll();
		expect(events).toEqual([]);
		expect(rpc).not.toHaveBeenCalled();
	});

	it("detects a payment with confirmations", async () => {
		const rpc = vi.fn<RpcCall>().mockImplementation(async (method, _params) => {
			if (method === "listreceivedbyaddress") {
				return [{ address: "bc1qtest", amount: 0.001, confirmations: 3, txids: ["tx1"] }];
			}
			if (method === "gettransaction") {
				return {
					details: [{ address: "bc1qtest", amount: 0.001, category: "receive" }],
					confirmations: 3,
				};
			}
			return null;
		});

		const { watcher } = createTestWatcher(rpc, { confirmations: 3 });
		watcher.setWatchedAddresses(["bc1qtest"]);

		const events = await watcher.poll();
		expect(events).toHaveLength(1);
		expect(events[0]!.chain).toBe("bitcoin");
		expect(events[0]!.token).toBe("BTC");
		expect(events[0]!.to).toBe("bc1qtest");
		expect(events[0]!.txHash).toBe("tx1");
		expect(events[0]!.confirmations).toBe(3);
		expect(events[0]!.confirmationsRequired).toBe(3);
		// 0.001 BTC = 100,000 sats. priceMicros=100_000_000_000 (=$100,000).
		// nativeToCents(100000, 100000000000, 8) = (100000 * 100000000000) / (10000 * 10^8) = 10000000000000000 / 1000000000000 = 10000
		expect(events[0]!.rawAmount).toBe("100000");
		expect(events[0]!.amountUsdCents).toBe(10000); // $100.00
	});

	it("skips addresses not in the watch set", async () => {
		const rpc = vi.fn<RpcCall>().mockImplementation(async (method) => {
			if (method === "listreceivedbyaddress") {
				return [{ address: "bc1qother", amount: 1.0, confirmations: 6, txids: ["tx2"] }];
			}
			return null;
		});

		const { watcher } = createTestWatcher(rpc);
		watcher.setWatchedAddresses(["bc1qmine"]);

		const events = await watcher.poll();
		expect(events).toEqual([]);
	});

	it("skips txs that have not gained new confirmations", async () => {
		const rpc = vi.fn<RpcCall>().mockImplementation(async (method) => {
			if (method === "listreceivedbyaddress") {
				return [{ address: "bc1qtest", amount: 0.5, confirmations: 2, txids: ["tx3"] }];
			}
			if (method === "gettransaction") {
				return {
					details: [{ address: "bc1qtest", amount: 0.5, category: "receive" }],
					confirmations: 2,
				};
			}
			return null;
		});

		const { watcher } = createTestWatcher(rpc, { confirmations: 6 });
		watcher.setWatchedAddresses(["bc1qtest"]);

		// First poll: should return event
		const first = await watcher.poll();
		expect(first).toHaveLength(1);

		// Second poll with same confirmations: should skip
		const second = await watcher.poll();
		expect(second).toEqual([]);
	});

	it("emits new event when confirmations increase", async () => {
		let confirmations = 1;
		const rpc = vi.fn<RpcCall>().mockImplementation(async (method) => {
			if (method === "listreceivedbyaddress") {
				return [{ address: "bc1qtest", amount: 0.1, confirmations, txids: ["tx4"] }];
			}
			if (method === "gettransaction") {
				return {
					details: [{ address: "bc1qtest", amount: 0.1, category: "receive" }],
					confirmations,
				};
			}
			return null;
		});

		const { watcher } = createTestWatcher(rpc, { confirmations: 3 });
		watcher.setWatchedAddresses(["bc1qtest"]);

		const first = await watcher.poll();
		expect(first).toHaveLength(1);
		expect(first[0]!.confirmations).toBe(1);

		confirmations = 2;
		const second = await watcher.poll();
		expect(second).toHaveLength(1);
		expect(second[0]!.confirmations).toBe(2);

		confirmations = 3;
		const third = await watcher.poll();
		expect(third).toHaveLength(1);
		expect(third[0]!.confirmations).toBe(3);
	});

	it("does not emit events after stop()", async () => {
		const rpc = vi.fn<RpcCall>().mockImplementation(async (method) => {
			if (method === "listreceivedbyaddress") {
				return [{ address: "bc1qtest", amount: 1.0, confirmations: 6, txids: ["tx5"] }];
			}
			return null;
		});

		const { watcher } = createTestWatcher(rpc);
		watcher.setWatchedAddresses(["bc1qtest"]);
		watcher.stop();

		const events = await watcher.poll();
		expect(events).toEqual([]);
		expect(rpc).not.toHaveBeenCalled();
	});

	it("importAddress adds to watch set and calls RPC", async () => {
		const rpc = vi.fn<RpcCall>().mockImplementation(async (method) => {
			if (method === "getdescriptorinfo") {
				return { descriptor: "addr(bc1qnew)#checksum" };
			}
			if (method === "importdescriptors") {
				return [{ success: true }];
			}
			if (method === "listreceivedbyaddress") {
				return [{ address: "bc1qnew", amount: 0.01, confirmations: 1, txids: ["tx6"] }];
			}
			if (method === "gettransaction") {
				return {
					details: [{ address: "bc1qnew", amount: 0.01, category: "receive" }],
					confirmations: 1,
				};
			}
			return null;
		});

		const { watcher } = createTestWatcher(rpc);
		await watcher.importAddress("bc1qnew");

		const events = await watcher.poll();
		expect(events).toHaveLength(1);
		expect(events[0]!.to).toBe("bc1qnew");
	});

	it("importAddress falls back to legacy importaddress on error", async () => {
		const rpc = vi.fn<RpcCall>().mockImplementation(async (method) => {
			if (method === "getdescriptorinfo") {
				throw new Error("Method not found");
			}
			if (method === "importaddress") {
				return null;
			}
			if (method === "listreceivedbyaddress") {
				return [];
			}
			return null;
		});

		const { watcher } = createTestWatcher(rpc);
		await watcher.importAddress("bc1qlegacy");

		expect(rpc).toHaveBeenCalledWith("importaddress", ["bc1qlegacy", "", false]);
	});

	it("works with different chain configs (LTC, DOGE)", async () => {
		const rpc = vi.fn<RpcCall>().mockImplementation(async (method) => {
			if (method === "listreceivedbyaddress") {
				return [{ address: "ltc1qtest", amount: 0.5, confirmations: 6, txids: ["ltctx1"] }];
			}
			if (method === "gettransaction") {
				return {
					details: [{ address: "ltc1qtest", amount: 0.5, category: "receive" }],
					confirmations: 6,
				};
			}
			return null;
		});

		const { watcher } = createTestWatcher(rpc, { token: "LTC", chain: "litecoin", confirmations: 6 });
		watcher.setWatchedAddresses(["ltc1qtest"]);

		const events = await watcher.poll();
		expect(events).toHaveLength(1);
		expect(events[0]!.chain).toBe("litecoin");
		expect(events[0]!.token).toBe("LTC");
	});

	it("skips entries without a receive category detail", async () => {
		const rpc = vi.fn<RpcCall>().mockImplementation(async (method) => {
			if (method === "listreceivedbyaddress") {
				return [{ address: "bc1qtest", amount: 1.0, confirmations: 6, txids: ["tx7"] }];
			}
			if (method === "gettransaction") {
				return {
					details: [{ address: "bc1qtest", amount: 1.0, category: "send" }],
					confirmations: 6,
				};
			}
			return null;
		});

		const { watcher } = createTestWatcher(rpc);
		watcher.setWatchedAddresses(["bc1qtest"]);

		const events = await watcher.poll();
		expect(events).toEqual([]);
	});

	it("init loads cursor from store", async () => {
		const rpc = vi.fn();
		const { watcher, cursorStore } = createTestWatcher(rpc);
		cursorStore._cursors.set("bitcoin:BTC", 42);

		await watcher.init();
		expect(watcher.getCursor()).toBe(42);
	});
});
