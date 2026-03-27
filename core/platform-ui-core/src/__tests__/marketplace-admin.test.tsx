import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockListPlugins, mockUpdatePlugin, mockAddPlugin } = vi.hoisted(() => ({
  mockListPlugins: vi.fn(),
  mockUpdatePlugin: vi.fn(),
  mockAddPlugin: vi.fn(),
}));

vi.mock("../lib/trpc", () => ({
  trpcVanilla: {
    adminMarketplace: {
      listPlugins: { query: mockListPlugins },
      updatePlugin: { mutate: mockUpdatePlugin },
      addPlugin: { mutate: mockAddPlugin },
    },
  },
}));

const PLUGIN_BASE = {
  id: "test-plugin",
  npm_package: "@wopr-network/plugin-test",
  name: "Test Plugin",
  description: "A test plugin",
  version: "1.0.0",
  author: "Test",
  category: "utility",
  icon_url: null,
  enabled: true,
  featured: false,
  sort_order: 0,
  notes: "",
  superpower_md: null,
  discovered_at: Date.now(),
  enabled_at: Date.now(),
  reviewed: true,
};

describe("admin-marketplace-api", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getDiscoveryQueue", () => {
    it("returns only unreviewed plugins when tRPC succeeds", async () => {
      const { getDiscoveryQueue } = await import("../lib/admin-marketplace-api");
      const plugins = [
        { ...PLUGIN_BASE, id: "reviewed", reviewed: true },
        { ...PLUGIN_BASE, id: "unreviewed", reviewed: false },
      ];
      mockListPlugins.mockResolvedValue(plugins);

      const queue = await getDiscoveryQueue();

      expect(mockListPlugins).toHaveBeenCalledOnce();
      expect(queue).toHaveLength(1);
      expect(queue[0].id).toBe("unreviewed");
      expect(queue[0].reviewed).toBe(false);
    });

    it("throws when tRPC fails", async () => {
      const { getDiscoveryQueue } = await import("../lib/admin-marketplace-api");
      mockListPlugins.mockRejectedValue(new Error("tRPC unavailable"));

      await expect(getDiscoveryQueue()).rejects.toThrow("tRPC unavailable");
    });
  });

  describe("getEnabledPlugins", () => {
    it("returns only enabled reviewed plugins sorted by sort_order when tRPC succeeds", async () => {
      const { getEnabledPlugins } = await import("../lib/admin-marketplace-api");
      const plugins = [
        { ...PLUGIN_BASE, id: "a", enabled: true, reviewed: true, sort_order: 2 },
        { ...PLUGIN_BASE, id: "b", enabled: false, reviewed: true, sort_order: 0 },
        { ...PLUGIN_BASE, id: "c", enabled: true, reviewed: true, sort_order: 1 },
        { ...PLUGIN_BASE, id: "d", enabled: true, reviewed: false, sort_order: 0 },
      ];
      mockListPlugins.mockResolvedValue(plugins);

      const result = await getEnabledPlugins();

      expect(mockListPlugins).toHaveBeenCalledOnce();
      expect(result.map((p) => p.id)).toEqual(["c", "a"]);
      for (const p of result) {
        expect(p.enabled).toBe(true);
        expect(p.reviewed).toBe(true);
      }
      for (let i = 1; i < result.length; i++) {
        expect(result[i].sort_order).toBeGreaterThanOrEqual(result[i - 1].sort_order);
      }
    });

    it("throws when tRPC fails", async () => {
      const { getEnabledPlugins } = await import("../lib/admin-marketplace-api");
      mockListPlugins.mockRejectedValue(new Error("tRPC unavailable"));

      await expect(getEnabledPlugins()).rejects.toThrow("tRPC unavailable");
    });
  });

  describe("updatePlugin", () => {
    it("returns updated plugin from tRPC when it succeeds", async () => {
      const { updatePlugin } = await import("../lib/admin-marketplace-api");
      const updated = { ...PLUGIN_BASE, notes: "test note" };
      mockUpdatePlugin.mockResolvedValue(updated);

      const result = await updatePlugin({ id: PLUGIN_BASE.id, notes: "test note" });

      expect(mockUpdatePlugin).toHaveBeenCalledWith({ id: PLUGIN_BASE.id, notes: "test note" });
      expect(result.notes).toBe("test note");
    });

    it("throws when tRPC fails", async () => {
      const { updatePlugin } = await import("../lib/admin-marketplace-api");
      mockUpdatePlugin.mockRejectedValue(new Error("tRPC unavailable"));

      await expect(updatePlugin({ id: "discord", notes: "fallback note" })).rejects.toThrow(
        "tRPC unavailable",
      );
    });
  });

  describe("addPluginByNpm", () => {
    it("returns new plugin from tRPC when it succeeds", async () => {
      const { addPluginByNpm } = await import("../lib/admin-marketplace-api");
      const newPlugin = {
        ...PLUGIN_BASE,
        id: "new-id",
        npm_package: "@wopr-network/plugin-new",
        reviewed: false,
        enabled: false,
      };
      mockAddPlugin.mockResolvedValue(newPlugin);

      const result = await addPluginByNpm({ npm_package: "@wopr-network/plugin-new" });

      expect(mockAddPlugin).toHaveBeenCalledWith({ npm_package: "@wopr-network/plugin-new" });
      expect(result.npm_package).toBe("@wopr-network/plugin-new");
      expect(result.reviewed).toBe(false);
      expect(result.enabled).toBe(false);
    });

    it("throws when tRPC fails", async () => {
      const { addPluginByNpm } = await import("../lib/admin-marketplace-api");
      mockAddPlugin.mockRejectedValue(new Error("tRPC unavailable"));

      await expect(addPluginByNpm({ npm_package: "@wopr-network/plugin-test" })).rejects.toThrow(
        "tRPC unavailable",
      );
    });
  });
});
