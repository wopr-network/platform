import { describe, expect, it } from "vitest";
import { mergeApiRates } from "../lib/pricing-data";

describe("mergeApiRates", () => {
  it("groups tts and stt under Voice", () => {
    const result = mergeApiRates({
      tts: [{ name: "TTS Standard", unit: "1K chars", price: 0.2 }],
      stt: [{ name: "Whisper", unit: "minute", price: 0.02 }],
    });

    const voice = result.find((c) => c.category === "Voice");
    expect(voice?.models).toHaveLength(2);
    expect(voice?.icon).toBe("mic");
  });

  it("orders categories: Text Gen, Voice, Image Gen, Messaging", () => {
    const result = mergeApiRates({
      sms: [{ name: "SMS", unit: "message", price: 0.01 }],
      llm: [{ name: "GPT-4o", unit: "1M tokens", price: 2.5 }],
      image_gen: [{ name: "SDXL", unit: "image", price: 0.03 }],
      tts: [{ name: "TTS", unit: "1K chars", price: 0.2 }],
    });

    expect(result.map((c) => c.category)).toEqual([
      "Text Generation",
      "Voice",
      "Image Generation",
      "Messaging",
    ]);
  });

  it("handles unknown capability keys with fallback", () => {
    const result = mergeApiRates({
      video_gen: [{ name: "Sora", unit: "second", price: 0.5 }],
    });

    expect(result).toHaveLength(1);
    expect(result[0].category).toBe("Video Gen");
    expect(result[0].icon).toBe("bot");
    expect(result[0].models[0].name).toBe("Sora");
  });

  it("returns empty array for empty input", () => {
    expect(mergeApiRates({})).toEqual([]);
  });

  it("unknown categories sort after known ones", () => {
    const result = mergeApiRates({
      llm: [{ name: "GPT-4o", unit: "1M tokens", price: 2.5 }],
      video_gen: [{ name: "Sora", unit: "second", price: 0.5 }],
    });

    expect(result[0].category).toBe("Text Generation");
    expect(result[1].category).toBe("Video Gen");
  });

  it("preserves all models within a grouped category", () => {
    const result = mergeApiRates({
      tts: [
        { name: "TTS Standard", unit: "1K chars", price: 0.2 },
        { name: "TTS Premium", unit: "1K chars", price: 0.5 },
      ],
      stt: [{ name: "Whisper", unit: "minute", price: 0.02 }],
    });

    const voice = result.find((c) => c.category === "Voice");
    expect(voice?.models).toHaveLength(3);
    expect(voice?.models.map((m) => m.name)).toEqual(["TTS Standard", "TTS Premium", "Whisper"]);
  });
});
