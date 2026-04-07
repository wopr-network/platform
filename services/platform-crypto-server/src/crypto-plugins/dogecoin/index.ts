import type { IChainPlugin, WatcherOpts } from "@wopr-network/platform-crypto-server/plugin";

import { createRpcFromOpts } from "../shared/utxo/index.js";
import { createUtxoWatcher } from "../shared/utxo/watcher.js";
import { p2pkhEncoder } from "./encoder.js";

export { encodeP2pkhAddress, p2pkhEncoder } from "./encoder.js";

export const dogecoinPlugin: IChainPlugin = {
	pluginId: "dogecoin",
	supportedCurve: "secp256k1",
	encoders: {
		p2pkh: p2pkhEncoder,
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
