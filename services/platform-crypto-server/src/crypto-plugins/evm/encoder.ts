import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import type { EncodingParams, IAddressEncoder } from "@wopr-network/platform-crypto-server/plugin";

// secp256k1.Point exists at runtime but the ECDSA TS type doesn't expose it.
// Access via the schnorr sub-object which does have the Point type.
const Point = (secp256k1 as unknown as { Point: { fromHex(h: string): { toBytes(c: boolean): Uint8Array } } }).Point;

/**
 * Derive an EVM (0x...) address from a compressed SEC1 public key.
 *
 * Steps:
 *   1. Decompress the 33-byte compressed pubkey to 65-byte uncompressed
 *   2. Take keccak256 of the uncompressed key (without the 0x04 prefix byte)
 *   3. Take the last 20 bytes as the address
 *   4. Apply EIP-55 mixed-case checksum
 */
function toHex(bytes: Uint8Array): string {
	return Array.from(bytes as unknown as number[], (b: number) => b.toString(16).padStart(2, "0")).join("");
}

function encodeEvm(pubkey: Uint8Array): string {
	const hexKey = toHex(pubkey);
	const uncompressed = Point.fromHex(hexKey).toBytes(false);
	// keccak256 of uncompressed key without the 04 prefix
	const hash = keccak_256(uncompressed.slice(1));
	const addressBytes = hash.slice(-20);
	const rawHex = toHex(addressBytes);

	// EIP-55 checksum
	const hashHex = toHex(keccak_256(new TextEncoder().encode(rawHex)));
	let checksummed = "0x";
	for (let i = 0; i < rawHex.length; i++) {
		const c = rawHex[i];
		checksummed += Number.parseInt(hashHex[i], 16) >= 8 ? c.toUpperCase() : c;
	}
	return checksummed;
}

/** EVM address encoder implementing IAddressEncoder. */
export class EvmAddressEncoder implements IAddressEncoder {
	encode(publicKey: Uint8Array, _params: EncodingParams): string {
		return encodeEvm(publicKey);
	}

	encodingType(): string {
		return "evm";
	}
}
