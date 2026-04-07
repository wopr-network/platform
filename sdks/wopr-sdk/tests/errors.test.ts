import { describe, expect, it } from "vitest";
import {
	AuthenticationError,
	InsufficientCreditsError,
	ProviderError,
	RateLimitError,
	ServerError,
	WOPRError,
	createError,
} from "../src/errors.js";

const makeBody = (overrides = {}) => ({
	error: {
		message: "Test error",
		type: "test_type",
		code: "test_code",
		...overrides,
	},
});

describe("createError", () => {
	it("returns AuthenticationError for 401", () => {
		const err = createError(401, makeBody());
		expect(err).toBeInstanceOf(AuthenticationError);
		expect(err).toBeInstanceOf(WOPRError);
		expect(err).toBeInstanceOf(Error);
	});

	it("returns InsufficientCreditsError for 402", () => {
		const body = makeBody({
			needsCredits: true,
			topUpUrl: "https://example.com/topup",
			currentBalanceCents: 0,
			requiredCents: 100,
		});
		const err = createError(402, body);
		expect(err).toBeInstanceOf(InsufficientCreditsError);
		const credErr = err as InsufficientCreditsError;
		expect(credErr.needsCredits).toBe(true);
		expect(credErr.topUpUrl).toBe("https://example.com/topup");
		expect(credErr.currentBalanceCents).toBe(0);
		expect(credErr.requiredCents).toBe(100);
	});

	it("returns RateLimitError for 429", () => {
		const err = createError(429, makeBody());
		expect(err).toBeInstanceOf(RateLimitError);
	});

	it("returns ProviderError for 422", () => {
		const err = createError(422, makeBody());
		expect(err).toBeInstanceOf(ProviderError);
	});

	it("returns ServerError for 502", () => {
		const err = createError(502, makeBody());
		expect(err).toBeInstanceOf(ServerError);
	});

	it("sets message, status, type, code properties", () => {
		const body = makeBody({ message: "Access denied", type: "auth_error", code: "invalid_api_key" });
		const err = createError(401, body);
		expect(err.message).toBe("Access denied");
		expect(err.status).toBe(401);
		expect(err.type).toBe("auth_error");
		expect(err.code).toBe("invalid_api_key");
	});

	it("defaults needsCredits to true when not in body", () => {
		const err = createError(402, makeBody()) as InsufficientCreditsError;
		expect(err.needsCredits).toBe(true);
	});
});
