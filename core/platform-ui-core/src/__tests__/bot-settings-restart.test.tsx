import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/instances/bot-1",
}));

// Mock hooks/use-fleet-sse
vi.mock("@/hooks/use-fleet-sse", () => ({
  useFleetSSE: () => ({ lastEvent: null }),
}));

// Mock hooks/use-save-queue
vi.mock("@/hooks/use-save-queue", () => ({
  useSaveQueue: () => ({ enqueue: vi.fn(), saving: false }),
}));

// Mock lib/api
vi.mock("@/lib/api", () => ({
  getInstanceHealth: vi.fn().mockResolvedValue(null),
  apiFetch: vi.fn(),
}));

// Mock bot-settings-data with controlBot we can spy on
const mockControlBot = vi
  .fn()
  .mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));
const mockGetBotSettings = vi.fn().mockResolvedValue({
  id: "bot-1",
  identity: { name: "Test Bot", personality: "", avatar: "" },
  brain: { model: "gpt-4", mode: "chat" },
  channels: [],
  availableChannels: [],
  activeSuperpowers: [],
  availableSuperpowers: [],
  installedPlugins: [],
  discoverPlugins: [],
  usage: { totalSpend: 0, creditBalance: 0, capabilities: [], trend: [] },
  status: "running" as const,
});
const mockGetBotStatus = vi.fn().mockResolvedValue({ status: "running" });

vi.mock("@/lib/bot-settings-data", () => ({
  PERSONALITY_TEMPLATES: [
    { id: "professional", label: "Professional", text: "Professional assistant." },
    { id: "creative", label: "Creative", text: "Creative companion." },
    { id: "casual", label: "Casual", text: "Casual assistant." },
    { id: "custom", label: "Custom", text: "" },
  ],
  controlBot: (...args: unknown[]) => mockControlBot(...args),
  getBotSettings: (...args: unknown[]) => mockGetBotSettings(...args),
  getBotStatus: (...args: unknown[]) => mockGetBotStatus(...args),
  updateBotIdentity: vi.fn(),
  updateBotBrain: vi.fn(),
  disconnectChannel: vi.fn(),
  updateChannelConfig: vi.fn(),
  activateSuperpower: vi.fn(),
  deactivateSuperpower: vi.fn(),
  updateSuperpowerConfig: vi.fn(),
  installPlugin: vi.fn(),
  uninstallPlugin: vi.fn(),
  updatePluginConfig: vi.fn(),
  listInstalledPlugins: vi.fn().mockResolvedValue([]),
  getStorageTier: vi.fn().mockResolvedValue({ tier: "standard" }),
  setStorageTier: vi.fn().mockResolvedValue({ tier: "standard" }),
  getStorageUsage: vi.fn().mockResolvedValue(null),
  getResourceTier: vi.fn().mockResolvedValue({ tier: "standard" }),
  setResourceTier: vi.fn().mockResolvedValue({ tier: "standard" }),
  getChannelConfig: vi.fn().mockResolvedValue({}),
  getPluginConfig: vi.fn().mockResolvedValue({}),
  getSuperpowerConfig: vi.fn().mockResolvedValue({}),
  togglePlugin: vi.fn(),
}));

// Mock framer-motion
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual("framer-motion");
  return { ...actual };
});

import { BotSettingsClient } from "@/components/bot-settings/bot-settings-client";

function renderWithQueryClient(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("BotSettingsClient restart feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockControlBot.mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 100)));
    mockGetBotSettings.mockResolvedValue({
      id: "bot-1",
      identity: { name: "Test Bot", personality: "", avatar: "" },
      brain: { model: "gpt-4", mode: "chat" },
      channels: [],
      availableChannels: [],
      activeSuperpowers: [],
      availableSuperpowers: [],
      installedPlugins: [],
      discoverPlugins: [],
      usage: { totalSpend: 0, creditBalance: 0, capabilities: [], trend: [] },
      status: "running" as const,
    });
    mockGetBotStatus.mockResolvedValue({ status: "running" });
  });

  it("shows restarting indicator in StatusBadge when restart is clicked", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<BotSettingsClient botId="bot-1" />);

    // Wait for the component to load
    await waitFor(() => {
      expect(screen.getByText("Restart")).toBeInTheDocument();
    });

    // Click restart
    await user.click(screen.getByText("Restart"));

    // Should show "Restarting" in the status badge area
    await waitFor(() => {
      expect(screen.getByText("Restarting")).toBeInTheDocument();
    });

    // controlBot should have been called with restart
    expect(mockControlBot).toHaveBeenCalledWith("bot-1", "restart");
  });

  it("hides Stop/Restart buttons while restart is pending", async () => {
    const user = userEvent.setup();
    renderWithQueryClient(<BotSettingsClient botId="bot-1" />);

    await waitFor(() => {
      expect(screen.getByText("Restart")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Restart"));

    // Stop and Restart buttons should be hidden during restart
    await waitFor(() => {
      expect(screen.queryByText("Restart")).not.toBeInTheDocument();
      expect(screen.queryByText("Stop")).not.toBeInTheDocument();
    });
  });
});
