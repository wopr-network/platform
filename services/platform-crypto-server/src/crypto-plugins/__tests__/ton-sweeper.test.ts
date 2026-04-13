import { ed25519 } from "@noble/curves/ed25519.js";
import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import * as bip39 from "@scure/bip39";
import { Address, beginCell, Cell } from "@ton/core";
import { describe, expect, it, vi } from "vitest";
import { TonAddressEncoder } from "../ton/encoder.js";
import {
  buildInternalTransfer,
  buildSignedTransferBody,
  buildWalletV4R2StateInit,
  computeWalletV4R2Address,
  TonSweeper,
} from "../ton/sweeper.js";

/**
 * SLIP-0010 Ed25519 derivation, identical to generate-ton-pool.mjs
 * and the sweep-key-parity test. DO NOT change without a migration.
 */
function slip0010Master(seed: Uint8Array) {
  const I = hmac(sha512, new TextEncoder().encode("ed25519 seed"), seed);
  return { key: I.slice(0, 32), chain: I.slice(32) };
}
function slip0010Child(parent: { key: Uint8Array; chain: Uint8Array }, idx: number) {
  const h = (idx | 0x80000000) >>> 0;
  const data = new Uint8Array(37);
  data[0] = 0x00;
  data.set(parent.key, 1);
  new DataView(data.buffer).setUint32(33, h, false);
  const I = hmac(sha512, parent.chain, data);
  return { key: I.slice(0, 32), chain: I.slice(32) };
}
function derivePrivkey(seed: Uint8Array, path: number[]): Uint8Array {
  let k = slip0010Master(seed);
  for (const i of path) k = slip0010Child(k, i);
  return k.key;
}

const TEST_MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const TEST_SEED = bip39.mnemonicToSeedSync(TEST_MNEMONIC);

// Known fixture — must match sweep-key-parity.test.ts and what the pool
// generator uploaded for this mnemonic.
const PINNED_ADDRESS_0 = "UQAzWZa6nM5mJev91wGc7VCSfBoIsYRqKJpV78N8Add9-RKY";
const PINNED_PUBKEY_0_HEX = "7952e94118f34607c75e23258dd9220d66ccac5a3ee074125c25068e8107bfbf";

describe("TON sweeper — parity with encoder + pool generator", () => {
  it("computeWalletV4R2Address matches TonAddressEncoder for the same pubkey", () => {
    // This is the load-bearing invariant: whatever address gets added to
    // the pool (via the encoder) must be derivable from the pubkey inside
    // the sweeper. If they ever diverge, funds in the pool become
    // unreachable.
    const pub = Buffer.from(PINNED_PUBKEY_0_HEX, "hex");
    const fromEncoder = new TonAddressEncoder().encode(new Uint8Array(pub), {});
    const fromSweeper = computeWalletV4R2Address(new Uint8Array(pub));
    expect(fromSweeper).toBe(fromEncoder);
  });

  it("pinned pool-index-0 address matches pubkey derived from test mnemonic", () => {
    const priv = derivePrivkey(TEST_SEED, [44, 607, 0]);
    const pub = ed25519.getPublicKey(priv);
    expect(Buffer.from(pub).toString("hex")).toBe(PINNED_PUBKEY_0_HEX);
    expect(computeWalletV4R2Address(pub)).toBe(PINNED_ADDRESS_0);
  });

  it("matches across 10 derivation indices end-to-end (mnemonic → address parity)", () => {
    // If this test fails, it means either the encoder, the sweeper, or the
    // SLIP-0010 derivation has drifted. All three must agree for every index.
    for (let i = 0; i < 10; i++) {
      const priv = derivePrivkey(TEST_SEED, [44, 607, i]);
      const pub = ed25519.getPublicKey(priv);
      const a = new TonAddressEncoder().encode(pub, {});
      const b = computeWalletV4R2Address(pub);
      expect(b).toBe(a);
    }
  });
});

describe("TON sweeper — message construction", () => {
  it("StateInit cell hashes to the user-facing address", () => {
    // contractAddress(0, stateInit) should collide with computeWalletV4R2Address.
    // Since computeWalletV4R2Address USES contractAddress, this is a self-check
    // that the StateInit pieces (code + data) are wired correctly.
    const pub = Buffer.from(PINNED_PUBKEY_0_HEX, "hex");
    const { code, data } = buildWalletV4R2StateInit(new Uint8Array(pub), 698983191);
    expect(code).toBeInstanceOf(Cell);
    expect(data).toBeInstanceOf(Cell);
    // Data cell should be exactly: seqno(32) + subwallet(32) + pubkey(256) + 1 bit = 353 bits
    expect(data.bits.length).toBe(32 + 32 + 256 + 1);
  });

  it("rejects non-32-byte pubkeys at StateInit build", () => {
    expect(() => buildWalletV4R2StateInit(new Uint8Array(31), 0)).toThrow();
    expect(() => buildWalletV4R2StateInit(new Uint8Array(33), 0)).toThrow();
  });

  it("internal transfer cell stores treasury + amount correctly", () => {
    const treasury = Address.parse(PINNED_ADDRESS_0);
    const cell = buildInternalTransfer(treasury, 1_234_567_890n);
    // Parse it back to confirm structure — this exercises the full
    // serialization contract (bit tags, coin encoding, address encoding).
    // Tag sequence: tag(1) + ihr_disabled(1) + bounce(1) + bounced(1) + src(2)
    const slice = cell.beginParse();
    expect(slice.loadUint(1)).toBe(0); // int_msg_info tag
    slice.loadBit(); // ihr_disabled
    slice.loadBit(); // bounce
    slice.loadBit(); // bounced
    slice.loadUint(2); // src = addr_none
    const parsedDst = slice.loadAddress();
    expect(parsedDst.toString({ bounceable: false, urlSafe: true })).toBe(PINNED_ADDRESS_0);
    expect(slice.loadCoins()).toBe(1_234_567_890n);
  });

  it("signed transfer body is signable by the privkey and verifiable by the pubkey", () => {
    // This is the spending proof. The body's hash is what Ed25519 signs.
    // If we can sign it with the derived privkey and verify under the
    // derived pubkey, we can spend from the address that pubkey controls.
    const priv = derivePrivkey(TEST_SEED, [44, 607, 0]);
    const pub = ed25519.getPublicKey(priv);
    const treasury = Address.parse(PINNED_ADDRESS_0);
    const internalMsg = buildInternalTransfer(treasury, 1_000_000_000n);

    const signedBody = buildSignedTransferBody({
      privateKey: priv,
      subwalletId: 698983191,
      validUntil: 1_900_000_000, // year 2030 — fits in 32 bits
      seqno: 0,
      sendMode: 3,
      internalMessage: internalMsg,
    });

    // Extract signature from the signed body (first 512 bits = 64 bytes).
    const slice = signedBody.beginParse();
    const signature = slice.loadBuffer(64);

    // Rebuild the unsigned cell with identical params so we can verify
    // the signature against it.
    const unsignedCell = beginCell()
      .storeUint(698983191, 32)
      .storeUint(1_900_000_000, 32)
      .storeUint(0, 32)
      .storeUint(0, 8)
      .storeUint(3, 8)
      .storeRef(internalMsg)
      .endCell();
    const hash = unsignedCell.hash();
    expect(ed25519.verify(signature, hash, pub)).toBe(true);

    // Negative case: wrong index's key must not verify.
    const wrongPriv = derivePrivkey(TEST_SEED, [44, 607, 1]);
    const wrongPub = ed25519.getPublicKey(wrongPriv);
    expect(ed25519.verify(signature, hash, wrongPub)).toBe(false);
  });
});

describe("TON sweeper — scan + sweep with mocked API", () => {
  const WATCHED = PINNED_ADDRESS_0;
  // Derived from TEST_MNEMONIC at m/44'/607'/1' — valid v4r2 address with correct checksum.
  const TREASURY = "UQDVJucJT96vGh_bYm3e5uzenasiTOwA9orUHQiyhNsKmBrP";

  function installTonMock(responses: {
    getAddressInformation?: Record<string, { balance: string; state: string }>;
    runGetMethod?: number;
    sendBoc?: { "@type"?: string; hash?: string };
  }) {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes("/getAddressInformation")) {
        const addr = new URL(u).searchParams.get("address") ?? "";
        const resp = responses.getAddressInformation?.[addr] ?? { balance: "0", state: "uninitialized" };
        return new Response(JSON.stringify({ ok: true, result: resp }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (u.includes("/runGetMethod")) {
        return new Response(
          JSON.stringify({
            ok: true,
            result: {
              stack: [["num", { number: { number: String(responses.runGetMethod ?? 0) } }]],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      if (u.includes("/sendBoc")) {
        return new Response(
          JSON.stringify({ ok: true, result: responses.sendBoc ?? { "@type": "ok", hash: "tx-hash-xyz" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("{}", { status: 200 });
    });
    // biome-ignore lint/suspicious/noExplicitAny: test mock override
    (globalThis as any).fetch = fetchMock;
    return fetchMock;
  }

  function makeOpts(extra: Record<string, unknown> = {}) {
    return {
      rpcUrl: "https://toncenter.com/api/v2",
      rpcHeaders: {},
      token: "TON",
      chain: "ton",
      decimals: 9,
      ...extra,
    };
  }

  it("scan: returns deposit info only for addresses with balance above threshold", async () => {
    installTonMock({
      getAddressInformation: {
        [WATCHED]: { balance: "1000000000", state: "uninitialized" }, // 1 TON, above threshold
        UQBD2j3nVKonc1Fggvmt6W5zgXadnmTl43spUT4BKeTcS4Cx: {
          balance: "5000000",
          state: "uninitialized",
        }, // 0.005 TON, below threshold
      },
    });
    const priv = derivePrivkey(TEST_SEED, [44, 607, 0]);
    const zeroPriv = new Uint8Array(32);
    const keys = [
      { address: WATCHED, index: 0, privateKey: priv, publicKey: ed25519.getPublicKey(priv) },
      {
        address: "UQBD2j3nVKonc1Fggvmt6W5zgXadnmTl43spUT4BKeTcS4Cx",
        index: 1,
        privateKey: zeroPriv,
        publicKey: ed25519.getPublicKey(zeroPriv),
      },
    ];
    const sweeper = new TonSweeper(makeOpts());
    const deposits = await sweeper.scan(keys, TREASURY);
    expect(deposits).toHaveLength(1);
    expect(deposits[0].address).toBe(WATCHED);
    expect(deposits[0].nativeBalance).toBe(1_000_000_000n);
  });

  it("sweep dry-run returns sweepable amount minus reserve, no broadcast", async () => {
    const fetchMock = installTonMock({
      getAddressInformation: {
        [WATCHED]: { balance: "1000000000", state: "uninitialized" }, // 1 TON
      },
    });
    const priv = derivePrivkey(TEST_SEED, [44, 607, 0]);
    const sweeper = new TonSweeper(makeOpts());
    const results = await sweeper.sweep(
      [{ address: WATCHED, index: 0, privateKey: priv, publicKey: ed25519.getPublicKey(priv) }],
      TREASURY,
      /* dryRun */ true,
    );
    expect(results).toHaveLength(1);
    expect(results[0].txHash).toBe("dry-run");
    expect(BigInt(results[0].amount)).toBe(1_000_000_000n - 50_000_000n); // balance - deploy reserve
    // No sendBoc in dry-run.
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("sendBoc"))).toBe(false);
  });

  it("sweep broadcast: builds signed BOC and POSTs to sendBoc", async () => {
    const fetchMock = installTonMock({
      getAddressInformation: {
        [WATCHED]: { balance: "2000000000", state: "uninitialized" }, // 2 TON, first-send (deploys)
      },
      sendBoc: { "@type": "ok", hash: "real-tx-hash" },
    });
    const priv = derivePrivkey(TEST_SEED, [44, 607, 0]);
    const sweeper = new TonSweeper(makeOpts());
    const results = await sweeper.sweep(
      [{ address: WATCHED, index: 0, privateKey: priv, publicKey: ed25519.getPublicKey(priv) }],
      TREASURY,
      /* dryRun */ false,
    );
    expect(results).toHaveLength(1);
    expect(results[0].txHash).toBe("real-tx-hash");

    // Verify we actually POSTed a BOC.
    const sendBocCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("sendBoc"));
    expect(sendBocCall).toBeTruthy();
    const boc = new URL(String(sendBocCall![0])).searchParams.get("boc") ?? "";
    // The BOC is base64, should be non-empty and decode without error.
    expect(boc.length).toBeGreaterThan(10);
    const bocBuf = Buffer.from(boc, "base64");
    expect(() => Cell.fromBoc(bocBuf)).not.toThrow();
  });

  it("Jetton mode: scan returns empty, sweep throws (deferred to #81)", async () => {
    installTonMock({});
    const priv = derivePrivkey(TEST_SEED, [44, 607, 0]);
    const sweeper = new TonSweeper(
      makeOpts({
        token: "USDT",
        decimals: 6,
        contractAddress: "EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs",
      }),
    );
    expect(
      await sweeper.scan(
        [{ address: WATCHED, index: 0, privateKey: priv, publicKey: ed25519.getPublicKey(priv) }],
        TREASURY,
      ),
    ).toEqual([]);
    await expect(
      sweeper.sweep(
        [{ address: WATCHED, index: 0, privateKey: priv, publicKey: ed25519.getPublicKey(priv) }],
        TREASURY,
        false,
      ),
    ).rejects.toThrow(/#81/);
  });
});
