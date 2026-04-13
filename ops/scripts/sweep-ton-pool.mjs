#!/usr/bin/env node
/**
 * Sweep TON addresses derived from a BIP39 mnemonic to a treasury address.
 *
 * Uses SLIP-0010 Ed25519 derivation at m/44'/607'/{i}' — SAME PATH as
 * generate-ton-pool.mjs. If they ever drift, the sweeper will not find
 * the pool addresses.
 *
 * First sweep from each wallet deploys the WalletV4R2 contract as part
 * of the same external message (StateInit attached). Subsequent sweeps
 * are plain transfers.
 *
 * Jetton (USDT-TON) sweep is NOT supported by this script — follow-up #81.
 *
 * Prerequisites:
 *   - @wopr-network/platform-crypto-server installed with a recent @ton/core
 *   - Mnemonic piped via stdin (same convention as crypto-sweep)
 *
 * Usage:
 *   openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -d -pass pass:<passphrase> \
 *     -in "/mnt/g/My Drive/paperclip-wallet.enc" \
 *     | TON_TREASURY=UQD... \
 *       MAX_INDEX=1000 \
 *       SWEEP_DRY_RUN=true \
 *       node ops/scripts/sweep-ton-pool.mjs
 *
 * Env:
 *   TON_TREASURY       Destination TON address (required)
 *   TON_RPC            TON Center v2 base URL (default: https://toncenter.com/api/v2)
 *   TON_API_KEY        TON Center API key (recommended)
 *   MAX_INDEX          Upper bound of pool indices to scan (default: 1000)
 *   START_INDEX        Lower bound (default: 0)
 *   SWEEP_DRY_RUN      "false" to actually broadcast. Defaults to true.
 *   MIN_BALANCE_NANOTON Skip addresses below this balance (default: 100000000 = 0.1 TON)
 */

import { ed25519 } from "@noble/curves/ed25519";
import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha512";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { TonSweeper, computeWalletV4R2Address } from "@wopr-network/platform-crypto-server/crypto-plugins/ton";

const TON_TREASURY = process.env.TON_TREASURY;
const TON_RPC = process.env.TON_RPC ?? "https://toncenter.com/api/v2";
const TON_API_KEY = process.env.TON_API_KEY;
const MAX_INDEX = Number(process.env.MAX_INDEX ?? "1000");
const START_INDEX = Number(process.env.START_INDEX ?? "0");
const DRY_RUN = process.env.SWEEP_DRY_RUN !== "false";
const MIN_BALANCE_NANOTON = BigInt(process.env.MIN_BALANCE_NANOTON ?? "100000000");

if (!TON_TREASURY) {
  console.error("TON_TREASURY is required");
  process.exit(1);
}
if (!Number.isFinite(MAX_INDEX) || MAX_INDEX <= 0) {
  console.error(`MAX_INDEX must be a positive integer, got ${MAX_INDEX}`);
  process.exit(1);
}
if (!Number.isFinite(START_INDEX) || START_INDEX < 0) {
  console.error(`START_INDEX must be a non-negative integer, got ${START_INDEX}`);
  process.exit(1);
}

// --- SLIP-0010 Ed25519 derivation (identical to generate-ton-pool.mjs) ---

function slip0010MasterKey(seed) {
  const I = hmac(sha512, new TextEncoder().encode("ed25519 seed"), seed);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

function slip0010Derive(parentKey, parentChainCode, index) {
  const hardenedIndex = (index | 0x80000000) >>> 0;
  const data = new Uint8Array(37);
  data[0] = 0x00;
  data.set(parentKey, 1);
  data[33] = (hardenedIndex >>> 24) & 0xff;
  data[34] = (hardenedIndex >>> 16) & 0xff;
  data[35] = (hardenedIndex >>> 8) & 0xff;
  data[36] = hardenedIndex & 0xff;
  const I = hmac(sha512, parentChainCode, data);
  return { key: I.slice(0, 32), chainCode: I.slice(32) };
}

function deriveEd25519Path(seed, path) {
  let { key, chainCode } = slip0010MasterKey(seed);
  for (const segment of path) {
    ({ key, chainCode } = slip0010Derive(key, chainCode, segment));
  }
  return key;
}

// --- Main ---

async function main() {
  // Read mnemonic from stdin
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const mnemonic = Buffer.concat(chunks).toString("utf-8").trim();

  if (!bip39.validateMnemonic(mnemonic, wordlist)) {
    console.error("Invalid mnemonic");
    process.exit(1);
  }

  const seed = await bip39.mnemonicToSeed(mnemonic);

  console.log(
    `Deriving keys for indices ${START_INDEX}..${START_INDEX + MAX_INDEX - 1} ` +
      `(${MAX_INDEX} addresses)...`,
  );

  // Build the KeyPair set by deriving from the mnemonic.
  const keys = [];
  for (let i = START_INDEX; i < START_INDEX + MAX_INDEX; i++) {
    const privateKey = deriveEd25519Path(seed, [44, 607, i]);
    const publicKey = ed25519.getPublicKey(privateKey);
    const address = computeWalletV4R2Address(publicKey);
    keys.push({ privateKey, publicKey, address, index: i });
  }

  console.log(`  derived ${keys.length} keys. Scanning balances...`);

  const sweeper = new TonSweeper({
    rpcUrl: TON_RPC,
    rpcHeaders: TON_API_KEY ? { "X-API-Key": TON_API_KEY } : {},
    token: "TON",
    chain: "ton",
    decimals: 9,
  });

  // Filter to only those above threshold before calling sweep (saves RPC on deeps).
  const deposits = await sweeper.scan(keys, TON_TREASURY);
  const sweepable = deposits.filter((d) => d.nativeBalance >= MIN_BALANCE_NANOTON);
  console.log(`  ${deposits.length} addresses have balance; ${sweepable.length} above threshold.`);

  if (sweepable.length === 0) {
    console.log("Nothing to sweep.");
    return;
  }

  for (const d of sweepable) {
    console.log(
      `  [${d.index}] ${d.address}: ${(Number(d.nativeBalance) / 1e9).toFixed(4)} TON`,
    );
  }

  const keysToSweep = keys.filter((k) => sweepable.some((d) => d.index === k.index));
  console.log(`\n${DRY_RUN ? "DRY RUN" : "BROADCASTING"} sweep of ${keysToSweep.length} addresses...`);

  const results = await sweeper.sweep(keysToSweep, TON_TREASURY, DRY_RUN);
  for (const r of results) {
    const amtTon = (Number(r.amount) / 1e9).toFixed(4);
    console.log(`  [${r.index}] ${r.address}: ${amtTon} TON → ${r.txHash}`);
  }

  const totalNanoton = results.reduce((sum, r) => sum + BigInt(r.amount), 0n);
  console.log(`\nSwept ${(Number(totalNanoton) / 1e9).toFixed(4)} TON total.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
