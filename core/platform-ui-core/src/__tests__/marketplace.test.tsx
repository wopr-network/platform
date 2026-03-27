import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginManifest } from "../lib/marketplace-data";
import {
  ALL_CATEGORIES,
  formatInstallCount,
  getHostedAdaptersForCapabilities,
  HOSTED_ADAPTERS,
  hasHostedOption,
  listInstalledPlugins,
} from "../lib/marketplace-data";
import { findManifest as findManifestFixture } from "./fixtures/mock-manifests";

// vi.hoisted runs before module imports so TEST_PLUGINS is available in vi.mock factories
const { TEST_PLUGINS } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MARKETPLACE_TEST_PLUGINS } =
    require("./fixtures/mock-manifests-data") as typeof import("./fixtures/mock-manifests");
  return { TEST_PLUGINS: MARKETPLACE_TEST_PLUGINS };
});

// --- Mock next/navigation for page components ---
const mockPush = vi.fn();
const mockParams: { plugin?: string } = {};
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/marketplace",
  useParams: () => mockParams,
  useSearchParams: () => ({ get: () => null }),
}));

// --- Mock next/link ---
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: { children: React.ReactNode; href: string } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// --- Mock useCapabilityMeta so CapabilityProviderPicker resolves stt/llm to hosted entries ---
vi.mock("@/hooks/use-capability-meta", () => ({
  useCapabilityMeta: () => ({
    meta: [
      {
        capability: "llm",
        label: "LLM",
        description: "200+ models via OpenRouter.",
        pricing: "$0.002/1K tokens",
        hostedProvider: "OpenRouter",
        icon: "bot",
        sortOrder: 0,
      },
      {
        capability: "stt",
        label: "STT",
        description: "Speech-to-text powered by Deepgram.",
        pricing: "$0.005/min",
        hostedProvider: "Deepgram",
        icon: "mic",
        sortOrder: 1,
      },
    ],
    loading: false,
    error: false,
    getMeta: (cap: string) => {
      const entries: Record<
        string,
        {
          capability: string;
          label: string;
          description: string;
          pricing: string;
          hostedProvider: string;
          icon: string;
          sortOrder: number;
        }
      > = {
        llm: {
          capability: "llm",
          label: "LLM",
          description: "200+ models via OpenRouter.",
          pricing: "$0.002/1K tokens",
          hostedProvider: "OpenRouter",
          icon: "bot",
          sortOrder: 0,
        },
        stt: {
          capability: "stt",
          label: "STT",
          description: "Speech-to-text powered by Deepgram.",
          pricing: "$0.005/min",
          hostedProvider: "Deepgram",
          icon: "mic",
          sortOrder: 1,
        },
      };
      return (
        entries[cap] ?? {
          capability: cap,
          label: cap.replace(/[-_]/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
          description: "",
          pricing: "",
          hostedProvider: "",
          icon: "sparkles",
          sortOrder: 999,
        }
      );
    },
  }),
}));

// --- Mock marketplace-data API functions ---
vi.mock("../lib/marketplace-data", async () => {
  const actual = await vi.importActual("../lib/marketplace-data");
  return {
    ...actual,
    listMarketplacePlugins: vi.fn().mockResolvedValue(TEST_PLUGINS),
    getMarketplacePlugin: vi.fn().mockImplementation(async (id: string) => {
      return TEST_PLUGINS.find((p) => p.id === id) ?? null;
    }),
    getPluginContent: vi.fn().mockResolvedValue(null),
    listInstalledPlugins: vi.fn().mockResolvedValue([]),
  };
});

function findManifest(id: string): PluginManifest {
  return findManifestFixture(id) as unknown as PluginManifest;
}

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function closestButton(el: HTMLElement): HTMLElement {
  const btn = el.closest("button");
  if (!btn) throw new Error("No parent button found");
  return btn;
}

// --- Data layer tests ---
describe("marketplace-data", () => {
  describe("formatInstallCount", () => {
    it("formats thousands with k suffix", () => {
      expect(formatInstallCount(12400)).toBe("12.4k");
      expect(formatInstallCount(8200)).toBe("8.2k");
      expect(formatInstallCount(1000)).toBe("1.0k");
    });

    it("returns plain number for counts under 1000", () => {
      expect(formatInstallCount(500)).toBe("500");
      expect(formatInstallCount(0)).toBe("0");
    });
  });

  describe("hasHostedOption", () => {
    it("returns true when capabilities match hosted adapters", () => {
      expect(hasHostedOption(["llm"])).toBe(true);
      expect(hasHostedOption(["tts"])).toBe(true);
      expect(hasHostedOption(["stt"])).toBe(true);
      expect(hasHostedOption(["embeddings"])).toBe(true);
      expect(hasHostedOption(["image-gen"])).toBe(true);
    });

    it("returns false when no capabilities match", () => {
      expect(hasHostedOption(["channel"])).toBe(false);
      expect(hasHostedOption(["webhook"])).toBe(false);
      expect(hasHostedOption(["ui"])).toBe(false);
      expect(hasHostedOption([])).toBe(false);
    });

    it("returns true if any capability matches", () => {
      expect(hasHostedOption(["channel", "llm"])).toBe(true);
      expect(hasHostedOption(["stt", "webhook"])).toBe(true);
    });
  });

  describe("getHostedAdaptersForCapabilities", () => {
    it("returns matching hosted adapters", () => {
      const adapters = getHostedAdaptersForCapabilities(["stt", "llm"]);
      expect(adapters).toHaveLength(2);
      expect(adapters.map((a) => a.capability)).toContain("llm");
      expect(adapters.map((a) => a.capability)).toContain("stt");
    });

    it("returns empty array when no match", () => {
      expect(getHostedAdaptersForCapabilities(["channel"])).toHaveLength(0);
    });
  });

  describe("HOSTED_ADAPTERS", () => {
    it("has entries for key hosted capabilities", () => {
      const caps = HOSTED_ADAPTERS.map((a) => a.capability);
      expect(caps).toContain("llm");
      expect(caps).toContain("tts");
      expect(caps).toContain("stt");
      expect(caps).toContain("embeddings");
      expect(caps).toContain("image-gen");
    });
  });

  describe("ALL_CATEGORIES", () => {
    it("includes standard plugin categories", () => {
      const ids = ALL_CATEGORIES.map((c) => c.id);
      expect(ids).toContain("channel");
      expect(ids).toContain("voice");
      expect(ids).toContain("memory");
      expect(ids).toContain("integration");
      expect(ids).toContain("webhook");
    });
  });
});

// --- Component tests ---
describe("MarketplacePage", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockParams.plugin = undefined;
  });

  it("renders marketplace page with heading and plugin cards", async () => {
    const { default: MarketplacePage } = await import("../app/(dashboard)/marketplace/page");
    render(<MarketplacePage />);

    // Initially shows skeleton loading state
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();

    // After loading, shows heading and featured section
    expect(await screen.findByText("Browse Superpowers")).toBeInTheDocument();
    expect(await screen.findByText("Featured Superpowers")).toBeInTheDocument();
  });

  it("filters plugins by search term", async () => {
    const user = userEvent.setup();
    const { default: MarketplacePage } = await import("../app/(dashboard)/marketplace/page");
    render(<MarketplacePage />);

    await screen.findByText("Browse Superpowers");

    const searchInput = screen.getByPlaceholderText("Search superpowers...");
    await user.type(searchInput, "nonexistentterm12345");

    // No results in the grid
    expect(screen.getByText(/No results for/)).toBeInTheDocument();
  });

  it("filters plugins by tab", async () => {
    const user = userEvent.setup();
    const { default: MarketplacePage } = await import("../app/(dashboard)/marketplace/page");
    render(<MarketplacePage />);

    await screen.findByText("Browse Superpowers");

    // Click "Channels" tab
    const channelsButton = closestButton(screen.getByText("Channels"));
    await user.click(channelsButton);

    // Should show channel plugins in the grid
    expect(screen.getByText("Discord")).toBeInTheDocument();
    expect(screen.getByText("Slack")).toBeInTheDocument();

    // Should not show non-channel plugins like webhooks in the grid
    expect(screen.queryByText("Webhooks")).not.toBeInTheDocument();
  });

  it("shows Platform Hosted Available badge for eligible plugins", async () => {
    const user = userEvent.setup();
    const { default: MarketplacePage } = await import("../app/(dashboard)/marketplace/page");
    render(<MarketplacePage />);

    await screen.findByText("Browse Superpowers");

    // Switch to Capabilities tab — Deepgram STT has 'stt' capability which matches a hosted adapter
    const capabilitiesButton = closestButton(screen.getByText("Capabilities"));
    await user.click(capabilitiesButton);

    // PluginCard shows "Platform Hosted" badge for eligible plugins
    const hostedBadges = screen.getAllByText("Platform Hosted");
    expect(hostedBadges.length).toBeGreaterThan(0);
  });

  it("shows empty state when no plugins match search", async () => {
    const user = userEvent.setup();
    const { default: MarketplacePage } = await import("../app/(dashboard)/marketplace/page");
    render(<MarketplacePage />);

    await screen.findByText("Browse Superpowers");

    const searchInput = screen.getByPlaceholderText("Search superpowers...");
    await user.type(searchInput, "nonexistentplugin12345");

    expect(screen.getByText(/No results for/)).toBeInTheDocument();
  });
});

describe("PluginDetailPage", () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it("renders plugin detail page with manifest info", async () => {
    mockParams.plugin = "discord";
    const { default: PluginDetailPage } = await import(
      "../app/(dashboard)/marketplace/[plugin]/page"
    );
    renderWithQueryClient(<PluginDetailPage />);

    // Wait for loading
    expect(await screen.findByText("Discord")).toBeInTheDocument();
    expect(screen.getByText("v3.2.0")).toBeInTheDocument();
    expect(screen.getByText("Give my bot this superpower")).toBeInTheDocument();
    expect(screen.getByText(/12\.4k installs/)).toBeInTheDocument();
  });

  it("shows not found for invalid plugin id", async () => {
    mockParams.plugin = "nonexistent-plugin";
    const { default: PluginDetailPage } = await import(
      "../app/(dashboard)/marketplace/[plugin]/page"
    );
    renderWithQueryClient(<PluginDetailPage />);

    expect(await screen.findByText("Plugin not found.")).toBeInTheDocument();
  });

  it("shows hosted adapter info for eligible plugins", async () => {
    mockParams.plugin = "semantic-memory";
    const { default: PluginDetailPage } = await import(
      "../app/(dashboard)/marketplace/[plugin]/page"
    );
    renderWithQueryClient(<PluginDetailPage />);

    await screen.findByText("A Bot That Never Forgets");
    expect(screen.getByText("Platform Hosted")).toBeInTheDocument();
    expect(screen.getByText("Platform Hosted Options")).toBeInTheDocument();
    expect(screen.getByText("Platform Hosted Embeddings")).toBeInTheDocument();
  });

  it("shows requirements for plugins with dependencies", async () => {
    mockParams.plugin = "meeting-transcriber";
    const { default: PluginDetailPage } = await import(
      "../app/(dashboard)/marketplace/[plugin]/page"
    );
    renderWithQueryClient(<PluginDetailPage />);

    await screen.findByText("Fire Your Secretary");
    expect(screen.getByText("Discord (for voice channels)")).toBeInTheDocument();
  });

  it("opens install wizard when Install button is clicked", async () => {
    const user = userEvent.setup();
    mockParams.plugin = "webhooks";
    const { default: PluginDetailPage } = await import(
      "../app/(dashboard)/marketplace/[plugin]/page"
    );
    renderWithQueryClient(<PluginDetailPage />);

    await screen.findByText("Webhooks");
    const installButton = screen.getByText("Give my bot this superpower");
    await user.click(installButton);

    // Should now show install wizard
    expect(screen.getByText("Install Webhooks")).toBeInTheDocument();
  });

  it("shows changelog entries", async () => {
    mockParams.plugin = "discord";
    const { default: PluginDetailPage } = await import(
      "../app/(dashboard)/marketplace/[plugin]/page"
    );
    renderWithQueryClient(<PluginDetailPage />);

    await screen.findByText("Discord");

    // Click changelog tab
    const user = userEvent.setup();
    await user.click(screen.getByText("Changelog"));

    expect(screen.getByText("Added thread support and slash commands.")).toBeInTheDocument();
    // v3.2.0 appears in the changelog entry badge (overview tab version footer is hidden)
    expect(screen.getAllByText("v3.2.0").length).toBeGreaterThanOrEqual(1);
  });

  it("shows configuration schema", async () => {
    mockParams.plugin = "discord";
    const { default: PluginDetailPage } = await import(
      "../app/(dashboard)/marketplace/[plugin]/page"
    );
    renderWithQueryClient(<PluginDetailPage />);

    await screen.findByText("Discord");

    const user = userEvent.setup();
    await user.click(screen.getByText("Configuration"));

    expect(screen.getByText("Bot Token")).toBeInTheDocument();
    expect(screen.getByText("Server ID")).toBeInTheDocument();
  });
});

describe("InstallWizard", () => {
  const mockBots = [
    { id: "00000000-0000-4000-8000-000000000001", name: "My Bot", state: "running" },
  ];

  beforeEach(() => {
    // Mock fetch for listBots so the wizard doesn't hang on network calls
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: vi.fn().mockReturnValue(null) },
        json: async () => ({ bots: mockBots }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders wizard with cancel and continue buttons", async () => {
    const { InstallWizard } = await import("../components/marketplace/install-wizard");
    const plugin = findManifest("webhooks");

    render(<InstallWizard plugin={plugin} onComplete={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText("Install Webhooks")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Continue")).toBeInTheDocument();
  });

  it("shows bot selector as first phase", async () => {
    const { InstallWizard } = await import("../components/marketplace/install-wizard");
    const plugin = findManifest("webhooks");

    render(<InstallWizard plugin={plugin} onComplete={vi.fn()} onCancel={vi.fn()} />);

    // First phase is bot-select
    expect(screen.getByText("Select which bot to install this plugin on")).toBeInTheDocument();
  });

  it("shows provider selector for plugins with hosted capabilities", async () => {
    const { InstallWizard } = await import("../components/marketplace/install-wizard");
    // meeting-transcriber has stt and llm capabilities
    const plugin = findManifest("meeting-transcriber");
    // meeting-transcriber requires discord — mock it as installed so requirements phase passes
    vi.mocked(listInstalledPlugins).mockResolvedValueOnce([{ pluginId: "discord", enabled: true }]);

    render(<InstallWizard plugin={plugin} onComplete={vi.fn()} onCancel={vi.fn()} />);

    // First phase is bot-select — wait for bots to load and select one
    const user = userEvent.setup();
    expect(
      await screen.findByText("Select which bot to install this plugin on"),
    ).toBeInTheDocument();

    // Wait for bots to load
    const botButton = await screen.findByText("My Bot");
    await user.click(botButton);

    // Advance past bot-select
    await user.click(screen.getByText("Continue"));

    // Next phase is requirements
    expect(screen.getByText("Check plugin requirements")).toBeInTheDocument();

    // Advance past requirements
    await user.click(screen.getByText("Continue"));

    // Should now show provider selector
    expect(
      screen.getByText(
        "Some capabilities can be provided by Platform Hosted services. Choose for each:",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("LLM")).toBeInTheDocument();
    expect(screen.getByText("STT")).toBeInTheDocument();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const { InstallWizard } = await import("../components/marketplace/install-wizard");
    const plugin = findManifest("webhooks");
    const onCancel = vi.fn();

    render(<InstallWizard plugin={plugin} onComplete={vi.fn()} onCancel={onCancel} />);

    const user = userEvent.setup();
    await user.click(screen.getByText("Cancel"));

    expect(onCancel).toHaveBeenCalledOnce();
  });
});

describe("PluginCard", () => {
  it("renders plugin info with link to detail page", async () => {
    const { PluginCard } = await import("../components/marketplace/plugin-card");
    const plugin = TEST_PLUGINS[0] as unknown as PluginManifest; // discord

    render(<PluginCard plugin={plugin} />);

    expect(screen.getByText("Discord")).toBeInTheDocument();
    expect(screen.getByText("v3.2.0")).toBeInTheDocument();
    expect(screen.getByText("12.4k installs")).toBeInTheDocument();
    expect(screen.getByText("Platform Team")).toBeInTheDocument();

    // Should have a link to the detail page
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/marketplace/discord");
  });

  it("shows Platform Hosted badge for eligible plugins", async () => {
    const { PluginCard } = await import("../components/marketplace/plugin-card");
    // semantic-memory has embeddings capability
    const plugin = findManifest("semantic-memory");

    render(<PluginCard plugin={plugin} />);

    // Cards show shortened "Platform Hosted" badge text
    expect(screen.getByText("Platform Hosted")).toBeInTheDocument();
  });

  it("does not show Platform Hosted badge for plugins without hosted capabilities", async () => {
    const { PluginCard } = await import("../components/marketplace/plugin-card");
    // discord only has 'channel' capability, no hosted adapter for that
    const plugin = findManifest("discord");

    render(<PluginCard plugin={plugin} />);

    expect(screen.queryByText("Platform Hosted")).not.toBeInTheDocument();
  });

  it("shows Installed badge when installed prop is true", async () => {
    const { PluginCard } = await import("../components/marketplace/plugin-card");
    const plugin = findManifest("discord");

    render(<PluginCard plugin={plugin} installed={true} />);

    expect(screen.getByText("Installed")).toBeInTheDocument();
  });

  it("does not show Installed badge when installed prop is false", async () => {
    const { PluginCard } = await import("../components/marketplace/plugin-card");
    const plugin = findManifest("discord");

    render(<PluginCard plugin={plugin} installed={false} />);

    expect(screen.queryByText("Installed")).not.toBeInTheDocument();
  });
});

describe("CategoryFilter", () => {
  it("renders All button and category buttons with counts", async () => {
    const { CategoryFilter } = await import("../components/marketplace/category-filter");
    const counts = { channel: 2, voice: 3, memory: 1 };

    render(<CategoryFilter selected={null} onSelect={vi.fn()} counts={counts} />);

    expect(screen.getByText("All")).toBeInTheDocument();
    expect(screen.getByText("Channel")).toBeInTheDocument();
    expect(screen.getByText("Voice")).toBeInTheDocument();
    expect(screen.getByText("Memory")).toBeInTheDocument();
  });

  it("calls onSelect with category when clicked", async () => {
    const { CategoryFilter } = await import("../components/marketplace/category-filter");
    const onSelect = vi.fn();
    const counts = { channel: 2, voice: 3 };

    render(<CategoryFilter selected={null} onSelect={onSelect} counts={counts} />);

    const user = userEvent.setup();
    await user.click(closestButton(screen.getByText("Voice")));

    expect(onSelect).toHaveBeenCalledWith("voice");
  });

  it("calls onSelect with null when All is clicked", async () => {
    const { CategoryFilter } = await import("../components/marketplace/category-filter");
    const onSelect = vi.fn();
    const counts = { channel: 2 };

    render(<CategoryFilter selected="channel" onSelect={onSelect} counts={counts} />);

    const user = userEvent.setup();
    await user.click(closestButton(screen.getByText("All")));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("hides categories with zero plugins", async () => {
    const { CategoryFilter } = await import("../components/marketplace/category-filter");
    const counts = { channel: 2 };

    render(<CategoryFilter selected={null} onSelect={vi.fn()} counts={counts} />);

    // Only Channel and All should be visible
    expect(screen.getByText("Channel")).toBeInTheDocument();
    expect(screen.queryByText("Voice")).not.toBeInTheDocument();
    expect(screen.queryByText("Memory")).not.toBeInTheDocument();
  });
});
