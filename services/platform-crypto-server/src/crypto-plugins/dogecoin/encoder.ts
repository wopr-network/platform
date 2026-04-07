import type { EncodingParams, IAddressEncoder } from "@wopr-network/platform-crypto-server/plugin";

import { hash160 } from "../bitcoin/encoder.js";

// ---------- Base58Check encoding ----------

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

/**
 * SHA-256 (pure implementation, duplicated from bitcoin encoder to avoid
 * re-exporting the internal function — hash160 is already exported).
 */
function sha256(data: Uint8Array): Uint8Array {
	const K: number[] = [
		0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98,
		0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
		0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8,
		0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
		0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
		0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
		0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
		0xc67178f2,
	];

	const msgLen = data.length;
	const bitLen = msgLen * 8;
	const padLen = ((msgLen + 9 + 63) & ~63) - msgLen;
	const padded = new Uint8Array(msgLen + padLen);
	padded.set(data);
	padded[msgLen] = 0x80;
	const view = new DataView(padded.buffer);
	view.setUint32(padded.length - 4, bitLen, false);

	let h0 = 0x6a09e667;
	let h1 = 0xbb67ae85;
	let h2 = 0x3c6ef372;
	let h3 = 0xa54ff53a;
	let h4 = 0x510e527f;
	let h5 = 0x9b05688c;
	let h6 = 0x1f83d9ab;
	let h7 = 0x5be0cd19;

	const w = new Int32Array(64);

	for (let offset = 0; offset < padded.length; offset += 64) {
		for (let i = 0; i < 16; i++) {
			w[i] = view.getInt32(offset + i * 4, false);
		}
		for (let i = 16; i < 64; i++) {
			const s0 = (ror32(w[i - 15]!, 7) ^ ror32(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3)) | 0;
			const s1 = (ror32(w[i - 2]!, 17) ^ ror32(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10)) | 0;
			w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
		}

		let a = h0;
		let b = h1;
		let c = h2;
		let d = h3;
		let e = h4;
		let f = h5;
		let g = h6;
		let h = h7;

		for (let i = 0; i < 64; i++) {
			const S1 = (ror32(e, 6) ^ ror32(e, 11) ^ ror32(e, 25)) | 0;
			const ch = ((e & f) ^ (~e & g)) | 0;
			const temp1 = (h + S1 + ch + K[i]! + w[i]!) | 0;
			const S0 = (ror32(a, 2) ^ ror32(a, 13) ^ ror32(a, 22)) | 0;
			const maj = ((a & b) ^ (a & c) ^ (b & c)) | 0;
			const temp2 = (S0 + maj) | 0;

			h = g;
			g = f;
			f = e;
			e = (d + temp1) | 0;
			d = c;
			c = b;
			b = a;
			a = (temp1 + temp2) | 0;
		}

		h0 = (h0 + a) | 0;
		h1 = (h1 + b) | 0;
		h2 = (h2 + c) | 0;
		h3 = (h3 + d) | 0;
		h4 = (h4 + e) | 0;
		h5 = (h5 + f) | 0;
		h6 = (h6 + g) | 0;
		h7 = (h7 + h) | 0;
	}

	const result = new Uint8Array(32);
	const rv = new DataView(result.buffer);
	rv.setInt32(0, h0, false);
	rv.setInt32(4, h1, false);
	rv.setInt32(8, h2, false);
	rv.setInt32(12, h3, false);
	rv.setInt32(16, h4, false);
	rv.setInt32(20, h5, false);
	rv.setInt32(24, h6, false);
	rv.setInt32(28, h7, false);
	return result;
}

function ror32(x: number, n: number): number {
	return (x >>> n) | (x << (32 - n));
}

// ---------- P2PKH encoding ----------

/**
 * Encode a compressed public key as a P2PKH (Base58Check) address.
 * Used for DOGE (version 0x1e), etc.
 *
 * Steps:
 *   1. HASH160(pubkey) = RIPEMD-160(SHA-256(pubkey))
 *   2. Prepend version byte
 *   3. Append double-SHA-256 checksum (first 4 bytes)
 *   4. Base58 encode
 */
export function encodeP2pkhAddress(publicKey: Uint8Array, versionByte: number): string {
	const h = hash160(publicKey);
	const payload = new Uint8Array(21);
	payload[0] = versionByte;
	payload.set(h, 1);
	const checksum = sha256(sha256(payload));
	const full = new Uint8Array(25);
	full.set(payload);
	full.set(checksum.slice(0, 4), 21);
	return base58encode(full);
}

/**
 * Dogecoin P2PKH address encoder.
 * Implements IAddressEncoder for the dogecoin plugin.
 * Default version byte is 0x1e (30) for mainnet. Override with params.version.
 */
export const p2pkhEncoder: IAddressEncoder = {
	encode(publicKey: Uint8Array, params: EncodingParams): string {
		const versionByte = params.version ? Number(params.version) : 0x1e;
		return encodeP2pkhAddress(publicKey, versionByte);
	},
	encodingType(): string {
		return "p2pkh";
	},
};
