import { describe, expect, it } from "vitest";

import { parseRpcUrl } from "../shared/utxo/rpc.js";

describe("parseRpcUrl", () => {
	it("extracts credentials from URL with embedded auth", () => {
		const result = parseRpcUrl("http://myuser:mypass@localhost:8332");
		expect(result.rpcUser).toBe("myuser");
		expect(result.rpcPassword).toBe("mypass");
		expect(result.rpcUrl).toBe("http://localhost:8332");
	});

	it("handles URL-encoded credentials", () => {
		const result = parseRpcUrl("http://user%40name:p%40ss@host:8332");
		expect(result.rpcUser).toBe("user@name");
		expect(result.rpcPassword).toBe("p@ss");
	});

	it("returns empty credentials for URL without auth", () => {
		const result = parseRpcUrl("http://localhost:8332");
		expect(result.rpcUser).toBe("");
		expect(result.rpcPassword).toBe("");
		expect(result.rpcUrl).toBe("http://localhost:8332");
	});

	it("strips trailing slash from parsed URL", () => {
		const result = parseRpcUrl("http://user:pass@localhost:8332/");
		expect(result.rpcUrl).toBe("http://localhost:8332");
	});

	it("handles non-URL strings gracefully", () => {
		const result = parseRpcUrl("not-a-url");
		expect(result.rpcUrl).toBe("not-a-url");
		expect(result.rpcUser).toBe("");
	});
});
