import { ed25519 } from "@noble/curves/ed25519.js";
import { describe, expect, it } from "vitest";
import { encodeTonAddress, TonAddressEncoder } from "../ton/encoder.js";

describe("TonAddressEncoder", () => {
	const encoder = new TonAddressEncoder();

	it("encodingType returns ton-base64url", () => {
		expect(encoder.encodingType()).toBe("ton-base64url");
	});

	it("encodes a known 32-byte pubkey to a base64url address", () => {
		const pubkey = new Uint8Array(32).fill(1);
		const address = encoder.encode(pubkey, {});
		expect(typeof address).toBe("string");
		// TON user-friendly addresses are 48 chars base64url (36 bytes → 48 chars)
		expect(address.length).toBe(48);
	});

	it("produces deterministic addresses", () => {
		const pubkey = new Uint8Array(32);
		pubkey[31] = 42;
		const a1 = encoder.encode(pubkey, {});
		const a2 = encoder.encode(pubkey, {});
		expect(a1).toBe(a2);
	});

	it("rejects non-32-byte input", () => {
		expect(() => encoder.encode(new Uint8Array(20), {})).toThrow("32-byte");
		expect(() => encoder.encode(new Uint8Array(33), {})).toThrow("32-byte");
		expect(() => encoder.encode(new Uint8Array(0), {})).toThrow("32-byte");
	});

	it("produces non-bounceable addresses by default (UQ prefix)", () => {
		// Non-bounceable tag = 0x51, workchain 0 → first bytes are 0x51 0x00
		// Base64url of [0x51, 0x00, ...] starts with "UQ"
		const pubkey = new Uint8Array(32).fill(0xab);
		const address = encoder.encode(pubkey, {});
		expect(address.startsWith("UQ")).toBe(true);
	});

	it("derives address from Ed25519 seed", () => {
		const seed = new Uint8Array(32);
		seed[31] = 1;
		const publicKey = ed25519.getPublicKey(seed);
		expect(publicKey.length).toBe(32);

		const address = encoder.encode(publicKey, {});
		expect(typeof address).toBe("string");
		expect(address.length).toBe(48);
		// Should be non-bounceable
		expect(address.startsWith("UQ")).toBe(true);
	});

	it("different pubkeys produce different addresses", () => {
		const pk1 = new Uint8Array(32).fill(1);
		const pk2 = new Uint8Array(32).fill(2);
		const a1 = encoder.encode(pk1, {});
		const a2 = encoder.encode(pk2, {});
		expect(a1).not.toBe(a2);
	});
});

describe("encodeTonAddress", () => {
	it("encodes non-bounceable address", () => {
		const hash = new Uint8Array(32).fill(0xff);
		const address = encodeTonAddress(hash, false, 0);
		// Non-bounceable: tag = 0x51
		expect(address.startsWith("UQ")).toBe(true);
		expect(address.length).toBe(48);
	});

	it("encodes bounceable address", () => {
		const hash = new Uint8Array(32).fill(0xff);
		const address = encodeTonAddress(hash, true, 0);
		// Bounceable: tag = 0x11
		expect(address.startsWith("EQ")).toBe(true);
		expect(address.length).toBe(48);
	});

	it("rejects non-32-byte hash", () => {
		expect(() => encodeTonAddress(new Uint8Array(16), false, 0)).toThrow("32-byte");
		expect(() => encodeTonAddress(new Uint8Array(64), false, 0)).toThrow("32-byte");
	});

	it("CRC16 changes with different data", () => {
		const h1 = new Uint8Array(32).fill(0x00);
		const h2 = new Uint8Array(32).fill(0x01);
		const a1 = encodeTonAddress(h1, false, 0);
		const a2 = encodeTonAddress(h2, false, 0);
		// Same prefix but different body+checksum
		expect(a1).not.toBe(a2);
	});

	it("produces valid base64url (no +, /, or =)", () => {
		// Run several inputs to increase chance of catching encoding issues
		for (let i = 0; i < 10; i++) {
			const hash = new Uint8Array(32);
			hash[0] = i;
			hash[31] = 255 - i;
			const address = encodeTonAddress(hash, false, 0);
			expect(address).not.toMatch(/[+/=]/);
			expect(address).toMatch(/^[A-Za-z0-9_-]+$/);
		}
	});
});
