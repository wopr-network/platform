import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BotSettings } from "@/lib/bot-settings-data";
import { PERSONALITY_TEMPLATES } from "@/lib/bot-settings-data";

const TEST_BOT_SETTINGS = vi.hoisted(
  (): BotSettings => ({
    id: "bot-001",
    identity: {
      name: "Jarvis",
      avatar: "robot",
      personality:
        'You are Jarvis, a helpful AI assistant. You are witty, concise, and slightly sarcastic. You help with coding, research, and creative tasks. You call your owner "sir."',
    },
    brain: {
      provider: "Anthropic",
      model: "Claude Sonnet 4",
      mode: "hosted",
      costPerMessage: "~$0.01/message",
      description: "Excellent at reasoning and code",
    },
    channels: [
      {
        id: "ch-1",
        type: "Discord",
        name: "My Server",
        status: "connected",
        stats: "3 channels, 142 messages today",
      },
      {
        id: "ch-2",
        type: "Web UI",
        name: "chat.localhost/jarvis",
        status: "always-on",
        stats: "12 sessions today",
      },
    ],
    availableChannels: [
      { type: "Slack", label: "Slack" },
      { type: "Telegram", label: "Telegram" },
      { type: "WhatsApp", label: "WhatsApp" },
    ],
    activeSuperpowers: [
      {
        id: "image-gen",
        name: "ImageGen",
        icon: "image",
        mode: "hosted",
        provider: "Replicate",
        model: "SDXL",
        usageCount: 47,
        usageLabel: "images this week",
        spend: 2.35,
      },
      {
        id: "voice",
        name: "Voice (STT+TTS)",
        icon: "mic",
        mode: "hosted",
        provider: "Deepgram + ElevenLabs",
        model: "STT + TTS",
        usageCount: 34,
        usageLabel: "min this week",
        spend: 1.2,
      },
      {
        id: "memory",
        name: "Memory",
        icon: "brain",
        mode: "hosted",
        provider: "OpenAI",
        model: "ada-002",
        usageCount: 2847,
        usageLabel: "memories stored",
        spend: 0.45,
      },
    ],
    availableSuperpowers: [
      {
        id: "video-gen",
        name: "VideoGen",
        icon: "video",
        description: "Generate videos from text in any channel",
        pricing: "~$0.50/vid",
      },
      {
        id: "phone",
        name: "Phone Calls",
        icon: "phone",
        description: "Your bot answers the phone and calls people",
        pricing: "~$0.10/min",
      },
      {
        id: "sms",
        name: "SMS",
        icon: "message-square",
        description: "Your bot sends and receives texts",
        pricing: "~$0.02/msg",
      },
      {
        id: "search",
        name: "Web Search",
        icon: "search",
        description: "Web + doc search in any channel",
        pricing: "~$0.01/search",
      },
      {
        id: "analytics",
        name: "Analytics",
        icon: "bar-chart",
        description: "Usage insights and reports",
        pricing: "Free",
      },
    ],
    installedPlugins: [
      {
        id: "meeting-transcriber",
        name: "Meeting Transcriber",
        description: "Transcribes voice calls to searchable notes",
        icon: "file-text",
        status: "active",
        capabilities: ["Voice (STT)", "Memory"],
      },
      {
        id: "art-director",
        name: "Art Director",
        description: "Style-consistent image generation with presets",
        icon: "palette",
        status: "active",
        capabilities: ["ImageGen"],
      },
    ],
    discoverPlugins: [
      {
        id: "analytics-pro",
        name: "Analytics Pro",
        description: "Deep usage analytics & reports",
        icon: "bar-chart",
        needs: ["Hosted"],
      },
      {
        id: "music-bot",
        name: "Music Bot",
        description: "Play music in voice channels",
        icon: "music",
        needs: ["Voice", "Hosted"],
      },
      {
        id: "scheduler",
        name: "Scheduler",
        description: "Schedule messages & reminders",
        icon: "calendar",
        needs: [],
      },
    ],
    usage: {
      totalSpend: 4.0,
      creditBalance: 7.42,
      capabilities: [
        { capability: "ImageGen", icon: "image", spend: 2.35, percent: 59 },
        { capability: "Voice", icon: "mic", spend: 1.2, percent: 30 },
        { capability: "Memory", icon: "brain", spend: 0.45, percent: 11 },
      ],
      trend: [
        { date: "Feb 1", spend: 0.5 },
        { date: "Feb 3", spend: 0.8 },
        { date: "Feb 5", spend: 0.3 },
        { date: "Feb 7", spend: 1.2 },
        { date: "Feb 9", spend: 0.6 },
        { date: "Feb 11", spend: 0.4 },
        { date: "Feb 13", spend: 0.2 },
      ],
    },
    status: "running",
  }),
);

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard/bots/bot-001/settings",
}));

// Mock better-auth/react
vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: () => ({ data: null, isPending: false, error: null }),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  }),
}));

// Mock bot-settings-data API functions
vi.mock("@/lib/bot-settings-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bot-settings-data")>();
  return {
    ...actual,
    getBotSettings: vi.fn().mockResolvedValue(TEST_BOT_SETTINGS),
    updateBotIdentity: vi.fn().mockResolvedValue(TEST_BOT_SETTINGS.identity),
    activateSuperpower: vi.fn().mockResolvedValue({ success: true }),
    controlBot: vi.fn().mockResolvedValue(undefined),
  };
});

describe("BotSettingsClient", () => {
  it("renders loading state initially", async () => {
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    const { container } = render(<BotSettingsClient botId="bot-001" />);
    expect(container.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(0);
  });

  it("renders bot name and status after loading", async () => {
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    expect(await screen.findByText("Jarvis")).toBeInTheDocument();
  });

  it("renders all 7 tab triggers", async () => {
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    expect(screen.getByRole("tab", { name: "Identity" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Brain" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Channels" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Superpowers" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Plugins" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Usage" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Danger Zone" })).toBeInTheDocument();
  });

  it("renders back to fleet link", async () => {
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    const backLink = screen.getByRole("link", { name: /Back to Fleet/ });
    expect(backLink).toBeInTheDocument();
    expect(backLink).toHaveAttribute("href", "/dashboard");
  });
});

describe("Identity tab", () => {
  it("renders identity form fields", async () => {
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Personality")).toBeInTheDocument();
  });

  it("renders personality template buttons", async () => {
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    for (const template of PERSONALITY_TEMPLATES) {
      expect(screen.getByRole("button", { name: template.label })).toBeInTheDocument();
    }
  });

  it("renders save changes button", async () => {
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });
});

describe("Brain tab", () => {
  it("renders current model and provider mode", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Brain" }));

    expect(screen.getByText("Model")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Claude Sonnet 4")).toBeInTheDocument();
    expect(screen.getByText("Provider Mode")).toBeInTheDocument();
  });

  it("renders Platform Hosted and BYOK options", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Brain" }));

    expect(screen.getByText("Platform Hosted")).toBeInTheDocument();
    expect(screen.getByText("Bring Your Own Key")).toBeInTheDocument();
  });
});

describe("Channels tab", () => {
  it("renders connected channels", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Channels" }));

    expect(screen.getByText("Discord")).toBeInTheDocument();
    expect(screen.getByText("Web UI")).toBeInTheDocument();
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Always On")).toBeInTheDocument();
  });

  it("renders add channel buttons", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Channels" }));

    expect(screen.getByRole("button", { name: "+ Add Slack" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add Telegram" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add WhatsApp" })).toBeInTheDocument();
  });

  it("renders free channels messaging", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Channels" }));

    expect(
      screen.getByText("Your Platform works everywhere you do. All channels are free."),
    ).toBeInTheDocument();
  });
});

describe("Superpowers tab", () => {
  it("renders active superpowers with usage stats", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Superpowers" }));

    expect(screen.getByText("ImageGen")).toBeInTheDocument();
    expect(screen.getByText(/47 images this week/)).toBeInTheDocument();
    expect(screen.getByText(/\$2\.35/)).toBeInTheDocument();

    expect(screen.getByText("Voice (STT+TTS)")).toBeInTheDocument();
    expect(screen.getByText("Memory")).toBeInTheDocument();
  });

  it("renders available superpowers with pricing", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Superpowers" }));

    expect(screen.getByText("VideoGen")).toBeInTheDocument();
    expect(screen.getByText("~$0.50/vid")).toBeInTheDocument();
    expect(screen.getByText("Phone Calls")).toBeInTheDocument();
    expect(screen.getByText("~$0.10/min")).toBeInTheDocument();
    expect(screen.getByText("SMS")).toBeInTheDocument();
    expect(screen.getByText("Web Search")).toBeInTheDocument();
    expect(screen.getByText("Analytics")).toBeInTheDocument();
  });

  it("renders add buttons for available superpowers", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Superpowers" }));

    const addButtons = screen.getAllByRole("button", { name: "+ Add" });
    expect(addButtons.length).toBe(5); // 5 available superpowers
  });

  it("renders 'Your Platform can do more' section", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Superpowers" }));

    expect(screen.getByText("Your Platform can do more")).toBeInTheDocument();
    expect(screen.getByText("One click to activate. Uses your credits.")).toBeInTheDocument();
  });

  it("calls activateSuperpower on add button click", async () => {
    const user = userEvent.setup();
    const { activateSuperpower } = await import("@/lib/bot-settings-data");
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Superpowers" }));

    const addButtons = screen.getAllByRole("button", { name: "+ Add" });
    await user.click(addButtons[0]);

    expect(activateSuperpower).toHaveBeenCalledWith("bot-001", "video-gen");
  });
});

describe("Plugins tab", () => {
  it("renders installed plugins", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Plugins" }));

    expect(screen.getByText("Meeting Transcriber")).toBeInTheDocument();
    expect(screen.getByText("Art Director")).toBeInTheDocument();
  });

  it("renders plugin capabilities", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Plugins" }));

    expect(screen.getByText("Uses: Voice (STT), Memory")).toBeInTheDocument();
    expect(screen.getByText("Uses: ImageGen")).toBeInTheDocument();
  });

  it("renders discover plugins section", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Plugins" }));

    expect(screen.getByText("Discover Plugins")).toBeInTheDocument();
    expect(screen.getByText("Analytics Pro")).toBeInTheDocument();
    expect(screen.getByText("Music Bot")).toBeInTheDocument();
    expect(screen.getByText("Scheduler")).toBeInTheDocument();
  });

  it("renders needs badges on discover plugins", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Plugins" }));

    const hostedBadges = screen.getAllByText("Needs: Hosted");
    expect(hostedBadges.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Needs: Voice")).toBeInTheDocument();
  });

  it("renders browse all plugins link", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Plugins" }));

    const browseLink = screen.getByRole("link", { name: "Browse all plugins" });
    expect(browseLink).toHaveAttribute("href", "/marketplace");
  });
});

describe("Usage tab", () => {
  it("renders usage summary", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Usage" }));

    expect(screen.getByText(/\$4\.00/)).toBeInTheDocument();
    expect(screen.getByText(/\$7\.42/)).toBeInTheDocument();
  });

  it("renders per-capability breakdown", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Usage" }));

    expect(screen.getByText("By Capability")).toBeInTheDocument();
    // Capability names appear in the breakdown
    const usageSection = screen.getByText("By Capability").closest("[data-slot='card']");
    expect(usageSection).toBeInTheDocument();
  });

  it("renders trend chart", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Usage" }));

    expect(screen.getByText("Trend")).toBeInTheDocument();
    expect(screen.getByText("Daily spend over the last 14 days")).toBeInTheDocument();
  });
});

describe("Danger Zone tab", () => {
  it("renders danger zone heading", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Danger Zone" }));

    expect(screen.getByRole("heading", { name: "Danger Zone" })).toBeInTheDocument();
  });

  it("renders stop, archive, and delete buttons", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Danger Zone" }));

    expect(screen.getByRole("button", { name: "Stop Jarvis" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Archive Jarvis" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Jarvis" })).toBeInTheDocument();
  });

  it("opens confirmation dialog on stop click", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Danger Zone" }));
    await user.click(screen.getByRole("button", { name: "Stop Jarvis" }));

    expect(screen.getByText("Stop Jarvis?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop bot" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("opens delete dialog with name confirmation requirement", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Danger Zone" }));
    await user.click(screen.getByRole("button", { name: "Delete Jarvis" }));

    expect(screen.getByText("Delete Jarvis permanently?")).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type "Jarvis" to confirm')).toBeInTheDocument();

    // Delete button should be disabled until name is typed
    const deleteBtn = screen.getByRole("button", { name: "Delete permanently" });
    expect(deleteBtn).toBeDisabled();
  });

  it("enables delete button when name matches", async () => {
    const user = userEvent.setup();
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Danger Zone" }));
    await user.click(screen.getByRole("button", { name: "Delete Jarvis" }));

    const input = screen.getByPlaceholderText('Type "Jarvis" to confirm');
    await user.type(input, "Jarvis");

    const deleteBtn = screen.getByRole("button", { name: "Delete permanently" });
    expect(deleteBtn).not.toBeDisabled();
  });

  it("calls controlBot on stop confirmation", async () => {
    const user = userEvent.setup();
    const { controlBot } = await import("@/lib/bot-settings-data");
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Danger Zone" }));
    await user.click(screen.getByRole("button", { name: "Stop Jarvis" }));
    await user.click(screen.getByRole("button", { name: "Stop bot" }));

    expect(controlBot).toHaveBeenCalledWith("bot-001", "stop");
  });
});

describe("Error handling", () => {
  it("shows error when getBotSettings fails", async () => {
    const { getBotSettings } = await import("@/lib/bot-settings-data");
    vi.mocked(getBotSettings).mockRejectedValueOnce(
      new Error("API error: 500 Internal Server Error"),
    );
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    expect(await screen.findByText("API error: 500 Internal Server Error")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to Dashboard/ })).toBeInTheDocument();
  });

  it("shows error when updateBotIdentity fails", async () => {
    const user = userEvent.setup();
    const { updateBotIdentity } = await import("@/lib/bot-settings-data");
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    vi.mocked(updateBotIdentity).mockRejectedValueOnce(new Error("Save failed"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText(/Failed to save/)).toBeInTheDocument();
  });

  it("does not show Saved! when save fails", async () => {
    const user = userEvent.setup();
    const { updateBotIdentity } = await import("@/lib/bot-settings-data");
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    vi.mocked(updateBotIdentity).mockRejectedValueOnce(new Error("Save failed"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await screen.findByText(/Failed to save/);
    expect(screen.queryByText("Saved!")).not.toBeInTheDocument();
  });

  it("shows error when activateSuperpower fails", async () => {
    const user = userEvent.setup();
    const { activateSuperpower } = await import("@/lib/bot-settings-data");
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Superpowers" }));
    vi.mocked(activateSuperpower).mockRejectedValueOnce(new Error("Activation failed"));
    const addButtons = screen.getAllByRole("button", { name: "+ Add" });
    await user.click(addButtons[0]);

    expect(await screen.findByText(/Failed to activate/)).toBeInTheDocument();
  });

  it("shows error when controlBot fails", async () => {
    const user = userEvent.setup();
    const { controlBot } = await import("@/lib/bot-settings-data");
    const { BotSettingsClient } = await import("../components/bot-settings/bot-settings-client");
    render(<BotSettingsClient botId="bot-001" />);
    await screen.findByText("Jarvis");

    await user.click(screen.getByRole("tab", { name: "Danger Zone" }));
    vi.mocked(controlBot).mockRejectedValueOnce(new Error("Control failed"));
    await user.click(screen.getByRole("button", { name: "Stop Jarvis" }));
    await user.click(screen.getByRole("button", { name: "Stop bot" }));

    expect(await screen.findByText(/Failed to stop bot/)).toBeInTheDocument();
  });
});
