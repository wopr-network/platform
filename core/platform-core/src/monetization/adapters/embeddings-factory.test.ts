import { describe, expect, it, vi } from "vitest";
import { createEmbeddingsAdapters } from "./embeddings-factory.js";
import * as ollamaModule from "./ollama-embeddings.js";
import * as openrouterModule from "./openrouter.js";

describe("createEmbeddingsAdapters", () => {
  it("creates all adapters when all config provided", () => {
    const result = createEmbeddingsAdapters({
      ollamaBaseUrl: "http://ollama:11434",
      openrouterApiKey: "sk-or",
    });

    expect(result.adapters).toHaveLength(2);
    expect(result.adapterMap.size).toBe(2);
    expect(result.skipped).toHaveLength(0);
  });

  it("orders adapters cheapest first (ollama before openrouter)", () => {
    const result = createEmbeddingsAdapters({
      ollamaBaseUrl: "http://ollama:11434",
      openrouterApiKey: "sk-or",
    });

    expect(result.adapters[0].name).toBe("ollama-embeddings");
    expect(result.adapters[1].name).toBe("openrouter");
  });

  it("ollama adapter is self-hosted", () => {
    const result = createEmbeddingsAdapters({
      ollamaBaseUrl: "http://ollama:11434",
    });

    expect(result.adapters[0].selfHosted).toBe(true);
  });

  it("creates only openrouter when no ollama URL", () => {
    const result = createEmbeddingsAdapters({
      openrouterApiKey: "sk-or",
    });

    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0].name).toBe("openrouter");
    expect(result.skipped).toEqual(["ollama-embeddings"]);
  });

  it("creates only ollama when no openrouter key", () => {
    const result = createEmbeddingsAdapters({
      ollamaBaseUrl: "http://ollama:11434",
    });

    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0].name).toBe("ollama-embeddings");
    expect(result.skipped).toEqual(["openrouter"]);
  });

  it("skips both when no config", () => {
    const result = createEmbeddingsAdapters({});

    expect(result.adapters).toHaveLength(0);
    expect(result.skipped).toEqual(["ollama-embeddings", "openrouter"]);
  });

  it("skips ollama with empty string URL", () => {
    const result = createEmbeddingsAdapters({
      ollamaBaseUrl: "",
    });

    expect(result.adapters).toHaveLength(0);
    expect(result.skipped).toContain("ollama-embeddings");
  });

  it("skips openrouter with empty string key", () => {
    const result = createEmbeddingsAdapters({
      openrouterApiKey: "",
    });

    expect(result.adapters).toHaveLength(0);
    expect(result.skipped).toContain("openrouter");
  });

  it("both adapters support embeddings capability", () => {
    const result = createEmbeddingsAdapters({
      ollamaBaseUrl: "http://ollama:11434",
      openrouterApiKey: "sk-or",
    });

    for (const adapter of result.adapters) {
      expect(adapter.capabilities).toContain("embeddings");
    }
  });

  it("both adapters implement embed", () => {
    const result = createEmbeddingsAdapters({
      ollamaBaseUrl: "http://ollama:11434",
      openrouterApiKey: "sk-or",
    });

    for (const adapter of result.adapters) {
      expect(typeof adapter.embed).toBe("function");
    }
  });

  it("adapterMap keys match adapter names", () => {
    const result = createEmbeddingsAdapters({
      ollamaBaseUrl: "http://ollama:11434",
      openrouterApiKey: "sk-or",
    });

    for (const [key, adapter] of result.adapterMap) {
      expect(key).toBe(adapter.name);
    }
  });

  it("passes per-adapter config overrides to ollama constructor", () => {
    const spy = vi.spyOn(ollamaModule, "createOllamaEmbeddingsAdapter");

    createEmbeddingsAdapters({
      ollamaBaseUrl: "http://ollama:11434",
      ollama: { marginMultiplier: 1.5 },
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "http://ollama:11434",
        marginMultiplier: 1.5,
      }),
    );

    spy.mockRestore();
  });

  it("passes per-adapter config overrides to openrouter constructor", () => {
    const spy = vi.spyOn(openrouterModule, "createOpenRouterAdapter");

    createEmbeddingsAdapters({
      openrouterApiKey: "sk-or",
      openrouter: { marginMultiplier: 1.5 },
    });

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "sk-or",
        marginMultiplier: 1.5,
      }),
    );

    spy.mockRestore();
  });
});
