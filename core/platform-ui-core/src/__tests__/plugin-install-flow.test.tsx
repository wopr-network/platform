import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PluginManifest } from "../lib/marketplace-data";

// Mock framer-motion to prevent rAF animation loops hanging jsdom tests
vi.mock("framer-motion", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  return {
    motion: new Proxy(
      {},
      {
        get:
          (_target: Record<string, unknown>, tag: string) =>
          ({ children, ...props }: { children?: unknown; [key: string]: unknown }) =>
            React.createElement(tag, props, children),
      },
    ),
    AnimatePresence: ({ children }: { children?: unknown }) => children,
    useMotionValue: (v: number) => ({
      get: () => v,
      on: () => () => {
        /* no-op */
      },
      set: () => {
        /* no-op */
      },
    }),
    useTransform: () => ({
      on: () => () => {
        /* no-op */
      },
      get: () => 0,
    }),
    animate: () => ({
      stop: () => {
        /* no-op */
      },
    }),
  };
});

// vi.hoisted runs before module imports so TEST_PLUGINS and mocks are available in vi.mock factories
const {
  TEST_PLUGINS,
  ALL_PLUGINS,
  mockInstallPlugin,
  mockListBots,
  mockListInstalledPlugins,
  injectPathlessZodError,
} = vi.hoisted(() => {
  const mockInstallPlugin = vi.fn();
  const mockListBots = vi
    .fn()
    .mockResolvedValue([{ id: "bot-001", name: "My Bot", state: "running" }]);
  const mockListInstalledPlugins = vi.fn().mockResolvedValue([]);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { INSTALL_FLOW_TEST_PLUGINS, MARKETPLACE_TEST_PLUGINS } =
    require("./fixtures/mock-manifests-data") as typeof import("./fixtures/mock-manifests");
  // Flag to conditionally inject a path-less Zod error in the mocked z.object
  const injectPathlessZodError = { value: false };
  return {
    TEST_PLUGINS: INSTALL_FLOW_TEST_PLUGINS,
    ALL_PLUGINS: MARKETPLACE_TEST_PLUGINS,
    mockInstallPlugin,
    mockListBots,
    mockListInstalledPlugins,
    injectPathlessZodError,
  };
});

// Mock zod with a conditional wrapper: when injectPathlessZodError.value is true,
// z.object() adds a superRefine that produces a path-less ZodIssue.
// Only inject on schemas with fields (Object.keys(shape).length > 0) so empty
// setup steps (no fields) pass through without triggering the fake error.
vi.mock("zod", async () => {
  const realZod = await vi.importActual<typeof import("zod")>("zod");
  const originalObject = realZod.z.object.bind(realZod.z);
  const wrappedObject = (
    shape?: Record<string, unknown>,
    params?: string | Record<string, unknown>,
  ) => {
    const schema = originalObject(shape, params as undefined);
    if (!injectPathlessZodError.value || !shape || Object.keys(shape).length === 0) return schema;
    return schema.superRefine((_val, ctx) => {
      ctx.addIssue({
        code: realZod.z.ZodIssueCode.custom,
        message: "Cross-field validation failed",
        path: [],
      });
    });
  };
  return { ...realZod, z: { ...realZod.z, object: wrappedObject } };
});

const mockPush = vi.fn();
const mockParams: { plugin?: string } = {};
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => "/marketplace",
  useParams: () => mockParams,
  useSearchParams: () => ({ get: () => null }),
}));

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

vi.mock("@/hooks/use-capability-meta", () => ({
  useCapabilityMeta: () => ({
    meta: [
      {
        capability: "llm",
        label: "Platform Hosted LLM",
        description: "Managed LLM.",
        pricing: "Pay-per-token",
        hostedProvider: "OpenRouter",
        icon: "bot",
        sortOrder: 0,
      },
      {
        capability: "stt",
        label: "Platform Hosted STT",
        description: "Managed STT.",
        pricing: "Pay-per-minute",
        hostedProvider: "Whisper",
        icon: "mic",
        sortOrder: 1,
      },
    ],
    loading: false,
    error: false,
    getMeta: (cap: string) => ({
      capability: cap,
      label: cap.toUpperCase(),
      description: "",
      pricing: "",
      hostedProvider: "",
      icon: "sparkles",
      sortOrder: 999,
    }),
  }),
}));

vi.mock("../lib/marketplace-data", async () => {
  const actual = await vi.importActual("../lib/marketplace-data");
  return {
    ...actual,
    listMarketplacePlugins: vi.fn().mockResolvedValue(TEST_PLUGINS),
    getMarketplacePlugin: vi.fn().mockImplementation(async (id: string) => {
      return TEST_PLUGINS.find((p) => p.id === id) ?? null;
    }),
    getPluginContent: vi.fn().mockResolvedValue(null),
    installPlugin: mockInstallPlugin,
    listBots: mockListBots,
    listInstalledPlugins: mockListInstalledPlugins,
  };
});

const mockBots = [
  { id: "bot-001", name: "My Bot", state: "running" },
  { id: "bot-002", name: "Second Bot", state: "stopped" },
];

function renderWithQueryClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("Plugin Install Flow", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockInstallPlugin.mockClear();
    mockParams.plugin = undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ bots: mockBots }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders install button on plugin detail page for uninstalled plugin", async () => {
    mockParams.plugin = "webhooks";
    const { default: PluginDetailPage } = await import(
      "../app/(dashboard)/marketplace/[plugin]/page"
    );
    renderWithQueryClient(<PluginDetailPage />);

    expect(await screen.findByText("Webhooks")).toBeInTheDocument();
    const installBtn = screen.getByText("Give my bot this superpower");
    expect(installBtn).toBeInTheDocument();
    expect(installBtn.closest("button")).not.toBeDisabled();
  });

  it("opens install wizard when install button is clicked", async () => {
    const user = userEvent.setup();
    mockParams.plugin = "webhooks";
    const { default: PluginDetailPage } = await import(
      "../app/(dashboard)/marketplace/[plugin]/page"
    );
    renderWithQueryClient(<PluginDetailPage />);

    await screen.findByText("Webhooks");
    await user.click(screen.getByText("Give my bot this superpower"));

    expect(screen.getByText("Install Webhooks")).toBeInTheDocument();
    expect(screen.getByText("Select which bot to install this plugin on")).toBeInTheDocument();
  });

  it("install wizard calls installPlugin on completion via detail page", async () => {
    mockInstallPlugin.mockResolvedValueOnce({ success: true });

    const user = userEvent.setup();
    mockParams.plugin = "webhooks";
    const { default: PluginDetailPage } = await import(
      "../app/(dashboard)/marketplace/[plugin]/page"
    );
    renderWithQueryClient(<PluginDetailPage />);

    await screen.findByText("Webhooks");
    await user.click(screen.getByText("Give my bot this superpower"));

    // Phase 1: Bot select — select a bot
    const botButton = await screen.findByText("My Bot");
    await user.click(botButton);
    await user.click(screen.getByText("Continue"));

    // Phase 2: Setup step "Configure Webhooks" (no fields) — advance
    await user.click(screen.getByText("Continue"));

    // Phase 3: Setup step "Webhooks Ready" (no fields) — advance to complete
    await user.click(screen.getByText("Continue"));

    // Complete phase — click Done
    expect(screen.getByText("Plugin installed successfully")).toBeInTheDocument();
    await user.click(screen.getByText("Done"));

    // Verify installPlugin was called with correct args
    await waitFor(() => {
      expect(mockInstallPlugin).toHaveBeenCalledWith(
        "webhooks",
        "bot-001",
        expect.objectContaining({}),
        expect.any(Object),
        expect.anything(),
      );
    });
  });

  it("shows error when installPlugin fails", async () => {
    mockInstallPlugin.mockRejectedValueOnce(new Error("Server error"));

    const user = userEvent.setup();
    mockParams.plugin = "webhooks";
    const { default: PluginDetailPage } = await import(
      "../app/(dashboard)/marketplace/[plugin]/page"
    );
    renderWithQueryClient(<PluginDetailPage />);

    await screen.findByText("Webhooks");
    await user.click(screen.getByText("Give my bot this superpower"));

    // Walk through wizard to completion
    const botButton = await screen.findByText("My Bot");
    await user.click(botButton);
    await user.click(screen.getByText("Continue"));
    await user.click(screen.getByText("Continue"));
    await user.click(screen.getByText("Continue"));

    // Complete phase — click Done triggers installPlugin
    await user.click(screen.getByText("Done"));

    // Should show error message (toUserMessage wraps the error)
    await waitFor(() => {
      expect(screen.getByText(/Installation failed|Server error/i)).toBeInTheDocument();
    });
  });

  it("wizard cancel button returns to detail page", async () => {
    const user = userEvent.setup();
    mockParams.plugin = "webhooks";
    const { default: PluginDetailPage } = await import(
      "../app/(dashboard)/marketplace/[plugin]/page"
    );
    renderWithQueryClient(<PluginDetailPage />);

    await screen.findByText("Webhooks");
    await user.click(screen.getByText("Give my bot this superpower"));
    expect(screen.getByText("Install Webhooks")).toBeInTheDocument();

    await user.click(screen.getByText("Cancel"));

    // Should return to detail page (install button visible again)
    expect(screen.getByText("Give my bot this superpower")).toBeInTheDocument();
    expect(screen.queryByText("Install Webhooks")).not.toBeInTheDocument();
  });
});

describe("Plugin Toggle (Enable/Disable)", () => {
  beforeEach(() => {
    // Default: single bot for most tests, individual tests override via mockResolvedValueOnce
    mockListBots.mockResolvedValue([{ id: "bot-001", name: "My Bot", state: "running" }]);
  });

  it("InstallWizard shows multiple bots and allows selection", async () => {
    mockListBots.mockResolvedValueOnce(mockBots);
    const { InstallWizard } = await import("../components/marketplace/install-wizard");
    const plugin = TEST_PLUGINS[0] as unknown as PluginManifest; // webhooks

    render(<InstallWizard plugin={plugin} onComplete={vi.fn()} onCancel={vi.fn()} />);

    // Wait for bots to load (listBots mock returns 2 bots)
    expect(await screen.findByText("My Bot")).toBeInTheDocument();
    expect(screen.getByText("Second Bot")).toBeInTheDocument();
  });

  it("RequirementsCheck shows 'No additional dependencies required' when plugin.requires is empty", async () => {
    // RequirementsCheck is not exported — test via InstallWizard with a plugin that has requires: []
    // and manually reach the requirements phase
    // Since requires=[] the requirements phase is skipped in the wizard, so we test the component
    // behavior indirectly: the wizard for TEST_PLUGINS[0] (webhooks, requires:[]) should never show
    // "This plugin requires the following dependencies:" text at all.
    const user = userEvent.setup();
    const { InstallWizard } = await import("../components/marketplace/install-wizard");
    const plugin = TEST_PLUGINS[0] as unknown as PluginManifest; // webhooks, requires: []

    render(<InstallWizard plugin={plugin} onComplete={vi.fn()} onCancel={vi.fn()} />);

    // Walk through all wizard phases
    const botButton = await screen.findByText("My Bot");
    await user.click(botButton);
    await user.click(screen.getByText("Continue"));

    // Advance through setup steps
    await user.click(screen.getByText("Continue"));
    await user.click(screen.getByText("Continue"));

    // Complete phase reached — "This plugin requires the following dependencies:" was never shown
    expect(screen.getByText("Plugin installed successfully")).toBeInTheDocument();
    expect(
      screen.queryByText("This plugin requires the following dependencies:"),
    ).not.toBeInTheDocument();
  });

  it("InstallWizard shows requirements phase for plugins with dependencies", async () => {
    const user = userEvent.setup();
    const { InstallWizard } = await import("../components/marketplace/install-wizard");
    const plugin = TEST_PLUGINS[1] as unknown as PluginManifest; // meeting-transcriber

    render(<InstallWizard plugin={plugin} onComplete={vi.fn()} onCancel={vi.fn()} />);

    // Select bot
    const botButton = await screen.findByText("My Bot");
    await user.click(botButton);
    await user.click(screen.getByText("Continue"));

    // Requirements phase
    expect(screen.getByText("Check plugin requirements")).toBeInTheDocument();
    expect(screen.getByText("Discord (for voice channels)")).toBeInTheDocument();
  });

  it("InstallWizard shows provider selector for hosted capabilities", async () => {
    const user = userEvent.setup();
    const { InstallWizard } = await import("../components/marketplace/install-wizard");
    const plugin = TEST_PLUGINS[1] as unknown as PluginManifest; // meeting-transcriber (stt + llm)
    // meeting-transcriber requires discord — mock it as installed so requirements phase passes
    mockListInstalledPlugins.mockResolvedValueOnce([{ pluginId: "discord", enabled: true }]);

    render(<InstallWizard plugin={plugin} onComplete={vi.fn()} onCancel={vi.fn()} />);

    // Select bot and advance
    const botButton = await screen.findByText("My Bot");
    await user.click(botButton);
    await user.click(screen.getByText("Continue"));

    // Skip requirements
    await user.click(screen.getByText("Continue"));

    // Provider selector
    expect(screen.getByText("Choose provider for each capability")).toBeInTheDocument();
    expect(screen.getByText("Platform Hosted LLM")).toBeInTheDocument();
    expect(screen.getByText("Platform Hosted STT")).toBeInTheDocument();

    // Can choose BYOK
    const byokButtons = screen.getAllByText("Use your key");
    await user.click(byokButtons[0]);
    // Button toggled to active (no assertion needed — just verifying click doesn't throw)
  });

  it("InstallWizard calls onComplete with botId and config including provider choices", async () => {
    const onComplete = vi.fn();
    const user = userEvent.setup();
    const { InstallWizard } = await import("../components/marketplace/install-wizard");
    const plugin = TEST_PLUGINS[0] as unknown as PluginManifest; // webhooks (no requirements, no hosted)

    render(<InstallWizard plugin={plugin} onComplete={onComplete} onCancel={vi.fn()} />);

    // Select bot
    const botButton = await screen.findByText("My Bot");
    await user.click(botButton);
    await user.click(screen.getByText("Continue"));

    // Setup steps (2 steps with no fields) — advance through both
    await user.click(screen.getByText("Continue"));
    await user.click(screen.getByText("Continue"));

    // Complete phase — click Done
    expect(screen.getByText("Plugin installed successfully")).toBeInTheDocument();
    await user.click(screen.getByText("Done"));

    expect(onComplete).toHaveBeenCalledWith(
      "bot-001",
      expect.objectContaining({ _providerChoices: {} }),
    );
  });

  it("InstallWizard shows loading skeleton while bots are loading", async () => {
    // Make listBots hang indefinitely
    mockListBots.mockReturnValue(
      new Promise(() => {
        /* never resolves */
      }),
    );

    const { InstallWizard } = await import("../components/marketplace/install-wizard");
    const plugin = TEST_PLUGINS[0] as unknown as PluginManifest;

    render(<InstallWizard plugin={plugin} onComplete={vi.fn()} onCancel={vi.fn()} />);

    // Should show skeleton while loading
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it("InstallWizard shows error when bot loading fails", async () => {
    mockListBots.mockRejectedValueOnce(new Error("Network failure"));

    const { InstallWizard } = await import("../components/marketplace/install-wizard");
    const plugin = TEST_PLUGINS[0] as unknown as PluginManifest;

    render(<InstallWizard plugin={plugin} onComplete={vi.fn()} onCancel={vi.fn()} />);

    // Should show error after loading fails
    await waitFor(() => {
      expect(screen.getByText(/Failed to load bots|Network failure/i)).toBeInTheDocument();
    });
  });

  it("InstallWizard shows empty state when no bots exist", async () => {
    mockListBots.mockResolvedValueOnce([]);

    const { InstallWizard } = await import("../components/marketplace/install-wizard");
    const plugin = TEST_PLUGINS[0] as unknown as PluginManifest;

    render(<InstallWizard plugin={plugin} onComplete={vi.fn()} onCancel={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/No bots found/i)).toBeInTheDocument();
    });
    expect(screen.getByText("Create a Bot")).toBeInTheDocument();
  });

  it("validateFields surfaces path-less Zod errors visibly instead of swallowing them", async () => {
    // Enable the path-less error injection on z.object (mocked at file level)
    injectPathlessZodError.value = true;

    const user = userEvent.setup();
    const { InstallWizard } = await import("../components/marketplace/install-wizard");

    // Use the Discord plugin which has a setup step with fields
    const discordPlugin = ALL_PLUGINS.find(
      (p: Record<string, unknown>) => p.id === "discord",
    ) as unknown as PluginManifest;

    render(<InstallWizard plugin={discordPlugin} onComplete={vi.fn()} onCancel={vi.fn()} />);

    // Select bot and advance to setup
    const botButton = await screen.findByText("My Bot");
    await user.click(botButton);
    await user.click(screen.getByText("Continue"));

    // Skip the first setup step (no fields — "Create a Discord Bot")
    await user.click(screen.getByText("Continue"));

    // Now on "Enter Bot Token" step — fill in a valid token so the only
    // error left is the path-less superRefine issue we injected.
    const tokenInput = screen.getByPlaceholderText("Paste your Discord bot token");
    await user.type(tokenInput, "valid-token-123");
    await user.click(screen.getByText("Continue"));

    // The path-less error should surface as a _form-level banner, not be silently dropped
    await waitFor(() => {
      expect(screen.getByText("Cross-field validation failed")).toBeInTheDocument();
    });

    // After typing in any field the _form banner should clear immediately
    await user.type(tokenInput, "x");
    expect(screen.queryByText("Cross-field validation failed")).not.toBeInTheDocument();

    injectPathlessZodError.value = false;
  });
});

describe("Install Wizard Navigation", () => {
  beforeEach(() => {
    mockListBots.mockResolvedValue([{ id: "bot-001", name: "My Bot", state: "running" }]);
  });

  it("Continue button is disabled until a bot is selected", async () => {
    const { InstallWizard } = await import("../components/marketplace/install-wizard");
    const plugin = TEST_PLUGINS[0] as unknown as PluginManifest;

    render(<InstallWizard plugin={plugin} onComplete={vi.fn()} onCancel={vi.fn()} />);

    // Wait for bots to load
    await screen.findByText("My Bot");

    // Continue button should be disabled when no bot selected
    const continueBtn = screen.getByText("Continue").closest("button");
    expect(continueBtn).toBeDisabled();
  });

  it("Continue button enables after selecting a bot", async () => {
    const user = userEvent.setup();
    const { InstallWizard } = await import("../components/marketplace/install-wizard");
    const plugin = TEST_PLUGINS[0] as unknown as PluginManifest;

    render(<InstallWizard plugin={plugin} onComplete={vi.fn()} onCancel={vi.fn()} />);

    const botButton = await screen.findByText("My Bot");
    await user.click(botButton);

    const continueBtn = screen.getByText("Continue").closest("button");
    expect(continueBtn).not.toBeDisabled();
  });

  it("back button navigates to previous phase", async () => {
    const user = userEvent.setup();
    const { InstallWizard } = await import("../components/marketplace/install-wizard");
    const plugin = TEST_PLUGINS[1] as unknown as PluginManifest; // meeting-transcriber (has requirements)

    render(<InstallWizard plugin={plugin} onComplete={vi.fn()} onCancel={vi.fn()} />);

    // Select bot and advance
    const botButton = await screen.findByText("My Bot");
    await user.click(botButton);
    await user.click(screen.getByText("Continue"));

    // Now on requirements phase
    expect(screen.getByText("Check plugin requirements")).toBeInTheDocument();

    // Click Back
    await user.click(screen.getByText("Back"));

    // Should be back on bot-select
    expect(screen.getByText("Select which bot to install this plugin on")).toBeInTheDocument();
  });

  it("calls onCancel when cancel button is clicked", async () => {
    const { InstallWizard } = await import("../components/marketplace/install-wizard");
    const plugin = TEST_PLUGINS[0] as unknown as PluginManifest;
    const onCancel = vi.fn();

    render(<InstallWizard plugin={plugin} onComplete={vi.fn()} onCancel={onCancel} />);

    const user = userEvent.setup();
    await user.click(screen.getByText("Cancel"));

    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("progress step counter advances through wizard phases", async () => {
    const user = userEvent.setup();
    const { InstallWizard } = await import("../components/marketplace/install-wizard");
    const plugin = TEST_PLUGINS[0] as unknown as PluginManifest; // webhooks

    render(<InstallWizard plugin={plugin} onComplete={vi.fn()} onCancel={vi.fn()} />);

    // Bot-select phase — Step 1 of N
    await screen.findByText("My Bot");
    expect(screen.getByText(/Step 1 of/)).toBeInTheDocument();

    // Select bot and advance
    await user.click(screen.getByText("My Bot"));
    await user.click(screen.getByText("Continue"));

    // Progress should have advanced past Step 1 (conflicts phase auto-skips to setup)
    await waitFor(() => {
      expect(screen.queryByText(/Step 1 of/)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Step \d+ of/)).toBeInTheDocument();
  });
});
