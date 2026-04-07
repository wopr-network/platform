import type {
	IChainWatcher,
	IPriceOracle,
	IWatcherCursorStore,
	PaymentEvent,
	WatcherOpts,
} from "@wopr-network/platform-crypto-server/plugin";
import type { JettonTransferV3, TonApiCall, TonTransaction } from "./types.js";

/** TON has 9 decimals (nanoton). */
const TON_DECIMALS = 9;
const MICROS_PER_CENT = 10_000n;

/**
 * Convert native TON amount (nanoton) to USD cents using oracle price in microdollars.
 */
function nativeToCents(nanoton: bigint, priceMicros: number, decimals: number): number {
	if (nanoton < 0n) throw new Error("nanoton must be non-negative");
	if (!Number.isInteger(priceMicros) || priceMicros <= 0) {
		throw new Error(`priceMicros must be a positive integer, got ${priceMicros}`);
	}
	return Number((nanoton * BigInt(priceMicros)) / (MICROS_PER_CENT * 10n ** BigInt(decimals)));
}

/**
 * Create a TON Center HTTP API v2 caller.
 *
 * TON Center uses REST-style endpoints, not JSON-RPC.
 * Endpoint: https://toncenter.com/api/v2/{method}?{params}
 */
export function createTonApiCaller(baseUrl: string, apiKey?: string): TonApiCall {
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (apiKey) headers["X-API-Key"] = apiKey;

	return async (method: string, params: Record<string, string>): Promise<unknown> => {
		const qs = new URLSearchParams(params).toString();
		const url = `${baseUrl}/${method}${qs ? `?${qs}` : ""}`;
		const res = await fetch(url, { headers });
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw new Error(`TON API ${method} failed: ${res.status} ${body.slice(0, 200)}`);
		}
		const data = (await res.json()) as { ok: boolean; result?: unknown; error?: string };
		if (!data.ok) throw new Error(`TON API ${method} error: ${data.error ?? "unknown"}`);
		return data.result;
	};
}

/**
 * TON chain watcher.
 *
 * Monitors watched addresses for incoming TON transfers.
 * Uses TON Center API v2 (getTransactions) to poll for new transactions.
 * Cursor is the logical time (lt) of the last processed transaction, stored as a number.
 *
 * For native TON: detects incoming messages with value > 0.
 * For Jetton (USDT etc.): would need to parse transfer notifications — deferred.
 */
export class TonWatcher implements IChainWatcher {
	private _cursor = 0;
	private _stopped = false;
	private readonly chain: string;
	private readonly token: string;
	private readonly api: TonApiCall;
	private readonly confirmationsRequired: number;
	private readonly decimals: number;
	private readonly cursorStore: IWatcherCursorStore;
	private readonly oracle: IPriceOracle;
	private readonly watcherId: string;
	private readonly contractAddress?: string;
	private readonly baseUrl: string;
	private readonly apiKey?: string;
	private _watchedAddresses: string[] = [];

	constructor(opts: WatcherOpts) {
		this.chain = opts.chain;
		this.token = opts.token;
		this.decimals = opts.decimals ?? TON_DECIMALS;
		this.confirmationsRequired = opts.confirmations ?? 1;
		this.cursorStore = opts.cursorStore;
		this.oracle = opts.oracle;
		this.watcherId = `ton:${this.chain}:${this.token}`;
		this.contractAddress = opts.contractAddress;

		this.baseUrl = opts.rpcUrl || "https://toncenter.com/api/v2";
		this.apiKey = opts.rpcHeaders?.["X-API-Key"];
		this.api = createTonApiCaller(this.baseUrl, this.apiKey);
	}

	/** Whether this watcher is for a Jetton (has contractAddress) or native TON. */
	private get isJetton(): boolean {
		return !!this.contractAddress;
	}

	async init(): Promise<void> {
		const saved = await this.cursorStore.get(this.watcherId);
		if (saved !== null) this._cursor = saved;
	}

	setWatchedAddresses(addresses: string[]): void {
		this._watchedAddresses = addresses;
	}

	getCursor(): number {
		return this._cursor;
	}

	stop(): void {
		this._stopped = true;
	}

	/**
	 * Poll for TON or Jetton transfers to watched addresses.
	 * Routes to native TON (v2 API) or Jetton (v3 API) based on contractAddress.
	 */
	async poll(): Promise<PaymentEvent[]> {
		if (this._stopped || this._watchedAddresses.length === 0) return [];
		return this.isJetton ? this.pollJetton() : this.pollNative();
	}

	/** Poll for native TON transfers via v2 getTransactions. */
	private async pollNative(): Promise<PaymentEvent[]> {
		const events: PaymentEvent[] = [];

		for (const address of this._watchedAddresses) {
			try {
				const txs = await this.getRecentTransactions(address);
				if (!txs.length) continue;

				for (const tx of txs) {
					const lt = Number(tx.lt);
					if (lt <= this._cursor) continue;

					if (tx.in_msg && tx.in_msg.destination === address && BigInt(tx.in_msg.value) > 0n) {
						const rawAmount = BigInt(tx.in_msg.value);
						const amountUsdCents = await this.toUsdCents(rawAmount);

						events.push({
							chain: this.chain,
							token: this.token,
							to: address,
							from: tx.in_msg.source || "unknown",
							rawAmount: rawAmount.toString(),
							amountUsdCents,
							txHash: tx.hash,
							blockNumber: lt,
							confirmations: this.confirmationsRequired,
							confirmationsRequired: this.confirmationsRequired,
						});
					}
				}

				const maxLt = txs.reduce((max, tx) => Math.max(max, Number(tx.lt)), this._cursor);
				if (maxLt > this._cursor) {
					this._cursor = maxLt;
					await this.cursorStore.save(this.watcherId, this._cursor);
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.error(`[ton-watcher] Error polling native ${address}: ${msg}`);
			}
		}

		return events;
	}

	/**
	 * Poll for Jetton (e.g. USDT) transfers via TON Center v3 /jetton/transfers.
	 * Uses the contractAddress as the jetton_master filter.
	 */
	private async pollJetton(): Promise<PaymentEvent[]> {
		const events: PaymentEvent[] = [];
		// v3 base URL: replace /v2 with /v3 if present, otherwise append /v3
		const v3Base = this.baseUrl.replace(/\/api\/v2$/, "/api/v3").replace(/\/$/, "");

		for (const address of this._watchedAddresses) {
			try {
				const transfers = await this.getJettonTransfers(v3Base, address);
				if (!transfers.length) continue;

				for (const jt of transfers) {
					const lt = Number(jt.transaction_lt);
					if (lt <= this._cursor) continue;
					if (jt.transaction_aborted) continue;

					const rawAmount = BigInt(jt.amount);
					if (rawAmount <= 0n) continue;

					// For stablecoins (USDT), 1:1 USD — amount / 10^decimals * 100 cents
					const amountUsdCents = await this.toUsdCents(rawAmount);

					events.push({
						chain: this.chain,
						token: this.token,
						to: address,
						from: jt.source || "unknown",
						rawAmount: rawAmount.toString(),
						amountUsdCents,
						txHash: jt.transaction_hash,
						blockNumber: lt,
						confirmations: this.confirmationsRequired,
						confirmationsRequired: this.confirmationsRequired,
					});
				}

				const maxLt = transfers.reduce((max, jt) => Math.max(max, Number(jt.transaction_lt)), this._cursor);
				if (maxLt > this._cursor) {
					this._cursor = maxLt;
					await this.cursorStore.save(this.watcherId, this._cursor);
				}
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.error(`[ton-watcher] Error polling jetton ${address}: ${msg}`);
			}
		}

		return events;
	}

	/** Convert raw amount to USD cents via oracle. */
	private async toUsdCents(rawAmount: bigint): Promise<number> {
		try {
			const { priceMicros } = await this.oracle.getPrice(this.token);
			if (priceMicros > 0) return nativeToCents(rawAmount, priceMicros, this.decimals);
		} catch {
			/* oracle failure is non-fatal */
		}
		return 0;
	}

	/**
	 * Fetch recent native TON transactions for an address via v2 API.
	 */
	private async getRecentTransactions(address: string): Promise<TonTransaction[]> {
		const result = await this.api("getTransactions", {
			address,
			limit: "20",
			archival: "true",
		});
		return (result as TonTransaction[]) ?? [];
	}

	/**
	 * Fetch incoming Jetton transfers for an address via TON Center v3 API.
	 */
	private async getJettonTransfers(v3Base: string, address: string): Promise<JettonTransferV3[]> {
		const params = new URLSearchParams({
			owner_address: address,
			jetton_id: this.contractAddress!,
			direction: "in",
			sort: "asc",
			limit: "50",
		});
		if (this._cursor > 0) params.set("start_lt", String(this._cursor));

		const headers: Record<string, string> = { "Content-Type": "application/json" };
		if (this.apiKey) headers["X-API-Key"] = this.apiKey;

		const url = `${v3Base}/jetton/transfers?${params}`;
		const res = await fetch(url, { headers });
		if (!res.ok) {
			const body = await res.text().catch(() => "");
			throw new Error(`TON v3 API jetton/transfers failed: ${res.status} ${body.slice(0, 200)}`);
		}
		const data = (await res.json()) as { jetton_transfers?: JettonTransferV3[] };
		return data.jetton_transfers ?? [];
	}
}
