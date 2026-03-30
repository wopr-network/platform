import { describe, expect, it } from "vitest";
import { createTranscriptionAdapters } from "./transcription-factory.js";

describe("createTranscriptionAdapters", () => {
  it("creates deepgram adapter when API key provided", () => {
    const result = createTranscriptionAdapters({
      deepgramApiKey: "sk-dg",
    });

    expect(result.adapters).toHaveLength(1);
    expect(result.adapterMap.size).toBe(1);
    expect(result.skipped).toHaveLength(0);
  });

  it("returns deepgram as only adapter", () => {
    const result = createTranscriptionAdapters({
      deepgramApiKey: "sk-dg",
    });

    expect(result.adapters[0].name).toBe("deepgram");
  });

  it("skips deepgram when no API key", () => {
    const result = createTranscriptionAdapters({});

    expect(result.adapters).toHaveLength(0);
    expect(result.skipped).toEqual(["deepgram"]);
  });

  it("skips deepgram with empty string API key", () => {
    const result = createTranscriptionAdapters({
      deepgramApiKey: "",
    });

    expect(result.adapters).toHaveLength(0);
    expect(result.skipped).toContain("deepgram");
  });

  it("adapter supports transcription capability", () => {
    const result = createTranscriptionAdapters({
      deepgramApiKey: "sk-dg",
    });

    expect(result.adapters[0].capabilities).toContain("transcription");
  });

  it("adapter implements transcribe", () => {
    const result = createTranscriptionAdapters({
      deepgramApiKey: "sk-dg",
    });

    expect(typeof result.adapters[0].transcribe).toBe("function");
  });

  it("adapterMap keys match adapter names", () => {
    const result = createTranscriptionAdapters({
      deepgramApiKey: "sk-dg",
    });

    for (const [key, adapter] of result.adapterMap) {
      expect(key).toBe(adapter.name);
    }
  });

  it("passes per-adapter config overrides", () => {
    const result = createTranscriptionAdapters({
      deepgramApiKey: "sk-dg",
      deepgram: { costPerMinute: 0.005, defaultModel: "nova-2-general" },
    });

    expect(result.adapters).toHaveLength(1);
    expect(result.adapters[0].name).toBe("deepgram");
  });
});
