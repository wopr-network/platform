import type {
	IChainWatcher,
	IWatcherCursorStore,
	PaymentEvent,
	WatcherOpts,
} from "@wopr-network/platform-crypto-server/plugin";

import { hexToTron, tronToHex } from "./address-convert.js";

/** Raw JSON-RPC log entry (same shape as EVM). */
interface RpcLog {
	address: string;
	topics: string[];
	data: string;
	blockNumber: string;
	transactionHash: string;
	logIndex: string;
}

type RpcCall = (method: string, params: unknown[]) => Promise<unknown>;

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** Create a JSON-RPC caller for Tron's EVM-compatible endpoint. */
function createRpcCaller(rpcUrl: string, extraHeaders?: Record<string, string>): RpcCall {
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
			const hasApiKey = "TRON-PRO-API-KEY" in headers;
			console.error(
				`[rpc] ${method} ${res.status} auth=${hasApiKey} url=${rpcUrl.replace(/apikey=[^&]+/, "apikey=***")} body=${body.slice(0, 200)}`,
			);
			throw new Error(`RPC ${method} failed: ${res.status}`);
		}
		const data = (await res.json()) as { result?: unknown; error?: { message: string } };
		if (data.error) throw new Error(`RPC ${method} error: ${data.error.message}`);
		return data.result;
	};
}

/**
 * Convert token raw amount (BigInt) to USD cents (integer).
 * Stablecoins are 1:1 USD. Truncates fractional cents.
 */
function centsFromTokenAmount(rawAmount: bigint, decimals: number): number {
	return Number((rawAmount * 100n) / 10n ** BigInt(decimals));
}

/**
 * Tron EVM-compatible watcher.
 *
 * Tron exposes an EVM-compatible JSON-RPC endpoint that supports eth_getLogs.
 * This watcher wraps the EVM watcher pattern but converts between Tron T...
 * Base58Check addresses and 0x hex addresses at the boundary.
 *
 * - setWatchedAddresses: accepts T... addresses, converts to 0x hex for filtering
 * - poll results: converts 0x hex addresses back to T... for PaymentEvent output
 */
export class TronEvmWatcher implements IChainWatcher {
	private _cursor = 0;
	private _stopped = false;
	private readonly chain: string;
	private readonly token: string;
	private readonly rpc: RpcCall;
	private readonly confirmations: number;
	private readonly contractAddress: string;
	private readonly decimals: number;
	private readonly cursorStore: IWatcherCursorStore;
	private readonly watcherId: string;
	/** Hex addresses used for RPC filtering. */
	private _watchedHexAddresses: string[] = [];
	/** Map from lowercase hex -> original T... address for reverse lookup. */
	private readonly _hexToTronMap: Map<string, string> = new Map();

	constructor(opts: WatcherOpts) {
		this.chain = opts.chain;
		this.token = opts.token;
		this.rpc = createRpcCaller(opts.rpcUrl, opts.rpcHeaders);
		this._cursor = 0;
		this.confirmations = opts.confirmations;
		this.contractAddress = (opts.contractAddress ?? "").toLowerCase();
		this.decimals = opts.decimals;
		this.cursorStore = opts.cursorStore;
		this.watcherId = `tron:${opts.chain}:${opts.token}`;
	}

	async init(): Promise<void> {
		const saved = await this.cursorStore.get(this.watcherId);
		if (saved !== null) this._cursor = saved;
	}

	/**
	 * Set watched addresses. Accepts Tron T... addresses.
	 * Converts to 0x hex internally for RPC filtering.
	 */
	setWatchedAddresses(addresses: string[]): void {
		this._hexToTronMap.clear();
		this._watchedHexAddresses = addresses.map((addr) => {
			const hex = tronToHex(addr).toLowerCase();
			this._hexToTronMap.set(hex, addr);
			return hex;
		});
	}

	getCursor(): number {
		return this._cursor;
	}

	stop(): void {
		this._stopped = true;
	}

	/**
	 * Poll for TRC-20 Transfer events using the EVM-compatible JSON-RPC.
	 * Converts hex addresses in results back to Tron T... format.
	 */
	async poll(): Promise<PaymentEvent[]> {
		if (this._stopped || this._watchedHexAddresses.length === 0) return [];

		const latestHex = (await this.rpc("eth_blockNumber", [])) as string;
		const latest = Number.parseInt(latestHex, 16);
		const confirmed = latest - this.confirmations;

		if (latest < this._cursor) return [];

		// Filter by topic[2] (to address) using hex addresses
		const toFilter =
			this._watchedHexAddresses.length > 0
				? this._watchedHexAddresses.map((a) => `0x000000000000000000000000${a.slice(2)}`)
				: null;

		const logs = (await this.rpc("eth_getLogs", [
			{
				address: this.contractAddress,
				topics: [TRANSFER_TOPIC, null, toFilter],
				fromBlock: `0x${this._cursor.toString(16)}`,
				toBlock: `0x${latest.toString(16)}`,
			},
		])) as RpcLog[];

		// Group logs by block
		const logsByBlock = new Map<number, RpcLog[]>();
		for (const log of logs) {
			const bn = Number.parseInt(log.blockNumber, 16);
			const arr = logsByBlock.get(bn);
			if (arr) arr.push(log);
			else logsByBlock.set(bn, [log]);
		}

		const events: PaymentEvent[] = [];

		const blockNums = [...logsByBlock.keys()].sort((a, b) => a - b);
		for (const blockNum of blockNums) {
			const confs = latest - blockNum;

			for (const log of logsByBlock.get(blockNum) ?? []) {
				const txKey = `${log.transactionHash}:${log.logIndex}`;

				const lastConf = await this.cursorStore.getConfirmationCount(this.watcherId, txKey);
				if (lastConf !== null && confs <= lastConf) continue;

				const toHex = `0x${log.topics[2].slice(26)}`.toLowerCase();
				const fromHex = `0x${log.topics[1].slice(26)}`.toLowerCase();
				const rawAmount = BigInt(log.data);
				const amountUsdCents = centsFromTokenAmount(rawAmount, this.decimals);

				// Convert hex addresses back to Tron T... format
				const toTron = this._hexToTronMap.get(toHex) ?? hexToTron(toHex);
				const fromTron = hexToTron(fromHex);

				events.push({
					chain: this.chain,
					token: this.token,
					from: fromTron,
					to: toTron,
					rawAmount: rawAmount.toString(),
					amountUsdCents,
					txHash: log.transactionHash,
					blockNumber: blockNum,
					confirmations: confs,
					confirmationsRequired: this.confirmations,
				});

				await this.cursorStore.saveConfirmationCount(this.watcherId, txKey, confs);
			}

			if (blockNum <= confirmed) {
				this._cursor = blockNum + 1;
				await this.cursorStore.save(this.watcherId, this._cursor);
			}
		}

		// Advance cursor if no logs found but confirmed blocks exist
		if (blockNums.length === 0 && confirmed >= this._cursor) {
			this._cursor = confirmed + 1;
			await this.cursorStore.save(this.watcherId, this._cursor);
		}

		return events;
	}
}
