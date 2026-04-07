import type { IChainPlugin, WatcherOpts } from "@wopr-network/platform-crypto-server/plugin";

import { keccakB58Encoder } from "./encoder.js";
import { TronEvmWatcher } from "./watcher.js";

export { hexToTron, isTronAddress, tronToHex } from "./address-convert.js";
export { encodeKeccakB58Address, keccakB58Encoder } from "./encoder.js";
export { TronEvmWatcher } from "./watcher.js";

export const tronPlugin: IChainPlugin = {
	pluginId: "tron",
	supportedCurve: "secp256k1",
	encoders: {
		"keccak-b58check": keccakB58Encoder,
	},
	createWatcher(opts: WatcherOpts) {
		return new TronEvmWatcher(opts);
	},
	createSweeper() {
		throw new Error("Not implemented");
	},
	version: 1,
};
