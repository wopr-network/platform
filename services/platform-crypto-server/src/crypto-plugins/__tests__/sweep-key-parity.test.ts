import { ed25519 } from "@noble/curves/ed25519.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { HDKey } from "@scure/bip32";
import * as bip39 from "@scure/bip39";
import { privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";

import { bech32Encoder } from "../bitcoin/encoder.js";
import { p2pkhEncoder } from "../dogecoin/encoder.js";
import { EvmAddressEncoder } from "../evm/encoder.js";
import { bech32Encoder as ltcBech32Encoder } from "../litecoin/encoder.js";
import { SolanaAddressEncoder } from "../solana/encoder.js";
import { TonAddressEncoder } from "../ton/encoder.js";
import { keccakB58Encoder } from "../tron/encoder.js";

// ---------------------------------------------------------------------------
// Well-known BIP-39 test mnemonic (public, never use in production)
// ---------------------------------------------------------------------------

const TEST_MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const TEST_SEED = bip39.mnemonicToSeedSync(TEST_MNEMONIC);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes as unknown as number[], (b: number) => b.toString(16).padStart(2, "0")).join("");
}

function privKeyHex(key: Uint8Array): `0x${string}` {
  return `0x${toHex(key)}` as `0x${string}`;
}

// ---------------------------------------------------------------------------
// secp256k1 chain configs
// ---------------------------------------------------------------------------

interface Secp256k1ChainConfig {
  name: string;
  coinType: number;
  encoder: { encode(pk: Uint8Array, params: Record<string, unknown>): string };
  params: Record<string, unknown>;
  addrRegex: RegExp;
}

const SECP256K1_CHAINS: Secp256k1ChainConfig[] = [
  {
    name: "Bitcoin",
    coinType: 0,
    encoder: bech32Encoder,
    params: { hrp: "bc" },
    addrRegex: /^bc1q/,
  },
  {
    name: "Litecoin",
    coinType: 2,
    encoder: ltcBech32Encoder,
    params: { hrp: "ltc" },
    addrRegex: /^ltc1q/,
  },
  {
    name: "Dogecoin",
    coinType: 3,
    encoder: p2pkhEncoder,
    params: { version: "0x1e" },
    addrRegex: /^D/,
  },
  {
    name: "EVM",
    coinType: 60,
    encoder: new EvmAddressEncoder(),
    params: {},
    addrRegex: /^0x[0-9a-fA-F]{40}$/,
  },
  {
    name: "Tron",
    coinType: 195,
    encoder: keccakB58Encoder,
    params: { version: "0x41" },
    addrRegex: /^T/,
  },
];

// ---------------------------------------------------------------------------
// SLIP-0010 Ed25519 derivation (manual, since @scure/bip32 is secp256k1 only)
// ---------------------------------------------------------------------------

interface Slip0010Key {
  privateKey: Uint8Array;
  chainCode: Uint8Array;
}

function slip0010MasterKey(seed: Uint8Array): Slip0010Key {
  const I = hmac(sha512, new TextEncoder().encode("ed25519 seed"), seed);
  return {
    privateKey: I.slice(0, 32),
    chainCode: I.slice(32),
  };
}

function slip0010DeriveChild(parent: Slip0010Key, index: number): Slip0010Key {
  // SLIP-0010 Ed25519: only hardened derivation (index >= 0x80000000)
  const hardenedIndex = (index | 0x80000000) >>> 0;
  const data = new Uint8Array(1 + 32 + 4);
  data[0] = 0x00;
  data.set(parent.privateKey, 1);
  const view = new DataView(data.buffer);
  view.setUint32(33, hardenedIndex, false); // big-endian
  const I = hmac(sha512, parent.chainCode, data);
  return {
    privateKey: I.slice(0, 32),
    chainCode: I.slice(32),
  };
}

function slip0010DerivePath(seed: Uint8Array, path: number[]): Slip0010Key {
  let key = slip0010MasterKey(seed);
  for (const index of path) {
    key = slip0010DeriveChild(key, index);
  }
  return key;
}

// ===========================================================================
// Tests
// ===========================================================================

describe("sweep key parity -- mnemonic private key controls derived address", () => {
  // -----------------------------------------------------------------------
  // secp256k1 chains: pubkey from xpub must equal pubkey from privkey
  // -----------------------------------------------------------------------

  describe("secp256k1 chains", () => {
    for (const chain of SECP256K1_CHAINS) {
      const path = `m/44'/${chain.coinType}'/0'`;

      it(`${chain.name}: privkey pubkey matches xpub pubkey at indices 0-4`, () => {
        const masterHD = HDKey.fromMasterSeed(TEST_SEED);
        const accountKey = masterHD.derive(path);
        const xpub = accountKey.publicExtendedKey;

        for (let i = 0; i < 5; i++) {
          // From full key (has private key): derive external chain (0), index i
          const fullChild = accountKey.deriveChild(0).deriveChild(i);
          // From xpub only: derive external chain (0), index i
          const xpubChild = HDKey.fromExtendedKey(xpub).deriveChild(0).deriveChild(i);

          const fullPk = fullChild.publicKey as Uint8Array;
          const xpubPk = xpubChild.publicKey as Uint8Array;

          expect(fullPk).toBeDefined();
          expect(xpubPk).toBeDefined();
          expect(toHex(fullPk)).toBe(toHex(xpubPk));
        }
      });

      it(`${chain.name}: encoder produces valid address from derived pubkey`, () => {
        const masterHD = HDKey.fromMasterSeed(TEST_SEED);
        const accountKey = masterHD.derive(path);
        const xpub = accountKey.publicExtendedKey;

        for (let i = 0; i < 5; i++) {
          const xpubChild = HDKey.fromExtendedKey(xpub).deriveChild(0).deriveChild(i);
          const pubkey = xpubChild.publicKey as Uint8Array;
          const address = chain.encoder.encode(pubkey, chain.params);

          expect(address).toMatch(chain.addrRegex);
        }
      });

      it(`${chain.name}: different indices produce different addresses`, () => {
        const masterHD = HDKey.fromMasterSeed(TEST_SEED);
        const accountKey = masterHD.derive(path);
        const xpub = accountKey.publicExtendedKey;

        const addresses = new Set<string>();
        for (let i = 0; i < 5; i++) {
          const xpubChild = HDKey.fromExtendedKey(xpub).deriveChild(0).deriveChild(i);
          const pubkey = xpubChild.publicKey as Uint8Array;
          const address = chain.encoder.encode(pubkey, chain.params);
          addresses.add(address);
        }
        expect(addresses.size).toBe(5);
      });

      it(`${chain.name}: derivation is deterministic`, () => {
        const masterHD = HDKey.fromMasterSeed(TEST_SEED);
        const accountKey = masterHD.derive(path);
        const xpub = accountKey.publicExtendedKey;

        const xpubChild = HDKey.fromExtendedKey(xpub).deriveChild(0).deriveChild(3);
        const pubkey = xpubChild.publicKey as Uint8Array;
        const addr1 = chain.encoder.encode(pubkey, chain.params);
        const addr2 = chain.encoder.encode(pubkey, chain.params);
        expect(addr1).toBe(addr2);
      });
    }
  });

  // -----------------------------------------------------------------------
  // EVM signing proof: viem privateKeyToAccount matches encoder output
  // -----------------------------------------------------------------------

  describe("EVM signing proof", () => {
    it("viem privateKeyToAccount matches encoder output at indices 0-9", () => {
      const evmPath = "m/44'/60'/0'";
      const masterHD = HDKey.fromMasterSeed(TEST_SEED);
      const accountKey = masterHD.derive(evmPath);
      const encoder = new EvmAddressEncoder();

      for (let i = 0; i < 10; i++) {
        const child = accountKey.deriveChild(0).deriveChild(i);
        const privKey = child.privateKey as Uint8Array;
        const pubKey = child.publicKey as Uint8Array;

        // Address from encoder (pubkey -> keccak -> EIP-55)
        const encoderAddr = encoder.encode(pubKey, {});

        // Address from viem (privkey -> account -> address)
        const viemAccount = privateKeyToAccount(privKeyHex(privKey));

        expect(viemAccount.address.toLowerCase()).toBe(encoderAddr.toLowerCase());
      }
    });

    it("viem treasury key matches encoder output", () => {
      const evmPath = "m/44'/60'/0'";
      const masterHD = HDKey.fromMasterSeed(TEST_SEED);
      const accountKey = masterHD.derive(evmPath);
      const encoder = new EvmAddressEncoder();

      // Treasury: chain index 1, address index 0
      const child = accountKey.deriveChild(1).deriveChild(0);
      const privKey = child.privateKey as Uint8Array;
      const pubKey = child.publicKey as Uint8Array;

      const encoderAddr = encoder.encode(pubKey, {});
      const viemAccount = privateKeyToAccount(privKeyHex(privKey));

      expect(viemAccount.address.toLowerCase()).toBe(encoderAddr.toLowerCase());
    });
  });

  // -----------------------------------------------------------------------
  // Solana Ed25519 (SLIP-0010 derivation)
  // -----------------------------------------------------------------------

  describe("Solana Ed25519", () => {
    const solanaEncoder = new SolanaAddressEncoder();

    it("SLIP-0010 derivation produces valid Solana address", () => {
      // m/44'/501'/0'/0' -- all hardened for SLIP-0010 Ed25519
      const derived = slip0010DerivePath(TEST_SEED, [44, 501, 0, 0]);
      const publicKey = ed25519.getPublicKey(derived.privateKey);

      expect(publicKey.length).toBe(32);

      const address = solanaEncoder.encode(publicKey, {});

      // Valid Base58 string, typical Solana address length 32-44 chars
      expect(address).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/);
      expect(address.length).toBeGreaterThanOrEqual(32);
      expect(address.length).toBeLessThanOrEqual(44);
    });

    it("same seed always produces same address", () => {
      const derived1 = slip0010DerivePath(TEST_SEED, [44, 501, 0, 0]);
      const pub1 = ed25519.getPublicKey(derived1.privateKey);
      const addr1 = solanaEncoder.encode(pub1, {});

      const derived2 = slip0010DerivePath(TEST_SEED, [44, 501, 0, 0]);
      const pub2 = ed25519.getPublicKey(derived2.privateKey);
      const addr2 = solanaEncoder.encode(pub2, {});

      expect(addr1).toBe(addr2);
    });

    it("different account indices produce different addresses", () => {
      const addresses = new Set<string>();
      for (let i = 0; i < 5; i++) {
        // m/44'/501'/i'/0'
        const derived = slip0010DerivePath(TEST_SEED, [44, 501, i, 0]);
        const publicKey = ed25519.getPublicKey(derived.privateKey);
        const address = solanaEncoder.encode(publicKey, {});
        addresses.add(address);
      }
      expect(addresses.size).toBe(5);
    });

    it("privkey and pubkey are consistent via Ed25519", () => {
      const derived = slip0010DerivePath(TEST_SEED, [44, 501, 0, 0]);
      const publicKey = ed25519.getPublicKey(derived.privateKey);

      // Sign something and verify to prove the key pair is valid
      const message = new TextEncoder().encode("test message");
      const signature = ed25519.sign(message, derived.privateKey);
      const valid = ed25519.verify(signature, message, publicKey);
      expect(valid).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // TON Ed25519 (SLIP-0010 derivation, WalletV4R2 encoder)
  //
  // Path: m/44'/607'/{i}' -- THREE hardened levels, per Tonkeeper standard.
  // This MUST match the path used by ops/scripts/generate-ton-pool.mjs.
  // If they diverge, the pool addresses uploaded to prod become unrecoverable.
  // -----------------------------------------------------------------------

  describe("TON Ed25519 (WalletV4R2)", () => {
    const tonEncoder = new TonAddressEncoder();

    it("SLIP-0010 derivation produces valid TON WalletV4R2 address", () => {
      // Same path as generate-ton-pool.mjs line 91: [44, 607, i]
      const derived = slip0010DerivePath(TEST_SEED, [44, 607, 0]);
      const publicKey = ed25519.getPublicKey(derived.privateKey);

      expect(publicKey.length).toBe(32);

      const address = tonEncoder.encode(publicKey, {});

      // TON user-friendly addresses: base64url-encoded 36 bytes → 48 chars.
      expect(address).toMatch(/^[A-Za-z0-9_-]{48}$/);
    });

    it("known-vector fixture: pinned address at index 0 with test mnemonic", () => {
      // Regenerate only if you have proven that the encoder OR the path
      // needed to change AND you have reconciled every live pool entry.
      // If this fails unexpectedly, STOP. It means addresses already in
      // the prod pool can no longer be derived from the seed.
      const derived = slip0010DerivePath(TEST_SEED, [44, 607, 0]);
      const publicKey = ed25519.getPublicKey(derived.privateKey);

      expect(Array.from(publicKey)).toEqual(
        Array.from(Buffer.from("7952e94118f34607c75e23258dd9220d66ccac5a3ee074125c25068e8107bfbf", "hex")),
      );
      expect(tonEncoder.encode(publicKey, {})).toBe("UQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-RKY");
    });

    it("same seed always produces same address (deterministic)", () => {
      const d1 = slip0010DerivePath(TEST_SEED, [44, 607, 0]);
      const addr1 = tonEncoder.encode(ed25519.getPublicKey(d1.privateKey), {});

      const d2 = slip0010DerivePath(TEST_SEED, [44, 607, 0]);
      const addr2 = tonEncoder.encode(ed25519.getPublicKey(d2.privateKey), {});

      expect(addr1).toBe(addr2);
    });

    it("different indices produce different addresses (no collisions)", () => {
      const addresses = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const derived = slip0010DerivePath(TEST_SEED, [44, 607, i]);
        const publicKey = ed25519.getPublicKey(derived.privateKey);
        addresses.add(tonEncoder.encode(publicKey, {}));
      }
      expect(addresses.size).toBe(10);
    });

    it("privkey ↔ pubkey relationship: signing proves we control the address", () => {
      // The load-bearing invariant: for every address we put in the pool,
      // the private key derived at the matching path can sign as the
      // public key that built the address. If this breaks, funds sent
      // to a pool address cannot be spent.
      for (let i = 0; i < 5; i++) {
        const derived = slip0010DerivePath(TEST_SEED, [44, 607, i]);
        const publicKey = ed25519.getPublicKey(derived.privateKey);

        // 1. The public key from the privkey must match what encoder sees.
        const address = tonEncoder.encode(publicKey, {});
        expect(address.length).toBe(48);

        // 2. Signature with privkey verifies under the same pubkey.
        const message = new TextEncoder().encode(`sweep-parity-${i}`);
        const sig = ed25519.sign(message, derived.privateKey);
        expect(ed25519.verify(sig, message, publicKey)).toBe(true);

        // 3. Signature from the WRONG index must NOT verify (sanity).
        const wrongDerived = slip0010DerivePath(TEST_SEED, [44, 607, i + 100]);
        const wrongSig = ed25519.sign(message, wrongDerived.privateKey);
        expect(ed25519.verify(wrongSig, message, publicKey)).toBe(false);
      }
    });

    it("encoder accepts only 32-byte Ed25519 pubkeys", () => {
      // Guard: a future change that accidentally feeds secp256k1 compressed
      // pubkeys (33 bytes) would produce garbage addresses silently.
      expect(() => tonEncoder.encode(new Uint8Array(31), {})).toThrow();
      expect(() => tonEncoder.encode(new Uint8Array(33), {})).toThrow();
      expect(() => tonEncoder.encode(new Uint8Array(64), {})).toThrow();
    });
  });
});
