import type {
	IChainWatcher,
	IWatcherCursorStore,
	PaymentEvent,
	WatcherOpts,
} from "@wopr-network/platform-crypto-server/plugin";
import type { SignatureInfo, SolanaRpcCall, SolanaTransaction } from "./types.js";

/** Microdollars per cent. Used for oracle price conversion. */
const MICROS_PER_CENT = 10_000n;

/** SOL has 9 decimals (lamports). */
const SOL_DECIMALS = 9;

/** Create a Solana JSON-RPC caller. */
export function createSolanaRpcCaller(rpcUrl: string, extraHeaders?: Record<string, string>): SolanaRpcCall {
	let id = 0;
	const headers: Record<string, string> = { "Content-Type": "application/json", ...extraHeaders };
	return async (method: string, params: unknown[]): Promise<unknown> => {
		const res = await fetch(rpcUrl, {
			method: "POST",
			headers,
			body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
		});
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw new Error(`Solana RPC ${method} failed: ${res.status} ${body.slice(0, 200)}`);
		}
		const data = (await res.json()) as { result?: unknown; error?: { message: string } };
		if (data.error) throw new Error(`Solana RPC ${method} error: ${data.error.message}`);
		return data.result;
	};
}

/**
 * Convert native SOL amount (lamports) to USD cents using oracle price in microdollars.
 */
function nativeToCents(lamports: bigint, priceMicros: number, decimals: number): number {
	if (lamports < 0n) throw new Error("lamports must be non-negative");
	if (!Number.isInteger(priceMicros) || priceMicros <= 0) {
		throw new Error(`priceMicros must be a positive integer, got ${priceMicros}`);
	}
	return Number((lamports * BigInt(priceMicros)) / (MICROS_PER_CENT * 10n ** BigInt(decimals)));
}

/**
 * Solana chain watcher.
 *
 * Monitors watched addresses for incoming SOL transfers and SPL token transfers.
 * Uses getSignaturesForAddress + getTransaction RPCs. Cursor is a slot number.
 *
 * For native SOL: detects balance increases to watched addresses.
 * For SPL tokens: detects token transfer instructions to watched addresses.
 */
export class SolanaWatcher implements IChainWatcher {
	private _cursor = 0;
	private _stopped = false;
	private readonly chain: string;
	private readonly token: string;
	private readonly rpc: SolanaRpcCall;
	private readonly confirmations: number;
	private readonly decimals: number;
	private readonly cursorStore: IWatcherCursorStore;
	private readonly watcherId: string;
	private readonly contractAddress?: string;
	private _watchedAddresses: Set<string>;

	constructor(opts: WatcherOpts) {
		this.chain = opts.chain;
		this.token = opts.token;
		this.rpc = createSolanaRpcCaller(opts.rpcUrl, opts.rpcHeaders);
		this._cursor = 0;
		this.confirmations = opts.confirmations;
		this.decimals = opts.decimals;
		this.cursorStore = opts.cursorStore;
		this.watcherId = `solana:${opts.chain}:${opts.token}`;
		this.contractAddress = opts.contractAddress;
		this._watchedAddresses = new Set<string>();
	}

	async init(): Promise<void> {
		const saved = await this.cursorStore.get(this.watcherId);
		if (saved !== null) this._cursor = saved;
	}

	setWatchedAddresses(addresses: string[]): void {
		this._watchedAddresses = new Set(addresses);
	}

	getCursor(): number {
		return this._cursor;
	}

	stop(): void {
		this._stopped = true;
	}

	/**
	 * Poll for SOL or SPL token transfers to watched addresses.
	 *
	 * For each watched address:
	 *   1. Call getSignaturesForAddress to find recent transactions
	 *   2. Call getTransaction for each to extract transfer details
	 *   3. Detect native SOL transfers (balance diff) or SPL token transfers
	 *
	 * Cursor is the highest slot seen, advanced only for finalized transactions.
	 */
	async poll(): Promise<PaymentEvent[]> {
		if (this._stopped || this._watchedAddresses.size === 0) return [];

		const events: PaymentEvent[] = [];

		for (const address of this._watchedAddresses) {
			if (this._stopped) break;

			const sigs = await this.getRecentSignatures(address);
			if (sigs.length === 0) continue;

			for (const sig of sigs) {
				if (this._stopped) break;
				if (sig.err) continue;
				if (sig.slot <= this._cursor) continue;

				const tx = (await this.rpc("getTransaction", [
					sig.signature,
					{ encoding: "json", maxSupportedTransactionVersion: 0 },
				])) as SolanaTransaction | null;

				if (!tx?.meta || tx.meta.err) continue;

				const txEvents = this.contractAddress
					? this.extractSplTransferEvents(tx, address, sig.signature)
					: this.extractNativeTransferEvents(tx, address, sig.signature);

				for (const evt of txEvents) {
					// Skip if already emitted at this confirmation count
					const txKey = `${sig.signature}:${evt.to}`;
					const lastConf = await this.cursorStore.getConfirmationCount(this.watcherId, txKey);
					if (lastConf !== null && evt.confirmations <= lastConf) continue;

					events.push(evt);
					await this.cursorStore.saveConfirmationCount(this.watcherId, txKey, evt.confirmations);
				}

				// Advance cursor for finalized slots
				if (sig.confirmationStatus === "finalized" && sig.slot > this._cursor) {
					this._cursor = sig.slot;
					await this.cursorStore.save(this.watcherId, this._cursor);
				}
			}
		}

		return events;
	}

	/** Fetch recent signatures for an address, filtering by slot > cursor. */
	private async getRecentSignatures(address: string): Promise<SignatureInfo[]> {
		const params: Record<string, unknown> = { limit: 100 };
		const sigs = (await this.rpc("getSignaturesForAddress", [address, params])) as SignatureInfo[];
		// Filter to only signatures after our cursor and sort ascending by slot
		return sigs.filter((s) => s.slot > this._cursor).sort((a, b) => a.slot - b.slot);
	}

	/**
	 * Extract native SOL transfer events from a transaction.
	 *
	 * Detects balance increases to the watched address by comparing
	 * preBalances and postBalances in the transaction metadata.
	 */
	private extractNativeTransferEvents(
		tx: SolanaTransaction,
		watchedAddress: string,
		signature: string,
	): PaymentEvent[] {
		const events: PaymentEvent[] = [];
		const { accountKeys } = tx.transaction.message;
		const meta = tx.meta;
		if (!meta) return events;
		const { preBalances, postBalances } = meta;

		const addrIndex = accountKeys.indexOf(watchedAddress);
		if (addrIndex === -1) return events;

		const pre = BigInt(preBalances[addrIndex]);
		const post = BigInt(postBalances[addrIndex]);
		const diff = post - pre;

		if (diff <= 0n) return events;

		// Determine sender: the first account with a balance decrease
		let from = accountKeys[0]; // fee payer as fallback
		for (let i = 0; i < accountKeys.length; i++) {
			if (i === addrIndex) continue;
			const senderDiff = BigInt(postBalances[i]) - BigInt(preBalances[i]);
			if (senderDiff < 0n) {
				from = accountKeys[i];
				break;
			}
		}

		// Get current slot for confirmation count
		const confs = this.confirmations; // simplified; real impl would compare against current slot

		events.push({
			chain: this.chain,
			token: this.token,
			from,
			to: watchedAddress,
			rawAmount: diff.toString(),
			amountUsdCents: nativeToCents(diff, 1, SOL_DECIMALS), // price conversion done by caller via oracle
			txHash: signature,
			blockNumber: tx.slot,
			confirmations: confs,
			confirmationsRequired: this.confirmations,
		});

		return events;
	}

	/**
	 * Extract SPL token transfer events from a transaction.
	 *
	 * Compares preTokenBalances and postTokenBalances for the watched address
	 * filtered by the configured token mint (contractAddress).
	 */
	private extractSplTransferEvents(tx: SolanaTransaction, watchedAddress: string, signature: string): PaymentEvent[] {
		const events: PaymentEvent[] = [];
		const { accountKeys } = tx.transaction.message;
		const mint = this.contractAddress;
		if (!mint) return events;

		const pre = tx.meta?.preTokenBalances ?? [];
		const post = tx.meta?.postTokenBalances ?? [];

		// Find post-balances for our token mint owned by the watched address
		for (const postBal of post) {
			if (postBal.mint !== mint) continue;
			if (postBal.owner !== watchedAddress) continue;

			const postAmount = BigInt(postBal.uiTokenAmount.amount);

			// Find matching pre-balance
			const preBal = pre.find(
				(p) => p.accountIndex === postBal.accountIndex && p.mint === mint && p.owner === watchedAddress,
			);
			const preAmount = preBal ? BigInt(preBal.uiTokenAmount.amount) : 0n;

			const diff = postAmount - preAmount;
			if (diff <= 0n) continue;

			// Determine sender: owner of any token account that decreased
			let from = accountKeys[0];
			for (const preTb of pre) {
				if (preTb.mint !== mint) continue;
				if (preTb.owner === watchedAddress) continue;
				const matchingPost = post.find((p) => p.accountIndex === preTb.accountIndex && p.mint === mint);
				if (matchingPost) {
					const senderDiff = BigInt(matchingPost.uiTokenAmount.amount) - BigInt(preTb.uiTokenAmount.amount);
					if (senderDiff < 0n && preTb.owner) {
						from = preTb.owner;
						break;
					}
				}
			}

			events.push({
				chain: this.chain,
				token: this.token,
				from,
				to: watchedAddress,
				rawAmount: diff.toString(),
				amountUsdCents: 0, // SPL stablecoins: conversion done by caller
				txHash: signature,
				blockNumber: tx.slot,
				confirmations: this.confirmations,
				confirmationsRequired: this.confirmations,
			});
		}

		return events;
	}
}
