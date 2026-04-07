import type {
	IChainPlugin,
	ISweepStrategy,
	SweeperOpts,
	WatcherOpts,
} from "@wopr-network/platform-crypto-server/plugin";
import { TonAddressEncoder } from "./encoder.js";
import { TonWatcher } from "./watcher.js";

export { encodeTonAddress, TonAddressEncoder } from "./encoder.js";
export type { JettonTransferV3, TonAccountState, TonApiCall, TonTransaction } from "./types.js";
export { createTonApiCaller, TonWatcher } from "./watcher.js";

const encoder = new TonAddressEncoder();

/**
 * TON (The Open Network) chain plugin.
 *
 * Supports native TON watching. Jetton (USDT, etc.) support can be added
 * by extending the watcher to parse Jetton transfer notifications.
 *
 * Uses Ed25519 curve for key derivation. Addresses are base64url-encoded
 * with CRC16 checksum (TON user-friendly format).
 *
 * The watcher polls TON Center API v2 for incoming transactions.
 * No local node required — uses hosted API endpoint.
 */
export const tonPlugin: IChainPlugin = {
	pluginId: "ton",
	supportedCurve: "ed25519",
	encoders: {
		"ton-base64url": encoder,
	},
	createWatcher(opts: WatcherOpts) {
		return new TonWatcher(opts);
	},
	createSweeper(_opts: SweeperOpts): ISweepStrategy {
		throw new Error("TON sweep not yet implemented — requires wallet contract deployment");
	},
	version: 1,
};
