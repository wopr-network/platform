import { afterAll, describe, expect, it, vi } from "vitest";
import { createTTSAdapters, createTTSAdaptersFromEnv } from "./tts-factory.js";

describe("createTTSAdapters", () => {
  it("creates both adapters when all config provided", () => {
    const result = createTTSAdapters({
      chatterboxBaseUrl: "http://chatterbox:8000",
      elevenlabsApiKey: "sk-el",
    });

    expect(result.adapters).toHaveLength(2);
    expect(result.adapterMap.size).toBe(2);
    expect(result.skipped).toHaveLength(0);
  });

  it("returns adapters in cost-priority order (GPU first)", () => {
    const result = createTTSAdapters({
      chatterboxBaseUrl: "http://chatterbox:8000",
      elevenlabsApiKey: "sk-el",
    });

    const names = result.adapters.map((a) => a.name);
    expect(names).toEqual(["chatterbox-tts", "elevenlabs"]);
  });

  it("skips chatterbox when no base URL", () => {
    const result = createTTSAdapters({
      elevenlabsApiKey: "sk-el",
    });

    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0].name).toBe("elevenlabs");
    expect(result.skipped).toEqual(["chatterbox-tts"]);
  });

  it("skips elevenlabs when no API key", () => {
    const result = createTTSAdapters({
      chatterboxBaseUrl: "http://chatterbox:8000",
    });

    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0].name).toBe("chatterbox-tts");
    expect(result.skipped).toEqual(["elevenlabs"]);
  });

  it("skips elevenlabs with empty string API key", () => {
    const result = createTTSAdapters({
      chatterboxBaseUrl: "http://chatterbox:8000",
      elevenlabsApiKey: "",
    });

    expect(result.adapters).toHaveLength(1);
    expect(result.skipped).toContain("elevenlabs");
  });

  it("returns empty result when no config provided", () => {
    const result = createTTSAdapters({});

    expect(result.adapters).toHaveLength(0);
    expect(result.adapterMap.size).toBe(0);
    expect(result.skipped).toEqual(["chatterbox-tts", "elevenlabs"]);
  });

  it("all adapters support tts capability", () => {
    const result = createTTSAdapters({
      chatterboxBaseUrl: "http://chatterbox:8000",
      elevenlabsApiKey: "sk-el",
    });

    for (const adapter of result.adapters) {
      expect(adapter.capabilities).toContain("tts");
    }
  });

  it("all adapters implement synthesizeSpeech", () => {
    const result = createTTSAdapters({
      chatterboxBaseUrl: "http://chatterbox:8000",
      elevenlabsApiKey: "sk-el",
    });

    for (const adapter of result.adapters) {
      expect(typeof adapter.synthesizeSpeech).toBe("function");
    }
  });

  it("adapterMap keys match adapter names", () => {
    const result = createTTSAdapters({
      chatterboxBaseUrl: "http://chatterbox:8000",
      elevenlabsApiKey: "sk-el",
    });

    for (const [key, adapter] of result.adapterMap) {
      expect(key).toBe(adapter.name);
    }
  });

  it("chatterbox adapter is marked self-hosted", () => {
    const result = createTTSAdapters({
      chatterboxBaseUrl: "http://chatterbox:8000",
    });

    expect(result.adapters[0].selfHosted).toBe(true);
  });

  it("elevenlabs adapter is not marked self-hosted", () => {
    const result = createTTSAdapters({
      elevenlabsApiKey: "sk-el",
    });

    expect(result.adapters[0].selfHosted).toBeUndefined();
  });

  it("passes per-adapter config overrides", () => {
    const result = createTTSAdapters({
      chatterboxBaseUrl: "http://chatterbox:8000",
      chatterbox: { costPerChar: 0.000001 },
      elevenlabsApiKey: "sk-el",
      elevenlabs: { defaultVoice: "custom-voice" },
    });

    expect(result.adapters).toHaveLength(2);
  });
});

describe("createTTSAdaptersFromEnv", () => {
  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it("reads config from environment variables", () => {
    vi.stubEnv("CHATTERBOX_BASE_URL", "http://chatterbox:8000");
    vi.stubEnv("ELEVENLABS_API_KEY", "env-el");

    const result = createTTSAdaptersFromEnv();

    expect(result.adapters).toHaveLength(2);
    const names = result.adapters.map((a) => a.name);
    expect(names).toEqual(["chatterbox-tts", "elevenlabs"]);
    expect(result.skipped).toHaveLength(0);
  });

  it("returns empty when no env vars set", () => {
    vi.stubEnv("CHATTERBOX_BASE_URL", "");
    vi.stubEnv("ELEVENLABS_API_KEY", "");

    const result = createTTSAdaptersFromEnv();

    expect(result.adapters).toHaveLength(0);
    expect(result.skipped).toHaveLength(2);
  });

  it("accepts per-adapter overrides alongside env config", () => {
    vi.stubEnv("CHATTERBOX_BASE_URL", "http://chatterbox:8000");
    vi.stubEnv("ELEVENLABS_API_KEY", "");

    const result = createTTSAdaptersFromEnv({
      chatterbox: { costPerChar: 0.000001 },
    });

    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0].name).toBe("chatterbox-tts");
  });
});
