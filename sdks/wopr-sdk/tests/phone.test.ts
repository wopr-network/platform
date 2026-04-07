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

describe("phone.call", () => {
	it("sends POST to /v1/phone/outbound with { to, from }", async () => {
		const mockResponse = { status: "queued", message: "Call initiated" };
		const fetchMock = makeFetch(200, mockResponse);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		await bot.phone.call({ to: "+15551234567", from: "+15559876543" });

		const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/v1/phone/outbound");
		expect(JSON.parse(opts.body as string)).toMatchObject({ to: "+15551234567", from: "+15559876543" });
	});

	it("rejects missing 'to' field via Zod validation", async () => {
		const bot = new WOPRBot({ apiKey: "test-key" });
		await expect(bot.phone.call({ to: "", from: "+15559876543" })).rejects.toThrow();
	});

	it("rejects missing 'from' field via Zod validation", async () => {
		const bot = new WOPRBot({ apiKey: "test-key" });
		await expect(bot.phone.call({ to: "+15551234567", from: "" })).rejects.toThrow();
	});
});

describe("phone.numbers.provision", () => {
	it("sends POST to /v1/phone/numbers", async () => {
		const mockNumber = {
			id: "num-1",
			phone_number: "+15551234567",
			friendly_name: "Test",
			capabilities: { sms: true, voice: true, mms: false },
		};
		const fetchMock = makeFetch(200, mockNumber);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		await bot.phone.numbers.provision({ area_code: "555" });

		const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/v1/phone/numbers");
	});
});

describe("phone.numbers.list", () => {
	it("sends GET to /v1/phone/numbers", async () => {
		const mockResponse = { data: [] };
		const fetchMock = makeFetch(200, mockResponse);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		await bot.phone.numbers.list();

		const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/v1/phone/numbers");
		expect(opts.method).toBe("GET");
	});
});

describe("phone.numbers.release", () => {
	it("sends DELETE to /v1/phone/numbers/<id>", async () => {
		const mockResponse = { status: "released", id: "num-1" };
		const fetchMock = makeFetch(200, mockResponse);

		const bot = new WOPRBot({ apiKey: "test-key", fetch: fetchMock as typeof fetch });
		await bot.phone.numbers.release("num-1");

		const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toContain("/v1/phone/numbers/num-1");
		expect(opts.method).toBe("DELETE");
	});
});
