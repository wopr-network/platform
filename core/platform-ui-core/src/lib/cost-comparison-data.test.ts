import { describe, expect, it } from "vitest";
import { buildCostComparison, DIY_COSTS } from "./cost-comparison-data";

describe("DIY_COSTS", () => {
  it("contains items derived from channelPlugins and superpowers with diyCostData", () => {
    expect(DIY_COSTS.length).toBeGreaterThan(0);
    for (const item of DIY_COSTS) {
      expect(item).toHaveProperty("capabilityId");
      expect(typeof item.capabilityId).toBe("string");
      expect(item).toHaveProperty("diyLabel");
      expect(item).toHaveProperty("diyCostPerMonth");
      expect(typeof item.diyCostNumeric).toBe("number");
      expect(Array.isArray(item.accounts)).toBe(true);
      expect(Array.isArray(item.apiKeys)).toBe(true);
    }
  });

  it("each capabilityId is unique", () => {
    const ids = DIY_COSTS.map((c) => c.capabilityId);
    expect(ids.length).toBe(new Set(ids).size);
  });
});

describe("buildCostComparison", () => {
  it("returns empty summary when no capabilities are selected", () => {
    const result = buildCostComparison([], []);
    expect(result.items).toEqual([]);
    expect(result.totalDiyMonthly).toBe("$0");
    expect(result.totalPlatformMonthly).toBe("$5");
    expect(result.accountsRequired).toBe(0);
    expect(result.apiKeysRequired).toBe(0);
  });

  it("filters items to only selected channels and superpowers", () => {
    const knownItem = DIY_COSTS[0];
    if (!knownItem) return;

    const result = buildCostComparison([knownItem.capabilityId], []);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].capabilityId).toBe(knownItem.capabilityId);
  });

  it("accepts superpowers in the second argument", () => {
    const superItem = DIY_COSTS.find((c) =>
      ["image-gen", "video-gen", "voice"].includes(c.capabilityId),
    );
    if (!superItem) return;

    const result = buildCostComparison([], [superItem.capabilityId]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].capabilityId).toBe(superItem.capabilityId);
  });

  it("sums diyCostNumeric and formats as dollars with + suffix", () => {
    // image-gen (3000 cents) + voice (1500 cents) = 4500 cents = $45
    const result = buildCostComparison([], ["image-gen", "voice"]);
    expect(result.totalDiyMonthly).toBe("$45+");
    expect(result.totalPlatformMonthly).toBe("$5");
  });

  it("deduplicates accounts across items sharing the same provider", () => {
    // image-gen and video-gen both require "Replicate" account
    const result = buildCostComparison([], ["image-gen", "video-gen"]);
    expect(result.accountsRequired).toBe(1);
  });

  it("deduplicates apiKeys across items sharing the same key", () => {
    // image-gen and video-gen both require "Replicate API Token"
    const result = buildCostComparison([], ["image-gen", "video-gen"]);
    expect(result.apiKeysRequired).toBe(1);
  });

  it("counts distinct accounts when items use different providers", () => {
    // image-gen (Replicate) + voice (ElevenLabs) = 2 accounts
    const result = buildCostComparison([], ["image-gen", "voice"]);
    expect(result.accountsRequired).toBe(2);
    expect(result.apiKeysRequired).toBe(2);
  });

  it("ignores IDs that have no matching DIY_COSTS entry", () => {
    const result = buildCostComparison(["nonexistent-channel"], ["nonexistent-super"]);
    expect(result.items).toEqual([]);
    expect(result.totalDiyMonthly).toBe("$0");
  });

  it("combines channels and superpowers in a single result", () => {
    // Find a channel with cost data (not a superpower)
    const superpowerIds = ["image-gen", "video-gen", "voice", "memory", "search", "text-gen"];
    const channelItem = DIY_COSTS.find((c) => !superpowerIds.includes(c.capabilityId));
    if (!channelItem) return;

    const result = buildCostComparison([channelItem.capabilityId], ["image-gen"]);
    expect(result.items).toHaveLength(2);
  });
});
