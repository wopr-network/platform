import { Credit } from "@wopr-network/platform-core/credits";
import { describe, expect, it, vi } from "vitest";
import type { FetchFn, OllamaEmbeddingsAdapterConfig } from "./ollama-embeddings.js";
import { createOllamaEmbeddingsAdapter } from "./ollama-embeddings.js";
import { withMargin } from "./types.js";

/** Helper to create a mock Response */
function mockResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as Response;
}

/** A successful OpenAI-compatible embeddings response */
function embeddingsResponse(overrides: Record<string, unknown> = {}) {
  return {
    model: "nomic-embed-text",
    data: [{ embedding: [0.1, 0.2, 0.3, 0.4] }],
    usage: { total_tokens: 5 },
    ...overrides,
  };
}

function makeConfig(overrides: Partial<OllamaEmbeddingsAdapterConfig> = {}): OllamaEmbeddingsAdapterConfig {
  return {
    baseUrl: "http://ollama:11434",
    costPerUnit: 0.000000005,
    ...overrides,
  };
}

describe("createOllamaEmbeddingsAdapter", () => {
  it("returns adapter with correct name and capabilities", () => {
    const adapter = createOllamaEmbeddingsAdapter(makeConfig());
    expect(adapter.name).toBe("ollama-embeddings");
    expect(adapter.capabilities).toEqual(["embeddings"]);
    expect(adapter.selfHosted).toBe(true);
  });

  it("calls /v1/embeddings endpoint", async () => {
    const body = embeddingsResponse();
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(body));

    const adapter = createOllamaEmbeddingsAdapter(makeConfig(), fetchFn);
    await adapter.embed({ input: "Hello world" });

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("http://ollama:11434/v1/embeddings");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
  });

  it("calculates cost from token count and costPerToken", async () => {
    const body = embeddingsResponse({ usage: { total_tokens: 100 } });
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(body));

    const adapter = createOllamaEmbeddingsAdapter(makeConfig({ costPerToken: 0.000000005 }), fetchFn);
    const result = await adapter.embed({ input: "test" });

    // 100 tokens * $0.000000005 = $0.0000005
    expect(result.cost.toDollars()).toBeCloseTo(0.0000005, 10);
  });

  it("applies margin to cost", async () => {
    const body = embeddingsResponse({ usage: { total_tokens: 1000 } });
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(body));

    const adapter = createOllamaEmbeddingsAdapter(makeConfig({ marginMultiplier: 1.5 }), fetchFn);
    const result = await adapter.embed({ input: "test" });

    const expectedCost = Credit.fromDollars(1000 * 0.000000005);
    expect(result.cost.toDollars()).toBeCloseTo(expectedCost.toDollars(), 10);
    expect(result.charge?.toDollars()).toBeCloseTo(withMargin(expectedCost, 1.5).toDollars(), 10);
  });

  it("uses default 1.2 margin (lower than third-party)", async () => {
    const body = embeddingsResponse({ usage: { total_tokens: 1000 } });
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(body));

    const adapter = createOllamaEmbeddingsAdapter(makeConfig(), fetchFn);
    const result = await adapter.embed({ input: "test" });

    const expectedCost = Credit.fromDollars(1000 * 0.000000005);
    expect(result.charge?.toDollars()).toBeCloseTo(withMargin(expectedCost, 1.2).toDollars(), 10);
  });

  it("uses default model (nomic-embed-text) when none specified", async () => {
    const body = embeddingsResponse();
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(body));

    const adapter = createOllamaEmbeddingsAdapter(makeConfig(), fetchFn);
    await adapter.embed({ input: "test" });

    const reqBody = JSON.parse(fetchFn.mock.calls[0][1]?.body as string);
    expect(reqBody.model).toBe("nomic-embed-text");
  });

  it("passes requested model through to request", async () => {
    const body = embeddingsResponse({ model: "mxbai-embed-large" });
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(body));

    const adapter = createOllamaEmbeddingsAdapter(makeConfig(), fetchFn);
    const result = await adapter.embed({ input: "test", model: "mxbai-embed-large" });

    const reqBody = JSON.parse(fetchFn.mock.calls[0][1]?.body as string);
    expect(reqBody.model).toBe("mxbai-embed-large");
    expect(result.result.model).toBe("mxbai-embed-large");
  });

  it("passes dimensions through to request", async () => {
    const body = embeddingsResponse();
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(body));

    const adapter = createOllamaEmbeddingsAdapter(makeConfig(), fetchFn);
    await adapter.embed({ input: "test", dimensions: 256 });

    const reqBody = JSON.parse(fetchFn.mock.calls[0][1]?.body as string);
    expect(reqBody.dimensions).toBe(256);
  });

  it("does not send dimensions when not specified", async () => {
    const body = embeddingsResponse();
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(body));

    const adapter = createOllamaEmbeddingsAdapter(makeConfig(), fetchFn);
    await adapter.embed({ input: "test" });

    const reqBody = JSON.parse(fetchFn.mock.calls[0][1]?.body as string);
    expect(reqBody.dimensions).toBeUndefined();
  });

  it("handles batch input (string[])", async () => {
    const body = embeddingsResponse({
      data: [{ embedding: [0.1, 0.2, 0.3] }, { embedding: [0.4, 0.5, 0.6] }],
      usage: { total_tokens: 10 },
    });
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(body));

    const adapter = createOllamaEmbeddingsAdapter(makeConfig(), fetchFn);
    const result = await adapter.embed({ input: ["Hello", "World"] });

    const reqBody = JSON.parse(fetchFn.mock.calls[0][1]?.body as string);
    expect(reqBody.input).toEqual(["Hello", "World"]);
    expect(result.result.embeddings).toHaveLength(2);
    expect(result.result.embeddings[0]).toEqual([0.1, 0.2, 0.3]);
    expect(result.result.embeddings[1]).toEqual([0.4, 0.5, 0.6]);
    expect(result.result.totalTokens).toBe(10);
  });

  it("throws on non-2xx response", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse({ error: "model not found" }, 404));

    const adapter = createOllamaEmbeddingsAdapter(makeConfig(), fetchFn);
    await expect(adapter.embed({ input: "test" })).rejects.toThrow("Ollama embeddings error (404)");
  });

  it("throws on 500 server error", async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse({ error: "internal error" }, 500));

    const adapter = createOllamaEmbeddingsAdapter(makeConfig(), fetchFn);
    await expect(adapter.embed({ input: "test" })).rejects.toThrow("Ollama embeddings error (500)");
  });

  it("uses custom baseUrl", async () => {
    const body = embeddingsResponse();
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(body));

    const adapter = createOllamaEmbeddingsAdapter(makeConfig({ baseUrl: "http://gpu-node:11434" }), fetchFn);
    await adapter.embed({ input: "test" });

    const [url] = fetchFn.mock.calls[0];
    expect(url).toBe("http://gpu-node:11434/v1/embeddings");
  });

  it("uses costPerUnit from SelfHostedAdapterConfig when costPerToken not set", async () => {
    const body = embeddingsResponse({ usage: { total_tokens: 1000 } });
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(body));

    const adapter = createOllamaEmbeddingsAdapter(makeConfig({ costPerUnit: 0.00000001 }), fetchFn);
    const result = await adapter.embed({ input: "test" });

    // 1000 tokens * $0.00000001 = $0.00001
    expect(result.cost.toDollars()).toBeCloseTo(0.00001, 8);
  });

  it("costPerToken takes precedence over costPerUnit", async () => {
    const body = embeddingsResponse({ usage: { total_tokens: 1000 } });
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(body));

    const adapter = createOllamaEmbeddingsAdapter(
      makeConfig({ costPerUnit: 0.00000001, costPerToken: 0.000000005 }),
      fetchFn,
    );
    const result = await adapter.embed({ input: "test" });

    // costPerToken wins: 1000 * $0.000000005 = $0.000005
    expect(result.cost.toDollars()).toBeCloseTo(0.000005, 10);
  });

  it("uses custom defaultModel from config", async () => {
    const body = embeddingsResponse({ model: "mxbai-embed-large" });
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(body));

    const adapter = createOllamaEmbeddingsAdapter(makeConfig({ defaultModel: "mxbai-embed-large" }), fetchFn);
    await adapter.embed({ input: "test" });

    const reqBody = JSON.parse(fetchFn.mock.calls[0][1]?.body as string);
    expect(reqBody.model).toBe("mxbai-embed-large");
  });

  it("normalizes trailing slash in baseUrl", async () => {
    const body = embeddingsResponse();
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(body));

    const adapter = createOllamaEmbeddingsAdapter(makeConfig({ baseUrl: "http://ollama:11434/" }), fetchFn);
    await adapter.embed({ input: "test" });

    const [url] = fetchFn.mock.calls[0];
    expect(url).toBe("http://ollama:11434/v1/embeddings");
  });

  it("returns correct totalTokens from response", async () => {
    const body = embeddingsResponse({ usage: { total_tokens: 42 } });
    const fetchFn = vi.fn<FetchFn>().mockResolvedValueOnce(mockResponse(body));

    const adapter = createOllamaEmbeddingsAdapter(makeConfig(), fetchFn);
    const result = await adapter.embed({ input: "test" });

    expect(result.result.totalTokens).toBe(42);
  });
});
