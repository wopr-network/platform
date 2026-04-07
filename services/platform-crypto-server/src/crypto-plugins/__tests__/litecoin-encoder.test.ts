import { HDKey } from "@scure/bip32";
import { describe, expect, it } from "vitest";
import { bech32Encoder } from "../litecoin/encoder.js";

const TEST_XPUB =
	"xpub6BnqJwdqnXEZdkynN5CsrYZr3MULY933SdLrswFfKPDFandTXPQDWY225FveTPUJXS8D91Ddp7FEfaGrvVxuMBGQsyoBYRLu6VMB3Ni2H2Z";

function derivePublicKey(xpub: string, index: number): Uint8Array {
	const master = HDKey.fromExtendedKey(xpub);
	const child = master.deriveChild(0).deriveChild(index);
	if (!child.publicKey) throw new Error("Failed to derive public key");
	return child.publicKey;
}

describe("Litecoin bech32 encoder", () => {
	it("produces ltc1q... addresses", () => {
		const pubkey = derivePublicKey(TEST_XPUB, 0);
		const address = bech32Encoder.encode(pubkey, {});
		expect(address).toMatch(/^ltc1q[a-z0-9]{38,42}$/);
	});

	it("produces different addresses for different indices", () => {
		const addr0 = bech32Encoder.encode(derivePublicKey(TEST_XPUB, 0), {});
		const addr1 = bech32Encoder.encode(derivePublicKey(TEST_XPUB, 1), {});
		expect(addr0).not.toBe(addr1);
	});

	it("produces consistent results for the same key", () => {
		const pubkey = derivePublicKey(TEST_XPUB, 0);
		const addr1 = bech32Encoder.encode(pubkey, {});
		const addr2 = bech32Encoder.encode(pubkey, {});
		expect(addr1).toBe(addr2);
	});

	it("respects custom hrp param", () => {
		const pubkey = derivePublicKey(TEST_XPUB, 0);
		const testnetAddr = bech32Encoder.encode(pubkey, { hrp: "tltc" });
		expect(testnetAddr).toMatch(/^tltc1q/);
	});

	it("reports encoding type as bech32", () => {
		expect(bech32Encoder.encodingType()).toBe("bech32");
	});

	it("address length is 43 characters (ltc1q + 38 chars for 20-byte witness)", () => {
		const pubkey = derivePublicKey(TEST_XPUB, 0);
		const address = bech32Encoder.encode(pubkey, {});
		// ltc1q... bech32 addresses for 20-byte programs are 43 chars
		expect(address.length).toBe(43);
	});
});
