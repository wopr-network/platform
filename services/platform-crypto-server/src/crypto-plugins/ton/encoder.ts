import { createHash } from "node:crypto";
import type { EncodingParams, IAddressEncoder } from "@wopr-network/platform-crypto-server/plugin";

/**
 * TON WalletV4R2 address derivation — pure implementation, no @ton/ton SDK.
 *
 * Derives the correct TON wallet address from a 32-byte Ed25519 public key
 * by constructing the WalletV4R2 StateInit cell and computing its SHA-256
 * representation hash, exactly as the TON blockchain does.
 *
 * Algorithm:
 *   1. Deserialize the V4R2 contract code from its known BOC constant
 *   2. Build the initial data cell: seqno(0) + walletId + publicKey + emptyPlugins
 *   3. Build the StateInit cell with code + data refs
 *   4. SHA-256 the StateInit cell's representation to get the 32-byte address hash
 *   5. Encode as TON user-friendly base64url address
 *
 * Cell representation hash (TVM spec):
 *   hash = SHA256(d1 || d2 || paddedData || depth[0]..depth[n] || hash[0]..hash[n])
 *   d1 = refs_count + levelMask * 32    (refs descriptor)
 *   d2 = ceil(bits/8) + floor(bits/8)   (bits descriptor)
 *   paddedData = data bits + '1' + '0' padding to byte boundary
 *   depth = 2 bytes big-endian per ref
 *   hash = 32 bytes per ref (child cell hash)
 */

// ---------------------------------------------------------------------------
// WalletV4R2 contract code — clean BOC (standard format, no embedded hashes).
// Produced by @ton/ton Cell.toBoc() from the canonical FunC wallet v4r2 contract.
// This is identical across all TON wallet implementations.
// Format: 0xB5EE9C72 magic, 20 cells, CRC32C trailer.
// ---------------------------------------------------------------------------
const WALLET_V4R2_CODE_BOC_BASE64 =
	"te6cckECFAEAAtQAART/APSkE/S88sgLAQIBIAIPAgFIAwYC5tAB0NMDIXGwkl8E4CLXScEgkl8E4ALTHyGC" +
	"EHBsdWe9IoIQZHN0cr2wkl8F4AP6QDAg+kQByMoHy//J0O1E0IEBQNch9AQwXIEBCPQKb6Exs5JfB+AF0z/I" +
	"JYIQcGx1Z7qSODDjDQOCEGRzdHK6kl8G4w0EBQB4AfoA9AQw+CdvIjBQCqEhvvLgUIIQcGx1Z4MesXCAGFAE" +
	"ywUmzxZY+gIZ9ADLaRfLH1Jgyz8gyYBA+wAGAIpQBIEBCPRZMO1E0IEBQNcgyAHPFvQAye1UAXKwjiOCEGRz" +
	"dHKDHrFwgBhQBcsFUAPPFiP6AhPLassfyz/JgED7AJJfA+ICASAHDgIBIAgNAgFYCQoAPbKd+1E0IEBQNch9" +
	"AQwAsjKB8v/ydABgQEI9ApvoTGACASALDAAZrc52omhAIGuQ64X/wAAZrx32omhAEGuQ64WPwAARuMl+1E0Nc" +
	"LH4AFm9JCtvaiaECAoGuQ+gIYRw1AgIR6STfSmRDOaQPp/5g3gSgBt4EBSJhxWfMYQE+PKDCNcYINMf0x/T" +
	"HwL4I7vyZO1E0NMf0x/T//QE0VFDuvKhUVG68qIF+QFUEGT5EPKj+AAkpMjLH1JAyx9SMMv/UhD0AMntVPgP" +
	"AdMHIcAAn2xRkyDXSpbTB9QC+wDoMOAhwAHjACHAAuMAAcADkTDjDQOkyMsfEssfy/8QERITAG7SB/oA1NQi" +
	"+QAFyMoHFcv/ydB3dIAYyMsFywIizxZQBfoCFMtrEszMyXP7AMhAFIEBCPRR8qcCAHCBAQjXGPoA0z/IVCBH" +
	"gQEI9FHyp4IQbm90ZXB0gBjIywXLAlAGzxZQBPoCFMtqEssfyz/Jc/sAAgBsgQEI1xj6ANM/MFIkgQEI9Fny" +
	"p4IQZHN0cnB0gBjIywXLAlAFzxZQA/oCE8tqyx8Syz/Jc/sAAAr0AMntVAj45Sg=";

/** Default sub-wallet ID for workchain 0 (698983191 = 0x29A9A317). */
const DEFAULT_WALLET_ID = 698983191;

// ---------------------------------------------------------------------------
// Minimal TVM Cell implementation — just enough to construct cells, compute
// their representation hashes, and deserialize BOC. No exotic cell support
// needed since wallet code/data/stateInit are all ordinary cells.
// ---------------------------------------------------------------------------

/** A TVM cell: bit data + up to 4 child refs. */
interface TvmCell {
	/** Raw data bits packed into bytes. */
	data: Uint8Array;
	/** Number of data bits (may not be byte-aligned). */
	bitLength: number;
	/** Child cell references (0-4). */
	refs: TvmCell[];
}

/**
 * Compute the representation hash of an ordinary TVM cell.
 *
 * repr = d1 || d2 || paddedData || depth[0]..depth[n] || hash[0]..hash[n]
 * hash = SHA256(repr)
 *
 * For ordinary cells at level 0 with level-0 children (our case),
 * levelMask is always 0.
 */
function cellHash(cell: TvmCell): Uint8Array {
	const { data, bitLength, refs } = cell;

	// d1: refs descriptor = refs.length + levelMask * 32
	// For ordinary cells, levelMask = OR of all children's levelMask.
	// All our cells are level 0 (ordinary, no merkle/pruned), so levelMask = 0.
	const d1 = refs.length;

	// d2: bits descriptor = ceil(bits/8) + floor(bits/8)
	const d2 = Math.ceil(bitLength / 8) + Math.floor(bitLength / 8);

	// Padded data: bits + '1' + '0's to next byte boundary.
	// If already byte-aligned, no padding needed (padding count = 0).
	const dataByteLen = Math.ceil(bitLength / 8);
	const padded = new Uint8Array(dataByteLen);
	padded.set(data.subarray(0, dataByteLen));

	const remainder = bitLength % 8;
	if (remainder !== 0) {
		// Set the padding bit: the first bit after data is '1', rest '0'.
		// In the last byte, bits [0..remainder-1] are data, bit [remainder] = 1.
		padded[dataByteLen - 1] |= 1 << (7 - remainder);
		// Clear any bits after the padding '1' (they should be 0).
		const mask = 0xff << (7 - remainder);
		padded[dataByteLen - 1] &= mask;
	}

	// Build the representation buffer
	const reprSize = 2 + dataByteLen + refs.length * (2 + 32);
	const repr = new Uint8Array(reprSize);
	let cursor = 0;

	repr[cursor++] = d1;
	repr[cursor++] = d2;

	repr.set(padded, cursor);
	cursor += dataByteLen;

	// For each ref: 2 bytes big-endian depth
	for (const ref of refs) {
		const depth = cellDepth(ref);
		repr[cursor++] = (depth >> 8) & 0xff;
		repr[cursor++] = depth & 0xff;
	}

	// For each ref: 32-byte hash
	for (const ref of refs) {
		const h = cellHash(ref);
		repr.set(h, cursor);
		cursor += 32;
	}

	return sha256(repr);
}

/** Compute the depth of a cell tree (0 for leaf cells). */
function cellDepth(cell: TvmCell): number {
	if (cell.refs.length === 0) return 0;
	let maxChildDepth = 0;
	for (const ref of cell.refs) {
		const d = cellDepth(ref);
		if (d > maxChildDepth) maxChildDepth = d;
	}
	return maxChildDepth + 1;
}

/** SHA-256 using Node.js crypto. */
function sha256(data: Uint8Array): Uint8Array {
	return new Uint8Array(createHash("sha256").update(data).digest());
}

// ---------------------------------------------------------------------------
// Bit builder — writes individual bits and multi-bit integers into a buffer.
// ---------------------------------------------------------------------------

class BitBuilder {
	private _buf: Uint8Array;
	private _len = 0;

	constructor(capacity: number) {
		this._buf = new Uint8Array(Math.ceil(capacity / 8));
	}

	get length(): number {
		return this._len;
	}

	writeBit(value: boolean | number): void {
		if (value && value !== 0) {
			this._buf[this._len >> 3] |= 1 << (7 - (this._len & 7));
		}
		this._len++;
	}

	writeUint(value: number | bigint, bits: number): void {
		const v = BigInt(value);
		for (let i = bits - 1; i >= 0; i--) {
			this.writeBit(Number((v >> BigInt(i)) & 1n));
		}
	}

	writeBytes(src: Uint8Array): void {
		for (const byte of src) {
			this.writeUint(byte, 8);
		}
	}

	/** Return the accumulated data buffer and bit length as a cell. */
	build(refs: TvmCell[] = []): TvmCell {
		return {
			data: this._buf.slice(0, Math.ceil(this._len / 8)),
			bitLength: this._len,
			refs,
		};
	}
}

// ---------------------------------------------------------------------------
// BOC deserialization — minimal parser for the standard BOC format.
// Only supports the 0xB5EE9C72 magic (the format used by all wallet code BOCs).
// ---------------------------------------------------------------------------

function deserializeBoc(src: Uint8Array): TvmCell[] {
	let off = 0;

	function readUint(bytes: number): number {
		let v = 0;
		for (let i = 0; i < bytes; i++) {
			v = v * 256 + src[off++];
		}
		return v;
	}

	const magic = readUint(4);
	if (magic !== 0xb5ee9c72) {
		throw new Error(`Invalid BOC magic: 0x${magic.toString(16)}`);
	}

	const flagByte = src[off++];
	const hasIdx = (flagByte >> 7) & 1;
	// bits 6: hasCrc32c, bit 5: hasCacheBits, bits 3-4: flags
	const sizeBytes = flagByte & 7;
	const offBytes = src[off++];

	const cellCount = readUint(sizeBytes);
	const rootCount = readUint(sizeBytes);
	readUint(sizeBytes); // absent
	readUint(offBytes); // totalCellSize

	// Root indices
	const rootIndices: number[] = [];
	for (let i = 0; i < rootCount; i++) {
		rootIndices.push(readUint(sizeBytes));
	}

	// Skip index if present
	if (hasIdx) {
		off += cellCount * offBytes;
	}

	// Parse each cell's raw representation
	interface RawCell {
		data: Uint8Array;
		bitLength: number;
		refIndices: number[];
	}

	const rawCells: RawCell[] = [];
	for (let i = 0; i < cellCount; i++) {
		const d1 = src[off++];
		const refsCount = d1 & 7;
		const hasHashes = !!(d1 & 16);
		const levelMask = d1 >> 5;

		const d2 = src[off++];
		const dataByteSize = Math.ceil(d2 / 2);
		const paddingAdded = !!(d2 % 2);

		// Skip cached hashes/depths if present
		if (hasHashes) {
			let hashCount = 0;
			let m = levelMask & 7;
			for (let b = 0; b < 3; b++) {
				hashCount += m & 1;
				m >>= 1;
			}
			hashCount += 1;
			off += hashCount * 32; // hashes
			off += hashCount * 2; // depths
		}

		// Read data bits
		let bitLength: number;
		const cellData = new Uint8Array(dataByteSize);
		for (let b = 0; b < dataByteSize; b++) {
			cellData[b] = src[off++];
		}

		if (paddingAdded && dataByteSize > 0) {
			// Find the padding bit: last '1' bit from the right in the last byte
			const lastByte = cellData[dataByteSize - 1];
			if (lastByte === 0) {
				bitLength = (dataByteSize - 1) * 8;
			} else {
				// Find rightmost set bit
				let trailingZeros = 0;
				let tmp = lastByte;
				while ((tmp & 1) === 0) {
					trailingZeros++;
					tmp >>= 1;
				}
				// The '1' padding bit is at position trailingZeros from the right
				bitLength = dataByteSize * 8 - trailingZeros - 1;
			}
			// Clear the padding bits in the data (set padding bit and after to 0)
			const rem = bitLength % 8;
			if (rem !== 0) {
				cellData[dataByteSize - 1] &= 0xff << (8 - rem);
			} else if (bitLength < dataByteSize * 8) {
				cellData[dataByteSize - 1] = 0;
			}
		} else {
			bitLength = dataByteSize * 8;
		}

		// Read ref indices
		const refIndices: number[] = [];
		for (let r = 0; r < refsCount; r++) {
			refIndices.push(readUint(sizeBytes));
		}

		rawCells.push({ data: cellData, bitLength, refIndices });
	}

	// Build cells bottom-up (refs always point forward in BOC)
	const builtCells: TvmCell[] = new Array(cellCount);
	for (let i = cellCount - 1; i >= 0; i--) {
		const raw = rawCells[i];
		const refs: TvmCell[] = raw.refIndices.map((idx) => {
			if (!builtCells[idx]) throw new Error(`BOC: forward ref ${idx} not yet built`);
			return builtCells[idx];
		});
		builtCells[i] = {
			data: raw.data.slice(0, Math.ceil(raw.bitLength / 8)),
			bitLength: raw.bitLength,
			refs,
		};
	}

	// Ignore CRC32C validation (the constant is trusted)
	return rootIndices.map((i) => builtCells[i]);
}

// ---------------------------------------------------------------------------
// WalletV4R2 StateInit construction
// ---------------------------------------------------------------------------

/** Deserialize the V4R2 wallet contract code cell from the known BOC. */
function getWalletV4R2Code(): TvmCell {
	// Decode base64 to bytes
	const binaryStr = atob(WALLET_V4R2_CODE_BOC_BASE64);
	const bytes = new Uint8Array(binaryStr.length);
	for (let i = 0; i < binaryStr.length; i++) {
		bytes[i] = binaryStr.charCodeAt(i);
	}
	const cells = deserializeBoc(bytes);
	if (cells.length === 0) throw new Error("Empty BOC for wallet V4R2 code");
	return cells[0];
}

/**
 * Build the initial data cell for WalletV4R2.
 *
 * Layout (321 bits total):
 *   seqno:       uint32  = 0
 *   walletId:    uint32  = 698983191 (+ workchain for non-zero workchains)
 *   publicKey:   256 bits (32 bytes)
 *   plugins:     bit     = 0 (empty HashmapE)
 */
function buildWalletV4R2Data(publicKey: Uint8Array, walletId: number): TvmCell {
	const bb = new BitBuilder(321);
	bb.writeUint(0, 32); // seqno = 0
	bb.writeUint(walletId, 32); // sub-wallet ID
	bb.writeBytes(publicKey); // 32-byte Ed25519 public key
	bb.writeBit(0); // empty plugins dict (HashmapE = bit(0))
	return bb.build();
}

/**
 * Build the StateInit cell from code and data cells.
 *
 * TL-B schema (block.tlb#L141):
 *   _ split_depth:(Maybe (## 5)) special:(Maybe TickTock)
 *     code:(Maybe ^Cell) data:(Maybe ^Cell)
 *     library:(HashmapE 256 SimpleLib) = StateInit;
 *
 * For a standard wallet:
 *   split_depth = Nothing  -> bit(0)
 *   special     = Nothing  -> bit(0)
 *   code        = Just     -> bit(1) + ref(code)
 *   data        = Just     -> bit(1) + ref(data)
 *   library     = Empty    -> bit(0)
 *
 * Total: 5 bits = 0b00110, 2 refs = [code, data]
 */
function buildStateInit(code: TvmCell, data: TvmCell): TvmCell {
	const bb = new BitBuilder(5);
	bb.writeBit(0); // no split_depth
	bb.writeBit(0); // no special
	bb.writeBit(1); // has code
	bb.writeBit(1); // has data
	bb.writeBit(0); // no library
	return bb.build([code, data]);
}

/**
 * Derive the WalletV4R2 StateInit hash for a given Ed25519 public key.
 * This is the 32-byte hash used as the address in workchain:hash format.
 */
export function deriveWalletV4R2Hash(publicKey: Uint8Array, workchain = 0): Uint8Array {
	if (publicKey.length !== 32) {
		throw new Error(`Expected 32-byte Ed25519 public key, got ${publicKey.length}`);
	}
	const walletId = DEFAULT_WALLET_ID + workchain;
	const code = getWalletV4R2Code();
	const data = buildWalletV4R2Data(publicKey, walletId);
	const stateInit = buildStateInit(code, data);
	return cellHash(stateInit);
}

// ---------------------------------------------------------------------------
// User-friendly address encoding
// ---------------------------------------------------------------------------

/** CRC16-CCITT used by TON addresses. */
function crc16(data: Uint8Array): number {
	let crc = 0;
	for (let i = 0; i < data.length; i++) {
		crc ^= data[i] << 8;
		for (let j = 0; j < 8; j++) {
			if (crc & 0x8000) {
				crc = ((crc << 1) ^ 0x1021) & 0xffff;
			} else {
				crc = (crc << 1) & 0xffff;
			}
		}
	}
	return crc;
}

/** Base64url encode (no padding). */
function base64urlEncode(bytes: Uint8Array): string {
	const binary = String.fromCharCode(...bytes);
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Encode a raw 32-byte hash as a TON user-friendly address.
 *
 * User-friendly format (36 bytes):
 *   [tag:1][workchain:1][hash:32][crc16:2]
 *
 * Tag: 0x11 = bounceable, 0x51 = non-bounceable
 * Workchain: 0x00 = basechain, 0xff = masterchain
 *
 * @param hash - 32-byte address hash (sha256 of StateInit cell)
 * @param bounceable - true for bounceable (0x11), false for non-bounceable (0x51)
 * @param workchain - 0 for basechain (default)
 */
export function encodeTonAddress(hash: Uint8Array, bounceable = false, workchain = 0): string {
	if (hash.length !== 32) {
		throw new Error(`TON address requires 32-byte hash, got ${hash.length} bytes`);
	}

	const tag = bounceable ? 0x11 : 0x51;
	const wc = workchain === -1 ? 0xff : workchain & 0xff;

	// Build 34-byte payload: tag + workchain + hash
	const payload = new Uint8Array(34);
	payload[0] = tag;
	payload[1] = wc;
	payload.set(hash, 2);

	// CRC16 checksum
	const crc = crc16(payload);
	const full = new Uint8Array(36);
	full.set(payload);
	full[34] = (crc >> 8) & 0xff;
	full[35] = crc & 0xff;

	return base64urlEncode(full);
}

/**
 * TON address encoder — derives real WalletV4R2 addresses.
 *
 * Given a 32-byte Ed25519 public key, constructs the WalletV4R2 StateInit
 * (code cell + data cell), computes its SHA-256 representation hash, and
 * encodes it as a non-bounceable user-friendly address (UQ... prefix).
 *
 * This produces the same address as @ton/ton's WalletContractV4, verified
 * against the canonical implementation in ton-org/ton.
 */
export class TonAddressEncoder implements IAddressEncoder {
	encode(publicKey: Uint8Array, _params: EncodingParams): string {
		if (publicKey.length !== 32) {
			throw new Error(`TON encoder requires 32-byte Ed25519 public key, got ${publicKey.length} bytes`);
		}
		const hash = deriveWalletV4R2Hash(publicKey, 0);
		return encodeTonAddress(hash, false, 0);
	}

	encodingType(): string {
		return "ton-base64url";
	}
}
