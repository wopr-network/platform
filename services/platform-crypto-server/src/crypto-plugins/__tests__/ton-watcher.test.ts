import { describe, expect, it, vi } from "vitest";
import type { TonTransaction } from "../ton/types.js";
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
		oracle: { getPrice: vi.fn().mockResolvedValue({ priceMicros: 3_500_000 }) },
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

	it("detects incoming TON transfer", async () => {
		const tx: TonTransaction = {
			utime: 1700000000,
			hash: "abc123def456",
			lt: "100",
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
			hash: "outgoing123",
			lt: "200",
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
			hash: "zero123",
			lt: "300",
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
			hash: "first123",
			lt: "100",
			fee: "1000000",
			in_msg: { source: senderAddr, destination: watchedAddr, value: "1000000000" },
		};
		const tx2: TonTransaction = {
			utime: 1700000010,
			hash: "second456",
			lt: "200",
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
			hash: "old-tx",
			lt: "50",
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
			hash: "stop-test",
			lt: "100",
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
			hash: "price-test",
			lt: "100",
			fee: "1000000",
			in_msg: { source: senderAddr, destination: watchedAddr, value: "1000000000" }, // 1 TON
		};

		const opts = createMockOpts({ [watchedAddr]: [tx] });
		// Oracle returns $3.50 = 3,500,000 microdollars
		opts.oracle.getPrice = vi.fn().mockResolvedValue({ priceMicros: 3_500_000 });

		const watcher = new TonWatcher(opts);
		await watcher.init();
		watcher.setWatchedAddresses([watchedAddr]);

		const events = await watcher.poll();
		expect(events).toHaveLength(1);
		// 1 TON (1e9 nanoton) * 3,500,000 micros / (10,000 * 1e9) = 350 cents = $3.50
		expect(events[0].amountUsdCents).toBe(350);
	});

	it("survives oracle failure gracefully", async () => {
		const tx: TonTransaction = {
			utime: 1700000000,
			hash: "oracle-fail",
			lt: "100",
			fee: "1000000",
			in_msg: { source: senderAddr, destination: watchedAddr, value: "1000000000" },
		};

		const opts = createMockOpts({ [watchedAddr]: [tx] });
		opts.oracle.getPrice = vi.fn().mockRejectedValue(new Error("oracle down"));

		const watcher = new TonWatcher(opts);
		await watcher.init();
		watcher.setWatchedAddresses([watchedAddr]);

		const events = await watcher.poll();
		expect(events).toHaveLength(1);
		expect(events[0].amountUsdCents).toBe(0); // fallback
		expect(events[0].rawAmount).toBe("1000000000"); // raw still correct
	});
});
