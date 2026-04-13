/**
 * Shared JSON-RPC types for EVM-like watchers (EVM mainnets + Tron).
 *
 * Solana is intentionally excluded — its RPC surface (getSignaturesForAddress
 * + getTransaction) is shaped completely differently and has its own dedup key.
 */

/** JSON-RPC call function signature — matches the one in evm/types.ts. */
export type RpcCall = (method: string, params: unknown[]) => Promise<unknown>;

/** Raw JSON-RPC log entry (eth_getLogs shape). */
export interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

/** Transfer(address,address,uint256) topic — standard ERC-20/TRC-20. */
export const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/**
 * Create a JSON-RPC caller bound to a URL (plain POST + JSON envelope).
 *
 * Kept identical in behavior to the per-plugin createRpcCaller helpers so
 * the base watcher can default to constructing one from rpcUrl when callers
 * don't inject a custom RpcCall. That preserves the existing constructor
 * contract (rpcUrl in, watcher out) while opening a seam for tests to pass
 * a vi.fn-backed RpcCall without monkey-patching globalThis.fetch.
 */
export function createRpcCaller(rpcUrl: string, extraHeaders?: Record<string, string>): RpcCall {
  let id = 0;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...extraHeaders,
  };
  return async (method: string, params: unknown[]): Promise<unknown> => {
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
    });
    if (!res.ok) {
      throw new Error(`RPC ${method} failed: ${res.status}`);
    }
    const data = (await res.json()) as {
      result?: unknown;
      error?: { message: string };
    };
    if (data.error) throw new Error(`RPC ${method} error: ${data.error.message}`);
    return data.result;
  };
}
