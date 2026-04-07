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

describe("images", () => {
	it("sends POST to /v1/images/generations with prompt, n, size", async () => {
		const mockResponse = { created: 1234567890, data: [{ url: "https://example.com/img.png" }] };
		const fetchMock = makeFetch(200, mockResponse);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		await bot.images.generate({ prompt: "A cat", n: 1, size: "1024x1024" });

		const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/v1/images/generations");
		expect(JSON.parse(opts.body as string)).toMatchObject({ prompt: "A cat", n: 1, size: "1024x1024" });
	});

	it("returns ImagesResponse with created and data[].url", async () => {
		const mockResponse = {
			created: 1234567890,
			data: [{ url: "https://example.com/img.png" }],
		};
		const fetchMock = makeFetch(200, mockResponse);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		const result = await bot.images.generate({ prompt: "A cat" });

		expect(result.created).toBe(1234567890);
		expect(result.data[0].url).toBe("https://example.com/img.png");
	});

	it("throws typed error on error response", async () => {
		const fetchMock = makeFetch(401, {
			error: { message: "Unauthorized", type: "auth_error", code: "invalid_api_key" },
		});

		const bot = new WOPRBot({ apiKey: "bad-key", fetch: fetchMock as typeof fetch });
		await expect(bot.images.generate({ prompt: "A cat" })).rejects.toBeInstanceOf(AuthenticationError);
	});
});
