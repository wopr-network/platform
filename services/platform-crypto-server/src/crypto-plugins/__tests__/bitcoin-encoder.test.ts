import { describe, expect, it } from "vitest";

import { bech32Encoder, encodeBech32Address, hash160 } from "../bitcoin/index.js";

describe("hash160", () => {
	it("produces a 20-byte output", () => {
		const input = new Uint8Array(33).fill(0x02);
		const result = hash160(input);
		expect(result).toBeInstanceOf(Uint8Array);
		expect(result.length).toBe(20);
	});

	it("is deterministic", () => {
		const input = new Uint8Array([0x03, ...new Array(32).fill(0xab)]);
		const a = hash160(input);
		const b = hash160(input);
		expect(Array.from(a)).toEqual(Array.from(b));
	});

	it("different inputs produce different hashes", () => {
		const a = hash160(new Uint8Array(33).fill(0x02));
		const b = hash160(new Uint8Array(33).fill(0x03));
		expect(Array.from(a)).not.toEqual(Array.from(b));
	});
});

describe("encodeBech32Address", () => {
	it("produces a bc1q... address for mainnet BTC", () => {
		// Use a known compressed public key (33 bytes starting with 02 or 03)
		const pubkey = new Uint8Array(33);
		pubkey[0] = 0x02;
		for (let i = 1; i < 33; i++) pubkey[i] = i;

		const address = encodeBech32Address(pubkey, "bc");
		expect(address).toMatch(/^bc1q[a-z0-9]+$/);
		// bech32 addresses are 42-62 chars for segwit v0
		expect(address.length).toBeGreaterThanOrEqual(42);
		expect(address.length).toBeLessThanOrEqual(62);
	});

	it("produces ltc1q... for Litecoin", () => {
		const pubkey = new Uint8Array(33);
		pubkey[0] = 0x03;
		for (let i = 1; i < 33; i++) pubkey[i] = 0xff - i;

		const address = encodeBech32Address(pubkey, "ltc");
		expect(address).toMatch(/^ltc1q[a-z0-9]+$/);
	});

	it("produces tb1q... for testnet BTC", () => {
		const pubkey = new Uint8Array(33);
		pubkey[0] = 0x02;
		for (let i = 1; i < 33; i++) pubkey[i] = 0x42;

		const address = encodeBech32Address(pubkey, "tb");
		expect(address).toMatch(/^tb1q[a-z0-9]+$/);
	});

	it("same pubkey + hrp always produces the same address", () => {
		const pubkey = new Uint8Array(33);
		pubkey[0] = 0x02;
		pubkey.fill(0xde, 1);

		const a = encodeBech32Address(pubkey, "bc");
		const b = encodeBech32Address(pubkey, "bc");
		expect(a).toBe(b);
	});

	it("different pubkeys produce different addresses", () => {
		const pub1 = new Uint8Array(33);
		pub1[0] = 0x02;
		pub1.fill(0x11, 1);

		const pub2 = new Uint8Array(33);
		pub2[0] = 0x02;
		pub2.fill(0x22, 1);

		const a = encodeBech32Address(pub1, "bc");
		const b = encodeBech32Address(pub2, "bc");
		expect(a).not.toBe(b);
	});
});

describe("bech32Encoder (IAddressEncoder)", () => {
	it("encodingType returns 'bech32'", () => {
		expect(bech32Encoder.encodingType()).toBe("bech32");
	});

	it("encode with hrp param produces correct prefix", () => {
		const pubkey = new Uint8Array(33);
		pubkey[0] = 0x02;
		pubkey.fill(0xaa, 1);

		const addr = bech32Encoder.encode(pubkey, { hrp: "bc" });
		expect(addr).toMatch(/^bc1q/);
	});

	it("encode defaults to bc (mainnet) when hrp not provided", () => {
		const pubkey = new Uint8Array(33);
		pubkey[0] = 0x03;
		pubkey.fill(0xbb, 1);

		const addr = bech32Encoder.encode(pubkey, {});
		expect(addr).toMatch(/^bc1q/);
	});

	it("encode with ltc hrp produces ltc1q address", () => {
		const pubkey = new Uint8Array(33);
		pubkey[0] = 0x02;
		pubkey.fill(0xcc, 1);

		const addr = bech32Encoder.encode(pubkey, { hrp: "ltc" });
		expect(addr).toMatch(/^ltc1q/);
	});
});
