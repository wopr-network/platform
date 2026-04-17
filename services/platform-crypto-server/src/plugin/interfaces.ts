// src/billing/crypto/plugin/interfaces.ts

export interface PaymentEvent {
  chain: string;
  token: string;
  from: string;
  to: string;
  rawAmount: string;
  amountUsdCents: number;
  txHash: string;
  blockNumber: number;
  confirmations: number;
  confirmationsRequired: number;
}

export interface ICurveDeriver {
  derivePublicKey(chainIndex: number, addressIndex: number): Uint8Array;
  getCurve(): "secp256k1" | "ed25519";
}

export interface EncodingParams {
  hrp?: string;
  version?: string;
  /** Network-variant flag (e.g., TON testnet). Chains that don't need it ignore this. */
  testnet?: boolean;
  [key: string]: string | boolean | undefined;
}

export interface IAddressEncoder {
  encode(publicKey: Uint8Array, params: EncodingParams): string;
  encodingType(): string;
}

export interface KeyPair {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
  address: string;
  index: number;
}

export interface DepositInfo {
  index: number;
  address: string;
  nativeBalance: bigint;
  tokenBalances: Array<{ token: string; balance: bigint; decimals: number }>;
}

export interface SweepResult {
  index: number;
  address: string;
  token: string;
  amount: string;
  txHash: string;
}

export interface ISweepStrategy {
  scan(keys: KeyPair[], treasury: string): Promise<DepositInfo[]>;
  sweep(keys: KeyPair[], treasury: string, dryRun: boolean): Promise<SweepResult[]>;
}

/**
 * The hot path's single way to look up a price.
 *
 * One path. Always returns a price. Callers do not try/catch this.
 * Implementations read from the `prices` DB table (populated by the refresher).
 * They MUST NOT call an external API. If no row exists for the token, that is
 * a system-invariant violation (gate at `/charges` should make it unreachable)
 * and the process should fail loudly.
 *
 * Note: `feedAddress` is ignored by DB-backed readers and retained only for
 * signature compatibility with legacy call sites.
 */
export interface IPriceReader {
  getPrice(token: string, feedAddress?: string): Promise<{ priceMicros: number }>;
}

export interface IWatcherCursorStore {
  get(watcherId: string): Promise<number | null>;
  save(watcherId: string, cursor: number): Promise<void>;
  getConfirmationCount(watcherId: string, txKey: string): Promise<number | null>;
  saveConfirmationCount(watcherId: string, txKey: string, count: number): Promise<void>;
}

export interface WatcherOpts {
  rpcUrl: string;
  rpcHeaders: Record<string, string>;
  priceReader: IPriceReader;
  cursorStore: IWatcherCursorStore;
  token: string;
  chain: string;
  contractAddress?: string;
  decimals: number;
  confirmations: number;
  /** Maximum block range per eth_getLogs call. Prevents RPC range-limit errors on public nodes. */
  maxBlockRange?: number;
}

export interface SweeperOpts {
  rpcUrl: string;
  rpcHeaders: Record<string, string>;
  token: string;
  chain: string;
  contractAddress?: string;
  decimals: number;
}

export interface IChainWatcher {
  init(): Promise<void>;
  poll(): Promise<PaymentEvent[]>;
  setWatchedAddresses(addresses: string[]): void;
  getCursor(): number;
  stop(): void;
}

export interface IChainPlugin {
  pluginId: string;
  supportedCurve: "secp256k1" | "ed25519";
  encoders: Record<string, IAddressEncoder>;
  createWatcher(opts: WatcherOpts): IChainWatcher;
  createSweeper(opts: SweeperOpts): ISweepStrategy;
  version: number;
}
