import { describe, expect, it } from "vitest";
import { WOPRBot } from "../src/client.js";

describe("WOPRBot", () => {
	it("throws if apiKey is missing", () => {
		expect(() => new WOPRBot({ apiKey: "" })).toThrow("apiKey is required");
	});

	it("sets default baseURL", () => {
		const bot = new WOPRBot({ apiKey: "test-key" });
		// Access via chat namespace which extends BaseResource
		expect((bot.chat.completions as unknown as { baseURL: string }).baseURL).toBe("https://api.wopr.bot/v1");
	});

	it("accepts custom baseURL", () => {
		const bot = new WOPRBot({ apiKey: "test-key", baseURL: "https://custom.example.com" });
		expect((bot.chat.completions as unknown as { baseURL: string }).baseURL).toBe("https://custom.example.com");
	});

	it("strips trailing slash from baseURL", () => {
		const bot = new WOPRBot({ apiKey: "test-key", baseURL: "https://custom.example.com/" });
		expect((bot.chat.completions as unknown as { baseURL: string }).baseURL).toBe("https://custom.example.com");
	});

	it("has all namespace properties", () => {
		const bot = new WOPRBot({ apiKey: "test-key" });
		expect(bot.chat).toBeDefined();
		expect(bot.completions).toBeDefined();
		expect(bot.embeddings).toBeDefined();
		expect(bot.audio).toBeDefined();
		expect(bot.images).toBeDefined();
		expect(bot.video).toBeDefined();
		expect(bot.phone).toBeDefined();
		expect(bot.sms).toBeDefined();
		expect(bot.models).toBeDefined();
	});
});
