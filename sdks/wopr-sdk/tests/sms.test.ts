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

describe("sms", () => {
	it("sends POST to /v1/messages/sms with { to, body, from }", async () => {
		const mockResponse = { sid: "SM123", status: "queued", capability: "sms" };
		const fetchMock = makeFetch(200, mockResponse);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		await bot.sms.send({ to: "+15551234567", body: "Hello!", from: "+15559876543" });

		const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/v1/messages/sms");
		expect(JSON.parse(opts.body as string)).toMatchObject({
			to: "+15551234567",
			body: "Hello!",
			from: "+15559876543",
		});
	});

	it("rejects missing 'to' via Zod validation", async () => {
		const bot = new WOPRBot({ apiKey: "test-key" });
		await expect(bot.sms.send({ to: "", body: "Hello", from: "+15559876543" })).rejects.toThrow();
	});

	it("rejects missing 'body' via Zod validation", async () => {
		const bot = new WOPRBot({ apiKey: "test-key" });
		await expect(bot.sms.send({ to: "+15551234567", body: "", from: "+15559876543" })).rejects.toThrow();
	});

	it("supports optional media_url array for MMS", async () => {
		const mockResponse = { sid: "SM123", status: "queued", capability: "mms" };
		const fetchMock = makeFetch(200, mockResponse);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		await bot.sms.send({
			to: "+15551234567",
			body: "Photo!",
			from: "+15559876543",
			media_url: ["https://example.com/photo.jpg"],
		});

		const [, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(JSON.parse(opts.body as string)).toMatchObject({
			media_url: ["https://example.com/photo.jpg"],
		});
	});

	it("returns SmsSendResponse with sid, status, capability", async () => {
		const mockResponse = { sid: "SM123", status: "queued", capability: "sms" };
		const fetchMock = makeFetch(200, mockResponse);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		const result = await bot.sms.send({ to: "+15551234567", body: "Hello!", from: "+15559876543" });

		expect(result.sid).toBe("SM123");
		expect(result.status).toBe("queued");
		expect(result.capability).toBe("sms");
	});
});
