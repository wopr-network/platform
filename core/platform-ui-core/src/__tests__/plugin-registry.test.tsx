import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePluginRegistry } from "@/hooks/use-plugin-registry";

vi.mock("@/lib/marketplace-data", () => ({
  listMarketplacePlugins: vi.fn(),
}));

import { listMarketplacePlugins } from "@/lib/marketplace-data";

const mockListMarketplacePlugins = vi.mocked(listMarketplacePlugins);

const MOCK_MARKETPLACE_PLUGINS = [
  {
    id: "discord",
    name: "Discord",
    description: "Discord channel plugin",
    version: "1.0.0",
    author: "Platform",
    icon: "MessageCircle",
    color: "#5865F2",
    category: "channel" as const,
    tags: [],
    capabilities: ["channel"],
    requires: [],
    install: [],
    configSchema: [],
    setup: [],
    installCount: 0,
    changelog: [],
  },
  {
    id: "slack",
    name: "Slack",
    description: "Slack channel plugin",
    version: "1.0.0",
    author: "Platform",
    icon: "Hash",
    color: "#4A154B",
    category: "channel" as const,
    tags: [],
    capabilities: ["channel"],
    requires: [],
    install: [],
    configSchema: [],
    setup: [],
    installCount: 0,
    changelog: [],
  },
  {
    id: "some-non-channel",
    name: "Memory Plugin",
    description: "Not a channel",
    version: "1.0.0",
    author: "Platform",
    icon: "Brain",
    color: "#10B981",
    category: "memory" as const,
    tags: [],
    capabilities: ["memory"],
    requires: [],
    install: [],
    configSchema: [],
    setup: [],
    installCount: 0,
    changelog: [],
  },
];

beforeEach(() => {
  mockListMarketplacePlugins.mockResolvedValue(MOCK_MARKETPLACE_PLUGINS);
});

describe("usePluginRegistry", () => {
  it("returns all expected plugin categories", async () => {
    const { result } = renderHook(() => usePluginRegistry());
    await waitFor(() => expect(result.current.categoriesLoaded).toBe(true));
    const categoryIds = result.current.categories.map((c) => c.id);
    expect(categoryIds).toEqual(["memory", "voice", "integration", "ui"]);
  });

  it("returns channel plugins (onboarding-only: signal, whatsapp, msteams; discord/slack/telegram are marketplace-sourced)", async () => {
    const { result } = renderHook(() => usePluginRegistry());
    await waitFor(() => expect(result.current.channelsLoaded).toBe(true));
    const channelIds = result.current.channels.map((c) => c.id);
    expect(channelIds).toContain("signal");
    expect(channelIds).toContain("whatsapp");
    expect(channelIds).toContain("msteams");
  });

  it("returns provider plugins", async () => {
    const { result } = renderHook(() => usePluginRegistry());
    await waitFor(() => expect(result.current.providersLoaded).toBe(true));
    const providerIds = result.current.providers.map((p) => p.id);
    expect(providerIds).toContain("anthropic");
    expect(providerIds).toContain("openai");
    expect(providerIds).toContain("kimi");
    expect(providerIds).toContain("opencode");
  });

  it("returns superpowers", () => {
    const { result } = renderHook(() => usePluginRegistry());
    const superpowerIds = result.current.superpowers.map((s) => s.id);
    expect(superpowerIds).toContain("image-gen");
    expect(superpowerIds).toContain("voice");
    expect(superpowerIds).toContain("memory");
    expect(superpowerIds).toContain("search");
  });

  it("returns personalities", () => {
    const { result } = renderHook(() => usePluginRegistry());
    const personalityIds = result.current.personalities.map((p) => p.id);
    expect(personalityIds).toContain("helpful");
    expect(personalityIds).toContain("creative");
    expect(personalityIds).toContain("code");
    expect(personalityIds).toContain("custom");
  });

  it("returns presets", () => {
    const { result } = renderHook(() => usePluginRegistry());
    expect(result.current.presets).toHaveLength(6);
    const presetIds = result.current.presets.map((p) => p.id);
    expect(presetIds).toContain("discord-ai-bot");
    expect(presetIds).toContain("custom");
  });

  it("returns hero and additional models", () => {
    const { result } = renderHook(() => usePluginRegistry());
    expect(result.current.heroModels.length).toBeGreaterThan(0);
    expect(result.current.additionalModels.length).toBeGreaterThan(0);
    expect(result.current.allModels.length).toBe(
      result.current.heroModels.length + result.current.additionalModels.length,
    );
  });

  it("returns BYOK providers", () => {
    const { result } = renderHook(() => usePluginRegistry());
    const byokIds = result.current.byokProviders.map((p) => p.id);
    expect(byokIds).toContain("anthropic");
    expect(byokIds).toContain("openai");
    expect(byokIds).toContain("openrouter");
  });

  it("data shape matches what onboarding expects: channels have configFields", async () => {
    const { result } = renderHook(() => usePluginRegistry());
    await waitFor(() => expect(result.current.channelsLoaded).toBe(true));
    for (const channel of result.current.channels) {
      expect(channel).toHaveProperty("id");
      expect(channel).toHaveProperty("name");
      expect(channel).toHaveProperty("description");
      expect(channel).toHaveProperty("icon");
      expect(channel).toHaveProperty("color");
      expect(channel).toHaveProperty("capabilities");
      expect(channel).toHaveProperty("configFields");
      expect(Array.isArray(channel.configFields)).toBe(true);
    }
  });

  it("data shape matches what onboarding expects: superpowers have requiresKey", () => {
    const { result } = renderHook(() => usePluginRegistry());
    for (const sp of result.current.superpowers) {
      expect(sp).toHaveProperty("id");
      expect(sp).toHaveProperty("name");
      expect(sp).toHaveProperty("tagline");
      expect(sp).toHaveProperty("requiresKey");
      expect(sp).toHaveProperty("configFields");
    }
  });

  it("provides derived providerOptions as simple {value, label} list", async () => {
    const { result } = renderHook(() => usePluginRegistry());
    await waitFor(() => expect(result.current.providersLoaded).toBe(true));
    expect(result.current.providerOptions.length).toBe(result.current.providers.length);
    for (const opt of result.current.providerOptions) {
      expect(opt).toHaveProperty("value");
      expect(opt).toHaveProperty("label");
      expect(typeof opt.value).toBe("string");
      expect(typeof opt.label).toBe("string");
    }
  });

  it("provides derived channelOptions as simple {value, label} list", async () => {
    const { result } = renderHook(() => usePluginRegistry());
    await waitFor(() => expect(result.current.channelsLoaded).toBe(true));
    expect(result.current.channelOptions.length).toBe(result.current.channels.length);
    for (const opt of result.current.channelOptions) {
      expect(opt).toHaveProperty("value");
      expect(opt).toHaveProperty("label");
    }
  });

  it("provides derived pluginOptions from all categories", async () => {
    const { result } = renderHook(() => usePluginRegistry());
    await waitFor(() => expect(result.current.categoriesLoaded).toBe(true));
    const totalCategoryPlugins = result.current.categories.reduce(
      (sum, cat) => sum + cat.plugins.length,
      0,
    );
    expect(result.current.pluginOptions.length).toBe(totalCategoryPlugins);
  });

  it("exposes helper functions", () => {
    const { result } = renderHook(() => usePluginRegistry());
    expect(typeof result.current.getAllPlugins).toBe("function");
    expect(typeof result.current.getPluginById).toBe("function");
    expect(typeof result.current.collectConfigFields).toBe("function");
    expect(typeof result.current.resolveDependencies).toBe("function");
    expect(typeof result.current.validateField).toBe("function");
  });

  it("getAllPlugins returns combined channels, providers, and category plugins", async () => {
    const { result } = renderHook(() => usePluginRegistry());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const all = result.current.getAllPlugins();
    // signal is an onboarding-only channel in the static list; discord is marketplace-sourced
    expect(all.map((p) => p.id)).toContain("signal");
    expect(all.map((p) => p.id)).toContain("anthropic");
    expect(all.map((p) => p.id)).toContain("semantic-memory");
  });

  it("getPluginById finds plugins from any source", async () => {
    const { result } = renderHook(() => usePluginRegistry());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.getPluginById("signal")?.name).toBe("Signal");
    expect(result.current.getPluginById("anthropic")?.name).toBe("Anthropic");
    expect(result.current.getPluginById("nonexistent")).toBeUndefined();
  });

  it("validateField works through the hook", () => {
    const { result } = renderHook(() => usePluginRegistry());
    const field = {
      key: "test",
      label: "Test Key",
      secret: true,
    };
    expect(result.current.validateField(field, "")).toBe("Test Key is required");
    expect(result.current.validateField(field, "valid")).toBeNull();
  });

  it("returns stable references across re-renders", async () => {
    const { result, rerender } = renderHook(() => usePluginRegistry());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const first = result.current;
    rerender();
    const second = result.current;
    // The memoized registry should be the same object
    expect(first).toBe(second);
  });

  it("starts with loading=true and transitions to loading=false after API resolves", async () => {
    const { result } = renderHook(() => usePluginRegistry());
    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("starts with empty channels/providers/pluginOptions before API resolves", () => {
    const { result } = renderHook(() => usePluginRegistry());
    // Before API resolves, lists are empty (no stale static data)
    expect(result.current.channels).toHaveLength(0);
    expect(result.current.providers).toHaveLength(0);
    expect(result.current.pluginOptions).toHaveLength(0);
  });

  it("fetches channels from marketplace API on mount and includes them", async () => {
    const { result } = renderHook(() => usePluginRegistry());
    // Initially empty before API resolves
    expect(result.current.channels).toHaveLength(0);

    await waitFor(() => {
      const ids = result.current.channels.map((c) => c.id);
      expect(ids).toContain("discord");
      expect(ids).toContain("slack");
      // Still includes onboarding-only channels
      expect(ids).toContain("signal");
      expect(ids).toContain("whatsapp");
      expect(ids).toContain("msteams");
      // Does NOT include non-channel plugins
      expect(ids).not.toContain("some-non-channel");
    });
  });

  it("channelOptions updates after marketplace fetch", async () => {
    const { result } = renderHook(() => usePluginRegistry());
    await waitFor(() => {
      const values = result.current.channelOptions.map((o) => o.value);
      expect(values).toContain("discord");
      expect(values).toContain("signal");
    });
  });

  it("falls back to static channels when marketplace API fails", async () => {
    mockListMarketplacePlugins.mockRejectedValueOnce(new Error("Network error"));
    const { result } = renderHook(() => usePluginRegistry());

    await waitFor(() => {
      expect(result.current.channelsLoaded).toBe(true);
    });

    // Should still have onboarding-only channels
    const ids = result.current.channels.map((c) => c.id);
    expect(ids).toContain("signal");
    expect(ids).toContain("whatsapp");
    expect(ids).toContain("msteams");
    // Should NOT have marketplace channels since API failed
    expect(ids).not.toContain("discord");
  });

  it("exposes channelsLoaded flag", async () => {
    const { result } = renderHook(() => usePluginRegistry());
    // Initially false
    expect(result.current.channelsLoaded).toBe(false);
    await waitFor(() => {
      expect(result.current.channelsLoaded).toBe(true);
    });
  });

  it("falls back to static providers when marketplace API fails", async () => {
    mockListMarketplacePlugins.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => usePluginRegistry());

    await waitFor(() => {
      expect(result.current.providersLoaded).toBe(true);
    });

    const ids = result.current.providers.map((p) => p.id);
    expect(ids).toContain("anthropic");
    expect(ids).toContain("openai");
  });

  it("falls back to static categories when marketplace API fails", async () => {
    mockListMarketplacePlugins.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => usePluginRegistry());

    await waitFor(() => {
      expect(result.current.categoriesLoaded).toBe(true);
    });

    const catIds = result.current.categories.map((c) => c.id);
    expect(catIds).toEqual(["memory", "voice", "integration", "ui"]);
  });

  it("loading transitions to false even when all API calls fail", async () => {
    mockListMarketplacePlugins.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => usePluginRegistry());

    expect(result.current.loading).toBe(true);
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.channelsLoaded).toBe(true);
    expect(result.current.providersLoaded).toBe(true);
    expect(result.current.categoriesLoaded).toBe(true);
  });

  it("does not update state after unmount (cancelled flag)", async () => {
    const resolvers: Array<(value: typeof MOCK_MARKETPLACE_PLUGINS) => void> = [];
    mockListMarketplacePlugins.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(resolve);
        }),
    );

    const { result, unmount } = renderHook(() => usePluginRegistry());

    expect(result.current.loading).toBe(true);
    expect(result.current.channelsLoaded).toBe(false);

    unmount();

    for (const r of resolvers) r(MOCK_MARKETPLACE_PLUGINS);

    await waitFor(() => {
      expect(result.current.channelsLoaded).toBe(false);
      expect(result.current.providersLoaded).toBe(false);
      expect(result.current.categoriesLoaded).toBe(false);
    });
  });

  it("does not update state on error after unmount (cancelled flag)", async () => {
    const rejecters: Array<(err: Error) => void> = [];
    mockListMarketplacePlugins.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejecters.push(reject);
        }),
    );

    const { result, unmount } = renderHook(() => usePluginRegistry());

    expect(result.current.loading).toBe(true);

    unmount();

    for (const r of rejecters) r(new Error("Network error"));

    await waitFor(() => {
      expect(result.current.channelsLoaded).toBe(false);
      expect(result.current.providersLoaded).toBe(false);
      expect(result.current.categoriesLoaded).toBe(false);
    });
  });

  it("getPluginById returns undefined for empty string", async () => {
    const { result } = renderHook(() => usePluginRegistry());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.getPluginById("")).toBeUndefined();
  });

  it("getAllPlugins count equals channels + providers + category plugins", async () => {
    const { result } = renderHook(() => usePluginRegistry());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const all = result.current.getAllPlugins();
    const categoryPluginCount = result.current.categories.reduce(
      (sum, cat) => sum + cat.plugins.length,
      0,
    );
    expect(all.length).toBe(
      result.current.channels.length + result.current.providers.length + categoryPluginCount,
    );
  });

  it("collectConfigFields returns config fields for selected channels", async () => {
    const { result } = renderHook(() => usePluginRegistry());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const fields = result.current.collectConfigFields(["signal"], [], []);
    expect(Array.isArray(fields)).toBe(true);
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      expect(field).toHaveProperty("key");
      expect(field).toHaveProperty("label");
    }
  });

  it("collectConfigFields returns empty array for empty selections", () => {
    const { result } = renderHook(() => usePluginRegistry());
    const fields = result.current.collectConfigFields([], [], []);
    expect(fields).toEqual([]);
  });

  it("resolveDependencies returns array for given selections", async () => {
    const { result } = renderHook(() => usePluginRegistry());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const deps = result.current.resolveDependencies(["discord"], ["anthropic"], []);
    expect(Array.isArray(deps)).toBe(true);
  });

  it("validateField returns null for non-empty value", () => {
    const { result } = renderHook(() => usePluginRegistry());
    const field = { key: "optional", label: "Optional Field", secret: false };
    expect(result.current.validateField(field, "some-value")).toBeNull();
  });

  it("partial API failure: channels fail but providers and categories succeed", async () => {
    mockListMarketplacePlugins
      .mockRejectedValueOnce(new Error("Channel API down"))
      .mockResolvedValueOnce(MOCK_MARKETPLACE_PLUGINS)
      .mockResolvedValueOnce(MOCK_MARKETPLACE_PLUGINS);

    const { result } = renderHook(() => usePluginRegistry());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.channelsLoaded).toBe(true);
    expect(result.current.providersLoaded).toBe(true);
    expect(result.current.categoriesLoaded).toBe(true);
  });
});
