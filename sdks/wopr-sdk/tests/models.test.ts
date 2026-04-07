import { describe, expect, it, vi } from "vitest";
import { WOPRBot } from "../src/client.js";

function makeFetch(status: number, body: unknown) {
	return vi.fn().mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		statusText: "OK",
		json: async () => body,
	});
}

describe("models", () => {
	it("sends GET to /v1/models", async () => {
		const mockResponse = {
			object: "list",
			data: [
				{ id: "gpt-4", object: "model", created: 1234567890, owned_by: "openai", capability: "chat", tier: "premium" },
			],
		};
		const fetchMock = makeFetch(200, mockResponse);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		await bot.models.list();

		const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/v1/models");
		expect(opts.method).toBe("GET");
	});

	it("returns ModelsListResponse with object: 'list' and data[]", async () => {
		const mockResponse = {
			object: "list",
			data: [
				{ id: "gpt-4", object: "model", created: 1234567890, owned_by: "openai", capability: "chat", tier: "premium" },
				{
					id: "whisper-1",
					object: "model",
					created: 1234567890,
					owned_by: "openai",
					capability: "audio",
					tier: "standard",
				},
			],
		};
		const fetchMock = makeFetch(200, mockResponse);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		const result = await bot.models.list();

		expect(result.object).toBe("list");
		expect(result.data).toHaveLength(2);
		expect(result.data[0].id).toBe("gpt-4");
	});
});
