import type { EncodingParams, IAddressEncoder } from "@wopr-network/platform-crypto-server/plugin";

/** Base58 alphabet used by Bitcoin/Solana. */
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/**
 * Encode a Uint8Array as a Base58 string (Bitcoin/Solana alphabet).
 *
 * This is a standalone implementation — no external dependency needed.
 */
export function base58Encode(bytes: Uint8Array): string {
	// Count leading zeros
	let zeros = 0;
	for (let i = 0; i < bytes.length && bytes[i] === 0; i++) {
		zeros++;
	}

	// Convert to base58
	// Allocate enough space in big-endian base58 representation
	const size = Math.ceil((bytes.length * 138) / 100) + 1;
	const b58 = new Uint8Array(size);

	for (let i = zeros; i < bytes.length; i++) {
		let carry = bytes[i];
		for (let j = size - 1; j >= 0; j--) {
			carry += 256 * b58[j];
			b58[j] = carry % 58;
			carry = Math.floor(carry / 58);
		}
	}

	// Skip leading zeros in base58 result
	let start = 0;
	while (start < size && b58[start] === 0) {
		start++;
	}

	// Build string: leading '1's for zero bytes + base58 digits
	let result = "";
	for (let i = 0; i < zeros; i++) {
		result += ALPHABET[0];
	}
	for (let i = start; i < size; i++) {
		result += ALPHABET[b58[i]];
	}

	return result;
}

/**
 * Derive a Solana address from a raw 32-byte Ed25519 public key.
 *
 * Solana addresses are simply the Base58 encoding of the raw public key.
 * No hashing, no version byte, no checksum.
 */
function encodeSolana(pubkey: Uint8Array): string {
	if (pubkey.length !== 32) {
		throw new Error(`Solana address requires 32-byte Ed25519 public key, got ${pubkey.length} bytes`);
	}
	return base58Encode(pubkey);
}

/** Solana address encoder implementing IAddressEncoder. */
export class SolanaAddressEncoder implements IAddressEncoder {
	encode(publicKey: Uint8Array, _params: EncodingParams): string {
		return encodeSolana(publicKey);
	}

	encodingType(): string {
		return "base58-solana";
	}
}
