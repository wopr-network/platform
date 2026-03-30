import { describe, expect, it } from "vitest";
import { bootstrapAdapters } from "./bootstrap.js";

describe("bootstrapAdapters", () => {
  it("creates all adapters when all keys provided", () => {
    const result = bootstrapAdapters({
      textGen: {
        deepseekApiKey: "sk-ds",
        geminiApiKey: "sk-gem",
        minimaxApiKey: "sk-mm",
        kimiApiKey: "sk-kimi",
        openrouterApiKey: "sk-or",
      },
      tts: {
        chatterboxBaseUrl: "http://chatterbox:8000",
        elevenlabsApiKey: "sk-el",
      },
      transcription: {
        deepgramApiKey: "sk-dg",
      },
      embeddings: {
        ollamaBaseUrl: "http://ollama:11434",
        openrouterApiKey: "sk-or",
      },
      imageGen: {
        replicateApiToken: "r8-rep",
        geminiApiKey: "sk-gem",
      },
    });

    // 5 text-gen + 2 TTS + 1 transcription + 2 embeddings + 2 image-gen = 12
    expect(result.adapters).toHaveLength(12);
    expect(result.summary.total).toBe(12);
    expect(result.summary.skipped).toBe(0);
  });

  it("allows duplicate provider names across capabilities", () => {
    const result = bootstrapAdapters({
      textGen: { openrouterApiKey: "sk-or" },
      embeddings: { openrouterApiKey: "sk-or" },
    });

    // OpenRouter appears twice — once for text-gen, once for embeddings
    const openrouters = result.adapters.filter((a) => a.name === "openrouter");
    expect(openrouters).toHaveLength(2);
    expect(result.summary.total).toBe(2);
  });

  it("returns correct per-capability counts", () => {
    const result = bootstrapAdapters({
      textGen: { deepseekApiKey: "sk-ds" },
      tts: { chatterboxBaseUrl: "http://chatterbox:8000" },
      transcription: { deepgramApiKey: "sk-dg" },
      embeddings: { openrouterApiKey: "sk-or" },
    });

    expect(result.summary.byCapability).toEqual({
      "text-generation": 1,
      tts: 1,
      transcription: 1,
      embeddings: 1,
      "image-generation": 0,
    });
  });

  it("tracks skipped providers by capability", () => {
    const result = bootstrapAdapters({
      textGen: { deepseekApiKey: "sk-ds" },
      tts: {},
      transcription: {},
      embeddings: {},
    });

    expect(result.skipped.tts).toEqual(["chatterbox-tts", "elevenlabs"]);
    expect(result.skipped.transcription).toEqual(["deepgram"]);
    expect(result.skipped.embeddings).toEqual(["ollama-embeddings", "openrouter"]);
    expect(result.skipped["text-generation"]).toEqual(["gemini", "minimax", "kimi", "openrouter"]);
    expect(result.skipped["image-generation"]).toEqual(["replicate", "nano-banana"]);
  });

  it("returns empty result when no config provided", () => {
    const result = bootstrapAdapters({});

    expect(result.adapters).toHaveLength(0);
    expect(result.summary.total).toBe(0);
    expect(result.summary.skipped).toBeGreaterThan(0);
  });

  it("omits capability from skipped when all providers created", () => {
    const result = bootstrapAdapters({
      transcription: { deepgramApiKey: "sk-dg" },
    });

    expect(result.skipped.transcription).toBeUndefined();
  });

  it("handles partial config — only text-gen", () => {
    const result = bootstrapAdapters({
      textGen: { openrouterApiKey: "sk-or" },
    });

    expect(result.summary.byCapability["text-generation"]).toBe(1);
    expect(result.summary.byCapability.tts).toBe(0);
    expect(result.summary.byCapability.transcription).toBe(0);
    expect(result.summary.byCapability.embeddings).toBe(0);
    expect(result.summary.byCapability["image-generation"]).toBe(0);
  });

  it("passes per-adapter overrides through", () => {
    const result = bootstrapAdapters({
      textGen: {
        deepseekApiKey: "sk-ds",
        deepseek: { marginMultiplier: 1.5 },
      },
    });

    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0].name).toBe("deepseek");
  });
});
