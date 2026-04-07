/**
 * EVM sweep strategy -- consolidates ETH + ERC-20s from deposit addresses to treasury.
 *
 * 3-phase sweep:
 *   1. Sweep ETH first -- deposit addresses self-fund gas, treasury receives ETH
 *   2. Fund gas -- treasury sends ETH to ERC-20 deposit addresses
 *   3. Sweep ERC-20s -- deposit addresses send all tokens to treasury
 */
import type { DepositInfo, ISweepStrategy, KeyPair, SweepResult } from "@wopr-network/platform-crypto-server/plugin";
import {
	type Address,
	type Chain,
	createPublicClient,
	createWalletClient,
	defineChain,
	formatEther,
	formatUnits,
	http,
	type PublicClient,
	type Transport,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ERC20_ABI = [
	{
		name: "balanceOf",
		type: "function",
		stateMutability: "view",
		inputs: [{ name: "account", type: "address" }],
		outputs: [{ name: "", type: "uint256" }],
	},
	{
		name: "transfer",
		type: "function",
		stateMutability: "nonpayable",
		inputs: [
			{ name: "to", type: "address" },
			{ name: "amount", type: "uint256" },
		],
		outputs: [{ name: "", type: "bool" }],
	},
] as const;

export interface EvmToken {
	name: string;
	address: Address;
	decimals: number;
}

export interface EvmSweeperOpts {
	rpcUrl: string;
	chainName: string;
	tokens: EvmToken[];
}

export class EvmSweeper implements ISweepStrategy {
	private readonly rpcUrl: string;
	private readonly chainName: string;
	private readonly tokens: EvmToken[];
	private readonly chain: Chain;
	private readonly publicClient: PublicClient<Transport, Chain>;

	constructor(opts: EvmSweeperOpts) {
		this.rpcUrl = opts.rpcUrl;
		this.chainName = opts.chainName;
		this.tokens = opts.tokens;

		this.chain = defineChain({
			id: 1,
			name: this.chainName,
			nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
			rpcUrls: { default: { http: [this.rpcUrl] } },
		});

		this.publicClient = createPublicClient({
			chain: this.chain,
			transport: http(this.rpcUrl),
		});
	}

	async scan(keys: KeyPair[], _treasury: string): Promise<DepositInfo[]> {
		const deposits: DepositInfo[] = [];

		for (const key of keys) {
			const addr = key.address as Address;
			const ethBalance = await this.publicClient.getBalance({ address: addr });

			const tokenBalances: DepositInfo["tokenBalances"] = [];
			for (const token of this.tokens) {
				try {
					const balance = await this.publicClient.readContract({
						address: token.address,
						abi: ERC20_ABI,
						functionName: "balanceOf",
						args: [addr],
					});
					if (balance > 0n) {
						tokenBalances.push({
							token: token.name,
							balance,
							decimals: token.decimals,
						});
					}
				} catch {
					// Contract may not exist on this chain
				}
			}

			if (ethBalance > 0n || tokenBalances.length > 0) {
				deposits.push({
					index: key.index,
					address: key.address,
					nativeBalance: ethBalance,
					tokenBalances,
				});
			}
		}

		return deposits;
	}

	async sweep(keys: KeyPair[], treasury: string, dryRun: boolean): Promise<SweepResult[]> {
		const treasuryAddress = treasury as Address;
		const deposits = await this.scan(keys, treasury);

		if (deposits.length === 0) {
			console.log("  No EVM deposits with balances.");
			return [];
		}

		const gasPrice = await this.publicClient.getGasPrice();
		const ethTransferGas = 21_000n * gasPrice;
		const erc20TransferGas = 65_000n * gasPrice;

		const ethDeposits = deposits.filter((d) => d.nativeBalance > ethTransferGas);
		const tokenDeposits = deposits.filter((d) => d.tokenBalances.length > 0);

		// Print scan summary
		const totalEth = ethDeposits.reduce((sum, d) => sum + d.nativeBalance, 0n);
		console.log(`  Found ${ethDeposits.length} ETH deposits (${formatEther(totalEth)} ETH)`);
		for (const token of this.tokens) {
			const total = tokenDeposits.reduce(
				(sum, d) => sum + (d.tokenBalances.find((t) => t.token === token.name)?.balance ?? 0n),
				0n,
			);
			if (total > 0n) {
				console.log(`  ${formatUnits(total, token.decimals)} ${token.name}`);
			}
		}

		if (dryRun) return [];

		const results: SweepResult[] = [];
		const keyMap = new Map(keys.map((k) => [k.index, k]));

		// Phase 1: Sweep ETH (self-funded gas)
		if (ethDeposits.length > 0) {
			console.log("  Phase 1: Sweeping ETH to treasury (self-funded gas)");
			for (const dep of ethDeposits) {
				const key = keyMap.get(dep.index);
				if (!key) continue;

				const privHex = toHexString(key.privateKey);
				const depAccount = privateKeyToAccount(privHex);
				const depWallet = createWalletClient({
					chain: this.chain,
					transport: http(this.rpcUrl),
					account: depAccount,
				});

				const sweepAmount = dep.nativeBalance - ethTransferGas;
				if (sweepAmount <= 0n) {
					console.log(`    [${dep.index}] Balance too low to cover gas, skipping`);
					continue;
				}

				const hash = await depWallet.sendTransaction({
					to: treasuryAddress,
					value: sweepAmount,
				});
				console.log(`    [${dep.index}] Swept ${formatEther(sweepAmount)} ETH: ${hash}`);
				await this.publicClient.waitForTransactionReceipt({ hash });
				results.push({
					index: dep.index,
					address: dep.address,
					token: "ETH",
					amount: formatEther(sweepAmount),
					txHash: hash,
				});
			}
		}

		// Phase 2: Fund gas for ERC-20 sweeps
		if (tokenDeposits.length > 0) {
			const treasuryKey = keys.find((k) => k.address.toLowerCase() === treasury.toLowerCase());
			if (!treasuryKey) {
				// Treasury key not in the deposit keys -- derive from the first key's parent
				// The caller must ensure the treasury key is passed separately or handle this
				console.log("  Warning: treasury key not found in key set, using external treasury wallet");
			}

			console.log("  Phase 2: Funding gas for ERC-20 sweeps");
			const treasuryEth = await this.publicClient.getBalance({
				address: treasuryAddress,
			});
			const totalGasNeeded = erc20TransferGas * BigInt(tokenDeposits.reduce((n, d) => n + d.tokenBalances.length, 0));
			console.log(`    Treasury ETH: ${formatEther(treasuryEth)}, gas needed: ${formatEther(totalGasNeeded)}`);

			if (treasuryEth < totalGasNeeded) {
				console.error(
					`    Insufficient treasury ETH for gas. Need ${formatEther(totalGasNeeded)}, have ${formatEther(treasuryEth)}.`,
				);
				return results;
			}

			// We need to create a treasury wallet -- derive key for chain=1, index=0
			// This is handled by the caller passing treasuryPrivKey via env or key array
			// For now, we assume the treasury has enough gas from the ETH sweep
			const treasuryPrivHex = treasuryKey ? toHexString(treasuryKey.privateKey) : null;
			if (!treasuryPrivHex) {
				console.error("    Cannot fund gas: treasury private key not available");
				return results;
			}

			const treasuryWallet = createWalletClient({
				chain: this.chain,
				transport: http(this.rpcUrl),
				account: privateKeyToAccount(treasuryPrivHex),
			});

			for (const dep of tokenDeposits) {
				const depEth = await this.publicClient.getBalance({
					address: dep.address as Address,
				});
				const needed = erc20TransferGas * BigInt(dep.tokenBalances.length);
				if (depEth >= needed) {
					console.log(`    [${dep.index}] Already has gas, skipping`);
					continue;
				}

				const hash = await treasuryWallet.sendTransaction({
					to: dep.address as Address,
					value: needed - depEth,
				});
				console.log(`    [${dep.index}] Funded ${formatEther(needed - depEth)} ETH: ${hash}`);
				await this.publicClient.waitForTransactionReceipt({ hash });
			}

			// Phase 3: Sweep ERC-20s
			console.log("  Phase 3: Sweeping ERC-20s to treasury");
			for (const dep of tokenDeposits) {
				const key = keyMap.get(dep.index);
				if (!key) continue;

				const privHex = toHexString(key.privateKey);
				const depAccount = privateKeyToAccount(privHex);
				const depWallet = createWalletClient({
					chain: this.chain,
					transport: http(this.rpcUrl),
					account: depAccount,
				});

				for (const tokenBal of dep.tokenBalances) {
					const tokenDef = this.tokens.find((t) => t.name === tokenBal.token);
					if (!tokenDef) continue;

					const hash = await depWallet.writeContract({
						address: tokenDef.address,
						abi: ERC20_ABI,
						functionName: "transfer",
						args: [treasuryAddress, tokenBal.balance],
					});
					console.log(
						`    [${dep.index}] Swept ${formatUnits(tokenBal.balance, tokenBal.decimals)} ${tokenBal.token}: ${hash}`,
					);
					await this.publicClient.waitForTransactionReceipt({
						hash,
					});
					results.push({
						index: dep.index,
						address: dep.address,
						token: tokenBal.token,
						amount: formatUnits(tokenBal.balance, tokenBal.decimals),
						txHash: hash,
					});
				}
			}
		}

		return results;
	}
}

function toHexString(bytes: Uint8Array): `0x${string}` {
	return `0x${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
}
