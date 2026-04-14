import type {
  IChainWatcher,
  IPriceReader,
  IWatcherCursorStore,
  PaymentEvent,
  WatcherOpts,
} from "@wopr-network/platform-crypto-server/plugin";
import { nativeToCents } from "../../oracle/convert.js";
import { createRpcCaller, type RpcCall, type RpcLog, TRANSFER_TOPIC } from "./types.js";

/**
 * Superset of WatcherOpts that optionally accepts a pre-built RpcCall. When
 * `rpc` is provided, `rpcUrl`/`rpcHeaders` are ignored for RPC construction.
 *
 * This is the test-smell fix the reviewer flagged: subclasses (and tests)
 * can inject an RpcCall mock without monkey-patching globalThis.fetch. The
 * URL-based path still works identically to the existing watchers.
 */
export interface BaseEvmLikeWatcherOpts extends WatcherOpts {
  rpc?: RpcCall;
}

/**
 * Parsed fields from a single Transfer log, before shape-finalization.
 *
 * `rawAmount` is a bigint here; the base class stringifies it when building
 * the PaymentEvent so the wire shape matches the existing watchers exactly.
 */
export interface ParsedTransferLog {
  from: string;
  to: string;
  rawAmount: bigint;
}

/**
 * Shared EVM-like (ERC-20 / TRC-20 via EVM-compatible RPC) watcher.
 *
 * Extracted from the two near-identical watchers in crypto-plugins/evm and
 * crypto-plugins/tron. The only things that differ between the two:
 *
 *   1. How a topic-encoded address is decoded into a display address
 *      (Tron: 0x hex -> T...Base58Check; EVM: lowercased 0x hex).
 *   2. How a watched address is encoded for the topic filter
 *      (Tron: T... -> hex; EVM: lowercased hex).
 *   3. Cosmetic identity (watcherId prefix).
 *
 * Subclasses implement `parseTransferLog()` and `encodeWatchedAddress()` and
 * declare a `watcherIdPrefix`. Everything else — cursor semantics, per-poll
 * oracle fetch, confirmation dedup, pending-block handling — is shared and
 * must stay byte-for-byte identical to the existing watchers. handlePayment
 * (watcher-service.ts) still owns the cumulative-cents accumulation.
 */
export abstract class BaseEvmLikeWatcher implements IChainWatcher {
  protected _cursor = 0;
  protected _stopped = false;
  protected readonly chain: string;
  protected readonly token: string;
  protected readonly rpc: RpcCall;
  protected readonly confirmations: number;
  protected readonly contractAddress: string;
  protected readonly decimals: number;
  protected readonly cursorStore: IWatcherCursorStore;
  protected readonly priceReader: IPriceReader;
  protected readonly watcherId: string;
  /** Hex-encoded addresses used for the topic[2] filter. */
  protected _watchedFilterAddresses: string[] = [];

  /** Prefix for the watcherId (e.g. "evm", "tron"). */
  protected abstract readonly watcherIdPrefix: string;

  constructor(opts: BaseEvmLikeWatcherOpts) {
    this.chain = opts.chain;
    this.token = opts.token;
    this.rpc = opts.rpc ?? createRpcCaller(opts.rpcUrl, opts.rpcHeaders);
    this.confirmations = opts.confirmations;
    this.contractAddress = (opts.contractAddress ?? "").toLowerCase();
    this.decimals = opts.decimals;
    this.cursorStore = opts.cursorStore;
    this.priceReader = opts.priceReader;
    // watcherId has to be built from a method return rather than the
    // abstract field, because in JS the abstract-marked field is only
    // initialized after super() — at constructor-time it's still undefined.
    this.watcherId = `${this.buildWatcherIdPrefix()}:${opts.chain}:${opts.token}`;
  }

  /**
   * Returns the watcher ID prefix. Subclass overrides this (cannot use the
   * abstract field directly in super() since the subclass initializer runs
   * after super). Value must be a literal string.
   */
  protected abstract buildWatcherIdPrefix(): string;

  /**
   * Parse a single RpcLog into display-layer from/to/rawAmount. Subclass
   * owns chain-specific address decoding (Tron maps hex -> T..., EVM just
   * lowercases hex). Must NOT call RPC — all network I/O is in poll().
   */
  protected abstract parseTransferLog(log: RpcLog): ParsedTransferLog;

  /**
   * Convert a watched address as provided by the caller into the hex form
   * used in the topic[2] filter. EVM lowercases it, Tron decodes T... to hex.
   */
  protected abstract encodeWatchedAddress(address: string): string;

  /** Hook called from setWatchedAddresses before filter list is populated. */
  protected onWatchedAddressesChanged(_addresses: string[]): void {
    // default no-op — Tron subclass uses this to rebuild its hex->T... map
  }

  async init(): Promise<void> {
    const saved = await this.cursorStore.get(this.watcherId);
    if (saved !== null) this._cursor = saved;
  }

  setWatchedAddresses(addresses: string[]): void {
    this.onWatchedAddressesChanged(addresses);
    this._watchedFilterAddresses = addresses.map((a) => this.encodeWatchedAddress(a).toLowerCase());
  }

  getCursor(): number {
    return this._cursor;
  }

  stop(): void {
    this._stopped = true;
  }

  /**
   * Poll loop. Mirrors the existing EVM/Tron watchers byte-for-byte:
   *
   *   - eth_blockNumber -> latest
   *   - if latest < cursor: bail
   *   - oracle.getPrice() exactly once per poll (NOT per log)
   *   - eth_getLogs over [cursor, latest] filtered by Transfer topic + watched to[]
   *   - group by block, ascending
   *   - per log: skip if already emitted at >= current conf count, else emit
   *     and saveConfirmationCount
   *   - advance cursor past any block <= (latest - confirmations)
   *   - if no logs at all but confirmed blocks exist, jump cursor to confirmed+1
   */
  async poll(): Promise<PaymentEvent[]> {
    if (this._stopped || this._watchedFilterAddresses.length === 0) return [];

    const latestHex = (await this.rpc("eth_blockNumber", [])) as string;
    const latest = Number.parseInt(latestHex, 16);
    const confirmed = latest - this.confirmations;

    if (latest < this._cursor) return [];

    // Oracle called exactly once per poll — used to convert every log's
    // rawAmount into cents. Per-log conversion would blow through rate limits.
    const { priceMicros } = await this.priceReader.getPrice(this.token);

    const toFilter =
      this._watchedFilterAddresses.length > 0
        ? this._watchedFilterAddresses.map((a) => `0x000000000000000000000000${a.slice(2)}`)
        : null;

    const logs = (await this.rpc("eth_getLogs", [
      {
        address: this.contractAddress,
        topics: [TRANSFER_TOPIC, null, toFilter],
        fromBlock: `0x${this._cursor.toString(16)}`,
        toBlock: `0x${latest.toString(16)}`,
      },
    ])) as RpcLog[];

    // Group logs by block so we can advance the cursor on a per-block
    // boundary (partial-block advancement would lose dedup on re-poll).
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

        const parsed = this.parseTransferLog(log);
        const amountUsdCents = nativeToCents(parsed.rawAmount, priceMicros, this.decimals);

        events.push({
          chain: this.chain,
          token: this.token,
          from: parsed.from,
          to: parsed.to,
          rawAmount: parsed.rawAmount.toString(),
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

    if (blockNums.length === 0 && confirmed >= this._cursor) {
      this._cursor = confirmed + 1;
      await this.cursorStore.save(this.watcherId, this._cursor);
    }

    return events;
  }
}
