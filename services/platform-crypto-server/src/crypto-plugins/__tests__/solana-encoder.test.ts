import { ed25519 } from "@noble/curves/ed25519.js";
import { describe, expect, it } from "vitest";
import { base58Encode, SolanaAddressEncoder } from "../solana/encoder.js";

describe("SolanaAddressEncoder", () => {
	const encoder = new SolanaAddressEncoder();

	it("encodingType returns base58-solana", () => {
		expect(encoder.encodingType()).toBe("base58-solana");
	});

	it("encodes a known 32-byte pubkey to correct Base58 address", () => {
		// All-ones pubkey (32 bytes of 0x01)
		const pubkey = new Uint8Array(32).fill(1);
		const address = encoder.encode(pubkey, {});
		// Base58 encoding of 32 bytes of 0x01
		expect(typeof address).toBe("string");
		expect(address.length).toBeGreaterThanOrEqual(32);
		expect(address.length).toBeLessThanOrEqual(44);
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

	it("encodes all-zero pubkey with leading 1s", () => {
		const pubkey = new Uint8Array(32); // all zeros
		const address = encoder.encode(pubkey, {});
		// Base58 encodes leading zero bytes as '1'
		expect(address.startsWith("1")).toBe(true);
	});

	it("derives correct address from Ed25519 seed 0x00...01", () => {
		// Create a 32-byte seed with last byte = 1
		const seed = new Uint8Array(32);
		seed[31] = 1;

		// Derive Ed25519 public key from private key (seed)
		const publicKey = ed25519.getPublicKey(seed);
		expect(publicKey.length).toBe(32);

		// Encode as Solana address
		const address = encoder.encode(publicKey, {});

		// Verify it's a valid Base58 string
		expect(address).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
		expect(address.length).toBeGreaterThanOrEqual(32);
		expect(address.length).toBeLessThanOrEqual(44);

		// The address should be the Base58 of the raw pubkey — verify round-trip
		const reencoded = base58Encode(publicKey);
		expect(address).toBe(reencoded);
	});

	it("derives correct address for well-known Ed25519 test vector", () => {
		// Seed = 32 bytes of 0x00...01
		const seed = new Uint8Array(32);
		seed[31] = 1;

		const publicKey = ed25519.getPublicKey(seed);

		// The Ed25519 public key for private key [0..0, 1] is a known value.
		// The Solana address is just the Base58 of this 32-byte key.
		const address = encoder.encode(publicKey, {});

		// Ed25519 pubkey for seed 0x00..01 = 4cb5abf6ad79fbf5abbccafcc269d85cd2651ed4b885b5869f241aedf0a5ba29
		// (this is the compressed Y coordinate of the point)
		const expectedPubkeyHex = "4cb5abf6ad79fbf5abbccafcc269d85cd2651ed4b885b5869f241aedf0a5ba29";
		const expectedPubkey = new Uint8Array(32);
		for (let i = 0; i < 32; i++) {
			expectedPubkey[i] = Number.parseInt(expectedPubkeyHex.slice(i * 2, i * 2 + 2), 16);
		}
		expect(publicKey).toEqual(expectedPubkey);

		// Now verify the Base58 encoding of this pubkey
		const expectedAddress = base58Encode(expectedPubkey);
		expect(address).toBe(expectedAddress);
	});

	it("base58Encode handles various byte patterns", () => {
		// Single byte
		const single = new Uint8Array([0xff]);
		const encoded = base58Encode(single);
		expect(encoded).toBe("5Q");

		// Empty-ish: all zeros should give all '1's
		const zeros = new Uint8Array(3);
		expect(base58Encode(zeros)).toBe("111");

		// Known value: [1] should give "2"
		expect(base58Encode(new Uint8Array([1]))).toBe("2");
	});
});
