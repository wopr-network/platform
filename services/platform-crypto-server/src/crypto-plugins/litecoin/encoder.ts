import type { EncodingParams, IAddressEncoder } from "@wopr-network/platform-crypto-server/plugin";

import { encodeBech32Address } from "../bitcoin/encoder.js";

/**
 * Litecoin bech32 address encoder.
 * Implements IAddressEncoder for the litecoin plugin.
 * Default HRP is "ltc" (mainnet). Override with params.hrp for testnet ("tltc").
 */
export const bech32Encoder: IAddressEncoder = {
	encode(publicKey: Uint8Array, params: EncodingParams): string {
		const hrp = params.hrp ?? "ltc";
		return encodeBech32Address(publicKey, hrp);
	},
	encodingType(): string {
		return "bech32";
	},
};
