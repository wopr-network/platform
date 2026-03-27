import { Credit } from "@wopr-network/platform-core/credits";
import { describe, expect, it, vi } from "vitest";
import type { FetchFn, MiniMaxAdapterConfig } from "./minimax.js";
import { createMiniMaxAdapter } from "./minimax.js";
import type { TextGenerationInput } from "./types.js";
import { withMargin } from "./types.js";

/** Helper to create a mock Response with headers */
function mockResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  const headerMap = new Map(Object.entries(headers));
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: {
      get: (name: string) => headerMap.get(name) ?? null,
    },
  } as Response;
}

/** A successful MiniMax chat completion response */
function chatCompletionResponse(overrides: Record<string, unknown> = {}) {
  return {
    id: "cmpl-mm-abc123",
    model: "minimax-m2",
    choices: [
      {
        message: {
          content: "Hello! How can I help you today?",
        },
      },
    ],
    usage: {
      prompt_tokens: 12,
      completion_tokens: 8,
    },
    ...overrides,
  };
}

function makeConfig(overrides: Partial<MiniMaxAdapterConfig> = {}): MiniMaxAdapterConfig {
  return {
    apiKey: "test-minimax-api-key",
    baseUrl: "https://api.minimax.chat",
    defaultModel: "minimax-m2",
    marginMultiplier: 1.3,
    inputTokenCostPer1M: 0.255,
    outputTokenCostPer1M: 1.0,
    ...overrides,
  };
}

describe("createMiniMaxAdapter", () => {
  it("returns adapter with correct name and capabilities", () => {
    const fetchFn: FetchFn = () => Promise.resolve(mockResponse({}));
    const adapter = createMiniMaxAdapter(makeConfig(), fetchFn);
    expect(adapter.name).toBe("minimax");
    expect(adapter.capabilities).toEqual(["text-generation"]);
  });

  describe("generateText", () => {
    it("calculates cost from token counts", async () => {
      const response = chatCompletionResponse({
        usage: { prompt_tokens: 1000, completion_tokens: 500 },
      });
      const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(response));

      const adapter = createMiniMaxAdapter(makeConfig(), fetchFn);
      const result = await adapter.generateText({ prompt: "Hello" });

      // (1000 / 1M) * $0.255 + (500 / 1M) * $1.00 = $0.000255 + $0.0005 = $0.000755
      expect(result.cost.toDollars()).toBeCloseTo(0.000755, 6);
    });

    it("applies margin correctly", async () => {
      const response = chatCompletionResponse({
        usage: { prompt_tokens: 1000, completion_tokens: 500 },
      });
      const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(response));

      const adapter = createMiniMaxAdapter(makeConfig({ marginMultiplier: 1.5 }), fetchFn);
      const result = await adapter.generateText({ prompt: "test" });

      const expectedCost = 0.000755;
      expect(result.cost.toDollars()).toBeCloseTo(expectedCost, 6);
      expect(result.charge?.toDollars()).toBeCloseTo(withMargin(Credit.fromDollars(expectedCost), 1.5).toDollars(), 6);
    });

    it("supports model override via input", async () => {
      const response = chatCompletionResponse({ model: "minimax-m2.5" });
      const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(response));

      const adapter = createMiniMaxAdapter(makeConfig(), fetchFn);
      const result = await adapter.generateText({
        prompt: "Explain monads",
        model: "minimax-m2.5",
      });

      const body = JSON.parse(fetchFn.mock.calls[0][1]?.body as string);
      expect(body.model).toBe("minimax-m2.5");
      expect(result.result.model).toBe("minimax-m2.5");
    });

    it("uses default model when none specified", async () => {
      const response = chatCompletionResponse();
      const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(response));

      const adapter = createMiniMaxAdapter(makeConfig({ defaultModel: "minimax-m2" }), fetchFn);
      await adapter.generateText({ prompt: "test" });

      const body = JSON.parse(fetchFn.mock.calls[0][1]?.body as string);
      expect(body.model).toBe("minimax-m2");
    });

    it("prefers messages array over prompt when provided", async () => {
      const response = chatCompletionResponse();
      const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(response));

      const adapter = createMiniMaxAdapter(makeConfig(), fetchFn);
      await adapter.generateText({
        prompt: "ignored",
        messages: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "Hello" },
        ],
      });

      const body = JSON.parse(fetchFn.mock.calls[0][1]?.body as string);
      expect(body.messages).toEqual([
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hello" },
      ]);
    });

    it("sends correct request format", async () => {
      const response = chatCompletionResponse();
      const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(response));

      const adapter = createMiniMaxAdapter(makeConfig(), fetchFn);
      await adapter.generateText({
        prompt: "Hello world",
        maxTokens: 500,
        temperature: 0.7,
      });

      expect(fetchFn).toHaveBeenCalledTimes(1);
      const [url, init] = fetchFn.mock.calls[0];
      expect(url).toBe("https://api.minimax.chat/v1/chat/completions");
      expect(init?.method).toBe("POST");

      const headers = init?.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers.Authorization).toBe("Bearer test-minimax-api-key");

      const body = JSON.parse(init?.body as string);
      expect(body.messages).toEqual([{ role: "user", content: "Hello world" }]);
      expect(body.max_tokens).toBe(500);
      expect(body.temperature).toBe(0.7);
    });

    it("does not send optional params when not provided", async () => {
      const response = chatCompletionResponse();
      const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(response));

      const adapter = createMiniMaxAdapter(makeConfig(), fetchFn);
      await adapter.generateText({ prompt: "test" });

      const body = JSON.parse(fetchFn.mock.calls[0][1]?.body as string);
      expect(body.max_tokens).toBeUndefined();
      expect(body.temperature).toBeUndefined();
    });

    it("passes temperature=0 correctly", async () => {
      const response = chatCompletionResponse();
      const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(response));

      const adapter = createMiniMaxAdapter(makeConfig(), fetchFn);
      await adapter.generateText({ prompt: "test", temperature: 0 });

      const body = JSON.parse(fetchFn.mock.calls[0][1]?.body as string);
      expect(body.temperature).toBe(0);
    });

    it("returns token usage from response", async () => {
      const response = chatCompletionResponse({
        usage: { prompt_tokens: 25, completion_tokens: 100 },
      });
      const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(response));

      const adapter = createMiniMaxAdapter(makeConfig(), fetchFn);
      const result = await adapter.generateText({ prompt: "test" });

      expect(result.result.usage.inputTokens).toBe(25);
      expect(result.result.usage.outputTokens).toBe(100);
    });

    it("handles missing usage in response", async () => {
      const response = chatCompletionResponse({ usage: undefined });
      const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(response));

      const adapter = createMiniMaxAdapter(makeConfig(), fetchFn);
      const result = await adapter.generateText({ prompt: "test" });

      expect(result.result.usage.inputTokens).toBe(0);
      expect(result.result.usage.outputTokens).toBe(0);
      expect(result.cost.isZero()).toBe(true);
    });

    it("throws on API error with message", async () => {
      const errorBody = { error: { message: "Invalid API key", type: "authentication_error" } };
      const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(errorBody, 401));

      const adapter = createMiniMaxAdapter(makeConfig(), fetchFn);
      await expect(adapter.generateText({ prompt: "test" })).rejects.toThrow("MiniMax API error (401)");
    });

    it("throws on 429 rate limit with retry-after", async () => {
      const fetchFn = vi
        .fn<FetchFn>()
        .mockResolvedValueOnce(mockResponse({ error: "rate limit exceeded" }, 429, { "retry-after": "30" }));

      const adapter = createMiniMaxAdapter(makeConfig(), fetchFn);
      try {
        await adapter.generateText({ prompt: "test" });
        expect.fail("should have thrown");
      } catch (err: unknown) {
        const error = err as Error & { httpStatus: number; retryAfter: string };
        expect(error.message).toBe("MiniMax rate limit exceeded");
        expect(error.httpStatus).toBe(429);
        expect(error.retryAfter).toBe("30");
      }
    });

    it("handles 429 without retry-after header", async () => {
      const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse({ error: "rate limit exceeded" }, 429));

      const adapter = createMiniMaxAdapter(makeConfig(), fetchFn);
      try {
        await adapter.generateText({ prompt: "test" });
        expect.fail("should have thrown");
      } catch (err: unknown) {
        const error = err as Error & { httpStatus: number; retryAfter?: string };
        expect(error.httpStatus).toBe(429);
        expect(error.retryAfter).toBeUndefined();
      }
    });

    it("throws on 500 server error", async () => {
      const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse({ error: "Internal error" }, 500));

      const adapter = createMiniMaxAdapter(makeConfig(), fetchFn);
      await expect(adapter.generateText({ prompt: "test" })).rejects.toThrow("MiniMax API error (500)");
    });

    it("uses custom baseUrl", async () => {
      const response = chatCompletionResponse();
      const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(response));

      const adapter = createMiniMaxAdapter(makeConfig({ baseUrl: "https://custom.minimax.chat" }), fetchFn);
      await adapter.generateText({ prompt: "test" });

      const url = fetchFn.mock.calls[0][0] as string;
      expect(url).toBe("https://custom.minimax.chat/v1/chat/completions");
    });

    it("extracts text from response choices", async () => {
      const response = chatCompletionResponse({
        choices: [
          {
            message: {
              content: "The answer is 42.",
            },
          },
        ],
      });
      const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(response));

      const adapter = createMiniMaxAdapter(makeConfig(), fetchFn);
      const result = await adapter.generateText({ prompt: "What is the answer?" });

      expect(result.result.text).toBe("The answer is 42.");
    });

    it("returns response model from API, not request model", async () => {
      const response = chatCompletionResponse({ model: "minimax-m2-20260301" });
      const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(response));

      const adapter = createMiniMaxAdapter(makeConfig(), fetchFn);
      const result = await adapter.generateText({ prompt: "test", model: "minimax-m2" });

      expect(result.result.model).toBe("minimax-m2-20260301");
    });

    it("falls back to prompt when messages is empty array", async () => {
      const response = chatCompletionResponse();
      const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(response));

      const adapter = createMiniMaxAdapter(makeConfig(), fetchFn);
      await adapter.generateText({ prompt: "use this prompt", messages: [] });

      const body = JSON.parse(fetchFn.mock.calls[0][1]?.body as string);
      expect(body.messages).toEqual([{ role: "user", content: "use this prompt" }]);
    });

    it("throws when neither messages nor prompt provided", async () => {
      const fetchFn = vi.fn<FetchFn>();
      const adapter = createMiniMaxAdapter(makeConfig(), fetchFn);

      await expect(adapter.generateText({} as TextGenerationInput)).rejects.toThrow(
        "MiniMax adapter requires either 'messages' or 'prompt'",
      );
      expect(fetchFn).not.toHaveBeenCalled();
    });
  });
});
