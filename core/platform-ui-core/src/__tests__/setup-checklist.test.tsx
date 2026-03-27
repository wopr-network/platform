import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  listInstances: vi.fn(),
  getCreditBalance: vi.fn(),
  listChannels: vi.fn(),
}));

vi.mock("@/lib/settings-api", () => ({
  listCapabilities: vi.fn(),
}));

vi.mock("@/lib/marketplace-data", () => ({
  listMarketplacePlugins: vi.fn().mockResolvedValue([
    {
      id: "discord",
      name: "Discord",
      description: "Discord channel plugin",
      icon: "MessageCircle",
      color: "#5865F2",
      category: "channel",
      capabilities: ["channel"],
    },
    {
      id: "slack",
      name: "Slack",
      description: "Slack channel plugin",
      icon: "Hash",
      color: "#4A154B",
      category: "channel",
      capabilities: ["channel"],
    },
    {
      id: "telegram",
      name: "Telegram",
      description: "Telegram channel plugin",
      icon: "Send",
      color: "#2AABEE",
      category: "channel",
      capabilities: ["channel"],
    },
  ]),
}));

// Mock next/link
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import type { CapabilitySetting, ChannelInfo } from "@/lib/api";
import { getCreditBalance, listChannels, listInstances } from "@/lib/api";
import { listCapabilities } from "@/lib/settings-api";
import { SetupChecklist } from "../components/onboarding/setup-checklist";

const mockListInstances = listInstances as ReturnType<typeof vi.fn>;
const mockGetCreditBalance = getCreditBalance as ReturnType<typeof vi.fn>;
const mockListChannels = listChannels as ReturnType<typeof vi.fn>;
const mockListCapabilities = listCapabilities as ReturnType<typeof vi.fn>;

const mockInstance = {
  id: "inst-001",
  name: "my-bot",
  status: "running" as const,
  health: "healthy" as const,
  uptime: 3600,
  pluginCount: 1,
  sessionCount: 2,
  provider: "anthropic",
  channels: ["discord"],
  plugins: [{ id: "image-gen", name: "Image Gen", version: "1.0.0", enabled: true }],
};

function setupMocks({
  channels = [] as ChannelInfo[],
  capabilities = [] as CapabilitySetting[],
  balance = 5.0,
  instances = [mockInstance],
} = {}) {
  mockListInstances.mockResolvedValue(instances);
  mockGetCreditBalance.mockResolvedValue({ balance, dailyBurn: 0, runway: null });
  mockListChannels.mockResolvedValue(channels);
  mockListCapabilities.mockResolvedValue(capabilities);
}

describe("SetupChecklist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("renders Discord channel as Ready when listChannels returns connected status", async () => {
    setupMocks({
      channels: [{ id: "ch-1", name: "discord-general", type: "discord", status: "connected" }],
    });

    render(<SetupChecklist />);

    await waitFor(() => {
      expect(screen.getByText("Discord")).toBeInTheDocument();
    });
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("renders Discord channel as Set up when listChannels returns disconnected status", async () => {
    setupMocks({
      channels: [{ id: "ch-1", name: "discord-general", type: "discord", status: "disconnected" }],
    });

    render(<SetupChecklist />);

    await waitFor(() => {
      expect(screen.getByText("Discord")).toBeInTheDocument();
    });
    expect(screen.getByText("Set up →")).toBeInTheDocument();
  });

  it("renders superpower as Ready (Hosted) when capability mode is hosted", async () => {
    setupMocks({
      capabilities: [
        {
          capability: "image-gen",
          mode: "hosted",
          maskedKey: null,
          keyStatus: null,
          provider: null,
        },
      ],
    });

    render(<SetupChecklist />);

    await waitFor(() => {
      expect(screen.getByText("ImageGen")).toBeInTheDocument();
    });
    expect(screen.getByText("Ready (Hosted)")).toBeInTheDocument();
  });

  it("renders superpower as Configure key when capability mode is byok with invalid key", async () => {
    setupMocks({
      capabilities: [
        {
          capability: "image-gen",
          mode: "byok",
          maskedKey: "r8_***",
          keyStatus: "invalid",
          provider: "Replicate",
        },
      ],
    });

    render(<SetupChecklist />);

    await waitFor(() => {
      expect(screen.getByText("ImageGen")).toBeInTheDocument();
    });
    expect(screen.getByText("Configure key →")).toBeInTheDocument();
  });

  it("renders superpower as Ready (Hosted) when capability mode is byok with valid key", async () => {
    setupMocks({
      capabilities: [
        {
          capability: "image-gen",
          mode: "byok",
          maskedKey: "r8_***",
          keyStatus: "valid",
          provider: "Replicate",
        },
      ],
    });

    render(<SetupChecklist />);

    await waitFor(() => {
      expect(screen.getByText("ImageGen")).toBeInTheDocument();
    });
    expect(screen.getByText("Ready (Hosted)")).toBeInTheDocument();
  });

  it("displays credit balance from API", async () => {
    setupMocks({ balance: 4.5 });

    render(<SetupChecklist />);

    await waitFor(() => {
      expect(screen.getByText("$4.50")).toBeInTheDocument();
    });
  });

  it("gracefully handles listChannels failure and still renders component", async () => {
    mockListInstances.mockResolvedValue([mockInstance]);
    mockGetCreditBalance.mockResolvedValue({ balance: 1.0, dailyBurn: 0, runway: null });
    mockListChannels.mockRejectedValue(new Error("Network error"));
    mockListCapabilities.mockResolvedValue([]);

    render(<SetupChecklist />);

    // Should still render without crashing, channel shows as not ready
    await waitFor(() => {
      expect(screen.getByText("Discord")).toBeInTheDocument();
    });
    expect(screen.getByText("Set up →")).toBeInTheDocument();
  });

  it("gracefully handles listCapabilities failure and falls back to static readiness", async () => {
    mockListInstances.mockResolvedValue([mockInstance]);
    mockGetCreditBalance.mockResolvedValue({ balance: 1.0, dailyBurn: 0, runway: null });
    mockListChannels.mockResolvedValue([]);
    mockListCapabilities.mockRejectedValue(new Error("Network error"));

    render(<SetupChecklist />);

    // Component should still render
    await waitFor(() => {
      expect(screen.getByText("ImageGen")).toBeInTheDocument();
    });
  });

  it("dismiss stores key in localStorage and hides component", async () => {
    setupMocks();
    const user = userEvent.setup();

    render(<SetupChecklist />);

    await waitFor(() => {
      expect(screen.getByText("Dismiss")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Dismiss"));

    expect(localStorage.getItem("platform-setup-checklist-dismissed")).toBe("true");
    expect(screen.queryByText("Let's get your Platform running")).not.toBeInTheDocument();
  });

  it("returns null when no instances exist", async () => {
    setupMocks({ instances: [] });

    const { container } = render(<SetupChecklist />);

    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("marks channel as connected if any instance has it connected", async () => {
    mockListInstances.mockResolvedValue([
      { ...mockInstance, id: "inst-001" },
      { ...mockInstance, id: "inst-002" },
    ]);
    mockGetCreditBalance.mockResolvedValue({ balance: 0, dailyBurn: 0, runway: null });
    mockListChannels.mockImplementation((botId: string) => {
      if (botId === "inst-001") {
        return Promise.resolve([
          { id: "ch-1", name: "discord-general", type: "discord", status: "disconnected" },
        ]);
      }
      return Promise.resolve([
        { id: "ch-2", name: "discord-other", type: "discord", status: "connected" },
      ]);
    });
    mockListCapabilities.mockResolvedValue([]);

    render(<SetupChecklist />);

    await waitFor(() => {
      expect(screen.getByText("Discord")).toBeInTheDocument();
    });
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });
});
