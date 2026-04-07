import type { IChainPlugin, SweeperOpts, WatcherOpts } from "@wopr-network/platform-crypto-server/plugin";
import { SolanaAddressEncoder } from "./encoder.js";
import { SolanaSweeper } from "./sweeper.js";
import { SolanaWatcher } from "./watcher.js";

export { base58Encode, SolanaAddressEncoder } from "./encoder.js";
export { SolanaSweeper } from "./sweeper.js";
export type { SignatureInfo, SolanaRpcCall, SolanaTransaction, TokenBalance, TransactionMeta } from "./types.js";
export { createSolanaRpcCaller, SolanaWatcher } from "./watcher.js";

const encoder = new SolanaAddressEncoder();

/**
 * Solana chain plugin.
 *
 * Supports native SOL watching and SPL token watching (e.g. USDC).
 * Uses Ed25519 curve for key derivation. Addresses are Base58-encoded
 * raw 32-byte public keys (no hashing, no checksum).
 *
 * The watcher detects incoming transfers by scanning transaction history
 * for each watched address via getSignaturesForAddress + getTransaction.
 */
export const solanaPlugin: IChainPlugin = {
	pluginId: "solana",
	supportedCurve: "ed25519",
	encoders: {
		"base58-solana": encoder,
	},
	createWatcher(opts: WatcherOpts) {
		return new SolanaWatcher(opts);
	},
	createSweeper(opts: SweeperOpts) {
		return new SolanaSweeper(opts);
	},
	version: 1,
};
