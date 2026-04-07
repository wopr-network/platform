import { describe, expect, it, vi } from "vitest";
import { WOPRBot } from "../src/client.js";
import { AuthenticationError } from "../src/errors.js";

function makeFetch(status: number, body: unknown, isBlob = false) {
	return vi.fn().mockResolvedValue({
		ok: status >= 200 && status < 300,
		status,
		statusText: "OK",
		json: isBlob
			? async () => {
					throw new Error("not json");
				}
			: async () => body,
		arrayBuffer: async () => body,
		body: isBlob ? body : null,
	});
}

describe("audio.transcriptions", () => {
	it("sends FormData POST to /v1/audio/transcriptions", async () => {
		const mockResponse = { text: "Hello world" };
		const fetchMock = makeFetch(200, mockResponse);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		const file = new Blob(["audio data"], { type: "audio/wav" });
		await bot.audio.transcriptions.create({ file: file as File, model: "whisper-1" });

		const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/v1/audio/transcriptions");
		expect(opts.body).toBeInstanceOf(FormData);
		// Authorization header is set
		expect((opts.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
	});

	it("throws typed error on error response", async () => {
		const fetchMock = makeFetch(401, {
			error: { message: "Unauthorized", type: "auth_error", code: "invalid_api_key" },
		});

		const bot = new WOPRBot({ apiKey: "bad-key", fetch: fetchMock as typeof fetch });
		const file = new Blob(["audio"], { type: "audio/wav" });
		await expect(bot.audio.transcriptions.create({ file: file as File, model: "whisper-1" })).rejects.toBeInstanceOf(
			AuthenticationError,
		);
	});
});

describe("audio.speech", () => {
	it("sends JSON POST to /v1/audio/speech", async () => {
		const audioBlob = new Blob(["audio binary"], { type: "audio/mpeg" });
		const fetchMock = makeFetch(200, audioBlob, true);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		await bot.audio.speech.create({ model: "tts-1", input: "Hello", voice: "alloy" });

		const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/v1/audio/speech");
		expect(JSON.parse(opts.body as string)).toMatchObject({ model: "tts-1", input: "Hello", voice: "alloy" });
	});

	it("returns raw Response with audio body", async () => {
		const audioBlob = new Blob(["audio binary"], { type: "audio/mpeg" });
		const mockResponse = {
			ok: true,
			status: 200,
			statusText: "OK",
			body: audioBlob,
		};
		const fetchMock = vi.fn().mockResolvedValue(mockResponse);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		const result = await bot.audio.speech.create({ model: "tts-1", input: "Hello", voice: "alloy" });

		expect(result).toBe(mockResponse);
	});
});
