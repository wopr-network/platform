import { describe, expect, it, vi } from "vitest";
import { WOPRBot } from "../src/client.js";
import { InsufficientCreditsError, RateLimitError } from "../src/errors.js";
import { Stream } from "../src/streaming.js";

function makeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
	return vi.fn().mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		statusText: "OK",
		json: async () => body,
		body: null,
		headers: new Headers(headers),
	});
}

function makeSSEFetch(chunks: string[]) {
	const encoder = new TextEncoder();
	const stream = new ReadableStream({
		start(controller) {
			for (const chunk of chunks) {
				controller.enqueue(encoder.encode(chunk));
			}
			controller.close();
		},
	});

	return vi.fn().mockResolvedValue({
		ok: true,
		status: 200,
		statusText: "OK",
		body: stream,
	});
}

describe("chat.completions", () => {
	it("sends POST to /v1/chat/completions with auth header and JSON body", async () => {
		const mockResponse = { id: "cmpl-1", choices: [{ message: { content: "Hello" } }] };
		const fetchMock = makeFetch(200, mockResponse);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		await bot.chat.completions.create({
			model: "gpt-4",
			messages: [{ role: "user", content: "Hi" }],
		});

		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe("https://api.wopr.bot/v1/chat/completions");
		expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
		expect(JSON.parse(opts.body as string)).toMatchObject({ model: "gpt-4" });
	});

	it("returns parsed ChatCompletion object", async () => {
		const mockResponse = { id: "cmpl-1", object: "chat.completion", choices: [] };
		const fetchMock = makeFetch(200, mockResponse);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		const result = await bot.chat.completions.create({
			model: "gpt-4",
			messages: [],
		});

		expect(result).toEqual(mockResponse);
	});

	it("streaming request returns Stream<ChatCompletionChunk>", async () => {
		const chunk = { id: "c1", object: "chat.completion.chunk", choices: [] };
		const fetchMock = makeSSEFetch([`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`]);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		const result = await bot.chat.completions.create({
			model: "gpt-4",
			messages: [],
			stream: true,
		});

		expect(result).toBeInstanceOf(Stream);
	});

	it("streaming response parses SSE lines into chunks", async () => {
		const chunk1 = { id: "c1", object: "chat.completion.chunk", choices: [{ delta: { content: "Hello" } }] };
		const chunk2 = { id: "c2", object: "chat.completion.chunk", choices: [{ delta: { content: " World" } }] };
		const fetchMock = makeSSEFetch([
			`data: ${JSON.stringify(chunk1)}\n\ndata: ${JSON.stringify(chunk2)}\n\ndata: [DONE]\n\n`,
		]);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		const stream = await bot.chat.completions.create({
			model: "gpt-4",
			messages: [],
			stream: true,
		});

		const collected = [];
		for await (const chunk of stream) {
			collected.push(chunk);
		}

		expect(collected).toHaveLength(2);
		expect(collected[0]).toEqual(chunk1);
		expect(collected[1]).toEqual(chunk2);
	});

	it("streaming handles [DONE] terminator", async () => {
		const chunk = { id: "c1", object: "chat.completion.chunk", choices: [] };
		const fetchMock = makeSSEFetch([`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\nextra stuff`]);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		const stream = await bot.chat.completions.create({
			model: "gpt-4",
			messages: [],
			stream: true,
		});

		const collected = [];
		for await (const item of stream) {
			collected.push(item);
		}

		expect(collected).toHaveLength(1);
	});

	it("throws InsufficientCreditsError for 402", async () => {
		const fetchMock = makeFetch(402, {
			error: { message: "Out of credits", type: "credits_error", code: "insufficient_credits" },
		});

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		await expect(bot.chat.completions.create({ model: "gpt-4", messages: [] })).rejects.toBeInstanceOf(
			InsufficientCreditsError,
		);
	});

	it("throws RateLimitError for 429", async () => {
		const fetchMock = makeFetch(429, {
			error: { message: "Rate limited", type: "rate_limit", code: "rate_limit_exceeded" },
		});

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		await expect(bot.chat.completions.create({ model: "gpt-4", messages: [] })).rejects.toBeInstanceOf(RateLimitError);
	});
});
