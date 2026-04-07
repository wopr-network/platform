import { describe, expect, it, vi } from "vitest";
import type { SolanaTransaction } from "../solana/types.js";
import { SolanaWatcher } from "../solana/watcher.js";

/** Create a minimal mock WatcherOpts. */
function createMockOpts(rpcResponses: Map<string, unknown>) {
	// Override global fetch to return mocked RPC responses
	const mockFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
		const body = JSON.parse((init?.body as string) ?? "{}") as { method: string; id: number };
		const result = rpcResponses.get(body.method);
		return new Response(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		});
	});

	// biome-ignore lint/suspicious/noExplicitAny: test mock override
	(globalThis as any).fetch = mockFetch;

	return {
		rpcUrl: "http://localhost:8899",
		rpcHeaders: {},
		oracle: { getPrice: vi.fn().mockResolvedValue({ priceMicros: 150_000_000 }) },
		cursorStore: {
			get: vi.fn().mockResolvedValue(null),
			save: vi.fn().mockResolvedValue(undefined),
			getConfirmationCount: vi.fn().mockResolvedValue(null),
			saveConfirmationCount: vi.fn().mockResolvedValue(undefined),
		},
		token: "SOL",
		chain: "solana",
		decimals: 9,
		confirmations: 1,
		_mockFetch: mockFetch,
	};
}

describe("SolanaWatcher", () => {
	it("initializes with cursor from store", async () => {
		const rpcResponses = new Map();
		const opts = createMockOpts(rpcResponses);
		opts.cursorStore.get = vi.fn().mockResolvedValue(500);

		const watcher = new SolanaWatcher(opts);
		await watcher.init();
		expect(watcher.getCursor()).toBe(500);
	});

	it("returns empty when no watched addresses", async () => {
		const rpcResponses = new Map();
		const opts = createMockOpts(rpcResponses);

		const watcher = new SolanaWatcher(opts);
		await watcher.init();
		const events = await watcher.poll();
		expect(events).toEqual([]);
	});

	it("returns empty when stopped", async () => {
		const rpcResponses = new Map();
		const opts = createMockOpts(rpcResponses);

		const watcher = new SolanaWatcher(opts);
		await watcher.init();
		watcher.setWatchedAddresses(["SomeAddress111111111111111111111111111111111"]);
		watcher.stop();
		const events = await watcher.poll();
		expect(events).toEqual([]);
	});

	it("detects native SOL transfer to watched address", async () => {
		const watchedAddr = "ReceiverAddr1111111111111111111111111111111";
		const senderAddr = "SenderAddr11111111111111111111111111111111";

		const mockTx: SolanaTransaction = {
			slot: 100,
			blockTime: 1700000000,
			meta: {
				err: null,
				fee: 5000,
				preBalances: [2_000_000_000, 500_000_000],
				postBalances: [1_000_000_000, 1_500_000_000],
			},
			transaction: {
				message: {
					accountKeys: [senderAddr, watchedAddr],
					instructions: [{ programIdIndex: 0, accounts: [0, 1], data: "" }],
				},
				signatures: ["sig123abc"],
			},
		};

		const rpcResponses = new Map<string, unknown>();
		rpcResponses.set("getSignaturesForAddress", [
			{
				signature: "sig123abc",
				slot: 100,
				err: null,
				memo: null,
				blockTime: 1700000000,
				confirmationStatus: "finalized",
			},
		]);
		rpcResponses.set("getTransaction", mockTx);

		const opts = createMockOpts(rpcResponses);
		const watcher = new SolanaWatcher(opts);
		await watcher.init();
		watcher.setWatchedAddresses([watchedAddr]);

		const events = await watcher.poll();
		expect(events).toHaveLength(1);
		expect(events[0].txHash).toBe("sig123abc");
		expect(events[0].to).toBe(watchedAddr);
		expect(events[0].from).toBe(senderAddr);
		expect(events[0].rawAmount).toBe("1000000000"); // 1 SOL increase
		expect(events[0].chain).toBe("solana");
		expect(events[0].token).toBe("SOL");
		expect(events[0].blockNumber).toBe(100);
	});

	it("advances cursor for finalized transactions", async () => {
		const watchedAddr = "ReceiverAddr1111111111111111111111111111111";

		const mockTx: SolanaTransaction = {
			slot: 200,
			blockTime: 1700000000,
			meta: {
				err: null,
				fee: 5000,
				preBalances: [2_000_000_000, 0],
				postBalances: [1_000_000_000, 1_000_000_000],
			},
			transaction: {
				message: {
					accountKeys: ["Sender1111111111111111111111111111111111111", watchedAddr],
					instructions: [],
				},
				signatures: ["sig456def"],
			},
		};

		const rpcResponses = new Map<string, unknown>();
		rpcResponses.set("getSignaturesForAddress", [
			{
				signature: "sig456def",
				slot: 200,
				err: null,
				memo: null,
				blockTime: 1700000000,
				confirmationStatus: "finalized",
			},
		]);
		rpcResponses.set("getTransaction", mockTx);

		const opts = createMockOpts(rpcResponses);
		const watcher = new SolanaWatcher(opts);
		await watcher.init();
		watcher.setWatchedAddresses([watchedAddr]);

		await watcher.poll();
		expect(watcher.getCursor()).toBe(200);
		expect(opts.cursorStore.save).toHaveBeenCalledWith("solana:solana:SOL", 200);
	});

	it("skips errored transactions", async () => {
		const watchedAddr = "ReceiverAddr1111111111111111111111111111111";

		const rpcResponses = new Map<string, unknown>();
		rpcResponses.set("getSignaturesForAddress", [
			{
				signature: "errored-sig",
				slot: 300,
				err: { InstructionError: [0, "Custom"] },
				memo: null,
				blockTime: 1700000000,
				confirmationStatus: "finalized",
			},
		]);

		const opts = createMockOpts(rpcResponses);
		const watcher = new SolanaWatcher(opts);
		await watcher.init();
		watcher.setWatchedAddresses([watchedAddr]);

		const events = await watcher.poll();
		expect(events).toEqual([]);
	});

	it("skips already-emitted confirmations", async () => {
		const watchedAddr = "ReceiverAddr1111111111111111111111111111111";

		const mockTx: SolanaTransaction = {
			slot: 400,
			blockTime: 1700000000,
			meta: {
				err: null,
				fee: 5000,
				preBalances: [2_000_000_000, 0],
				postBalances: [1_000_000_000, 1_000_000_000],
			},
			transaction: {
				message: {
					accountKeys: ["Sender1111111111111111111111111111111111111", watchedAddr],
					instructions: [],
				},
				signatures: ["sig-dup"],
			},
		};

		const rpcResponses = new Map<string, unknown>();
		rpcResponses.set("getSignaturesForAddress", [
			{
				signature: "sig-dup",
				slot: 400,
				err: null,
				memo: null,
				blockTime: 1700000000,
				confirmationStatus: "finalized",
			},
		]);
		rpcResponses.set("getTransaction", mockTx);

		const opts = createMockOpts(rpcResponses);
		// Already emitted at confirmation count 1
		opts.cursorStore.getConfirmationCount = vi.fn().mockResolvedValue(1);

		const watcher = new SolanaWatcher(opts);
		await watcher.init();
		watcher.setWatchedAddresses([watchedAddr]);

		const events = await watcher.poll();
		expect(events).toEqual([]);
	});

	it("detects SPL token transfer to watched address", async () => {
		const watchedAddr = "ReceiverAddr1111111111111111111111111111111";
		const senderAddr = "SenderAddr11111111111111111111111111111111";
		const usdcMint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

		const mockTx: SolanaTransaction = {
			slot: 500,
			blockTime: 1700000000,
			meta: {
				err: null,
				fee: 5000,
				preBalances: [2_000_000_000, 1_000_000],
				postBalances: [1_995_000_000, 1_000_000],
				preTokenBalances: [
					{
						accountIndex: 0,
						mint: usdcMint,
						uiTokenAmount: { amount: "10000000", decimals: 6, uiAmountString: "10.0" },
						owner: senderAddr,
					},
					{
						accountIndex: 1,
						mint: usdcMint,
						uiTokenAmount: { amount: "0", decimals: 6, uiAmountString: "0.0" },
						owner: watchedAddr,
					},
				],
				postTokenBalances: [
					{
						accountIndex: 0,
						mint: usdcMint,
						uiTokenAmount: { amount: "5000000", decimals: 6, uiAmountString: "5.0" },
						owner: senderAddr,
					},
					{
						accountIndex: 1,
						mint: usdcMint,
						uiTokenAmount: { amount: "5000000", decimals: 6, uiAmountString: "5.0" },
						owner: watchedAddr,
					},
				],
			},
			transaction: {
				message: {
					accountKeys: [senderAddr, watchedAddr],
					instructions: [],
				},
				signatures: ["spl-sig-789"],
			},
		};

		const rpcResponses = new Map<string, unknown>();
		rpcResponses.set("getSignaturesForAddress", [
			{
				signature: "spl-sig-789",
				slot: 500,
				err: null,
				memo: null,
				blockTime: 1700000000,
				confirmationStatus: "finalized",
			},
		]);
		rpcResponses.set("getTransaction", mockTx);

		const opts = createMockOpts(rpcResponses);
		// Configure as SPL token watcher
		const splOpts = { ...opts, token: "USDC", contractAddress: usdcMint };

		const watcher = new SolanaWatcher(splOpts);
		await watcher.init();
		watcher.setWatchedAddresses([watchedAddr]);

		const events = await watcher.poll();
		expect(events).toHaveLength(1);
		expect(events[0].txHash).toBe("spl-sig-789");
		expect(events[0].to).toBe(watchedAddr);
		expect(events[0].from).toBe(senderAddr);
		expect(events[0].rawAmount).toBe("5000000"); // 5 USDC
		expect(events[0].token).toBe("USDC");
	});
});
