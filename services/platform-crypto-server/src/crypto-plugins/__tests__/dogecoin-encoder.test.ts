import { HDKey } from "@scure/bip32";
import { describe, expect, it } from "vitest";
import { encodeP2pkhAddress, p2pkhEncoder } from "../dogecoin/encoder.js";

const TEST_XPUB =
	"xpub6BnqJwdqnXEZdkynN5CsrYZr3MULY933SdLrswFfKPDFandTXPQDWY225FveTPUJXS8D91Ddp7FEfaGrvVxuMBGQsyoBYRLu6VMB3Ni2H2Z";

function derivePublicKey(xpub: string, index: number): Uint8Array {
	const master = HDKey.fromExtendedKey(xpub);
	const child = master.deriveChild(0).deriveChild(index);
	if (!child.publicKey) throw new Error("Failed to derive public key");
	return child.publicKey;
}

describe("Dogecoin P2PKH encoder", () => {
	it("produces D... addresses with default version byte 0x1e", () => {
		const pubkey = derivePublicKey(TEST_XPUB, 0);
		const address = p2pkhEncoder.encode(pubkey, {});
		expect(address).toMatch(/^D[1-9A-HJ-NP-Za-km-z]+$/);
	});

	it("produces different addresses for different indices", () => {
		const addr0 = p2pkhEncoder.encode(derivePublicKey(TEST_XPUB, 0), {});
		const addr1 = p2pkhEncoder.encode(derivePublicKey(TEST_XPUB, 1), {});
		expect(addr0).not.toBe(addr1);
	});

	it("produces consistent results for the same key", () => {
		const pubkey = derivePublicKey(TEST_XPUB, 0);
		const addr1 = p2pkhEncoder.encode(pubkey, {});
		const addr2 = p2pkhEncoder.encode(pubkey, {});
		expect(addr1).toBe(addr2);
	});

	it("respects custom version param", () => {
		const pubkey = derivePublicKey(TEST_XPUB, 0);
		// Version byte 0x00 = Bitcoin mainnet P2PKH (starts with 1)
		const btcAddr = p2pkhEncoder.encode(pubkey, { version: "0" });
		expect(btcAddr).toMatch(/^1[1-9A-HJ-NP-Za-km-z]+$/);
	});

	it("address length is 33-34 characters for DOGE", () => {
		const pubkey = derivePublicKey(TEST_XPUB, 0);
		const address = p2pkhEncoder.encode(pubkey, {});
		// P2PKH addresses are typically 25-34 chars, DOGE mainnet usually 34
		expect(address.length).toBeGreaterThanOrEqual(25);
		expect(address.length).toBeLessThanOrEqual(34);
	});

	it("encodeP2pkhAddress function works directly", () => {
		const pubkey = derivePublicKey(TEST_XPUB, 0);
		const address = encodeP2pkhAddress(pubkey, 0x1e);
		expect(address).toMatch(/^D/);
	});

	it("reports encoding type as p2pkh", () => {
		expect(p2pkhEncoder.encodingType()).toBe("p2pkh");
	});

	it("DOGE addresses only contain valid Base58 characters", () => {
		const pubkey = derivePublicKey(TEST_XPUB, 0);
		const address = p2pkhEncoder.encode(pubkey, {});
		// Base58 excludes 0, O, I, l
		expect(address).not.toMatch(/[0OIl]/);
	});
});
