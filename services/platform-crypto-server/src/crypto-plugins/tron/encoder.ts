import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import type { EncodingParams, IAddressEncoder } from "@wopr-network/platform-crypto-server/plugin";

import { sha256 } from "./sha256.js";

// secp256k1.Point exists at runtime but the ECDSA TS type doesn't expose it.
const Point = (secp256k1 as unknown as { Point: { fromHex(h: string): { toBytes(c: boolean): Uint8Array } } }).Point;

// ---------- Base58 encoding ----------

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58encode(data: Uint8Array): string {
	let num = 0n;
	for (const byte of data) num = num * 256n + BigInt(byte);
	let encoded = "";
	while (num > 0n) {
		encoded = BASE58_ALPHABET[Number(num % 58n)] + encoded;
		num = num / 58n;
	}
	for (const byte of data) {
		if (byte !== 0) break;
		encoded = `1${encoded}`;
	}
	return encoded;
}

function toHex(bytes: Uint8Array): string {
	return Array.from(bytes as unknown as number[], (b: number) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- Keccak-B58Check encoding ----------

/**
 * Encode a compressed public key as a Tron (keccak-b58check) address.
 *
 * Steps:
 *   1. Decompress SEC1 compressed pubkey to 65-byte uncompressed
 *   2. keccak256(uncompressed[1:]) — skip the 0x04 prefix
 *   3. Take last 20 bytes as address
 *   4. Prepend version byte (0x41 for Tron mainnet)
 *   5. Append double-SHA-256 checksum (first 4 bytes)
 *   6. Base58 encode
 */
export function encodeKeccakB58Address(publicKey: Uint8Array, versionByte: number): string {
	const hexKey = toHex(publicKey);
	const uncompressed = Point.fromHex(hexKey).toBytes(false);
	const hash = keccak_256(uncompressed.slice(1));
	const addressBytes = hash.slice(-20);
	const payload = new Uint8Array(21);
	payload[0] = versionByte;
	payload.set(addressBytes, 1);
	const checksum = sha256(sha256(payload));
	const full = new Uint8Array(25);
	full.set(payload);
	full.set(checksum.slice(0, 4), 21);
	return base58encode(full);
}

/**
 * Tron keccak-b58check address encoder.
 * Implements IAddressEncoder for the tron plugin.
 * Default version byte is 0x41 (65) for mainnet. Override with params.version.
 */
export const keccakB58Encoder: IAddressEncoder = {
	encode(publicKey: Uint8Array, params: EncodingParams): string {
		const versionByte = params.version ? Number(params.version) : 0x41;
		return encodeKeccakB58Address(publicKey, versionByte);
	},
	encodingType(): string {
		return "keccak-b58check";
	},
};
