import type { IChainPlugin, SweeperOpts, WatcherOpts } from "@wopr-network/platform-crypto-server/plugin";
import { EvmAddressEncoder } from "./encoder.js";
import { EthWatcher } from "./eth-watcher.js";
import { EvmWatcher } from "./watcher.js";

export { EvmAddressEncoder } from "./encoder.js";
export { EthWatcher } from "./eth-watcher.js";
export type {
	ChainConfig,
	EvmChain,
	RpcCall,
	RpcLog,
	RpcTransaction,
	StablecoinToken,
	TokenConfig,
} from "./types.js";
export { DEFAULT_CHAINS, DEFAULT_TOKENS } from "./types.js";
export { createRpcCaller, EvmWatcher } from "./watcher.js";

const encoder = new EvmAddressEncoder();

/**
 * EVM chain plugin.
 *
 * Supports ERC-20 stablecoin watching (EvmWatcher) and native ETH watching (EthWatcher).
 * The watcher created depends on whether a contractAddress is provided in opts:
 *   - With contractAddress: EvmWatcher (ERC-20 Transfer log scanner)
 *   - Without contractAddress: EthWatcher (native ETH block scanner)
 */
export const evmPlugin: IChainPlugin = {
	pluginId: "evm",
	supportedCurve: "secp256k1",
	encoders: {
		evm: encoder,
	},
	createWatcher(opts: WatcherOpts) {
		if (opts.contractAddress) {
			return new EvmWatcher(opts);
		}
		return new EthWatcher(opts);
	},
	createSweeper(_opts: SweeperOpts) {
		throw new Error("Not implemented — EVM sweeper is planned for Phase 3");
	},
	version: 1,
};
