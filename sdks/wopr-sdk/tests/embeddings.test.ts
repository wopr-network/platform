import { describe, expect, it, vi } from "vitest";
import { WOPRBot } from "../src/client.js";
import { AuthenticationError } from "../src/errors.js";

function makeFetch(status: number, body: unknown) {
	return vi.fn().mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		statusText: "OK",
		json: async () => body,
	});
}

describe("embeddings", () => {
	it("sends POST to /v1/embeddings with correct body", async () => {
		const mockResponse = {
			object: "list",
			data: [{ embedding: [0.1, 0.2], index: 0 }],
			model: "text-embedding-3-small",
			usage: { prompt_tokens: 5, total_tokens: 5 },
		};
		const fetchMock = makeFetch(200, mockResponse);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		await bot.embeddings.create({ model: "text-embedding-3-small", input: "Hello world" });

		const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/v1/embeddings");
		expect(JSON.parse(opts.body as string)).toMatchObject({ model: "text-embedding-3-small", input: "Hello world" });
	});

	it("returns parsed CreateEmbeddingResponse", async () => {
		const mockResponse = {
			object: "list",
			data: [{ embedding: [0.1, 0.2], index: 0, object: "embedding" }],
			model: "text-embedding-3-small",
			usage: { prompt_tokens: 5, total_tokens: 5 },
		};
		const fetchMock = makeFetch(200, mockResponse);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		const result = await bot.embeddings.create({ model: "text-embedding-3-small", input: "Hello" });

		expect(result).toEqual(mockResponse);
	});

	it("throws typed error on error response", async () => {
		const fetchMock = makeFetch(401, {
			error: { message: "Unauthorized", type: "auth_error", code: "invalid_api_key" },
		});

		const bot = new WOPRBot({ apiKey: "bad-key", fetch: fetchMock as typeof fetch });
		await expect(bot.embeddings.create({ model: "text-embedding-3-small", input: "x" })).rejects.toBeInstanceOf(
			AuthenticationError,
		);
	});
});
