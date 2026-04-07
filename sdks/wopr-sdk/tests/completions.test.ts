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

describe("completions", () => {
	it("sends POST to /v1/completions with correct body", async () => {
		const mockResponse = { id: "cmpl-1", object: "text_completion", choices: [] };
		const fetchMock = makeFetch(200, mockResponse);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		await bot.completions.create({ model: "gpt-3.5-turbo-instruct", prompt: "Hello" });

		const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/v1/completions");
		expect(JSON.parse(opts.body as string)).toMatchObject({ prompt: "Hello" });
	});

	it("returns parsed Completion object", async () => {
		const mockResponse = { id: "cmpl-1", object: "text_completion", choices: [{ text: "World" }] };
		const fetchMock = makeFetch(200, mockResponse);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		const result = await bot.completions.create({ model: "gpt-3.5-turbo-instruct", prompt: "Hello" });

		expect(result).toEqual(mockResponse);
	});

	it("throws typed error on error response", async () => {
		const fetchMock = makeFetch(401, {
			error: { message: "Unauthorized", type: "auth_error", code: "invalid_api_key" },
		});

		const bot = new WOPRBot({ apiKey: "bad-key", fetch: fetchMock as typeof fetch });
		await expect(bot.completions.create({ model: "gpt-3.5-turbo-instruct", prompt: "x" })).rejects.toBeInstanceOf(
			AuthenticationError,
		);
	});
});
