import type {
	IChainWatcher,
	IPriceOracle,
	IWatcherCursorStore,
	PaymentEvent,
	WatcherOpts,
} from "@wopr-network/platform-crypto-server/plugin";
import type { RpcCall, RpcTransaction } from "./types.js";
import { createRpcCaller } from "./watcher.js";

/** Microdollars per cent. Used for oracle price conversion. */
const MICROS_PER_CENT = 10_000n;

/**
 * Convert native token amount to USD cents using oracle price in microdollars.
 *
 * @param rawAmount - Raw value in smallest unit (e.g. wei)
 * @param priceMicros - Price per whole token in microdollars (10^-6 USD)
 * @param decimals - Token decimals (18 for ETH)
 */
function nativeToCents(rawAmount: bigint, priceMicros: number, decimals: number): number {
	if (rawAmount < 0n) throw new Error("rawAmount must be non-negative");
	if (!Number.isInteger(priceMicros) || priceMicros <= 0) {
		throw new Error(`priceMicros must be a positive integer, got ${priceMicros}`);
	}
	return Number((rawAmount * BigInt(priceMicros)) / (MICROS_PER_CENT * 10n ** BigInt(decimals)));
}

/**
 * Native ETH transfer watcher.
 *
 * Unlike the ERC-20 EvmWatcher which uses eth_getLogs for Transfer events,
 * this scans blocks for transactions where `to` matches a watched deposit
 * address and `value > 0`.
 *
 * Scans up to latest block (not just confirmed) to detect pending txs.
 * Emits events on each confirmation increment. Only advances cursor
 * past fully-confirmed blocks.
 */
export class EthWatcher implements IChainWatcher {
	private _cursor = 0;
	private _stopped = false;
	private readonly chain: string;
	private readonly token: string;
	private readonly rpc: RpcCall;
	private readonly oracle: IPriceOracle;
	private readonly confirmations: number;
	private readonly cursorStore: IWatcherCursorStore;
	private readonly watcherId: string;
	private _watchedAddresses: Set<string>;

	constructor(opts: WatcherOpts) {
		this.chain = opts.chain;
		this.token = opts.token;
		this.rpc = createRpcCaller(opts.rpcUrl, opts.rpcHeaders);
		this.oracle = opts.oracle;
		this._cursor = 0;
		this.confirmations = opts.confirmations;
		this.cursorStore = opts.cursorStore;
		this.watcherId = `eth:${opts.chain}`;
		this._watchedAddresses = new Set<string>();
	}

	async init(): Promise<void> {
		const saved = await this.cursorStore.get(this.watcherId);
		if (saved !== null) this._cursor = saved;
	}

	setWatchedAddresses(addresses: string[]): void {
		this._watchedAddresses = new Set(addresses.map((a) => a.toLowerCase()));
	}

	getCursor(): number {
		return this._cursor;
	}

	stop(): void {
		this._stopped = true;
	}

	/**
	 * Poll for native ETH transfers to watched addresses, including unconfirmed blocks.
	 *
	 * Scans from cursor to latest block in batches of 5. Emits events with current
	 * confirmation count. Re-emits on each confirmation increment. Only advances
	 * cursor past fully-confirmed blocks.
	 */
	async poll(): Promise<PaymentEvent[]> {
		if (this._stopped || this._watchedAddresses.size === 0) return [];

		const latestHex = (await this.rpc("eth_blockNumber", [])) as string;
		const latest = Number.parseInt(latestHex, 16);
		const confirmed = latest - this.confirmations;

		if (latest < this._cursor) return [];

		const { priceMicros } = await this.oracle.getPrice("ETH");

		const events: PaymentEvent[] = [];

		// Fetch blocks in batches to avoid bursting RPC rate limits on fast chains.
		const BATCH_SIZE = 5;
		for (let batchStart = this._cursor; batchStart <= latest; batchStart += BATCH_SIZE) {
			if (this._stopped) break;

			const batchEnd = Math.min(batchStart + BATCH_SIZE - 1, latest);
			const blockNums = Array.from({ length: batchEnd - batchStart + 1 }, (_, i) => batchStart + i);

			const blocks = await Promise.all(
				blockNums.map((bn) =>
					this.rpc("eth_getBlockByNumber", [`0x${bn.toString(16)}`, true]).then(
						(b) => ({ blockNum: bn, block: b as { transactions: RpcTransaction[] } | null, error: null }),
						(err: unknown) => ({ blockNum: bn, block: null, error: err }),
					),
				),
			);

			// Stop processing at the first failed block so the cursor doesn't advance past it.
			const firstFailIdx = blocks.findIndex((b) => b.error !== null || !b.block);
			const safeBlocks = firstFailIdx === -1 ? blocks : blocks.slice(0, firstFailIdx);
			for (const { blockNum, block } of safeBlocks) {
				if (!block) break;

				const confs = latest - blockNum;

				for (const tx of block.transactions) {
					if (!tx.to) continue;
					const to = tx.to.toLowerCase();
					if (!this._watchedAddresses.has(to)) continue;

					const valueWei = BigInt(tx.value);
					if (valueWei === 0n) continue;

					// Skip if we already emitted at this confirmation count
					const lastConf = await this.cursorStore.getConfirmationCount(this.watcherId, tx.hash);
					if (lastConf !== null && confs <= lastConf) continue;

					const amountUsdCents = nativeToCents(valueWei, priceMicros, 18);

					events.push({
						chain: this.chain,
						token: this.token,
						from: tx.from.toLowerCase(),
						to,
						rawAmount: valueWei.toString(),
						amountUsdCents,
						txHash: tx.hash,
						blockNumber: blockNum,
						confirmations: confs,
						confirmationsRequired: this.confirmations,
					});

					await this.cursorStore.saveConfirmationCount(this.watcherId, tx.hash, confs);
				}

				// Only advance cursor past fully-confirmed blocks
				if (blockNum <= confirmed) {
					this._cursor = blockNum + 1;
					await this.cursorStore.save(this.watcherId, this._cursor);
				}
			}

			if (firstFailIdx !== -1) break;
		}

		return events;
	}
}
