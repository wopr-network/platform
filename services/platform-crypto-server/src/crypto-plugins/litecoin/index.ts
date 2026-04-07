import type { IChainPlugin, WatcherOpts } from "@wopr-network/platform-crypto-server/plugin";

import { createRpcFromOpts } from "../shared/utxo/index.js";
import { createUtxoWatcher } from "../shared/utxo/watcher.js";
import { bech32Encoder } from "./encoder.js";

export { bech32Encoder } from "./encoder.js";

export const litecoinPlugin: IChainPlugin = {
	pluginId: "litecoin",
	supportedCurve: "secp256k1",
	encoders: {
		bech32: bech32Encoder,
	},
	createWatcher(opts: WatcherOpts) {
		const rpc = createRpcFromOpts(opts.rpcUrl, opts.rpcHeaders);
		return createUtxoWatcher(opts, rpc);
	},
	createSweeper() {
		throw new Error("Not implemented");
	},
	version: 1,
};
