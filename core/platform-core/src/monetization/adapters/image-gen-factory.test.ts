import { afterAll, describe, expect, it, vi } from "vitest";
import { createImageGenAdapters, createImageGenAdaptersFromEnv } from "./image-gen-factory.js";

describe("createImageGenAdapters", () => {
  it("creates both adapters when all keys provided", () => {
    const result = createImageGenAdapters({
      geminiApiKey: "sk-gem",
      replicateApiToken: "r8-rep",
    });

    expect(result.adapters).toHaveLength(2);
    expect(result.adapterMap.size).toBe(2);
    expect(result.skipped).toHaveLength(0);
  });

  it("returns adapters in cost-priority order (cheapest first)", () => {
    const result = createImageGenAdapters({
      geminiApiKey: "sk-gem",
      replicateApiToken: "r8-rep",
    });

    const names = result.adapters.map((a) => a.name);
    expect(names).toEqual(["replicate", "nano-banana"]);
  });

  it("skips nano-banana when no Gemini API key", () => {
    const result = createImageGenAdapters({
      replicateApiToken: "r8-rep",
    });

    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0].name).toBe("replicate");
    expect(result.skipped).toEqual(["nano-banana"]);
  });

  it("skips replicate when no API token", () => {
    const result = createImageGenAdapters({
      geminiApiKey: "sk-gem",
    });

    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0].name).toBe("nano-banana");
    expect(result.skipped).toEqual(["replicate"]);
  });

  it("skips adapters with empty string keys", () => {
    const result = createImageGenAdapters({
      geminiApiKey: "",
      replicateApiToken: "r8-rep",
    });

    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0].name).toBe("replicate");
    expect(result.skipped).toContain("nano-banana");
  });

  it("returns empty result when no keys provided", () => {
    const result = createImageGenAdapters({});

    expect(result.adapters).toHaveLength(0);
    expect(result.adapterMap.size).toBe(0);
    expect(result.skipped).toEqual(["replicate", "nano-banana"]);
  });

  it("all adapters support image-generation capability", () => {
    const result = createImageGenAdapters({
      geminiApiKey: "sk-gem",
      replicateApiToken: "r8-rep",
    });

    for (const adapter of result.adapters) {
      expect(adapter.capabilities).toContain("image-generation");
    }
  });

  it("all adapters implement generateImage", () => {
    const result = createImageGenAdapters({
      geminiApiKey: "sk-gem",
      replicateApiToken: "r8-rep",
    });

    for (const adapter of result.adapters) {
      expect(typeof adapter.generateImage).toBe("function");
    }
  });

  it("adapterMap keys match adapter names", () => {
    const result = createImageGenAdapters({
      geminiApiKey: "sk-gem",
      replicateApiToken: "r8-rep",
    });

    for (const [key, adapter] of result.adapterMap) {
      expect(key).toBe(adapter.name);
    }
  });

  it("passes per-adapter config overrides", () => {
    const result = createImageGenAdapters({
      geminiApiKey: "sk-gem",
      nanoBanana: { costPerImage: 0.01 },
      replicateApiToken: "r8-rep",
      replicate: { marginMultiplier: 1.5 },
    });

    expect(result.adapters).toHaveLength(2);
  });

  it("creates only one adapter for single-provider config", () => {
    const result = createImageGenAdapters({
      geminiApiKey: "sk-gem",
    });

    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0].name).toBe("nano-banana");
    expect(result.skipped).toEqual(["replicate"]);
  });
});

describe("createImageGenAdaptersFromEnv", () => {
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("reads keys from environment variables", () => {
    vi.stubEnv("GEMINI_API_KEY", "env-gem");
    vi.stubEnv("REPLICATE_API_TOKEN", "env-rep");

    const result = createImageGenAdaptersFromEnv();

    expect(result.adapters).toHaveLength(2);
    const names = result.adapters.map((a) => a.name);
    expect(names).toEqual(["replicate", "nano-banana"]);
    expect(result.skipped).toHaveLength(0);
  });

  it("returns empty when no env vars set", () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("REPLICATE_API_TOKEN", "");

    const result = createImageGenAdaptersFromEnv();

    expect(result.adapters).toHaveLength(0);
    expect(result.skipped).toHaveLength(2);
  });

  it("accepts per-adapter overrides alongside env keys", () => {
    vi.stubEnv("GEMINI_API_KEY", "env-gem");
    vi.stubEnv("REPLICATE_API_TOKEN", "");

    const result = createImageGenAdaptersFromEnv({
      nanoBanana: { costPerImage: 0.01 },
    });

    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0].name).toBe("nano-banana");
  });
});
