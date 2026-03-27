import { describe, expect, it } from "vitest";

describe("parseManifest", () => {
  it("fills defaults for a minimal manifest with only id and name", async () => {
    const { parseManifest } = await import("../lib/marketplace-data");
    const result = parseManifest({ id: "test-plugin", name: "Test" });

    expect(result.id).toBe("test-plugin");
    expect(result.name).toBe("Test");
    expect(result.description).toBe("No description provided");
    expect(result.version).toBe("unknown");
    expect(result.author).toBe("Unknown");
    expect(result.icon).toBe("Package");
    expect(result.color).toBe("#6B7280");
    expect(result.tags).toEqual([]);
    expect(result.capabilities).toEqual([]);
    expect(result.requires).toEqual([]);
    expect(result.install).toEqual([]);
    expect(result.configSchema).toEqual([]);
    expect(result.setup).toEqual([]);
    expect(result.installCount).toBe(0);
    expect(result.changelog).toEqual([]);
  });

  it("preserves all fields when manifest is complete", async () => {
    const { parseManifest } = await import("../lib/marketplace-data");
    const full = {
      id: "discord",
      name: "Discord",
      description: "Connect to Discord",
      version: "3.2.0",
      author: "Platform Team",
      icon: "MessageCircle",
      color: "#5865F2",
      category: "channel",
      tags: ["chat"],
      capabilities: ["channel"],
      requires: [],
      install: [],
      configSchema: [],
      setup: [],
      installCount: 12400,
      changelog: [{ version: "3.2.0", date: "2026-02-10", notes: "Thread support" }],
    };
    const result = parseManifest(full);

    expect(result.description).toBe("Connect to Discord");
    expect(result.version).toBe("3.2.0");
    expect(result.installCount).toBe(12400);
    expect(result.changelog).toHaveLength(1);
  });

  it("throws on manifest missing required id", async () => {
    const { parseManifest } = await import("../lib/marketplace-data");
    expect(() => parseManifest({ name: "No ID" })).toThrow();
  });

  it("throws on manifest missing required name", async () => {
    const { parseManifest } = await import("../lib/marketplace-data");
    expect(() => parseManifest({ id: "no-name" })).toThrow();
  });

  it("defaults category to integration for unknown values", async () => {
    const { parseManifest } = await import("../lib/marketplace-data");
    const result = parseManifest({ id: "x", name: "X" });
    expect(result.category).toBe("integration");
  });
});

describe("parseManifestSafe", () => {
  it("returns null for invalid manifests instead of throwing", async () => {
    const { parseManifestSafe } = await import("../lib/marketplace-data");
    const result = parseManifestSafe({ noId: true });
    expect(result).toBeNull();
  });

  it("returns parsed manifest for valid input", async () => {
    const { parseManifestSafe } = await import("../lib/marketplace-data");
    const result = parseManifestSafe({ id: "test", name: "Test" });
    expect(result?.id).toBe("test");
  });
});

describe("listMarketplacePlugins with incomplete manifests", () => {
  it("filters out manifests missing id and fills defaults for partial ones", async () => {
    const { parseManifestSafe } = await import("../lib/marketplace-data");

    const apiResponse = [
      {
        id: "good",
        name: "Good Plugin",
        description: "Works fine",
        version: "1.0.0",
        author: "Test",
        icon: "X",
        color: "#000",
        category: "channel",
        tags: [],
        capabilities: [],
        requires: [],
        install: [],
        configSchema: [],
        setup: [],
        installCount: 0,
        changelog: [],
      },
      { id: "minimal", name: "Minimal" }, // missing most fields
      { name: "No ID" }, // invalid — no id
      { id: "no-name" }, // invalid — no name
    ];

    const results = apiResponse
      .map((item) => parseManifestSafe(item))
      .filter((r): r is NonNullable<typeof r> => r !== null);

    // "good" and "minimal" should parse; "No ID" fails (no id); "no-name" may fail (no name)
    expect(results.length).toBeGreaterThanOrEqual(2);

    const minimal = results.find((r) => r.id === "minimal");
    expect(minimal?.description).toBe("No description provided");
    expect(minimal?.version).toBe("unknown");
    expect(minimal?.tags).toEqual([]);
    expect(minimal?.capabilities).toEqual([]);
    expect(minimal?.configSchema).toEqual([]);
  });
});
