/**
 * Tron sweep strategy -- consolidates TRX + TRC-20s from deposit addresses to treasury.
 *
 * Uses Tron HTTP API (not EVM JSON-RPC).
 *
 * 3-phase sweep:
 *   1. Sweep TRX first -- deposit addresses self-fund bandwidth, treasury receives TRX
 *   2. Fund energy -- treasury sends TRX to TRC-20 deposit addresses
 *   3. Sweep TRC-20s -- deposit addresses send all tokens to treasury
 */

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import type { DepositInfo, ISweepStrategy, KeyPair, SweepResult } from "@wopr-network/platform-crypto-server/plugin";
import { sha256 } from "../tron/sha256.js";

// TRX has 6 decimals (1 TRX = 1,000,000 SUN)
const SUN_PER_TRX = 1_000_000n;
// Min TRX to keep for a simple TRX transfer (~1.1 TRX in SUN)
const TRX_TRANSFER_COST = 1_100_000n;
// Energy needed for TRC-20 transfer (~15 TRX in SUN, conservative)
const TRC20_ENERGY_COST = 15_000_000n;

// secp256k1.ProjectivePoint for point decompression
const ProjectivePoint = (
	secp256k1 as unknown as {
		ProjectivePoint: {
			fromHex(hex: string): { toRawBytes(compressed: boolean): Uint8Array };
		};
	}
).ProjectivePoint;

export interface TronToken {
	name: string;
	contractAddress: string; // T... base58 address
	decimals: number;
}

export interface TronSweeperOpts {
	rpcUrl: string;
	apiKey?: string;
	tokens: TronToken[];
}

// --- Base58 ---

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

function base58decode(str: string): Uint8Array {
	let num = 0n;
	for (const ch of str) {
		const idx = BASE58_ALPHABET.indexOf(ch);
		if (idx < 0) throw new Error(`Invalid Base58 char: ${ch}`);
		num = num * 58n + BigInt(idx);
	}
	const hex = num.toString(16).padStart(50, "0"); // 25 bytes = 50 hex chars
	const pairs = hex.match(/.{2}/g) ?? [];
	const bytes = new Uint8Array(pairs.map((h) => Number.parseInt(h, 16)));
	let leadingZeros = 0;
	for (const ch of str) {
		if (ch !== "1") break;
		leadingZeros++;
	}
	const result = new Uint8Array(leadingZeros + bytes.length);
	result.set(bytes, leadingZeros);
	return result;
}

// --- Hex helpers ---

function toHex(data: Uint8Array): string {
	return Array.from(data, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
	const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
	const pairs = clean.match(/.{2}/g) ?? [];
	return new Uint8Array(pairs.map((h) => Number.parseInt(h, 16)));
}

// --- Address helpers ---

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

function tronAddressToHex(tAddr: string): string {
	const decoded = base58decode(tAddr);
	return toHex(decoded.slice(0, 21));
}

function formatTrx(sun: bigint): string {
	const whole = sun / SUN_PER_TRX;
	const frac = sun % SUN_PER_TRX;
	if (frac === 0n) return `${whole}`;
	return `${whole}.${frac.toString().padStart(6, "0").replace(/0+$/, "")}`;
}

function formatTokenAmount(amount: bigint, decimals: number): string {
	return (Number(amount) / 10 ** decimals).toString();
}

// --- Tron RPC ---

export class TronSweeper implements ISweepStrategy {
	private readonly rpcUrl: string;
	private readonly apiKey?: string;
	private readonly tokens: TronToken[];
	private readonly tokenHexMap: Map<string, string>;

	constructor(opts: TronSweeperOpts) {
		this.rpcUrl = opts.rpcUrl;
		this.apiKey = opts.apiKey;
		this.tokens = opts.tokens;
		this.tokenHexMap = new Map(opts.tokens.map((t) => [t.name, tronAddressToHex(t.contractAddress)]));
	}

	private headers(): Record<string, string> {
		const h: Record<string, string> = {
			"Content-Type": "application/json",
		};
		if (this.apiKey) h["TRON-PRO-API-KEY"] = this.apiKey;
		return h;
	}

	private async post(path: string, body: Record<string, unknown>): Promise<unknown> {
		const res = await fetch(`${this.rpcUrl}${path}`, {
			method: "POST",
			headers: this.headers(),
			body: JSON.stringify(body),
		});
		if (!res.ok) throw new Error(`Tron RPC ${path} returned ${res.status}: ${await res.text()}`);
		return res.json();
	}

	private async getTrxBalance(addressHex: string): Promise<bigint> {
		const result = (await this.post("/wallet/getaccount", {
			address: addressHex,
			visible: false,
		})) as { balance?: number };
		return BigInt(result.balance ?? 0);
	}

	private async getTrc20Balance(ownerHex: string, contractHex: string): Promise<bigint> {
		const ownerBytes = ownerHex.startsWith("41") ? ownerHex.slice(2) : ownerHex;
		const parameter = ownerBytes.padStart(64, "0");

		const result = (await this.post("/wallet/triggerconstantcontract", {
			owner_address: ownerHex,
			contract_address: contractHex,
			function_selector: "balanceOf(address)",
			parameter,
			visible: false,
		})) as { constant_result?: string[] };

		if (!result.constant_result?.[0]) return 0n;
		return BigInt(`0x${result.constant_result[0]}`);
	}

	private async createTrxTransfer(
		fromHexAddr: string,
		toHexAddr: string,
		amountSun: bigint,
	): Promise<{ raw_data: unknown; raw_data_hex: string; txID: string }> {
		const result = (await this.post("/wallet/createtransaction", {
			owner_address: fromHexAddr,
			to_address: toHexAddr,
			amount: Number(amountSun),
			visible: false,
		})) as { raw_data: unknown; raw_data_hex: string; txID: string };
		if (!result.txID) throw new Error(`Failed to create TRX transfer: ${JSON.stringify(result)}`);
		return result;
	}

	private async createTrc20Transfer(
		fromHexAddr: string,
		contractHex: string,
		toHexAddr: string,
		amount: bigint,
	): Promise<{
		transaction: { raw_data: unknown; raw_data_hex: string; txID: string };
	}> {
		const toBytes = toHexAddr.startsWith("41") ? toHexAddr.slice(2) : toHexAddr;
		const amountHex = amount.toString(16).padStart(64, "0");
		const parameter = toBytes.padStart(64, "0") + amountHex;

		const result = (await this.post("/wallet/triggersmartcontract", {
			owner_address: fromHexAddr,
			contract_address: contractHex,
			function_selector: "transfer(address,uint256)",
			parameter,
			fee_limit: 100_000_000,
			visible: false,
		})) as {
			result?: { result: boolean };
			transaction: {
				raw_data: unknown;
				raw_data_hex: string;
				txID: string;
			};
		};
		if (!result.result?.result) throw new Error(`Failed to create TRC-20 transfer: ${JSON.stringify(result)}`);
		return result as {
			transaction: {
				raw_data: unknown;
				raw_data_hex: string;
				txID: string;
			};
		};
	}

	private signTransaction(
		tx: { raw_data: unknown; raw_data_hex: string; txID: string },
		privateKey: Uint8Array,
	): {
		raw_data: unknown;
		raw_data_hex: string;
		txID: string;
		signature: string[];
	} {
		const txHash = fromHex(tx.txID);
		// secp256k1.sign returns RecoveredSignature with toCompactRawBytes() and recovery
		const sig = secp256k1.sign(txHash, privateKey, { lowS: true }) as unknown as {
			toCompactRawBytes(): Uint8Array;
			recovery: number;
		};
		// Tron signature = r (32) + s (32) + recovery (1)
		const sigBytes = new Uint8Array(65);
		sigBytes.set(sig.toCompactRawBytes(), 0);
		sigBytes[64] = sig.recovery;
		return { ...tx, signature: [toHex(sigBytes)] };
	}

	private async broadcastTransaction(signedTx: unknown): Promise<string> {
		const result = (await this.post("/wallet/broadcasttransaction", signedTx as Record<string, unknown>)) as {
			result?: boolean;
			txid?: string;
			message?: string;
		};
		if (!result.result) throw new Error(`Broadcast failed: ${result.message ?? JSON.stringify(result)}`);
		return result.txid ?? (signedTx as { txID: string }).txID;
	}

	private keyToTronHex(key: KeyPair): string {
		return tronAddressToHex(key.address.startsWith("T") ? key.address : pubkeyToTronAddress(key.publicKey));
	}

	async scan(keys: KeyPair[], _treasury: string): Promise<DepositInfo[]> {
		const deposits: DepositInfo[] = [];

		for (let i = 0; i < keys.length; i++) {
			const key = keys[i];
			if (!key) continue;
			const addrHex = this.keyToTronHex(key);
			const trxBalance = await this.getTrxBalance(addrHex);

			const tokenBalances: DepositInfo["tokenBalances"] = [];
			for (const token of this.tokens) {
				const contractHex = this.tokenHexMap.get(token.name);
				if (!contractHex) continue;
				try {
					const balance = await this.getTrc20Balance(addrHex, contractHex);
					if (balance > 0n) {
						tokenBalances.push({
							token: token.name,
							balance,
							decimals: token.decimals,
						});
					}
				} catch {
					// Contract call failed
				}
			}

			if (trxBalance > 0n || tokenBalances.length > 0) {
				deposits.push({
					index: key.index,
					address: key.address,
					nativeBalance: trxBalance,
					tokenBalances,
				});
			}

			// Rate limit protection
			if (i % 10 === 9) await sleep(200);
		}

		return deposits;
	}

	async sweep(keys: KeyPair[], treasury: string, dryRun: boolean): Promise<SweepResult[]> {
		const treasuryHex = tronAddressToHex(treasury);
		const deposits = await this.scan(keys, treasury);

		if (deposits.length === 0) {
			console.log("  No Tron deposits with balances.");
			return [];
		}

		const trxDeposits = deposits.filter((d) => d.nativeBalance > TRX_TRANSFER_COST);
		const tokenDeposits = deposits.filter((d) => d.tokenBalances.length > 0);
		const totalTrx = trxDeposits.reduce((sum, d) => sum + d.nativeBalance, 0n);

		// Print scan summary
		console.log(`  Found ${trxDeposits.length} TRX deposits (${formatTrx(totalTrx)} TRX)`);
		for (const token of this.tokens) {
			const total = tokenDeposits.reduce(
				(sum, d) => sum + (d.tokenBalances.find((t) => t.token === token.name)?.balance ?? 0n),
				0n,
			);
			if (total > 0n) {
				console.log(`  ${formatTokenAmount(total, token.decimals)} ${token.name}`);
			}
		}

		if (dryRun) return [];

		const results: SweepResult[] = [];
		const keyMap = new Map(keys.map((k) => [k.index, k]));

		// Phase 1: Sweep TRX (self-funded)
		if (trxDeposits.length > 0) {
			console.log("  Phase 1: Sweeping TRX to treasury");
			for (const dep of trxDeposits) {
				const key = keyMap.get(dep.index);
				if (!key) continue;

				const sweepAmount = dep.nativeBalance - TRX_TRANSFER_COST;
				if (sweepAmount <= 0n) {
					console.log(`    [${dep.index}] Balance too low to cover fees, skipping`);
					continue;
				}

				try {
					const depHex = this.keyToTronHex(key);
					const tx = await this.createTrxTransfer(depHex, treasuryHex, sweepAmount);
					const signed = this.signTransaction(tx, key.privateKey);
					const txId = await this.broadcastTransaction(signed);
					console.log(`    [${dep.index}] Swept ${formatTrx(sweepAmount)} TRX: ${txId}`);
					await sleep(3000);
					results.push({
						index: dep.index,
						address: dep.address,
						token: "TRX",
						amount: formatTrx(sweepAmount),
						txHash: txId,
					});
				} catch (err) {
					console.error(`    [${dep.index}] Failed: ${err}`);
				}
			}
		}

		// Phase 2: Fund energy for TRC-20 sweeps
		if (tokenDeposits.length > 0) {
			const treasuryTrx = await this.getTrxBalance(treasuryHex);
			const totalEnergyNeeded =
				TRC20_ENERGY_COST * BigInt(tokenDeposits.reduce((n, d) => n + d.tokenBalances.length, 0));

			console.log("  Phase 2: Funding energy for TRC-20 sweeps");
			console.log(`    Treasury TRX: ${formatTrx(treasuryTrx)}, energy cost: ${formatTrx(totalEnergyNeeded)}`);

			if (treasuryTrx < totalEnergyNeeded) {
				console.error(
					`    Insufficient treasury TRX. Need ${formatTrx(totalEnergyNeeded)}, have ${formatTrx(treasuryTrx)}.`,
				);
				return results;
			}

			// Find treasury key
			const treasuryKey = keys.find((k) => k.address === treasury);
			if (!treasuryKey) {
				console.error("    Cannot fund energy: treasury private key not available");
				return results;
			}

			for (const dep of tokenDeposits) {
				const depHex = tronAddressToHex(dep.address);
				const depTrx = await this.getTrxBalance(depHex);
				const needed = TRC20_ENERGY_COST * BigInt(dep.tokenBalances.length);
				if (depTrx >= needed) {
					console.log(`    [${dep.index}] Already has energy TRX, skipping`);
					continue;
				}

				try {
					const fundAmount = needed - depTrx;
					const tx = await this.createTrxTransfer(treasuryHex, depHex, fundAmount);
					const signed = this.signTransaction(tx, treasuryKey.privateKey);
					const txId = await this.broadcastTransaction(signed);
					console.log(`    [${dep.index}] Funded ${formatTrx(fundAmount)} TRX: ${txId}`);
					await sleep(3000);
				} catch (err) {
					console.error(`    [${dep.index}] Fund failed: ${err}`);
				}
			}

			// Phase 3: Sweep TRC-20s
			console.log("  Phase 3: Sweeping TRC-20s to treasury");
			for (const dep of tokenDeposits) {
				const key = keyMap.get(dep.index);
				if (!key) continue;
				const depHex = this.keyToTronHex(key);

				for (const tokenBal of dep.tokenBalances) {
					const contractHex = this.tokenHexMap.get(tokenBal.token);
					if (!contractHex) continue;

					try {
						const { transaction: tx } = await this.createTrc20Transfer(
							depHex,
							contractHex,
							treasuryHex,
							tokenBal.balance,
						);
						const signed = this.signTransaction(tx, key.privateKey);
						const txId = await this.broadcastTransaction(signed);
						console.log(
							`    [${dep.index}] Swept ${formatTokenAmount(tokenBal.balance, tokenBal.decimals)} ${tokenBal.token}: ${txId}`,
						);
						await sleep(3000);
						results.push({
							index: dep.index,
							address: dep.address,
							token: tokenBal.token,
							amount: formatTokenAmount(tokenBal.balance, tokenBal.decimals),
							txHash: txId,
						});
					} catch (err) {
						console.error(`    [${dep.index}] ${tokenBal.token} sweep failed: ${err}`);
					}
				}
			}
		}

		return results;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}
