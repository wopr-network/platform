import type {
  IChainWatcher,
  IPriceOracle,
  IWatcherCursorStore,
  PaymentEvent,
  WatcherOpts,
} from "@wopr-network/platform-crypto-server/plugin";
import { nativeToCents } from "../../oracle/convert.js";
import type { RpcCall, RpcLog } from "./types.js";

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** Create an RPC caller for a given URL (plain JSON-RPC over fetch). */
export function createRpcCaller(rpcUrl: string, extraHeaders?: Record<string, string>): RpcCall {
  let id = 0;
  const headers: Record<string, string> = { "Content-Type": "application/json", ...extraHeaders };
  return async (method: string, params: unknown[]): Promise<unknown> => {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    if (!res.ok) {
      const _body = await res.text().catch(() => "");
      const _hasApiKey = "TRON-PRO-API-KEY" in headers;
      throw new Error(`RPC ${method} failed: ${res.status}`);
    }
    const data = (await res.json()) as { result?: unknown; error?: { message: string } };
    if (data.error) throw new Error(`RPC ${method} error: ${data.error.message}`);
    return data.result;
  };
}

// Use the shared nativeToCents from oracle/convert.ts. The old
// centsFromTokenAmount helper assumed every ERC-20 is a 1:1-pegged
// stablecoin — correct for USDC/USDT/DAI, wildly wrong for LINK/UNI/WETH.
// nativeToCents takes an oracle price in microdollars (10^-6 USD per
// whole token) and returns proper USD cents. Stablecoins still work:
// their oracle returns priceMicros ≈ 1_000_000 (=$1.000000).

/**
 * ERC-20 Transfer log scanner.
 *
 * Scans from cursor to latest block for Transfer events matching watched
 * deposit addresses. Emits events with current confirmation count. Re-emits
 * on each confirmation increment. Only advances cursor past fully-confirmed blocks.
 */
export class EvmWatcher implements IChainWatcher {
  private _cursor = 0;
  private _stopped = false;
  private readonly chain: string;
  private readonly token: string;
  private readonly rpc: RpcCall;
  private readonly confirmations: number;
  private readonly contractAddress: string;
  private readonly decimals: number;
  private readonly cursorStore: IWatcherCursorStore;
  private readonly oracle: IPriceOracle;
  private readonly watcherId: string;
  private _watchedAddresses: string[];

  constructor(opts: WatcherOpts) {
    this.chain = opts.chain;
    this.token = opts.token;
    this.rpc = createRpcCaller(opts.rpcUrl, opts.rpcHeaders);
    this._cursor = 0;
    this.confirmations = opts.confirmations;
    this.contractAddress = (opts.contractAddress ?? "").toLowerCase();
    this.decimals = opts.decimals;
    this.cursorStore = opts.cursorStore;
    this.oracle = opts.oracle;
    this.watcherId = `evm:${opts.chain}:${opts.token}`;
    this._watchedAddresses = [];
  }

  async init(): Promise<void> {
    const saved = await this.cursorStore.get(this.watcherId);
    if (saved !== null) this._cursor = saved;
  }

  setWatchedAddresses(addresses: string[]): void {
    this._watchedAddresses = addresses.map((a) => a.toLowerCase());
  }

  getCursor(): number {
    return this._cursor;
  }

  stop(): void {
    this._stopped = true;
  }

  /**
   * Poll for ERC-20 Transfer events, including pending (unconfirmed) blocks.
   *
   * Two-phase scan:
   *   1. Scan cursor..latest for new/updated txs, emit with current confirmation count
   *   2. Re-check pending txs automatically since cursor doesn't advance past unconfirmed blocks
   *
   * Cursor only advances past fully-confirmed blocks.
   *
   * Returns PaymentEvent[] instead of using callbacks.
   */
  async poll(): Promise<PaymentEvent[]> {
    if (this._stopped || this._watchedAddresses.length === 0) return [];

    const latestHex = (await this.rpc("eth_blockNumber", [])) as string;
    const latest = Number.parseInt(latestHex, 16);
    const confirmed = latest - this.confirmations;

    if (latest < this._cursor) return [];

    // Fetch the current USD price for this token once per poll. Used to
    // convert the raw ERC-20 amount into USD cents for webhook/display.
    // The raw-native amount comparison in handlePayment (watcher-service.ts)
    // is unaffected — credits fire based on native units, not cents.
    const { priceMicros } = await this.oracle.getPrice(this.token);

    // Filter by topic[2] (to address) when watched addresses are set.
    const toFilter =
      this._watchedAddresses.length > 0
        ? this._watchedAddresses.map((a) => `0x000000000000000000000000${a.slice(2)}`)
        : null;

    // Scan from cursor to latest (not just confirmed) to detect pending txs
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

    // Process all blocks (including unconfirmed), emit with confirmation count
    const blockNums = [...logsByBlock.keys()].sort((a, b) => a - b);
    for (const blockNum of blockNums) {
      const confs = latest - blockNum;

      for (const log of logsByBlock.get(blockNum) ?? []) {
        const txKey = `${log.transactionHash}:${log.logIndex}`;

        // Skip if we already emitted at this confirmation count
        const lastConf = await this.cursorStore.getConfirmationCount(this.watcherId, txKey);
        if (lastConf !== null && confs <= lastConf) continue;

        const to = `0x${log.topics[2].slice(26)}`.toLowerCase();
        const from = `0x${log.topics[1].slice(26)}`.toLowerCase();
        const rawAmount = BigInt(log.data);
        const amountUsdCents = nativeToCents(rawAmount, priceMicros, this.decimals);

        events.push({
          chain: this.chain,
          token: this.token,
          from,
          to,
          rawAmount: rawAmount.toString(),
          amountUsdCents,
          txHash: log.transactionHash,
          blockNumber: blockNum,
          confirmations: confs,
          confirmationsRequired: this.confirmations,
        });

        // Track confirmation count
        await this.cursorStore.saveConfirmationCount(this.watcherId, txKey, confs);
      }

      // Only advance cursor past fully-confirmed blocks
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
