#!/usr/bin/env node
/**
 * Generate Solana address pool from a BIP39 mnemonic using SLIP-0010 (Ed25519).
 *
 * Solana has no single canonical derivation path — different wallets use
 * different conventions. This script *auto-detects* which path produced the
 * existing pool by deriving the first few candidates and comparing against
 * addresses already in `sol-main`. If no candidate matches, it aborts.
 *
 * Prerequisites:
 *   npm install @wopr-network/crypto-plugins @noble/curves @noble/hashes @scure/bip39
 *
 * Usage:
 *   MNEMONIC="twenty four words ..." node scripts/generate-sol-pool.mjs \
 *     --verify=0:Ejobc57...BCjU,1:9tHtw...QfwV,2:2ptbj...Y1iu \
 *     --count=1000 --start-index=1000
 *
 * Verify-only (detect path, derive nothing new):
 *   MNEMONIC="..." node scripts/generate-sol-pool.mjs --verify=<samples> --detect-only
 *
 * Dry run (detect + derive but don't upload):
 *   ... --dry-run
 *
 * Options:
 *   --verify=<idx:addr,idx:addr,...>  REQUIRED. Known pool samples to match.
 *   --count=N                         Number to generate (default: 1000)
 *   --start-index=M                   First derivation_index to derive (default: auto = current max + 1)
 *   --detect-only                     Detect path, print winner, exit
 *   --dry-run                         Derive but don't upload
 *   --server=URL                      default: http://167.71.118.221:3100
 *   --admin-token=T                   default: ADMIN_TOKEN env or ks-admin-2026
 */

import { ed25519 } from "@noble/curves/ed25519";
import { hmac } from "@noble/hashes/hmac";
import { sha512 } from "@noble/hashes/sha512";
import { SolanaAddressEncoder } from "@wopr-network/crypto-plugins";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";

const MNEMONIC = process.env.MNEMONIC;
if (!MNEMONIC) {
  console.error("MNEMONIC env var required.");
  process.exit(1);
}

const argFlag = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

const VERIFY_RAW = argFlag("verify");
if (!VERIFY_RAW) {
  console.error("--verify=<idx:addr,idx:addr,...> is required. Pass at least 2 known pool samples.");
  process.exit(1);
}
const VERIFY_SAMPLES = VERIFY_RAW.split(",").map((s) => {
  const [idx, addr] = s.split(":");
  return { index: Number(idx), address: addr };
});
if (VERIFY_SAMPLES.length < 2) {
  console.error("Provide at least 2 --verify samples to disambiguate candidate paths.");
  process.exit(1);
}

const COUNT = Number(argFlag("count") ?? 1000);
const START_INDEX_ARG = argFlag("start-index");
const DETECT_ONLY = process.argv.includes("--detect-only");
const DRY_RUN = process.argv.includes("--dry-run");
const SERVER = argFlag("server") ?? "http://167.71.118.221:3100";
const ADMIN_TOKEN = argFlag("admin-token") ?? process.env.ADMIN_TOKEN ?? "ks-admin-2026";

// --- SLIP-0010 Ed25519 HD derivation (hardened-only) ---

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

// --- Candidate path strategies ---
// Each strategy takes a derivation_index `i` and returns the SLIP-0010 path array.
const CANDIDATES = [
  // Verified path for `sol-main` (Phantom/Sollet) — 2026-04-13
  { name: "m/44'/501'/{i}'/0'", build: (i) => [44, 501, i, 0] },
  { name: "m/44'/501'/{i}'", build: (i) => [44, 501, i] },
  { name: "m/44'/501'/0'/{i}'", build: (i) => [44, 501, 0, i] },
  { name: "m/44'/501'/0'/0'/{i}'", build: (i) => [44, 501, 0, 0, i] },
  { name: "m/501'/{i}'", build: (i) => [501, i] },
];

const encoder = new SolanaAddressEncoder();

function addressForPath(seed, path) {
  const priv = deriveEd25519Path(seed, path);
  const pub = ed25519.getPublicKey(priv);
  return { publicKey: pub, address: encoder.encode(pub, {}) };
}

async function main() {
  if (!bip39.validateMnemonic(MNEMONIC, wordlist)) {
    console.error("Invalid mnemonic.");
    process.exit(1);
  }
  const seed = await bip39.mnemonicToSeed(MNEMONIC);

  // --- Phase 1: detect path ---
  console.log(`Testing ${CANDIDATES.length} candidate derivation paths against ${VERIFY_SAMPLES.length} known addresses...`);
  let winner = null;
  const failures = [];
  for (const cand of CANDIDATES) {
    const allMatch = VERIFY_SAMPLES.every((s) => {
      const { address } = addressForPath(seed, cand.build(s.index));
      return address === s.address;
    });
    if (allMatch) {
      winner = cand;
      console.log(`  ✅ ${cand.name} — all samples match`);
      break;
    }
    const derived = VERIFY_SAMPLES.map((s) => addressForPath(seed, cand.build(s.index)).address);
    failures.push({ name: cand.name, derived });
    console.log(`  ❌ ${cand.name}`);
  }

  if (!winner) {
    console.error("\nNo candidate path matches. The mnemonic or the pool's original derivation scheme is different.");
    console.error("Derived vs expected for each candidate:");
    for (const f of failures) {
      console.error(`\n  ${f.name}:`);
      for (let i = 0; i < VERIFY_SAMPLES.length; i++) {
        console.error(`    idx ${VERIFY_SAMPLES[i].index}: got ${f.derived[i]} / expected ${VERIFY_SAMPLES[i].address}`);
      }
    }
    process.exit(2);
  }

  console.log(`\nDetected derivation path: ${winner.name}`);
  if (DETECT_ONLY) return;

  // --- Phase 2: determine start_index ---
  let startIndex;
  if (START_INDEX_ARG != null) {
    startIndex = Number(START_INDEX_ARG);
  } else {
    console.log("\nFetching current pool depth to auto-pick start-index...");
    const res = await fetch(`${SERVER}/admin/pool/status`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    if (!res.ok) {
      console.error(`Failed to fetch pool status: ${res.status}`);
      process.exit(1);
    }
    const status = await res.json();
    const solPool = status.pools?.find((p) => p.key_ring_id === "sol-main");
    if (!solPool) {
      console.error("No sol-main pool found on server.");
      process.exit(1);
    }
    startIndex = solPool.total;
    console.log(`  sol-main has ${solPool.total} total (${solPool.available} available). Starting at index ${startIndex}.`);
  }

  // --- Phase 3: derive new addresses ---
  console.log(`\nDeriving ${COUNT} addresses at indices ${startIndex}..${startIndex + COUNT - 1}...`);
  const addresses = [];
  for (let i = 0; i < COUNT; i++) {
    const derivationIndex = startIndex + i;
    const { publicKey, address } = addressForPath(seed, winner.build(derivationIndex));
    addresses.push({
      index: derivationIndex,
      public_key: Buffer.from(publicKey).toString("hex"),
      address,
    });
    if (i > 0 && i % 200 === 0) console.log(`  ${i}/${COUNT}...`);
  }
  console.log(`Generated ${addresses.length}. First: ${addresses[0].address}  Last: ${addresses.at(-1).address}`);

  if (DRY_RUN) {
    console.log("\nDry run — not uploading.");
    return;
  }

  // --- Phase 4: upload ---
  console.log(`\nPOST ${SERVER}/admin/pool/replenish ...`);
  const res = await fetch(`${SERVER}/admin/pool/replenish`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ADMIN_TOKEN}` },
    body: JSON.stringify({
      key_ring_id: "sol-main",
      plugin_id: "solana",
      encoding: "base58-solana",
      addresses,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Upload failed: ${res.status} ${body}`);
    process.exit(1);
  }
  console.log("Upload complete:", await res.json());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
