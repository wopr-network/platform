/** Configuration for a bitcoind-compatible JSON-RPC node (BTC, LTC, DOGE). */
export interface UtxoNodeConfig {
	readonly rpcUrl: string;
	readonly rpcUser: string;
	readonly rpcPassword: string;
	readonly network: "mainnet" | "testnet" | "regtest";
	readonly confirmations: number;
}

/** A single "received by address" entry from listreceivedbyaddress. */
export interface ReceivedByAddress {
	address: string;
	amount: number;
	confirmations: number;
	txids: string[];
}

/** Transaction detail from gettransaction. */
export interface TxDetail {
	address: string;
	amount: number;
	category: string;
}

/** Response from gettransaction RPC call. */
export interface GetTransactionResponse {
	details: TxDetail[];
	confirmations: number;
}

/** Descriptor info response from getdescriptorinfo. */
export interface DescriptorInfo {
	descriptor: string;
}

/** Result of importdescriptors RPC call. */
export interface ImportDescriptorResult {
	success: boolean;
	error?: { message: string };
}

/** JSON-RPC call signature for bitcoind-compatible nodes. */
export type RpcCall = (method: string, params: unknown[]) => Promise<unknown>;
