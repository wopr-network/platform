import type { RpcCall } from "./types.js";

interface RpcConfig {
	rpcUrl: string;
	rpcUser: string;
	rpcPassword: string;
}

/**
 * Parse RPC credentials from a URL with embedded basic auth.
 * e.g. "http://user:pass@host:8332" -> { rpcUrl: "http://host:8332", rpcUser: "user", rpcPassword: "pass" }
 * If no auth in URL, returns the URL as-is with empty credentials.
 */
export function parseRpcUrl(url: string): RpcConfig {
	try {
		const parsed = new URL(url);
		if (parsed.username) {
			const rpcUser = decodeURIComponent(parsed.username);
			const rpcPassword = decodeURIComponent(parsed.password);
			parsed.username = "";
			parsed.password = "";
			return { rpcUrl: parsed.toString().replace(/\/$/, ""), rpcUser, rpcPassword };
		}
	} catch {
		// Not a valid URL with auth, return as-is
	}
	return { rpcUrl: url, rpcUser: "", rpcPassword: "" };
}

/**
 * Create a JSON-RPC caller for a bitcoind-compatible node (BTC, LTC, DOGE).
 * Uses basic auth and JSON-RPC 1.0 protocol.
 */
export function createBitcoindRpc(rpcUrl: string, rpcUser: string, rpcPassword: string): RpcCall {
	let id = 0;
	const auth = btoa(`${rpcUser}:${rpcPassword}`);
	return async (method: string, params: unknown[]): Promise<unknown> => {
		const res = await fetch(rpcUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Basic ${auth}`,
			},
			body: JSON.stringify({ jsonrpc: "1.0", id: ++id, method, params }),
		});
		if (!res.ok) throw new Error(`RPC ${method} failed: ${res.status}`);
		const data = (await res.json()) as { result?: unknown; error?: { message: string } };
		if (data.error) throw new Error(`RPC ${method}: ${data.error.message}`);
		return data.result;
	};
}

/**
 * Create a bitcoind-compatible RPC caller from WatcherOpts-style config.
 * Parses rpcUrl for embedded credentials, falls back to rpcHeaders Authorization.
 */
export function createRpcFromOpts(rpcUrl: string, rpcHeaders: Record<string, string>): RpcCall {
	// Try parsing credentials from URL
	const parsed = parseRpcUrl(rpcUrl);
	if (parsed.rpcUser) {
		return createBitcoindRpc(parsed.rpcUrl, parsed.rpcUser, parsed.rpcPassword);
	}

	// Fall back to rpcHeaders (may contain Authorization header)
	let id = 0;
	return async (method: string, params: unknown[]): Promise<unknown> => {
		const res = await fetch(rpcUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				...rpcHeaders,
			},
			body: JSON.stringify({ jsonrpc: "1.0", id: ++id, method, params }),
		});
		if (!res.ok) throw new Error(`RPC ${method} failed: ${res.status}`);
		const data = (await res.json()) as { result?: unknown; error?: { message: string } };
		if (data.error) throw new Error(`RPC ${method}: ${data.error.message}`);
		return data.result;
	};
}
