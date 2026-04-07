import type { EncodingParams, IAddressEncoder } from "@wopr-network/platform-crypto-server/plugin";

// ---------- bech32 encoding (pure implementation, no external deps) ----------

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

const BECH32_GENERATOR = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function bech32Polymod(values: number[]): number {
	let chk = 1;
	for (const v of values) {
		const top = chk >> 25;
		chk = ((chk & 0x1ffffff) << 5) ^ v;
		for (let i = 0; i < 5; i++) {
			if ((top >> i) & 1) {
				chk ^= BECH32_GENERATOR[i]!;
			}
		}
	}
	return chk;
}

function bech32HrpExpand(hrp: string): number[] {
	const result: number[] = [];
	for (let i = 0; i < hrp.length; i++) {
		result.push(hrp.charCodeAt(i) >> 5);
	}
	result.push(0);
	for (let i = 0; i < hrp.length; i++) {
		result.push(hrp.charCodeAt(i) & 31);
	}
	return result;
}

function bech32CreateChecksum(hrp: string, data: number[]): number[] {
	const values = [...bech32HrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0];
	const polymod = bech32Polymod(values) ^ 1;
	const checksum: number[] = [];
	for (let i = 0; i < 6; i++) {
		checksum.push((polymod >> (5 * (5 - i))) & 31);
	}
	return checksum;
}

function bech32Encode(hrp: string, data: number[]): string {
	const combined = [...data, ...bech32CreateChecksum(hrp, data)];
	let result = `${hrp}1`;
	for (const d of combined) {
		result += BECH32_CHARSET[d];
	}
	return result;
}

/** Convert a byte array to 5-bit words (bech32 encoding). */
function toWords(bytes: Uint8Array): number[] {
	let value = 0;
	let bits = 0;
	const words: number[] = [];
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			bits -= 5;
			words.push((value >> bits) & 31);
		}
	}
	if (bits > 0) {
		words.push((value << (5 - bits)) & 31);
	}
	return words;
}

// ---------- hash160 (SHA-256 + RIPEMD-160) pure implementation ----------

/**
 * SHA-256 implementation (pure TypeScript).
 * Used for hash160 in address derivation.
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

	// Pre-processing: padding
	const msgLen = data.length;
	const bitLen = msgLen * 8;
	// Padding: 1 bit, then zeros, then 64-bit length
	const padLen = ((msgLen + 9 + 63) & ~63) - msgLen;
	const padded = new Uint8Array(msgLen + padLen);
	padded.set(data);
	padded[msgLen] = 0x80;
	// Write bit length as big-endian 64-bit at the end
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

/**
 * RIPEMD-160 implementation (pure TypeScript).
 * Used for hash160 in address derivation.
 */
function ripemd160(data: Uint8Array): Uint8Array {
	const msgLen = data.length;
	const bitLen = msgLen * 8;
	const padLen = ((msgLen + 9 + 63) & ~63) - msgLen;
	const padded = new Uint8Array(msgLen + padLen);
	padded.set(data);
	padded[msgLen] = 0x80;
	const view = new DataView(padded.buffer);
	view.setUint32(padded.length - 8, bitLen, true); // little-endian for RIPEMD

	let h0 = 0x67452301;
	let h1 = 0xefcdab89;
	let h2 = 0x98badcfe;
	let h3 = 0x10325476;
	let h4 = 0xc3d2e1f0;

	const RL = [
		0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8, 3, 10,
		14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12, 1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2, 4, 0, 5, 9, 7,
		12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13,
	];

	const RR = [
		5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12, 6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2, 15, 5,
		1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13, 8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14, 12, 15, 10, 4,
		1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11,
	];

	const SL = [
		11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8, 7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12, 11,
		13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5, 11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12, 9, 15,
		5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6,
	];

	const SR = [
		8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6, 9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11, 9,
		7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5, 15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8, 8, 5,
		12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11,
	];

	const KL = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e];
	const KR = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000];

	function f(j: number, x: number, y: number, z: number): number {
		if (j < 16) return x ^ y ^ z;
		if (j < 32) return (x & y) | (~x & z);
		if (j < 48) return (x | ~y) ^ z;
		if (j < 64) return (x & z) | (y & ~z);
		return x ^ (y | ~z);
	}

	function rol32(x: number, n: number): number {
		return (x << n) | (x >>> (32 - n));
	}

	for (let offset = 0; offset < padded.length; offset += 64) {
		const x: number[] = [];
		for (let i = 0; i < 16; i++) {
			x.push(view.getInt32(offset + i * 4, true)); // little-endian
		}

		let al = h0;
		let bl = h1;
		let cl = h2;
		let dl = h3;
		let el = h4;
		let ar = h0;
		let br = h1;
		let cr = h2;
		let dr = h3;
		let er = h4;

		for (let j = 0; j < 80; j++) {
			const round = j >> 4;
			let t = (al + f(j, bl, cl, dl) + x[RL[j]!]! + KL[round]!) | 0;
			t = (rol32(t, SL[j]!) + el) | 0;
			al = el;
			el = dl;
			dl = rol32(cl, 10);
			cl = bl;
			bl = t;

			t = (ar + f(79 - j, br, cr, dr) + x[RR[j]!]! + KR[round]!) | 0;
			t = (rol32(t, SR[j]!) + er) | 0;
			ar = er;
			er = dr;
			dr = rol32(cr, 10);
			cr = br;
			br = t;
		}

		const t = (h1 + cl + dr) | 0;
		h1 = (h2 + dl + er) | 0;
		h2 = (h3 + el + ar) | 0;
		h3 = (h4 + al + br) | 0;
		h4 = (h0 + bl + cr) | 0;
		h0 = t;
	}

	const result = new Uint8Array(20);
	const rv = new DataView(result.buffer);
	rv.setInt32(0, h0, true);
	rv.setInt32(4, h1, true);
	rv.setInt32(8, h2, true);
	rv.setInt32(12, h3, true);
	rv.setInt32(16, h4, true);
	return result;
}

/** HASH160 = RIPEMD-160(SHA-256(data)). Standard Bitcoin address hash. */
export function hash160(data: Uint8Array): Uint8Array {
	return ripemd160(sha256(data));
}

/**
 * Encode a compressed public key as a bech32 (SegWit v0) address.
 * Used for BTC (hrp="bc"), LTC (hrp="ltc"), etc.
 */
export function encodeBech32Address(publicKey: Uint8Array, hrp: string): string {
	const h = hash160(publicKey);
	const words = toWords(h);
	// witness version 0 prefix
	return bech32Encode(hrp, [0, ...words]);
}

/**
 * Bitcoin bech32 address encoder.
 * Implements IAddressEncoder for the bitcoin plugin.
 * Default HRP is "bc" (mainnet). Override with params.hrp for testnet ("tb").
 */
export const bech32Encoder: IAddressEncoder = {
	encode(publicKey: Uint8Array, params: EncodingParams): string {
		const hrp = params.hrp ?? "bc";
		return encodeBech32Address(publicKey, hrp);
	},
	encodingType(): string {
		return "bech32";
	},
};
