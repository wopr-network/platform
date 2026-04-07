import type {
	IChainWatcher,
	IPriceOracle,
	IWatcherCursorStore,
	PaymentEvent,
	WatcherOpts,
} from "@wopr-network/platform-crypto-server/plugin";

import type {
	DescriptorInfo,
	GetTransactionResponse,
	ImportDescriptorResult,
	ReceivedByAddress,
	RpcCall,
} from "./types.js";

/**
 * Convert raw native units to USD cents using microdollar pricing.
 *
 * priceMicros = microdollars (10^-6 USD) per 1 whole coin.
 * rawAmount is in the smallest unit (sats for BTC, litoshis for LTC, etc).
 * decimals = number of decimal places (8 for BTC/LTC/DOGE).
 *
 * Formula: (rawAmount * priceMicros) / (10_000 * 10^decimals)
 *   where 10_000 converts microdollars to cents (1 cent = 10,000 microdollars).
 */
function nativeToCents(rawAmount: bigint, priceMicros: number, decimals: number): number {
	if (rawAmount < 0n) throw new Error("rawAmount must be non-negative");
	if (!Number.isInteger(priceMicros) || priceMicros <= 0) {
		throw new Error(`priceMicros must be a positive integer, got ${priceMicros}`);
	}
	const MICROS_PER_CENT = 10_000n;
	return Number((rawAmount * BigInt(priceMicros)) / (MICROS_PER_CENT * 10n ** BigInt(decimals)));
}

export interface UtxoWatcherConfig {
	/** JSON-RPC call function for the node. */
	rpc: RpcCall;
	/** Chain identifier for the price oracle (e.g. "BTC", "LTC", "DOGE"). */
	token: string;
	/** Chain name for PaymentEvent (e.g. "bitcoin", "litecoin", "dogecoin"). */
	chain: string;
	/** Number of decimal places for this chain's native unit (8 for BTC/LTC/DOGE). */
	decimals: number;
	/** Required confirmations before marking fully processed. */
	confirmations: number;
	/** Price oracle for USD conversion. */
	oracle: IPriceOracle;
	/** Cursor store for dedup and confirmation tracking. */
	cursorStore: IWatcherCursorStore;
}

/**
 * Generic UTXO chain watcher that works with any bitcoind-compatible node.
 * Polls listreceivedbyaddress for payments and tracks confirmations.
 *
 * Reusable for BTC, LTC, and DOGE.
 */
export class UtxoWatcher implements IChainWatcher {
	private readonly rpc: RpcCall;
	private readonly addresses: Set<string> = new Set();
	private readonly token: string;
	private readonly chain: string;
	private readonly decimals: number;
	private readonly minConfirmations: number;
	private readonly oracle: IPriceOracle;
	private readonly cursorStore: IWatcherCursorStore;
	private readonly watcherId: string;
	private cursor = 0;
	private stopped = false;

	constructor(config: UtxoWatcherConfig) {
		this.rpc = config.rpc;
		this.token = config.token;
		this.chain = config.chain;
		this.decimals = config.decimals;
		this.minConfirmations = config.confirmations;
		this.oracle = config.oracle;
		this.cursorStore = config.cursorStore;
		this.watcherId = `${config.chain}:${config.token}`;
	}

	async init(): Promise<void> {
		// Load persisted cursor (block height not used for UTXO, but kept for interface compat)
		const saved = await this.cursorStore.get(this.watcherId);
		if (saved !== null) this.cursor = saved;
	}

	setWatchedAddresses(addresses: string[]): void {
		this.addresses.clear();
		for (const a of addresses) this.addresses.add(a);
	}

	getCursor(): number {
		return this.cursor;
	}

	stop(): void {
		this.stopped = true;
	}

	/**
	 * Import an address into the node's wallet (watch-only).
	 * Uses importdescriptors (modern) with fallback to importaddress (legacy).
	 */
	async importAddress(address: string): Promise<void> {
		try {
			const info = (await this.rpc("getdescriptorinfo", [`addr(${address})`])) as DescriptorInfo;
			const result = (await this.rpc("importdescriptors", [
				[{ desc: info.descriptor, timestamp: 0 }],
			])) as ImportDescriptorResult[];
			if (result[0] && !result[0].success) {
				throw new Error(result[0].error?.message ?? "importdescriptors failed");
			}
		} catch {
			// Fallback: legacy importaddress
			await this.rpc("importaddress", [address, "", false]);
		}
		this.addresses.add(address);
	}

	/**
	 * Poll for payments to watched addresses.
	 * Returns PaymentEvent[] for each new or updated confirmation.
	 */
	async poll(): Promise<PaymentEvent[]> {
		if (this.stopped || this.addresses.size === 0) return [];

		const events: PaymentEvent[] = [];

		// Poll with minconf=0 to see unconfirmed txs
		const received = (await this.rpc("listreceivedbyaddress", [
			0, // minconf=0: see ALL txs including unconfirmed
			false, // include_empty
			true, // include_watchonly
		])) as ReceivedByAddress[];

		const { priceMicros } = await this.oracle.getPrice(this.token);

		for (const entry of received) {
			if (!this.addresses.has(entry.address)) continue;

			for (const txid of entry.txids) {
				// Skip fully-processed txids
				const confirmCount = await this.cursorStore.getConfirmationCount(this.watcherId, txid);

				// Get transaction details for the exact amount
				const tx = (await this.rpc("gettransaction", [txid, true])) as GetTransactionResponse;

				const detail = tx.details.find((d) => d.address === entry.address && d.category === "receive");
				if (!detail) continue;

				// Check if confirmations have increased since last seen
				if (confirmCount !== null && tx.confirmations <= confirmCount) continue;

				// Skip if already at or past threshold on a previous poll
				if (confirmCount !== null && confirmCount >= this.minConfirmations) continue;

				const rawAmount = BigInt(Math.round(detail.amount * 10 ** this.decimals));
				const amountUsdCents = nativeToCents(rawAmount, priceMicros, this.decimals);

				events.push({
					chain: this.chain,
					token: this.token,
					from: "", // UTXO chains don't have a single sender
					to: entry.address,
					rawAmount: rawAmount.toString(),
					amountUsdCents,
					txHash: txid,
					blockNumber: 0, // UTXO chains use txid-based tracking, not block numbers
					confirmations: tx.confirmations,
					confirmationsRequired: this.minConfirmations,
				});

				// Persist confirmation count
				await this.cursorStore.saveConfirmationCount(this.watcherId, txid, tx.confirmations);
			}
		}

		return events;
	}
}

/** Create a UtxoWatcher from the standard WatcherOpts interface. */
export function createUtxoWatcher(opts: WatcherOpts, rpc: RpcCall): IChainWatcher {
	return new UtxoWatcher({
		rpc,
		token: opts.token,
		chain: opts.chain,
		decimals: opts.decimals,
		confirmations: opts.confirmations,
		oracle: opts.oracle,
		cursorStore: opts.cursorStore,
	});
}
