import { afterAll, describe, expect, it, vi } from "vitest";
import { createTextGenAdapters, createTextGenAdaptersFromEnv } from "./text-gen-factory.js";

describe("createTextGenAdapters", () => {
  it("creates all adapters when all keys provided", () => {
    const result = createTextGenAdapters({
      deepseekApiKey: "sk-ds",
      geminiApiKey: "sk-gem",
      minimaxApiKey: "sk-mm",
      kimiApiKey: "sk-kimi",
      openrouterApiKey: "sk-or",
    });

    expect(result.adapters).toHaveLength(5);
    expect(result.adapterMap.size).toBe(5);
    expect(result.skipped).toHaveLength(0);
  });

  it("returns adapters in cost-priority order", () => {
    const result = createTextGenAdapters({
      deepseekApiKey: "sk-ds",
      geminiApiKey: "sk-gem",
      minimaxApiKey: "sk-mm",
      kimiApiKey: "sk-kimi",
      openrouterApiKey: "sk-or",
    });

    const names = result.adapters.map((a) => a.name);
    expect(names).toEqual(["deepseek", "gemini", "minimax", "kimi", "openrouter"]);
  });

  it("skips adapters without API keys", () => {
    const result = createTextGenAdapters({
      deepseekApiKey: "sk-ds",
      openrouterApiKey: "sk-or",
    });

    expect(result.adapters).toHaveLength(2);
    expect(result.adapterMap.has("deepseek")).toBe(true);
    expect(result.adapterMap.has("openrouter")).toBe(true);
    expect(result.skipped).toEqual(["gemini", "minimax", "kimi"]);
  });

  it("skips adapters with empty string API keys", () => {
    const result = createTextGenAdapters({
      deepseekApiKey: "",
      geminiApiKey: "sk-gem",
    });

    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0].name).toBe("gemini");
    expect(result.skipped).toContain("deepseek");
  });

  it("returns empty result when no keys provided", () => {
    const result = createTextGenAdapters({});

    expect(result.adapters).toHaveLength(0);
    expect(result.adapterMap.size).toBe(0);
    expect(result.skipped).toEqual(["deepseek", "gemini", "minimax", "kimi", "openrouter"]);
  });

  it("all adapters support text-generation capability", () => {
    const result = createTextGenAdapters({
      deepseekApiKey: "sk-ds",
      geminiApiKey: "sk-gem",
      minimaxApiKey: "sk-mm",
      kimiApiKey: "sk-kimi",
      openrouterApiKey: "sk-or",
    });

    for (const adapter of result.adapters) {
      expect(adapter.capabilities).toContain("text-generation");
    }
  });

  it("all adapters implement generateText", () => {
    const result = createTextGenAdapters({
      deepseekApiKey: "sk-ds",
      geminiApiKey: "sk-gem",
      minimaxApiKey: "sk-mm",
      kimiApiKey: "sk-kimi",
      openrouterApiKey: "sk-or",
    });

    for (const adapter of result.adapters) {
      expect(typeof adapter.generateText).toBe("function");
    }
  });

  it("adapterMap keys match adapter names", () => {
    const result = createTextGenAdapters({
      deepseekApiKey: "sk-ds",
      geminiApiKey: "sk-gem",
    });

    for (const [key, adapter] of result.adapterMap) {
      expect(key).toBe(adapter.name);
    }
  });

  it("passes per-adapter config overrides", () => {
    const result = createTextGenAdapters({
      deepseekApiKey: "sk-ds",
      deepseek: { defaultModel: "deepseek-reasoner" },
    });

    // Adapter was created — we can't inspect internal config directly,
    // but we can confirm it was created successfully with override
    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0].name).toBe("deepseek");
  });

  it("creates only one adapter for single-provider config", () => {
    const result = createTextGenAdapters({
      kimiApiKey: "sk-kimi",
    });

    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0].name).toBe("kimi");
    expect(result.skipped).toEqual(["deepseek", "gemini", "minimax", "openrouter"]);
  });
});

describe("createTextGenAdaptersFromEnv", () => {
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("reads API keys from environment variables", () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "env-ds");
    vi.stubEnv("GEMINI_API_KEY", "env-gem");
    vi.stubEnv("MINIMAX_API_KEY", "");
    vi.stubEnv("KIMI_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "env-or");

    const result = createTextGenAdaptersFromEnv();

    expect(result.adapters).toHaveLength(3);
    const names = result.adapters.map((a) => a.name);
    expect(names).toEqual(["deepseek", "gemini", "openrouter"]);
    expect(result.skipped).toEqual(["minimax", "kimi"]);
  });

  it("returns empty when no env vars set", () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("MINIMAX_API_KEY", "");
    vi.stubEnv("KIMI_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");

    const result = createTextGenAdaptersFromEnv();

    expect(result.adapters).toHaveLength(0);
    expect(result.skipped).toHaveLength(5);
  });

  it("accepts per-adapter overrides alongside env keys", () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "env-ds");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("MINIMAX_API_KEY", "");
    vi.stubEnv("KIMI_API_KEY", "");
    vi.stubEnv("OPENROUTER_API_KEY", "");

    const result = createTextGenAdaptersFromEnv({
      deepseek: { marginMultiplier: 1.5 },
    });

    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0].name).toBe("deepseek");
  });
});
