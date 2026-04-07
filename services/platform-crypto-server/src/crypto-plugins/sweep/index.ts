#!/usr/bin/env node

/**
 * Unified crypto sweep CLI -- consolidates deposits from all chains to treasury.
 *
 * Reads mnemonic from stdin, fetches chain config from chain server,
 * dispatches to per-chain sweep strategies.
 *
 * Usage:
 *   openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -d -pass pass:<passphrase> \
 *     -in "/mnt/g/My Drive/paperclip-wallet.enc" \
 *     | CRYPTO_SERVICE_URL=http://167.71.118.221:3100 \
 *       CRYPTO_SERVICE_KEY=sk-chain-2026 \
 *       crypto-sweep
 *
 * Env vars:
 *   CRYPTO_SERVICE_URL  -- Chain server URL (required)
 *   CRYPTO_SERVICE_KEY  -- Chain server auth key (optional)
 *   SWEEP_DRY_RUN       -- set to "false" to actually broadcast (default: true)
 *   MAX_ADDRESSES       -- how many deposit addresses to scan (default: 200)
 */

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { HDKey } from "@scure/bip32";
import * as bip39 from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { KeyPair, SweepResult } from "@wopr-network/platform-crypto-server/plugin";
import { privateKeyToAccount } from "viem/accounts";
import { SolanaSweeper } from "../solana/sweeper.js";
import { sha256 } from "../tron/sha256.js";
import { EvmSweeper, type EvmToken } from "./evm-sweeper.js";
import { TronSweeper, type TronToken } from "./tron-sweeper.js";
import { UtxoSweeper } from "./utxo-sweeper.js";

// --- Config ---

const CRYPTO_SERVICE_URL = process.env.CRYPTO_SERVICE_URL;
const CRYPTO_SERVICE_KEY = process.env.CRYPTO_SERVICE_KEY;
const DRY_RUN = process.env.SWEEP_DRY_RUN !== "false";
const MAX_INDEX = Number(process.env.MAX_ADDRESSES ?? "200");
const SUBCOMMAND = process.argv[2]; // "sweep" (default) or "pool-replenish"

// --- Chain server types ---

interface ChainMethod {
	id: string;
	token: string;
	chain: string;
	decimals: number;
	contractAddress: string | null;
	displayName: string;
	coin_type: number;
	curve: string;
	encoding: string;
	encoding_params: Record<string, string>;
	rpc_url?: string;
	rpc_headers?: Record<string, string>;
}

// Coin type to BIP-44 path and chain family
const COIN_TYPE_FAMILIES: Record<number, string> = {
	0: "utxo", // BTC
	2: "utxo", // LTC
	3: "utxo", // DOGE
	60: "evm", // ETH / EVM chains
	195: "tron", // TRX
	501: "solana", // SOL
};

// --- Address derivation ---

// Base58 for Tron addresses
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58encode(data: Uint8Array): string {
	let num = 0n;
	for (const byte of data) num = num * 256n + BigInt(byte);
	let encoded = "";
	while (num > 0n) {
		encoded = BASE58_ALPHABET[Number(num % 58n)] + encoded;
		num = num / 58n;
	}
	for (const byte of data) {
		if (byte !== 0) break;
		encoded = `1${encoded}`;
	}
	return encoded;
}

// secp256k1.ProjectivePoint for point decompression
const ProjectivePoint = (
	secp256k1 as unknown as {
		ProjectivePoint: {
			fromHex(hex: string): { toRawBytes(compressed: boolean): Uint8Array };
		};
	}
).ProjectivePoint;

function toHex(data: Uint8Array): string {
	return Array.from(data, (b) => b.toString(16).padStart(2, "0")).join("");
}

function pubkeyToTronAddress(pubkey: Uint8Array): string {
	const uncompressed: Uint8Array = ProjectivePoint.fromHex(toHex(pubkey)).toRawBytes(false);
	const hash = keccak_256(uncompressed.slice(1));
	const addressBytes = hash.slice(-20);
	const payload = new Uint8Array(21);
	payload[0] = 0x41;
	payload.set(addressBytes, 1);
	const checksum = sha256(sha256(payload));
	const full = new Uint8Array(25);
	full.set(payload);
	full.set(checksum.slice(0, 4), 21);
	return base58encode(full);
}

function deriveKeyPairs(
	master: HDKey,
	coinType: number,
	family: string,
	maxIndex: number,
	chainIndex: number,
): KeyPair[] {
	const account = master.derive(`m/44'/${coinType}'/0'`);
	const chain = account.deriveChild(chainIndex);
	const keys: KeyPair[] = [];

	for (let i = 0; i < maxIndex; i++) {
		const child = chain.deriveChild(i);
		if (!child.privateKey || !child.publicKey) continue;

		let address: string;
		if (family === "evm") {
			const privHex = `0x${toHex(child.privateKey)}` as `0x${string}`;
			address = privateKeyToAccount(privHex).address;
		} else if (family === "tron") {
			address = pubkeyToTronAddress(child.publicKey);
		} else {
			// UTXO / other -- use hex pubkey as placeholder address
			address = toHex(child.publicKey);
		}

		keys.push({
			privateKey: child.privateKey,
			publicKey: child.publicKey,
			address,
			index: i,
		});
	}

	return keys;
}

function deriveTreasuryAddress(master: HDKey, coinType: number, family: string): KeyPair {
	// Treasury = internal chain (1), index 0
	const account = master.derive(`m/44'/${coinType}'/0'`);
	const chain = account.deriveChild(1);
	const child = chain.deriveChild(0);
	if (!child.privateKey || !child.publicKey) throw new Error(`Cannot derive treasury key for coin_type ${coinType}`);

	let address: string;
	if (family === "evm") {
		const privHex = `0x${toHex(child.privateKey)}` as `0x${string}`;
		address = privateKeyToAccount(privHex).address;
	} else if (family === "tron") {
		address = pubkeyToTronAddress(child.publicKey);
	} else {
		address = toHex(child.publicKey);
	}

	return {
		privateKey: child.privateKey,
		publicKey: child.publicKey,
		address,
		index: 0,
	};
}

// --- Main ---

async function main() {
	// Validate required env
	if (!CRYPTO_SERVICE_URL) {
		console.error("CRYPTO_SERVICE_URL is required");
		process.exit(1);
	}

	// Read mnemonic from stdin
	const chunks: Buffer[] = [];
	for await (const chunk of process.stdin) {
		chunks.push(chunk as Buffer);
	}
	const mnemonic = Buffer.concat(chunks).toString("utf-8").trim();

	if (!bip39.validateMnemonic(mnemonic, wordlist)) {
		console.error("Invalid mnemonic");
		process.exit(1);
	}

	// Fetch full payment method records from admin endpoint (includes rpc_url, coin_type, etc.)
	console.log(`Fetching chains from ${CRYPTO_SERVICE_URL}/admin/chains...`);
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (CRYPTO_SERVICE_KEY) headers.Authorization = `Bearer ${CRYPTO_SERVICE_KEY}`;

	const res = await fetch(`${CRYPTO_SERVICE_URL}/admin/chains`, { headers });
	if (!res.ok) throw new Error(`Chain server returned ${res.status}`);

	const methods: ChainMethod[] = await res.json();
	console.log(`Found ${methods.length} payment methods\n`);

	// Group by coin_type
	const byCoinType = new Map<number, ChainMethod[]>();
	for (const m of methods) {
		const coinType = m.coin_type;
		if (coinType === undefined || coinType === null) {
			console.log(`  Skipping ${m.token}/${m.chain} -- no coin_type`);
			continue;
		}
		const group = byCoinType.get(coinType) ?? [];
		group.push(m);
		byCoinType.set(coinType, group);
	}

	// Derive master HD key
	const seed = bip39.mnemonicToSeedSync(mnemonic);
	const master = HDKey.fromMasterSeed(seed);

	console.log(`Dry run: ${DRY_RUN}`);
	console.log(`Max addresses: ${MAX_INDEX}\n`);

	const allResults: SweepResult[] = [];

	// Process each coin type group
	for (const [coinType, group] of byCoinType) {
		const family = COIN_TYPE_FAMILIES[coinType];
		if (!family) {
			console.log(`Skipping coin_type ${coinType} -- unsupported family`);
			continue;
		}

		const chainNames = [...new Set(group.map((m) => m.chain))].join(", ");
		console.log(`\n${"=".repeat(60)}\nCoin type ${coinType} (${family}) -- chains: ${chainNames}\n${"=".repeat(60)}`);

		// Derive deposit keys at chain=0 (external)
		const depositKeys = deriveKeyPairs(master, coinType, family, MAX_INDEX, 0);
		const treasury = deriveTreasuryAddress(master, coinType, family);
		console.log(`Treasury: ${treasury.address}`);
		console.log(`Scanning ${MAX_INDEX} deposit addresses...\n`);

		// Include treasury key in the key set so sweepers can use it for gas funding
		const allKeys = [...depositKeys, treasury];

		if (family === "utxo") {
			const sweeper = new UtxoSweeper(chainNames);
			try {
				await sweeper.sweep(allKeys, treasury.address, DRY_RUN);
			} catch (err) {
				console.log(`  ${(err as Error).message}`);
			}
			continue;
		}

		if (family === "evm") {
			// Group EVM methods by chain (each chain has its own RPC)
			const byChain = new Map<string, ChainMethod[]>();
			for (const m of group) {
				const chain = byChain.get(m.chain) ?? [];
				chain.push(m);
				byChain.set(m.chain, chain);
			}

			for (const [chainName, chainMethods] of byChain) {
				const rpcUrl = chainMethods[0]?.rpc_url;
				if (!rpcUrl) {
					console.log(`  Skipping ${chainName} -- no rpc_url in chain config`);
					continue;
				}

				const tokens: EvmToken[] = chainMethods
					.filter((m) => m.contractAddress)
					.map((m) => ({
						name: m.token,
						address: m.contractAddress as `0x${string}`,
						decimals: m.decimals,
					}));

				console.log(`\n--- ${chainName} (${tokens.length} ERC-20 tokens) ---`);
				const sweeper = new EvmSweeper({
					rpcUrl,
					chainName,
					tokens,
				});
				const results = await sweeper.sweep(allKeys, treasury.address, DRY_RUN);
				allResults.push(...results);
			}
			continue;
		}

		if (family === "tron") {
			const rpcUrl = group[0]?.rpc_url;
			if (!rpcUrl) {
				console.log("  Skipping tron -- no rpc_url in chain config");
				continue;
			}

			const tokens: TronToken[] = group
				.filter((m): m is ChainMethod & { contractAddress: string } => m.contractAddress != null)
				.map((m) => ({
					name: m.token,
					contractAddress: m.contractAddress,
					decimals: m.decimals,
				}));

			console.log(`\n--- Tron (${tokens.length} TRC-20 tokens) ---`);
			const sweeper = new TronSweeper({
				rpcUrl,
				apiKey: group[0]?.rpc_headers?.["TRON-PRO-API-KEY"],
				tokens,
			});
			const results = await sweeper.sweep(allKeys, treasury.address, DRY_RUN);
			allResults.push(...results);
			continue;
		}

		if (family === "solana") {
			// Solana uses Ed25519 — pre-derived pool keys come from the chain server
			const rpcUrl = group[0]?.rpc_url;
			if (!rpcUrl) {
				console.log("  Skipping solana -- no rpc_url in chain config");
				continue;
			}

			// For Solana, fetch pre-derived pool addresses from the chain server
			console.log(`\n--- Solana (${group.length} tokens) ---`);
			console.log("  Note: Solana uses Ed25519 pre-derived keys -- sweep requires pool keys from chain server");

			for (const method of group) {
				const sweeper = new SolanaSweeper({
					rpcUrl,
					rpcHeaders: method.rpc_headers ?? {},
					chain: method.chain,
					token: method.token,
					decimals: method.decimals,
					contractAddress: method.contractAddress ?? undefined,
				});

				// For Solana, we can't derive keys from the secp256k1 master — skip if no pool keys.
				// In production, pool keys would be fetched from the chain server's admin API.
				console.log(`  ${method.token}: scan-only (pool key sweep requires admin/pool/export endpoint)`);
				try {
					const deposits = await sweeper.scan([], treasury.address);
					if (deposits.length > 0) {
						for (const d of deposits) {
							console.log(`    [${d.index}] ${d.address}: ${d.nativeBalance} lamports`);
						}
					} else {
						console.log("    No deposits found");
					}
				} catch (err) {
					console.log(`    Scan error: ${(err as Error).message}`);
				}
			}
			continue;
		}

		console.log(`  Skipping ${family} -- no sweeper implemented`);
	}

	// Summary
	console.log(`\n${"=".repeat(60)}`);
	console.log("SWEEP SUMMARY");
	console.log(`${"=".repeat(60)}`);

	if (allResults.length === 0) {
		if (DRY_RUN) {
			console.log("Dry run complete. Set SWEEP_DRY_RUN=false to broadcast.");
		} else {
			console.log("No funds swept.");
		}
	} else {
		for (const r of allResults) {
			console.log(`  [${r.index}] ${r.address}: ${r.amount} ${r.token} -> ${r.txHash}`);
		}
		console.log(`\nTotal: ${allResults.length} transactions`);
	}

	console.log("\nDone.");
}

// --- Pool replenish subcommand ---

async function poolReplenish() {
	if (!CRYPTO_SERVICE_URL) {
		console.error("CRYPTO_SERVICE_URL is required");
		process.exit(1);
	}

	const count = Number(process.env.POOL_COUNT ?? "100");
	const chain = process.env.POOL_CHAIN;

	if (!chain) {
		console.error("POOL_CHAIN is required (e.g. 'solana')");
		process.exit(1);
	}

	console.log(`Replenishing ${count} addresses for chain "${chain}"...`);

	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (CRYPTO_SERVICE_KEY) headers.Authorization = `Bearer ${CRYPTO_SERVICE_KEY}`;

	const res = await fetch(`${CRYPTO_SERVICE_URL}/admin/pool/replenish`, {
		method: "POST",
		headers,
		body: JSON.stringify({ chain, count }),
	});

	if (!res.ok) {
		const body = await res.text();
		console.error(`Pool replenish failed: ${res.status} ${body}`);
		process.exit(1);
	}

	const result = (await res.json()) as { added: number; total: number };
	console.log(`Added ${result.added} addresses (total pool: ${result.total})`);

	// Check pool status
	const statusRes = await fetch(`${CRYPTO_SERVICE_URL}/admin/pool/status?chain=${chain}`, { headers });
	if (statusRes.ok) {
		const status = (await statusRes.json()) as { available: number; claimed: number; total: number };
		console.log(`Pool status: ${status.available} available, ${status.claimed} claimed, ${status.total} total`);
	}

	console.log("Done.");
}

// --- Entry point ---

if (SUBCOMMAND === "pool-replenish") {
	poolReplenish().catch((err) => {
		console.error(err);
		process.exit(1);
	});
} else {
	main().catch((err) => {
		console.error(err);
		process.exit(1);
	});
}
