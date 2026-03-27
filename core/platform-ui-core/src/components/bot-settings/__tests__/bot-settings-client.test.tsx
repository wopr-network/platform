import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BotSettingsClient } from "../bot-settings-client";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
}));

vi.mock("@/lib/bot-settings-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/bot-settings-data")>();
  return {
    ...actual,
    getBotSettings: vi.fn().mockResolvedValue({
      id: "bot-001",
      identity: {
        name: "TestBot",
        avatar: "",
        personality: "Helpful assistant",
      },
      brain: {
        provider: "anthropic",
        model: "claude-sonnet-4-6",
        mode: "hosted",
        costPerMessage: "$0.001",
        description: "Claude Sonnet",
      },
      channels: [],
      availableChannels: [],
      activeSuperpowers: [],
      availableSuperpowers: [],
      installedPlugins: [],
      discoverPlugins: [],
      usage: {
        totalSpend: 0,
        creditBalance: 100,
        capabilities: [],
        trend: [],
      },
      status: "running",
    }),
    updateBotIdentity: vi.fn().mockResolvedValue({
      name: "TestBot",
      avatar: "",
      personality: "Helpful assistant",
    }),
    updateBotBrain: vi.fn().mockResolvedValue(undefined),
    togglePlugin: vi.fn().mockResolvedValue(undefined),
    installPlugin: vi.fn().mockResolvedValue(undefined),
    activateSuperpower: vi.fn().mockResolvedValue({ success: true }),
    controlBot: vi.fn().mockResolvedValue(undefined),
    disconnectChannel: vi.fn().mockResolvedValue(undefined),
    getChannelConfig: vi.fn().mockResolvedValue({}),
    getPluginConfig: vi.fn().mockResolvedValue({}),
    getSuperpowerConfig: vi.fn().mockResolvedValue({}),
    updateChannelConfig: vi.fn().mockResolvedValue(undefined),
    updatePluginConfig: vi.fn().mockResolvedValue(undefined),
    updateSuperpowerConfig: vi.fn().mockResolvedValue(undefined),
  };
});

describe("BotSettingsClient — loading and error states", () => {
  it("renders skeleton while loading", async () => {
    const { getBotSettings } = await import("@/lib/bot-settings-data");
    vi.mocked(getBotSettings).mockReturnValueOnce(
      new Promise(() => {
        /* never resolves — keep loading state for test */
      }),
    );

    const { container } = render(<BotSettingsClient botId="bot-001" />);
    // No bot name rendered yet
    expect(screen.queryByDisplayValue("TestBot")).not.toBeInTheDocument();
    // Skeleton elements present
    expect(container.querySelectorAll("[class*='animate-pulse']").length).toBeGreaterThan(0);
  });

  it("renders error state when getBotSettings fails", async () => {
    const { getBotSettings } = await import("@/lib/bot-settings-data");
    vi.mocked(getBotSettings).mockRejectedValueOnce(new Error("Server error"));

    render(<BotSettingsClient botId="bot-001" />);

    await waitFor(() => {
      expect(screen.getByText(/Server error/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /Back to Dashboard/i })).toBeInTheDocument();
  });
});

describe("BotSettingsClient — IdentityTab save flow", () => {
  it("renders identity tab with bot name after loading", async () => {
    render(<BotSettingsClient botId="bot-001" />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("TestBot")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });

  it("calls updateBotIdentity with updated name on save", async () => {
    const user = userEvent.setup();
    const { updateBotIdentity } = await import("@/lib/bot-settings-data");

    render(<BotSettingsClient botId="bot-001" />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("TestBot")).toBeInTheDocument();
    });

    const nameInput = screen.getByDisplayValue("TestBot");
    await user.clear(nameInput);
    await user.type(nameInput, "UpdatedBot");

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(updateBotIdentity).toHaveBeenCalledWith("bot-001", {
        name: "UpdatedBot",
        avatar: "",
        personality: "Helpful assistant",
      });
    });
  });

  it("shows Saved! confirmation after successful save", async () => {
    const user = userEvent.setup();

    render(<BotSettingsClient botId="bot-001" />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("TestBot")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(screen.getByText("Saved!")).toBeInTheDocument();
    });
  });

  it("shows error message when save fails", async () => {
    const { updateBotIdentity } = await import("@/lib/bot-settings-data");
    vi.mocked(updateBotIdentity).mockRejectedValueOnce(new Error("Server error"));

    const user = userEvent.setup();
    render(<BotSettingsClient botId="bot-001" />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("TestBot")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to save \u2014 please try again.")).toBeInTheDocument();
    });
  });

  it("disables save button while saving", async () => {
    const { updateBotIdentity } = await import("@/lib/bot-settings-data");
    let resolveUpdate!: (v: { name: string; avatar: string; personality: string }) => void;
    vi.mocked(updateBotIdentity).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }),
    );

    const user = userEvent.setup();
    render(<BotSettingsClient botId="bot-001" />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("TestBot")).toBeInTheDocument();
    });

    const saveBtn = screen.getByRole("button", { name: "Save changes" });
    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    });

    resolveUpdate({ name: "TestBot", avatar: "", personality: "Helpful assistant" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
    });
  });

  it("disables save button when name is empty", async () => {
    const user = userEvent.setup();

    render(<BotSettingsClient botId="bot-001" />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("TestBot")).toBeInTheDocument();
    });

    const nameInput = screen.getByDisplayValue("TestBot");
    await user.clear(nameInput);

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });
});
