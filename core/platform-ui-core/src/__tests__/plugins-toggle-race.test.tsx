import { act, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      variants: _variants,
      initial: _initial,
      animate: _animate,
      whileHover: _whileHover,
      whileTap: _whileTap,
      transition: _transition,
      style,
      className,
    }: React.PropsWithChildren<{
      variants?: unknown;
      initial?: unknown;
      animate?: unknown;
      whileHover?: unknown;
      whileTap?: unknown;
      transition?: unknown;
      style?: React.CSSProperties;
      className?: string;
    }>) => (
      <div style={style} className={className}>
        {children}
      </div>
    ),
  },
  AnimatePresence: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

// Mock plugin setup chat hook
vi.mock("@/hooks/use-plugin-setup-chat", () => ({
  usePluginSetupChat: () => ({
    state: {
      isOpen: false,
      pluginName: "",
      messages: [],
      isConnected: false,
      isTyping: false,
      isComplete: false,
    },
    sendMessage: vi.fn(),
    closeSetup: vi.fn(),
    openSetup: vi.fn(),
  }),
}));

// Mock brand config
vi.mock("@/lib/brand-config", () => ({
  getBrandConfig: () => ({ productName: "TestProduct", brandName: "TestBrand" }),
}));

// Mock plugin-setup component
vi.mock("@/components/plugin-setup", () => ({
  SetupChatPanel: () => null,
}));

const mockTogglePluginEnabled = vi.fn();
const mockListInstalledPlugins = vi.fn();

vi.mock("@/lib/marketplace-data", () => ({
  listBots: vi.fn().mockResolvedValue([{ id: "bot-1", name: "Test Bot" }]),
  listMarketplacePlugins: vi.fn().mockResolvedValue([
    {
      id: "plugin-1",
      name: "Test Plugin",
      description: "A test plugin",
      version: "1.0.0",
      color: "#ff0000",
      tags: [],
      capabilities: [],
      installCount: 100,
      author: "Test",
      category: "integration",
      configSchema: [],
    },
  ]),
  listInstalledPlugins: (...args: unknown[]) => mockListInstalledPlugins(...args),
  togglePluginEnabled: (...args: unknown[]) => mockTogglePluginEnabled(...args),
  formatInstallCount: (n: number) => String(n),
  hasHostedOption: () => false,
}));

import PluginsPage from "@/app/plugins/page";

describe("togglePlugin race condition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListInstalledPlugins.mockResolvedValue([{ pluginId: "plugin-1", enabled: true }]);
    // Make togglePluginEnabled slow so we can test in-flight guard
    mockTogglePluginEnabled.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 500)),
    );
  });

  it("blocks a second toggle while the first is in flight (stale closure exposes race)", async () => {
    // Use a deferred promise instead of a real timer to avoid async leak on test teardown
    let resolveToggle!: () => void;
    const togglePromise = new Promise<void>((resolve) => {
      resolveToggle = resolve;
    });
    mockTogglePluginEnabled.mockReturnValue(togglePromise);

    render(<PluginsPage />);

    // Wait for the page to fully load
    const toggle = await screen.findByRole("switch", { name: /toggle test plugin/i });
    expect(toggle).toBeInTheDocument();

    // Simulate rapid double-click by firing two change events synchronously
    // WITHOUT awaiting between them — this exposes the stale closure bug because
    // React hasn't re-rendered between the two calls, so the `toggling` state
    // variable is still `null` in both closures.
    const switchEl = toggle;

    // Fire two synthetic events in the same synchronous batch
    act(() => {
      switchEl.click();
      switchEl.click();
    });

    // After settling, only ONE API call should have been made
    await waitFor(() => {
      // If the stale closure bug exists, this will be 2. With the ref fix, it will be 1.
      expect(mockTogglePluginEnabled).toHaveBeenCalledTimes(1);
    });

    // Resolve the deferred promise to drain the pending async operation before teardown
    await act(async () => {
      resolveToggle();
    });
  });

  it("allows toggling again after the first completes", async () => {
    // Fast resolution for this test
    mockTogglePluginEnabled.mockResolvedValue(undefined);
    mockListInstalledPlugins
      .mockResolvedValueOnce([{ pluginId: "plugin-1", enabled: true }]) // initial load
      .mockResolvedValueOnce([{ pluginId: "plugin-1", enabled: false }]) // after first toggle
      .mockResolvedValueOnce([{ pluginId: "plugin-1", enabled: true }]); // after second toggle

    render(<PluginsPage />);

    const toggle = await screen.findByRole("switch", { name: /toggle test plugin/i });

    // First toggle
    act(() => {
      toggle.click();
    });

    await waitFor(() => {
      expect(mockTogglePluginEnabled).toHaveBeenCalledTimes(1);
    });

    // Wait for the toggle to complete (ref cleared, switch re-enabled)
    await waitFor(() => {
      expect(toggle).not.toBeDisabled();
    });

    // Second toggle — should work now that the first is complete
    act(() => {
      toggle.click();
    });

    await waitFor(() => {
      expect(mockTogglePluginEnabled).toHaveBeenCalledTimes(2);
    });
  });
});
