import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Wizard } from "@/components/channel-wizard";
import { FieldInteractive } from "@/components/channel-wizard/field-interactive";
import { FieldPaste } from "@/components/channel-wizard/field-paste";
import { StepRenderer } from "@/components/channel-wizard/step-renderer";
import type { SetupStep } from "@/lib/channel-manifests";
import {
  CHANNEL_MANIFESTS_FIXTURE,
  DISCORD_MANIFEST,
  TELEGRAM_MANIFEST,
} from "./fixtures/mock-manifests";

// Mock @/lib/channel-manifests to use fixture data (sync for Wizard component tests)
vi.mock("@/lib/channel-manifests", async () => {
  const actual = await vi.importActual("@/lib/channel-manifests");
  return {
    ...actual,
    getChannelManifests: vi.fn().mockResolvedValue(CHANNEL_MANIFESTS_FIXTURE),
    getManifest: vi
      .fn()
      .mockImplementation(async (id: string) => CHANNEL_MANIFESTS_FIXTURE.find((m) => m.id === id)),
  };
});

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock @/lib/api for connection test tests
vi.mock("@/lib/api", () => ({
  testChannelConnection: vi.fn(),
}));

describe("channel-manifests", () => {
  it("provides Discord, Slack, and Telegram manifests via getChannelManifests", async () => {
    const { getChannelManifests } = await import("@/lib/channel-manifests");
    const manifests = await getChannelManifests();
    expect(manifests).toHaveLength(3);
    expect(manifests.map((m) => m.id)).toEqual(["discord", "slack", "telegram"]);
  });

  it("getManifest returns correct manifest by id", async () => {
    const { getManifest } = await import("@/lib/channel-manifests");
    const discord = await getManifest("discord");
    expect(discord?.name).toBe("Discord");
  });

  it("getManifest returns undefined for unknown id", async () => {
    const { getManifest } = await import("@/lib/channel-manifests");
    const result = await getManifest("unknown");
    expect(result).toBeUndefined();
  });

  it("Discord manifest has 4 setup steps", async () => {
    const { getManifest } = await import("@/lib/channel-manifests");
    const discord = await getManifest("discord");
    expect(discord?.setup).toHaveLength(4);
    expect(discord?.setup.map((s) => s.id)).toEqual([
      "create-bot",
      "paste-token",
      "select-guild",
      "done",
    ]);
  });

  it("Telegram manifest has secret token field with paste flow", async () => {
    const { getManifest } = await import("@/lib/channel-manifests");
    const telegram = await getManifest("telegram");
    const tokenStep = telegram?.setup.find((s) => s.id === "paste-token");
    const tokenField = tokenStep?.fields[0];
    expect(tokenField?.secret).toBe(true);
    expect(tokenField?.setupFlow).toBe("paste");
  });

  it("Slack manifest has oauth flow", async () => {
    const { getManifest } = await import("@/lib/channel-manifests");
    const slack = await getManifest("slack");
    const oauthStep = slack?.setup.find((s) => s.id === "oauth");
    const oauthField = oauthStep?.fields[0];
    expect(oauthField?.setupFlow).toBe("oauth");
  });
});

describe("FieldPaste", () => {
  it("renders label and input", () => {
    const onChange = vi.fn();
    render(
      <FieldPaste
        field={{
          key: "token",
          label: "Bot Token",
          type: "string",
          required: true,
          secret: true,
          setupFlow: "paste",
          placeholder: "Enter token",
        }}
        value=""
        onChange={onChange}
      />,
    );

    expect(screen.getByText("Bot Token")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Enter token")).toBeInTheDocument();
  });

  it("masks secret fields by default and toggles visibility", () => {
    const onChange = vi.fn();
    render(
      <FieldPaste
        field={{
          key: "token",
          label: "Token",
          type: "string",
          required: true,
          secret: true,
          setupFlow: "paste",
        }}
        value="secret-value"
        onChange={onChange}
      />,
    );

    const input = screen.getByLabelText("Token") as HTMLInputElement;
    expect(input.type).toBe("password");

    fireEvent.click(screen.getByText("Show"));
    expect(input.type).toBe("text");

    fireEvent.click(screen.getByText("Hide"));
    expect(input.type).toBe("password");
  });

  it("calls onChange when typing", () => {
    const onChange = vi.fn();
    render(
      <FieldPaste
        field={{
          key: "token",
          label: "Token",
          type: "string",
          required: true,
          setupFlow: "paste",
        }}
        value=""
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Token"), { target: { value: "abc" } });
    expect(onChange).toHaveBeenCalledWith("token", "abc");
  });

  it("displays error message", () => {
    render(
      <FieldPaste
        field={{
          key: "token",
          label: "Token",
          type: "string",
          required: true,
          setupFlow: "paste",
        }}
        value=""
        onChange={vi.fn()}
        error="Token is required"
      />,
    );

    expect(screen.getByText("Token is required")).toBeInTheDocument();
  });
});

describe("FieldInteractive", () => {
  it("renders select options", () => {
    const onChange = vi.fn();
    render(
      <FieldInteractive
        field={{
          key: "guild",
          label: "Server",
          type: "select",
          required: true,
          setupFlow: "interactive",
          options: [
            { label: "Server A", value: "a" },
            { label: "Server B", value: "b" },
          ],
        }}
        value=""
        onChange={onChange}
      />,
    );

    expect(screen.getByText("Server A")).toBeInTheDocument();
    expect(screen.getByText("Server B")).toBeInTheDocument();
  });

  it("highlights selected option and calls onChange", () => {
    const onChange = vi.fn();
    render(
      <FieldInteractive
        field={{
          key: "guild",
          label: "Server",
          type: "select",
          required: true,
          setupFlow: "interactive",
          options: [
            { label: "Server A", value: "a" },
            { label: "Server B", value: "b" },
          ],
        }}
        value="a"
        onChange={onChange}
      />,
    );

    expect(screen.getByText("Selected")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Server B"));
    expect(onChange).toHaveBeenCalledWith("guild", "b");
  });
});

describe("StepRenderer", () => {
  it("renders instruction text and external link", () => {
    const step: SetupStep = {
      id: "create-bot",
      title: "Create Bot",
      description: "Create a bot",
      instruction: "Go to the developer portal",
      externalUrl: "https://discord.com/developers",
      fields: [],
    };

    render(<StepRenderer step={step} values={{}} errors={{}} onChange={vi.fn()} />);

    expect(screen.getByText("Go to the developer portal")).toBeInTheDocument();
    expect(screen.getByText("Open discord.com")).toBeInTheDocument();
  });

  it("renders completion step with checkmark", () => {
    const step: SetupStep = {
      id: "done",
      title: "Done",
      description: "Your bot is ready to use.",
      fields: [],
    };

    render(<StepRenderer step={step} values={{}} errors={{}} onChange={vi.fn()} />);

    expect(screen.getByText("Your bot is ready to use.")).toBeInTheDocument();
  });
});

describe("Wizard", () => {
  const discord = DISCORD_MANIFEST;

  it("renders the first step", () => {
    render(<Wizard manifest={discord} onComplete={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText("Create a Discord Bot")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Continue")).toBeInTheDocument();
  });

  it("renders the Discord brand color badge", () => {
    render(<Wizard manifest={discord} onComplete={vi.fn()} onCancel={vi.fn()} />);

    const brandBadge = screen.getByText("D");
    expect(brandBadge).toBeInTheDocument();
  });

  it("navigates to next step on Continue", () => {
    render(<Wizard manifest={discord} onComplete={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByText("Continue"));
    expect(screen.getByText("Enter Bot Token")).toBeInTheDocument();
    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
  });

  it("navigates back on Back button", () => {
    render(<Wizard manifest={discord} onComplete={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByText("Continue"));
    expect(screen.getByText("Enter Bot Token")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Back"));
    expect(screen.getByText("Create a Discord Bot")).toBeInTheDocument();
  });

  it("calls onCancel when Cancel is clicked", () => {
    const onCancel = vi.fn();
    render(<Wizard manifest={discord} onComplete={vi.fn()} onCancel={onCancel} />);

    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("validates required fields before advancing", () => {
    render(<Wizard manifest={discord} onComplete={vi.fn()} onCancel={vi.fn()} />);

    // Step 1 has no fields, advance to step 2
    fireEvent.click(screen.getByText("Continue"));
    expect(screen.getByText("Enter Bot Token")).toBeInTheDocument();

    // Try to advance without filling token
    fireEvent.click(screen.getByText("Continue"));
    expect(screen.getByText("Bot Token is required")).toBeInTheDocument();
    // Should still be on step 2
    expect(screen.getByText("Step 2 of 4")).toBeInTheDocument();
  });

  it("advances after filling required field", () => {
    render(<Wizard manifest={discord} onComplete={vi.fn()} onCancel={vi.fn()} />);

    // Step 1 -> Step 2
    fireEvent.click(screen.getByText("Continue"));

    // Fill in the token
    fireEvent.change(screen.getByPlaceholderText("Paste your Discord bot token"), {
      target: { value: "valid-token-123" },
    });

    // Step 2 -> Step 3
    fireEvent.click(screen.getByText("Continue"));
    expect(screen.getByText("Select Server")).toBeInTheDocument();
  });

  it("shows Finish on last step and calls onComplete", () => {
    const onComplete = vi.fn();
    render(<Wizard manifest={discord} onComplete={onComplete} onCancel={vi.fn()} />);

    // Navigate through all steps
    // Step 1 (no fields)
    fireEvent.click(screen.getByText("Continue"));

    // Step 2 (token)
    fireEvent.change(screen.getByPlaceholderText("Paste your Discord bot token"), {
      target: { value: "valid-token-123" },
    });
    fireEvent.click(screen.getByText("Continue"));

    // Step 3 (select guild)
    fireEvent.click(screen.getByText("Platform HQ"));
    fireEvent.click(screen.getByText("Continue"));

    // Step 4 (done)
    expect(screen.getByText("Finish")).toBeInTheDocument();
    expect(screen.getByText("Connection Complete")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Finish"));
    expect(onComplete).toHaveBeenCalledWith({
      botToken: "valid-token-123",
      guildId: "1234567890",
    });
  });

  it("shows test connection button on final step", () => {
    render(<Wizard manifest={discord} onComplete={vi.fn()} onCancel={vi.fn()} />);

    // Navigate to final step
    fireEvent.click(screen.getByText("Continue"));
    fireEvent.change(screen.getByPlaceholderText("Paste your Discord bot token"), {
      target: { value: "valid-token-123" },
    });
    fireEvent.click(screen.getByText("Continue"));
    fireEvent.click(screen.getByText("Platform HQ"));
    fireEvent.click(screen.getByText("Continue"));

    expect(screen.getByText("Test Bot Connection")).toBeInTheDocument();
  });

  it("renders progress bar", () => {
    render(<Wizard manifest={discord} onComplete={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText("25%")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Continue"));
    expect(screen.getByText("50%")).toBeInTheDocument();
  });

  it("disables Finish button when submitting is true", () => {
    render(<Wizard manifest={discord} onComplete={vi.fn()} onCancel={vi.fn()} submitting={true} />);

    // Navigate to final step
    fireEvent.click(screen.getByText("Continue")); // step 1
    fireEvent.change(screen.getByPlaceholderText("Paste your Discord bot token"), {
      target: { value: "valid-token-123" },
    });
    fireEvent.click(screen.getByText("Continue")); // step 2
    fireEvent.click(screen.getByText("Platform HQ")); // select guild
    fireEvent.click(screen.getByText("Continue")); // step 3

    const finishBtn = screen.getByText("Connecting...");
    expect(finishBtn.closest("button")).toBeDisabled();
  });
});

describe("Wizard with Telegram (short flow)", () => {
  const telegram = TELEGRAM_MANIFEST;

  it("renders Telegram wizard with 3 steps", () => {
    render(<Wizard manifest={telegram} onComplete={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByText("Create a Telegram Bot")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
  });

  it("validates token format", () => {
    render(<Wizard manifest={telegram} onComplete={vi.fn()} onCancel={vi.fn()} />);

    fireEvent.click(screen.getByText("Continue"));

    // Enter invalid format
    fireEvent.change(screen.getByPlaceholderText("123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"), {
      target: { value: "bad token with spaces" },
    });
    fireEvent.click(screen.getByText("Continue"));
    expect(screen.getByText("Invalid Telegram bot token format")).toBeInTheDocument();
  });
});

describe("Wizard connection test API integration", () => {
  const discord = DISCORD_MANIFEST;

  /** Navigate the Discord wizard to the final step with a valid token. */
  async function navigateToFinalStep() {
    render(<Wizard manifest={discord} onComplete={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText("Continue")); // step 1
    fireEvent.change(screen.getByPlaceholderText("Paste your Discord bot token"), {
      target: { value: "valid-token-123" },
    });
    fireEvent.click(screen.getByText("Continue")); // step 2
    fireEvent.click(screen.getByText("Platform HQ")); // select guild
    fireEvent.click(screen.getByText("Continue")); // step 3 → final
  }

  it("calls API and shows success when connection test passes", async () => {
    const { testChannelConnection } = await import("@/lib/api");
    vi.mocked(testChannelConnection).mockResolvedValue({ success: true });

    await navigateToFinalStep();
    await act(async () => {
      fireEvent.click(screen.getByText("Test Bot Connection"));
    });

    await waitFor(() => {
      expect(screen.getByText("Connection successful")).toBeInTheDocument();
    });
  });

  it("calls API and shows error message when connection test fails", async () => {
    const { testChannelConnection } = await import("@/lib/api");
    vi.mocked(testChannelConnection).mockResolvedValue({
      success: false,
      error: "Invalid bot token",
    });

    await navigateToFinalStep();
    await act(async () => {
      fireEvent.click(screen.getByText("Test Bot Connection"));
    });

    await waitFor(() => {
      expect(screen.getByText("Invalid bot token")).toBeInTheDocument();
    });
  });

  it("shows network error message when fetch throws", async () => {
    const { testChannelConnection } = await import("@/lib/api");
    vi.mocked(testChannelConnection).mockRejectedValue(new Error("Network error"));

    await navigateToFinalStep();
    await act(async () => {
      fireEvent.click(screen.getByText("Test Bot Connection"));
    });

    await waitFor(() => {
      expect(
        screen.getByText("Could not reach the server. Check your connection."),
      ).toBeInTheDocument();
    });
  });

  it("shows Testing... and disables button while request is in flight", async () => {
    const { testChannelConnection } = await import("@/lib/api");
    vi.mocked(testChannelConnection).mockReturnValue(
      new Promise(() => {
        /* never resolves — keep in-flight state for test */
      }),
    );

    await navigateToFinalStep();
    await act(async () => {
      fireEvent.click(screen.getByText("Test Bot Connection"));
    });

    const btn = screen.getByRole("button", { name: "Testing..." });
    expect(btn).toBeDisabled();
  });
});
