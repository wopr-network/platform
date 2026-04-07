import { HDKey } from "@scure/bip32";
import { describe, expect, it } from "vitest";
import { hexToTron, isTronAddress, tronToHex } from "../tron/address-convert.js";
import { encodeKeccakB58Address, keccakB58Encoder } from "../tron/encoder.js";

const TEST_XPUB =
	"xpub6BnqJwdqnXEZdkynN5CsrYZr3MULY933SdLrswFfKPDFandTXPQDWY225FveTPUJXS8D91Ddp7FEfaGrvVxuMBGQsyoBYRLu6VMB3Ni2H2Z";

function derivePublicKey(xpub: string, index: number): Uint8Array {
	const master = HDKey.fromExtendedKey(xpub);
	const child = master.deriveChild(0).deriveChild(index);
	if (!child.publicKey) throw new Error("Failed to derive public key");
	return child.publicKey;
}

describe("Tron keccak-b58check encoder", () => {
	it("produces T... addresses with default version byte 0x41", () => {
		const pubkey = derivePublicKey(TEST_XPUB, 0);
		const address = keccakB58Encoder.encode(pubkey, {});
		expect(address).toMatch(/^T[1-9A-HJ-NP-Za-km-z]+$/);
	});

	it("index 0 produces TDTkBJWfXqfCPhNAgHxmgPNHigJEg4ghww", () => {
		const pubkey = derivePublicKey(TEST_XPUB, 0);
		const address = keccakB58Encoder.encode(pubkey, {});
		expect(address).toBe("TDTkBJWfXqfCPhNAgHxmgPNHigJEg4ghww");
	});

	it("produces different addresses for different indices", () => {
		const addr0 = keccakB58Encoder.encode(derivePublicKey(TEST_XPUB, 0), {});
		const addr1 = keccakB58Encoder.encode(derivePublicKey(TEST_XPUB, 1), {});
		expect(addr0).not.toBe(addr1);
	});

	it("produces consistent results for the same key", () => {
		const pubkey = derivePublicKey(TEST_XPUB, 0);
		const addr1 = keccakB58Encoder.encode(pubkey, {});
		const addr2 = keccakB58Encoder.encode(pubkey, {});
		expect(addr1).toBe(addr2);
	});

	it("respects custom version param", () => {
		const pubkey = derivePublicKey(TEST_XPUB, 0);
		// Different version byte produces different address
		const addr41 = keccakB58Encoder.encode(pubkey, {});
		const addr00 = keccakB58Encoder.encode(pubkey, { version: "0" });
		expect(addr41).not.toBe(addr00);
	});

	it("encodeKeccakB58Address function works directly", () => {
		const pubkey = derivePublicKey(TEST_XPUB, 0);
		const address = encodeKeccakB58Address(pubkey, 0x41);
		expect(address).toMatch(/^T/);
	});

	it("reports encoding type as keccak-b58check", () => {
		expect(keccakB58Encoder.encodingType()).toBe("keccak-b58check");
	});

	it("addresses only contain valid Base58 characters", () => {
		const pubkey = derivePublicKey(TEST_XPUB, 0);
		const address = keccakB58Encoder.encode(pubkey, {});
		expect(address).not.toMatch(/[0OIl]/);
	});
});

describe("Tron address conversion", () => {
	it("tronToHex converts T... to 0x hex", () => {
		const pubkey = derivePublicKey(TEST_XPUB, 0);
		const tronAddr = keccakB58Encoder.encode(pubkey, {});
		const hex = tronToHex(tronAddr);
		expect(hex).toMatch(/^0x[0-9a-f]{40}$/);
	});

	it("hexToTron converts 0x hex back to T...", () => {
		const pubkey = derivePublicKey(TEST_XPUB, 0);
		const tronAddr = keccakB58Encoder.encode(pubkey, {});
		const hex = tronToHex(tronAddr);
		const roundTrip = hexToTron(hex);
		expect(roundTrip).toBe(tronAddr);
	});

	it("tronToHex throws on non-T address", () => {
		expect(() => tronToHex("D7abc123")).toThrow("Not a Tron address");
	});

	it("hexToTron throws on wrong-length hex", () => {
		expect(() => hexToTron("0x1234")).toThrow("Invalid hex address length");
	});

	it("isTronAddress detects T... addresses", () => {
		const pubkey = derivePublicKey(TEST_XPUB, 0);
		const tronAddr = keccakB58Encoder.encode(pubkey, {});
		expect(isTronAddress(tronAddr)).toBe(true);
		expect(isTronAddress("0x1234567890abcdef1234567890abcdef12345678")).toBe(false);
		expect(isTronAddress("D7abcdef")).toBe(false);
	});

	it("round-trip through multiple addresses", () => {
		for (let i = 0; i < 5; i++) {
			const pubkey = derivePublicKey(TEST_XPUB, i);
			const tronAddr = keccakB58Encoder.encode(pubkey, {});
			const hex = tronToHex(tronAddr);
			const back = hexToTron(hex);
			expect(back).toBe(tronAddr);
		}
	});
});
