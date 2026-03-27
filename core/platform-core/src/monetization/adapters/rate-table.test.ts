import { describe, expect, it } from "vitest";
import { calculateSavings, getRatesForCapability, lookupRate, RATE_TABLE } from "./rate-table.js";
import type { AdapterCapability } from "./types.js";

describe("RATE_TABLE", () => {
  it("contains both standard and premium tiers for TTS", () => {
    const standardTTS = RATE_TABLE.find((e) => e.capability === "tts" && e.tier === "standard");
    const premiumTTS = RATE_TABLE.find((e) => e.capability === "tts" && e.tier === "premium");

    expect(standardTTS).toEqual(expect.objectContaining({ capability: "tts", tier: "standard" }));
    expect(premiumTTS).toEqual(expect.objectContaining({ capability: "tts", tier: "premium" }));
  });

  it("contains both standard and premium tiers for embeddings", () => {
    const standard = RATE_TABLE.find((e) => e.capability === "embeddings" && e.tier === "standard");
    const premium = RATE_TABLE.find((e) => e.capability === "embeddings" && e.tier === "premium");

    expect(standard).toEqual(
      expect.objectContaining({ capability: "embeddings", tier: "standard", provider: "ollama-embeddings" }),
    );
    expect(premium).toEqual(
      expect.objectContaining({ capability: "embeddings", tier: "premium", provider: "openrouter" }),
    );
  });

  it("contains both standard and premium tiers for text-generation", () => {
    const standard = RATE_TABLE.find((e) => e.capability === "text-generation" && e.tier === "standard");
    const premium = RATE_TABLE.find((e) => e.capability === "text-generation" && e.tier === "premium");

    expect(standard).toEqual(
      expect.objectContaining({ capability: "text-generation", tier: "standard", provider: "self-hosted-llm" }),
    );
    expect(premium).toEqual(
      expect.objectContaining({ capability: "text-generation", tier: "premium", provider: "openrouter" }),
    );
  });

  it("standard tier is cheaper than premium tier for every capability", () => {
    const capabilities = new Set(RATE_TABLE.map((e) => e.capability));
    let compared = 0;

    for (const capability of capabilities) {
      const standard = RATE_TABLE.find((e) => e.capability === capability && e.tier === "standard");
      const premium = RATE_TABLE.find((e) => e.capability === capability && e.tier === "premium");

      if (standard && premium) {
        expect(standard.effectivePrice).toBeLessThan(premium.effectivePrice);
        compared++;
      }
    }

    expect(compared).toBeGreaterThan(0);
  });

  it("effective price equals cost * margin", () => {
    for (const entry of RATE_TABLE) {
      const expectedEffectivePrice = entry.costPerUnit * entry.margin;
      expect(entry.effectivePrice).toBeCloseTo(expectedEffectivePrice, 8);
    }
  });

  it("standard tier uses self-hosted providers", () => {
    const standardEntries = RATE_TABLE.filter((e) => e.tier === "standard");

    for (const entry of standardEntries) {
      // Self-hosted providers include "self-hosted-" prefix or are known self-hosted names
      const isSelfHosted =
        entry.provider.startsWith("self-hosted-") ||
        entry.provider === "chatterbox-tts" ||
        entry.provider === "ollama-embeddings";
      expect(isSelfHosted).toBe(true);
    }
  });

  it("premium tier uses third-party providers", () => {
    const premiumEntries = RATE_TABLE.filter((e) => e.tier === "premium");

    for (const entry of premiumEntries) {
      // Third-party providers are well-known brand names
      const isThirdParty = ["elevenlabs", "deepgram", "openrouter", "replicate", "nano-banana"].includes(
        entry.provider,
      );
      expect(isThirdParty).toBe(true);
    }
  });

  it("standard tier has lower margins than premium tier", () => {
    const capabilities = new Set(RATE_TABLE.map((e) => e.capability));

    for (const capability of capabilities) {
      const standard = RATE_TABLE.find((e) => e.capability === capability && e.tier === "standard");
      const premium = RATE_TABLE.find((e) => e.capability === capability && e.tier === "premium");

      if (standard && premium) {
        expect(standard.margin).toBeLessThan(premium.margin);
      }
    }
  });
});

describe("lookupRate", () => {
  it("finds standard tier TTS rate", () => {
    const rate = lookupRate("tts", "standard");
    expect(rate).toEqual(
      expect.objectContaining({
        capability: "tts",
        tier: "standard",
        provider: "chatterbox-tts",
      }),
    );
  });

  it("finds premium tier TTS rate", () => {
    const rate = lookupRate("tts", "premium");
    expect(rate).toEqual(
      expect.objectContaining({
        capability: "tts",
        tier: "premium",
        provider: "elevenlabs",
      }),
    );
  });

  it("finds text-generation rate entries", () => {
    const standard = lookupRate("text-generation", "standard");
    const premium = lookupRate("text-generation", "premium");

    expect(standard?.provider).toBe("self-hosted-llm");
    expect(premium?.provider).toBe("openrouter");
  });

  it("returns undefined for non-existent capability", () => {
    const rate = lookupRate("video-generation" as unknown as AdapterCapability, "standard");
    expect(rate).toBeUndefined();
  });

  it("returns undefined for non-existent tier", () => {
    const rate = lookupRate("tts", "enterprise" as unknown as "standard" | "premium");
    expect(rate).toBeUndefined();
  });
});

describe("getRatesForCapability", () => {
  it("returns both standard and premium for TTS", () => {
    const rates = getRatesForCapability("tts");
    expect(rates).toHaveLength(2);
    expect(rates.map((r) => r.tier)).toContain("standard");
    expect(rates.map((r) => r.tier)).toContain("premium");
  });

  it("returns both standard and premium for text-generation", () => {
    const rates = getRatesForCapability("text-generation");
    expect(rates).toHaveLength(2);
    expect(rates.map((r) => r.tier)).toContain("standard");
    expect(rates.map((r) => r.tier)).toContain("premium");
  });

  it("returns both standard and premium for embeddings", () => {
    const rates = getRatesForCapability("embeddings");
    expect(rates).toHaveLength(2);
    expect(rates.map((r) => r.tier)).toContain("standard");
    expect(rates.map((r) => r.tier)).toContain("premium");
  });

  it("returns premium-only for transcription (no standard tier yet)", () => {
    const rates = getRatesForCapability("transcription");
    expect(rates).toHaveLength(1);
    expect(rates[0].tier).toBe("premium");
    expect(rates[0].provider).toBe("deepgram");
  });

  it("returns empty array for non-existent capability", () => {
    const rates = getRatesForCapability("video-generation" as unknown as AdapterCapability);
    expect(rates).toHaveLength(0);
  });

  it("all returned rates have the requested capability", () => {
    const rates = getRatesForCapability("tts");
    expect(rates.every((r) => r.capability === "tts")).toBe(true);
  });
});

describe("calculateSavings", () => {
  it("calculates savings for TTS at 1M characters", () => {
    const savings = calculateSavings("tts", 1_000_000);

    // Standard: $2.40 per 1M chars
    // Premium: $22.50 per 1M chars
    // Savings: $20.10 per 1M chars
    expect(savings).toBeCloseTo(20.1, 1);
  });

  it("calculates savings for text-generation at 1M tokens", () => {
    const savings = calculateSavings("text-generation", 1_000_000);

    // Standard (self-hosted-llm): $0.06 per 1M tokens
    // Premium (openrouter): $1.30 per 1M tokens
    // Savings: $1.24 per 1M tokens
    expect(savings).toBeCloseTo(1.24, 2);
  });

  it("calculates savings for TTS at 100K characters", () => {
    const savings = calculateSavings("tts", 100_000);

    // Standard: $0.24 per 100K chars
    // Premium: $2.25 per 100K chars
    // Savings: $2.01 per 100K chars
    expect(savings).toBeCloseTo(2.01, 2);
  });

  it("calculates savings for embeddings at 1M tokens", () => {
    const savings = calculateSavings("embeddings", 1_000_000);

    // Standard (ollama-embeddings): $0.006 per 1M tokens
    // Premium (openrouter): $0.026 per 1M tokens
    // Savings: $0.020 per 1M tokens
    expect(savings).toBeCloseTo(0.02, 3);
  });

  it("returns zero when capability has no standard tier", () => {
    // Transcription only has premium (deepgram) — no self-hosted whisper yet
    const savings = calculateSavings("transcription", 1000);
    expect(savings).toBe(0);
  });

  it("returns zero when capability has no premium tier", () => {
    // This would happen if a capability only has self-hosted, no third-party
    const savings = calculateSavings("voice-cloning" as unknown as AdapterCapability, 1000);
    expect(savings).toBe(0);
  });

  it("savings scale linearly with units", () => {
    const savings1M = calculateSavings("tts", 1_000_000);
    const savings2M = calculateSavings("tts", 2_000_000);

    expect(savings2M).toBeCloseTo(savings1M * 2, 1);
  });

  it("savings are always positive or zero", () => {
    // Standard should always be cheaper than premium
    const savings = calculateSavings("tts", 1000);
    expect(savings).toBeGreaterThanOrEqual(0);
  });
});
