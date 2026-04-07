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

describe("video", () => {
	it("sends POST to /v1/video/generations with validated params", async () => {
		const mockResponse = { created: 1234567890, data: [{ url: "https://example.com/video.mp4" }] };
		const fetchMock = makeFetch(200, mockResponse);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		await bot.video.generate({ prompt: "A sunset", duration: 5 });

		const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/v1/video/generations");
		expect(JSON.parse(opts.body as string)).toMatchObject({ prompt: "A sunset", duration: 5 });
	});

	it("rejects empty prompt via Zod validation", async () => {
		const bot = new WOPRBot({ apiKey: "test-key" });
		await expect(bot.video.generate({ prompt: "" })).rejects.toThrow();
	});

	it("rejects duration > 60", async () => {
		const bot = new WOPRBot({ apiKey: "test-key" });
		await expect(bot.video.generate({ prompt: "A sunset", duration: 61 })).rejects.toThrow();
	});

	it("rejects duration < 1", async () => {
		const bot = new WOPRBot({ apiKey: "test-key" });
		await expect(bot.video.generate({ prompt: "A sunset", duration: 0 })).rejects.toThrow();
	});

	it("defaults duration to 4 seconds", async () => {
		const mockResponse = { created: 1234567890, data: [{ url: "https://example.com/video.mp4" }] };
		const fetchMock = makeFetch(200, mockResponse);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		await bot.video.generate({ prompt: "A sunset" });

		const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(JSON.parse(opts.body as string)).toMatchObject({ duration: 4 });
	});

	it("returns VideoGenerateResponse with created and data[].url", async () => {
		const mockResponse = { created: 1234567890, data: [{ url: "https://example.com/video.mp4" }] };
		const fetchMock = makeFetch(200, mockResponse);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		const result = await bot.video.generate({ prompt: "A sunset" });

		expect(result.created).toBe(1234567890);
		expect(result.data[0].url).toBe("https://example.com/video.mp4");
	});
});
