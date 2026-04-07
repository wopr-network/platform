/** JSON-RPC call function signature. */
export type SolanaRpcCall = (method: string, params: unknown[]) => Promise<unknown>;

/** Solana signature info from getSignaturesForAddress. */
export interface SignatureInfo {
	signature: string;
	slot: number;
	err: unknown | null;
	memo: string | null;
	blockTime: number | null;
	confirmationStatus: "processed" | "confirmed" | "finalized" | null;
}

/** Solana transaction metadata. */
export interface TransactionMeta {
	err: unknown | null;
	fee: number;
	preBalances: number[];
	postBalances: number[];
	preTokenBalances?: TokenBalance[];
	postTokenBalances?: TokenBalance[];
}

/** SPL token balance entry in transaction metadata. */
export interface TokenBalance {
	accountIndex: number;
	mint: string;
	uiTokenAmount: {
		amount: string;
		decimals: number;
		uiAmountString: string;
	};
	owner?: string;
}

/** Parsed Solana transaction from getTransaction. */
export interface SolanaTransaction {
	slot: number;
	blockTime: number | null;
	meta: TransactionMeta | null;
	transaction: {
		message: {
			accountKeys: string[];
			instructions: Array<{
				programIdIndex: number;
				accounts: number[];
				data: string;
			}>;
		};
		signatures: string[];
	};
}
