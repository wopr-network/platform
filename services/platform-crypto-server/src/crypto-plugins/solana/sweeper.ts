import { ed25519 } from "@noble/curves/ed25519.js";
import type {
	DepositInfo,
	ISweepStrategy,
	KeyPair,
	SweeperOpts,
	SweepResult,
} from "@wopr-network/platform-crypto-server/plugin";
import type { SolanaRpcCall } from "./types.js";
import { createSolanaRpcCaller } from "./watcher.js";

/** Transaction fee estimate (in lamports). */
const TX_FEE = 5_000n;

/** SPL Token program ID. */
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

/** System program ID. */
const SYSTEM_PROGRAM_ID = "11111111111111111111111111111111";

// --- Base58 for Solana ---

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58decode(str: string): Uint8Array {
	let num = 0n;
	for (const ch of str) {
		const idx = BASE58_ALPHABET.indexOf(ch);
		if (idx < 0) throw new Error(`Invalid Base58 char: ${ch}`);
		num = num * 58n + BigInt(idx);
	}
	const bytes: number[] = [];
	while (num > 0n) {
		bytes.unshift(Number(num % 256n));
		num = num / 256n;
	}
	let leadingZeros = 0;
	for (const ch of str) {
		if (ch !== "1") break;
		leadingZeros++;
	}
	return new Uint8Array([...new Array(leadingZeros).fill(0), ...bytes]);
}

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
	return encoded || "1";
}

// --- Solana transaction helpers ---

/** Compact-u16 encoding used by Solana for array lengths. */
function encodeCompactU16(value: number): Uint8Array {
	if (value < 0x80) return new Uint8Array([value]);
	if (value < 0x4000) return new Uint8Array([(value & 0x7f) | 0x80, value >> 7]);
	return new Uint8Array([(value & 0x7f) | 0x80, ((value >> 7) & 0x7f) | 0x80, value >> 14]);
}

/** Write a u32 as little-endian bytes. */
function writeU32LE(value: number): Uint8Array {
	const buf = new Uint8Array(4);
	buf[0] = value & 0xff;
	buf[1] = (value >> 8) & 0xff;
	buf[2] = (value >> 16) & 0xff;
	buf[3] = (value >> 24) & 0xff;
	return buf;
}

/** Write a u64 as little-endian bytes. */
function writeU64LE(value: bigint): Uint8Array {
	const buf = new Uint8Array(8);
	for (let i = 0; i < 8; i++) {
		buf[i] = Number(value & 0xffn);
		value = value >> 8n;
	}
	return buf;
}

/** Concatenate multiple Uint8Arrays. */
function concatBytes(...arrays: Uint8Array[]): Uint8Array {
	const total = arrays.reduce((sum, a) => sum + a.length, 0);
	const result = new Uint8Array(total);
	let offset = 0;
	for (const a of arrays) {
		result.set(a, offset);
		offset += a.length;
	}
	return result;
}

/**
 * Build a Solana transaction message (v0 legacy format).
 * Returns the serialized message bytes for signing.
 */
function buildTransactionMessage(
	recentBlockhash: string,
	feePayer: Uint8Array,
	instructions: Array<{
		programId: Uint8Array;
		accounts: Array<{ pubkey: Uint8Array; isSigner: boolean; isWritable: boolean }>;
		data: Uint8Array;
	}>,
): Uint8Array {
	// Collect all unique accounts
	const accountMap = new Map<string, { pubkey: Uint8Array; isSigner: boolean; isWritable: boolean }>();
	const feePayerKey = base58encode(feePayer);
	accountMap.set(feePayerKey, { pubkey: feePayer, isSigner: true, isWritable: true });

	for (const ix of instructions) {
		const progKey = base58encode(ix.programId);
		if (!accountMap.has(progKey)) {
			accountMap.set(progKey, { pubkey: ix.programId, isSigner: false, isWritable: false });
		}
		for (const acc of ix.accounts) {
			const key = base58encode(acc.pubkey);
			const existing = accountMap.get(key);
			if (existing) {
				existing.isSigner = existing.isSigner || acc.isSigner;
				existing.isWritable = existing.isWritable || acc.isWritable;
			} else {
				accountMap.set(key, { ...acc });
			}
		}
	}

	// Sort: signers+writable first, then signers+readonly, then non-signers+writable, then non-signers+readonly
	// Fee payer is always first
	const accounts = [...accountMap.values()];
	accounts.sort((a, b) => {
		const aKey = base58encode(a.pubkey);
		const bKey = base58encode(b.pubkey);
		if (aKey === feePayerKey) return -1;
		if (bKey === feePayerKey) return 1;
		if (a.isSigner !== b.isSigner) return a.isSigner ? -1 : 1;
		if (a.isWritable !== b.isWritable) return a.isWritable ? -1 : 1;
		return 0;
	});

	const numRequiredSignatures = accounts.filter((a) => a.isSigner).length;
	const numReadonlySignedAccounts = accounts.filter((a) => a.isSigner && !a.isWritable).length;
	const numReadonlyUnsignedAccounts = accounts.filter((a) => !a.isSigner && !a.isWritable).length;

	const accountKeyIndex = new Map<string, number>();
	for (let i = 0; i < accounts.length; i++) {
		accountKeyIndex.set(base58encode(accounts[i].pubkey), i);
	}

	// Serialize message
	const header = new Uint8Array([numRequiredSignatures, numReadonlySignedAccounts, numReadonlyUnsignedAccounts]);
	const accountKeysLen = encodeCompactU16(accounts.length);
	const accountKeysData = concatBytes(...accounts.map((a) => a.pubkey));
	const blockhashBytes = base58decode(recentBlockhash);
	const instructionsLen = encodeCompactU16(instructions.length);

	const ixData: Uint8Array[] = [];
	for (const ix of instructions) {
		const progIdx = accountKeyIndex.get(base58encode(ix.programId));
		if (progIdx === undefined) throw new Error("Program ID not in account list");
		const accountIdxs = ix.accounts.map((a) => {
			const idx = accountKeyIndex.get(base58encode(a.pubkey));
			if (idx === undefined) throw new Error("Account not in account list");
			return idx;
		});
		ixData.push(
			concatBytes(
				new Uint8Array([progIdx]),
				encodeCompactU16(accountIdxs.length),
				new Uint8Array(accountIdxs),
				encodeCompactU16(ix.data.length),
				ix.data,
			),
		);
	}

	return concatBytes(header, accountKeysLen, accountKeysData, blockhashBytes, instructionsLen, ...ixData);
}

/**
 * Sign and serialize a full Solana transaction (legacy format).
 * Returns base58-encoded wire format ready for sendTransaction.
 */
function signAndSerialize(messageBytes: Uint8Array, signers: Uint8Array[]): string {
	const signatures: Uint8Array[] = [];
	for (const secretKey of signers) {
		const sig = ed25519.sign(messageBytes, secretKey.slice(0, 32));
		signatures.push(sig);
	}

	const numSigs = encodeCompactU16(signatures.length);
	const wire = concatBytes(numSigs, ...signatures, messageBytes);
	return base58encode(wire);
}

/**
 * Solana sweep strategy.
 *
 * Scans deposit addresses for SOL balances and SPL token balances,
 * then creates transfer transactions to sweep funds to the treasury.
 */
export class SolanaSweeper implements ISweepStrategy {
	private readonly rpc: SolanaRpcCall;
	private readonly token: string;
	private readonly chain: string;
	private readonly contractAddress?: string;
	private readonly decimals: number;

	constructor(opts: SweeperOpts) {
		this.rpc = createSolanaRpcCaller(opts.rpcUrl, opts.rpcHeaders);
		this.token = opts.token;
		this.chain = opts.chain;
		this.contractAddress = opts.contractAddress;
		this.decimals = opts.decimals;
	}

	/**
	 * Scan deposit addresses for balances.
	 *
	 * For each key:
	 *   - Check native SOL balance via getBalance
	 *   - Check SPL token balances via getTokenAccountsByOwner
	 */
	async scan(keys: KeyPair[], _treasury: string): Promise<DepositInfo[]> {
		const results: DepositInfo[] = [];

		for (const key of keys) {
			const balance = (await this.rpc("getBalance", [key.address])) as { value: number };
			const nativeBalance = BigInt(balance.value);

			const tokenBalances: Array<{ token: string; balance: bigint; decimals: number }> = [];

			if (this.contractAddress) {
				const tokenAccounts = (await this.rpc("getTokenAccountsByOwner", [
					key.address,
					{ mint: this.contractAddress },
					{ encoding: "jsonParsed" },
				])) as {
					value: Array<{
						account: {
							data: {
								parsed: {
									info: {
										tokenAmount: { amount: string; decimals: number };
										mint: string;
									};
								};
							};
						};
					}>;
				};

				for (const ta of tokenAccounts.value) {
					const info = ta.account.data.parsed.info;
					const bal = BigInt(info.tokenAmount.amount);
					if (bal > 0n) {
						tokenBalances.push({
							token: info.mint,
							balance: bal,
							decimals: info.tokenAmount.decimals,
						});
					}
				}
			}

			if (nativeBalance > 0n || tokenBalances.length > 0) {
				results.push({
					index: key.index,
					address: key.address,
					nativeBalance,
					tokenBalances,
				});
			}
		}

		return results;
	}

	/**
	 * Sweep funds from deposit addresses to treasury.
	 *
	 * For native SOL: transfers balance minus fee.
	 * For SPL tokens: transfers full token balance using token transfer instruction.
	 *
	 * In dry-run mode, returns what would be swept without broadcasting.
	 */
	async sweep(keys: KeyPair[], treasury: string, dryRun: boolean): Promise<SweepResult[]> {
		const deposits = await this.scan(keys, treasury);
		const results: SweepResult[] = [];

		for (const deposit of deposits) {
			const key = keys.find((k) => k.index === deposit.index);
			if (!key) continue;

			// Sweep SPL tokens first
			for (const tb of deposit.tokenBalances) {
				if (dryRun) {
					results.push({
						index: deposit.index,
						address: deposit.address,
						token: tb.token,
						amount: tb.balance.toString(),
						txHash: "dry-run",
					});
					continue;
				}

				// In production, this would build and sign an SPL token transfer transaction
				// using @solana/web3.js. For now, placeholder for the transaction submission.
				const txHash = await this.submitSplTransfer(key, treasury, tb.token, tb.balance);
				results.push({
					index: deposit.index,
					address: deposit.address,
					token: tb.token,
					amount: tb.balance.toString(),
					txHash,
				});
			}

			// Sweep native SOL (leave enough for rent + fee if token accounts exist)
			const sweepableNative = deposit.nativeBalance - TX_FEE;
			if (sweepableNative > 0n) {
				if (dryRun) {
					results.push({
						index: deposit.index,
						address: deposit.address,
						token: "SOL",
						amount: sweepableNative.toString(),
						txHash: "dry-run",
					});
					continue;
				}

				const txHash = await this.submitSolTransfer(key, treasury, sweepableNative);
				results.push({
					index: deposit.index,
					address: deposit.address,
					token: "SOL",
					amount: sweepableNative.toString(),
					txHash,
				});
			}
		}

		return results;
	}

	/**
	 * Submit a native SOL transfer via SystemProgram.transfer.
	 *
	 * Builds the instruction manually, signs with Ed25519, and submits via sendTransaction.
	 */
	private async submitSolTransfer(key: KeyPair, treasury: string, lamports: bigint): Promise<string> {
		const blockhashResult = (await this.rpc("getLatestBlockhash", [{ commitment: "finalized" }])) as {
			value: { blockhash: string; lastValidBlockHeight: number };
		};

		const fromPubkey = base58decode(key.address);
		const toPubkey = base58decode(treasury);
		const systemProgramId = base58decode(SYSTEM_PROGRAM_ID);

		// SystemProgram.Transfer instruction: index 2, followed by u64 lamports
		const ixData = concatBytes(writeU32LE(2), writeU64LE(lamports));

		const message = buildTransactionMessage(blockhashResult.value.blockhash, fromPubkey, [
			{
				programId: systemProgramId,
				accounts: [
					{ pubkey: fromPubkey, isSigner: true, isWritable: true },
					{ pubkey: toPubkey, isSigner: false, isWritable: true },
				],
				data: ixData,
			},
		]);

		// Ed25519 signing requires the 64-byte secret key (32-byte seed + 32-byte pubkey)
		const secretKey = concatBytes(key.privateKey, fromPubkey);
		const serialized = signAndSerialize(message, [secretKey]);

		const result = (await this.rpc("sendTransaction", [serialized, { encoding: "base58" }])) as string;
		return result;
	}

	/**
	 * Submit an SPL token transfer.
	 *
	 * Finds or derives the associated token accounts for sender and receiver,
	 * then builds a TokenProgram.Transfer instruction.
	 */
	private async submitSplTransfer(key: KeyPair, treasury: string, mint: string, amount: bigint): Promise<string> {
		const blockhashResult = (await this.rpc("getLatestBlockhash", [{ commitment: "finalized" }])) as {
			value: { blockhash: string; lastValidBlockHeight: number };
		};

		const fromPubkey = base58decode(key.address);
		const tokenProgramId = base58decode(TOKEN_PROGRAM_ID);

		// Find sender's token account for this mint
		const senderAccounts = (await this.rpc("getTokenAccountsByOwner", [
			key.address,
			{ mint },
			{ encoding: "jsonParsed" },
		])) as { value: Array<{ pubkey: string }> };

		if (senderAccounts.value.length === 0) {
			throw new Error(`No token account found for ${key.address} mint ${mint}`);
		}
		const senderTokenAccount = base58decode(senderAccounts.value[0].pubkey);

		// Find receiver's token account for this mint
		const receiverAccounts = (await this.rpc("getTokenAccountsByOwner", [
			treasury,
			{ mint },
			{ encoding: "jsonParsed" },
		])) as { value: Array<{ pubkey: string }> };

		if (receiverAccounts.value.length === 0) {
			throw new Error(`No token account found for treasury ${treasury} mint ${mint} — create ATA first`);
		}
		const receiverTokenAccount = base58decode(receiverAccounts.value[0].pubkey);

		// SPL Token Transfer instruction: index 3, followed by u64 amount
		const ixData = concatBytes(new Uint8Array([3]), writeU64LE(amount));

		const message = buildTransactionMessage(blockhashResult.value.blockhash, fromPubkey, [
			{
				programId: tokenProgramId,
				accounts: [
					{ pubkey: senderTokenAccount, isSigner: false, isWritable: true },
					{ pubkey: receiverTokenAccount, isSigner: false, isWritable: true },
					{ pubkey: fromPubkey, isSigner: true, isWritable: false },
				],
				data: ixData,
			},
		]);

		const secretKey = concatBytes(key.privateKey, fromPubkey);
		const serialized = signAndSerialize(message, [secretKey]);

		const result = (await this.rpc("sendTransaction", [serialized, { encoding: "base58" }])) as string;
		return result;
	}
}
