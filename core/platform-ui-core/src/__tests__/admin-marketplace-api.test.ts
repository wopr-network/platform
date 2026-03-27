import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- Mock tRPC client ----
const { mockListPlugins, mockUpdatePlugin, mockAddPlugin } = vi.hoisted(() => ({
  mockListPlugins: { query: vi.fn() },
  mockUpdatePlugin: { mutate: vi.fn() },
  mockAddPlugin: { mutate: vi.fn() },
}));

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {
    adminMarketplace: {
      listPlugins: mockListPlugins,
      updatePlugin: mockUpdatePlugin,
      addPlugin: mockAddPlugin,
    },
  },
  trpc: {},
}));

import type { AdminPlugin } from "@/lib/admin-marketplace-api";
import {
  addPluginByNpm,
  getAllPlugins,
  getDiscoveryQueue,
  getEnabledPlugins,
  reorderPlugins,
  updatePlugin,
} from "@/lib/admin-marketplace-api";

function fakePlugin(overrides: Partial<AdminPlugin> = {}): AdminPlugin {
  return {
    id: "test-1",
    npm_package: "@test/plugin",
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
    discovered_at: 1000,
    enabled_at: 2000,
    reviewed: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAllPlugins", () => {
  it("returns plugins from tRPC", async () => {
    const plugins = [fakePlugin()];
    mockListPlugins.query.mockResolvedValue(plugins);

    const result = await getAllPlugins();

    expect(mockListPlugins.query).toHaveBeenCalledWith(undefined);
    expect(result).toEqual(plugins);
  });

  it("throws when API fails", async () => {
    mockListPlugins.query.mockRejectedValue(new Error("API down"));

    await expect(getAllPlugins()).rejects.toThrow("API down");
  });
});

describe("getDiscoveryQueue", () => {
  it("returns only unreviewed plugins from tRPC", async () => {
    const plugins = [
      fakePlugin({ id: "a", reviewed: true }),
      fakePlugin({ id: "b", reviewed: false }),
    ];
    mockListPlugins.query.mockResolvedValue(plugins);

    const result = await getDiscoveryQueue();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b");
  });

  it("throws when API fails", async () => {
    mockListPlugins.query.mockRejectedValue(new Error("fail"));

    await expect(getDiscoveryQueue()).rejects.toThrow("fail");
  });
});

describe("getEnabledPlugins", () => {
  it("returns enabled+reviewed plugins sorted by sort_order", async () => {
    const plugins = [
      fakePlugin({ id: "b", enabled: true, reviewed: true, sort_order: 2 }),
      fakePlugin({ id: "a", enabled: true, reviewed: true, sort_order: 1 }),
      fakePlugin({ id: "c", enabled: false, reviewed: true, sort_order: 0 }),
      fakePlugin({ id: "d", enabled: true, reviewed: false, sort_order: 0 }),
    ];
    mockListPlugins.query.mockResolvedValue(plugins);

    const result = await getEnabledPlugins();

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("a");
    expect(result[1].id).toBe("b");
  });

  it("throws when API fails", async () => {
    mockListPlugins.query.mockRejectedValue(new Error("fail"));

    await expect(getEnabledPlugins()).rejects.toThrow("fail");
  });
});

describe("updatePlugin", () => {
  it("calls tRPC mutate and returns updated plugin", async () => {
    const updated = fakePlugin({ id: "x", notes: "updated" });
    mockUpdatePlugin.mutate.mockResolvedValue(updated);

    const result = await updatePlugin({ id: "x", notes: "updated" });

    expect(mockUpdatePlugin.mutate).toHaveBeenCalledWith({ id: "x", notes: "updated" });
    expect(result).toEqual(updated);
  });

  it("throws when API fails", async () => {
    mockUpdatePlugin.mutate.mockRejectedValue(new Error("fail"));

    await expect(updatePlugin({ id: "x" })).rejects.toThrow("fail");
  });
});

describe("addPluginByNpm", () => {
  it("calls tRPC mutate and returns new plugin", async () => {
    const newPlugin = fakePlugin({ npm_package: "@foo/bar" });
    mockAddPlugin.mutate.mockResolvedValue(newPlugin);

    const result = await addPluginByNpm({ npm_package: "@foo/bar" });

    expect(mockAddPlugin.mutate).toHaveBeenCalledWith({ npm_package: "@foo/bar" });
    expect(result).toEqual(newPlugin);
  });

  it("throws when API fails", async () => {
    mockAddPlugin.mutate.mockRejectedValue(new Error("fail"));

    await expect(addPluginByNpm({ npm_package: "@foo/bar" })).rejects.toThrow("fail");
  });
});

describe("reorderPlugins", () => {
  it("calls updatePlugin.mutate for each id with correct sort_order", async () => {
    mockUpdatePlugin.mutate.mockResolvedValue({});

    await reorderPlugins(["c", "a", "b"]);

    expect(mockUpdatePlugin.mutate).toHaveBeenCalledTimes(3);
    expect(mockUpdatePlugin.mutate).toHaveBeenCalledWith({ id: "c", sort_order: 0 });
    expect(mockUpdatePlugin.mutate).toHaveBeenCalledWith({ id: "a", sort_order: 1 });
    expect(mockUpdatePlugin.mutate).toHaveBeenCalledWith({ id: "b", sort_order: 2 });
  });

  it("handles empty array without calling mutate", async () => {
    await reorderPlugins([]);

    expect(mockUpdatePlugin.mutate).not.toHaveBeenCalled();
  });

  it("throws when API fails", async () => {
    mockUpdatePlugin.mutate.mockRejectedValue(new Error("fail"));

    await expect(reorderPlugins(["a"])).rejects.toThrow("fail");
  });
});
