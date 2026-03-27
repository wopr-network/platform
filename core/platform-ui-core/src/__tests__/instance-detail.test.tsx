import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InstanceDetailClient } from "../app/instances/[id]/instance-detail-client";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: vi.fn().mockReturnValue({ push: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  getInstance: vi.fn().mockResolvedValue({
    id: "inst-001",
    name: "test-instance",
    template: "General Assistant",
    status: "running",
    provider: "anthropic",
    channels: ["discord-general"],
    plugins: [
      { id: "p1", name: "memory", version: "1.2.0", enabled: true },
      { id: "p2", name: "web-search", version: "0.9.1", enabled: false },
    ],
    uptime: 86400,
    createdAt: "2026-01-15T10:00:00Z",
    config: { model: "claude-sonnet-4-5-20250514", maxTokens: 4096 },
    channelDetails: [{ id: "ch-0", name: "discord-general", type: "discord", status: "connected" }],
    sessions: [
      {
        id: "sess-001",
        userId: "user-alice",
        messageCount: 42,
        startedAt: "2026-02-12T08:00:00Z",
        lastActivityAt: "2026-02-12T09:30:00Z",
      },
    ],
    resourceUsage: { memoryMb: 256, cpuPercent: 12.5 },
  }),
  controlInstance: vi.fn().mockResolvedValue(undefined),
  updateInstanceConfig: vi.fn().mockResolvedValue(undefined),
  getImageStatus: vi.fn().mockResolvedValue({
    currentDigest: "sha256:aaa",
    latestDigest: "sha256:bbb",
    updateAvailable: true,
  }),
  pullImageUpdate: vi.fn().mockResolvedValue(undefined),
  getInstanceLogs: vi
    .fn()
    .mockResolvedValue([
      { id: "log-1", level: "info", message: "Bot started", timestamp: "2026-02-14T10:00:00Z" },
    ]),
  listSnapshots: vi.fn().mockResolvedValue([
    {
      id: "snap-001",
      instanceId: "inst-001",
      name: "pre-deploy backup",
      type: "on-demand",
      trigger: "manual",
      sizeMb: 128,
      createdAt: "2026-02-20T10:00:00Z",
      expiresAt: null,
    },
    {
      id: "snap-002",
      instanceId: "inst-001",
      name: null,
      type: "nightly",
      trigger: "scheduled",
      sizeMb: 256,
      createdAt: "2026-02-19T03:00:00Z",
      expiresAt: 1740000000,
    },
  ]),
  createSnapshot: vi.fn().mockResolvedValue({
    snapshot: {
      id: "snap-003",
      instanceId: "inst-001",
      name: null,
      type: "on-demand",
      trigger: "manual",
      sizeMb: 64,
      createdAt: "2026-02-24T12:00:00Z",
      expiresAt: null,
    },
    estimatedMonthlyCost: "$0.01/month",
  }),
  restoreSnapshot: vi.fn().mockResolvedValue(undefined),
  deleteSnapshot: vi.fn().mockResolvedValue(undefined),
  getInstanceSecretKeys: vi.fn().mockResolvedValue(["DISCORD_TOKEN", "OPENAI_API_KEY"]),
  updateInstanceSecrets: vi.fn().mockResolvedValue(undefined),
  renameInstance: vi.fn().mockResolvedValue(undefined),
}));

describe("InstanceDetailClient", () => {
  it("renders instance name and status", async () => {
    render(<InstanceDetailClient instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("test-instance")).toBeInTheDocument();
    });
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("renders all tab triggers", async () => {
    render(<InstanceDetailClient instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("test-instance")).toBeInTheDocument();
    });

    expect(screen.getByRole("tab", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Plugins" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Channels" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Sessions" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Config" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Logs" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Snapshots" })).toBeInTheDocument();
  });

  it("shows overview metrics by default", async () => {
    render(<InstanceDetailClient instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("256 MB")).toBeInTheDocument();
    });
    expect(screen.getByText("12.5%")).toBeInTheDocument();
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("shows action buttons for running instance", async () => {
    render(<InstanceDetailClient instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("Stop")).toBeInTheDocument();
    });
    expect(screen.getByText("Restart")).toBeInTheDocument();
    expect(screen.getByText("Destroy")).toBeInTheDocument();
  });

  it("tabs can be clicked and become selected", async () => {
    const user = userEvent.setup();
    render(<InstanceDetailClient instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("test-instance")).toBeInTheDocument();
    });

    // Verify all tabs are rendered
    const pluginsTab = screen.getByRole("tab", { name: "Plugins" });
    const channelsTab = screen.getByRole("tab", { name: "Channels" });
    const sessionsTab = screen.getByRole("tab", { name: "Sessions" });
    const configTab = screen.getByRole("tab", { name: "Config" });
    const logsTab = screen.getByRole("tab", { name: "Logs" });

    expect(pluginsTab).toBeInTheDocument();
    expect(channelsTab).toBeInTheDocument();
    expect(sessionsTab).toBeInTheDocument();
    expect(configTab).toBeInTheDocument();
    expect(logsTab).toBeInTheDocument();

    // Click Plugins tab and verify it becomes selected
    await user.click(pluginsTab);
    expect(pluginsTab).toHaveAttribute("aria-selected", "true");

    // Click Channels tab and verify it becomes selected
    await user.click(channelsTab);
    expect(channelsTab).toHaveAttribute("aria-selected", "true");

    // Click Config tab and verify it becomes selected
    await user.click(configTab);
    expect(configTab).toHaveAttribute("aria-selected", "true");

    // Click Sessions tab and verify it becomes selected
    await user.click(sessionsTab);
    expect(sessionsTab).toHaveAttribute("aria-selected", "true");

    // Click Logs tab and verify it becomes selected
    await user.click(logsTab);
    expect(logsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Bot started")).toBeInTheDocument();
  });

  it("clicking Save Config calls updateInstanceConfig with parsed JSON", async () => {
    const user = userEvent.setup();
    render(<InstanceDetailClient instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("test-instance")).toBeInTheDocument();
    });

    const configTab = screen.getByRole("tab", { name: "Config" });
    await user.click(configTab);

    const saveBtn = screen.getByText("Save Config");
    await user.click(saveBtn);

    const { updateInstanceConfig } = await import("@/lib/api");
    expect(updateInstanceConfig).toHaveBeenCalledWith("inst-001", {
      model: "claude-sonnet-4-5-20250514",
      maxTokens: "4096",
    });
  });

  it("clicking Stop button calls controlInstance with correct args", async () => {
    const user = userEvent.setup();
    const { controlInstance } = await import("@/lib/api");
    render(<InstanceDetailClient instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("Stop")).toBeInTheDocument();
    });

    const stopBtn = screen.getByText("Stop");
    await user.click(stopBtn);

    expect(controlInstance).toHaveBeenCalledWith("inst-001", "stop");
  });

  it("shows snapshot list when Snapshots tab is clicked", async () => {
    const user = userEvent.setup();
    render(<InstanceDetailClient instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("test-instance")).toBeInTheDocument();
    });

    const snapshotsTab = screen.getByRole("tab", { name: "Snapshots" });
    await user.click(snapshotsTab);

    await waitFor(() => {
      expect(screen.getByText("pre-deploy backup")).toBeInTheDocument();
    });
    expect(screen.getByText("128 MB")).toBeInTheDocument();
    expect(screen.getByText("on-demand")).toBeInTheDocument();
    expect(screen.getByText("nightly")).toBeInTheDocument();
  });

  it("shows Create Snapshot button in Snapshots tab", async () => {
    const user = userEvent.setup();
    render(<InstanceDetailClient instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("test-instance")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "Snapshots" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create Snapshot" })).toBeInTheDocument();
    });
  });

  it("calls createSnapshot when Create Snapshot is clicked", async () => {
    const user = userEvent.setup();
    const { createSnapshot } = await import("@/lib/api");
    render(<InstanceDetailClient instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("test-instance")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "Snapshots" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create Snapshot" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Create Snapshot" }));
    expect(createSnapshot).toHaveBeenCalledWith("inst-001");
  });

  it("shows restore confirmation dialog", async () => {
    const user = userEvent.setup();
    render(<InstanceDetailClient instanceId="inst-001" />);
    await waitFor(() => {
      expect(screen.getByText("test-instance")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "Snapshots" }));
    await waitFor(() => {
      expect(screen.getByText("pre-deploy backup")).toBeInTheDocument();
    });

    const restoreButtons = screen.getAllByRole("button", { name: "Restore" });
    await user.click(restoreButtons[0]);

    await waitFor(() => {
      expect(screen.getByText("This will restart your bot from this snapshot")).toBeInTheDocument();
    });
  });

  it("shows delete confirmation dialog", async () => {
    const user = userEvent.setup();
    render(<InstanceDetailClient instanceId="inst-001" />);
    await waitFor(() => {
      expect(screen.getByText("test-instance")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "Snapshots" }));
    await waitFor(() => {
      expect(screen.getByText("pre-deploy backup")).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole("button", { name: "Delete" });
    await user.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/permanently delete/i)).toBeInTheDocument();
    });
  });

  it("shows update available badge when image update exists", async () => {
    render(<InstanceDetailClient instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("Update available")).toBeInTheDocument();
    });
  });

  it("shows Pull Update button when update is available", async () => {
    render(<InstanceDetailClient instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("Pull Update")).toBeInTheDocument();
    });
  });

  it("calls pullImageUpdate when Pull Update button is clicked and confirmed via AlertDialog", async () => {
    const user = userEvent.setup();
    const { pullImageUpdate } = await import("@/lib/api");

    render(<InstanceDetailClient instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("Pull Update")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Pull Update"));

    await waitFor(() => {
      expect(
        screen.getByText("This will pull the latest image and restart the bot. Continue?"),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(pullImageUpdate).toHaveBeenCalledWith("inst-001");
  });

  it("does not call pullImageUpdate when user cancels AlertDialog", async () => {
    const user = userEvent.setup();
    const { pullImageUpdate } = await import("@/lib/api");
    vi.mocked(pullImageUpdate).mockClear();

    render(<InstanceDetailClient instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("Pull Update")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Pull Update"));

    await waitFor(() => {
      expect(
        screen.getByText("This will pull the latest image and restart the bot. Continue?"),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(pullImageUpdate).not.toHaveBeenCalled();
  });

  it("shows Secrets section in Config tab with existing secret keys", async () => {
    const user = userEvent.setup();
    render(<InstanceDetailClient instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("test-instance")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "Config" }));

    await waitFor(() => {
      expect(screen.getByText("Secrets")).toBeInTheDocument();
    });
    expect(screen.getByText("DISCORD_TOKEN")).toBeInTheDocument();
    expect(screen.getByText("OPENAI_API_KEY")).toBeInTheDocument();
  });

  it("calls updateInstanceSecrets when saving a secret value", async () => {
    const user = userEvent.setup();
    const { updateInstanceSecrets } = await import("@/lib/api");

    render(<InstanceDetailClient instanceId="inst-001" />);
    await waitFor(() => {
      expect(screen.getByText("test-instance")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "Config" }));
    await waitFor(() => {
      expect(screen.getByText("Secrets")).toBeInTheDocument();
    });

    const inputs = screen.getAllByPlaceholderText("Enter new value...");
    await user.type(inputs[0], "new-secret-value");

    await user.click(screen.getByRole("button", { name: "Save Secrets" }));

    expect(updateInstanceSecrets).toHaveBeenCalledWith("inst-001", {
      DISCORD_TOKEN: "new-secret-value",
    });
  });

  it("allows adding a new secret key", async () => {
    const user = userEvent.setup();
    render(<InstanceDetailClient instanceId="inst-001" />);
    await waitFor(() => {
      expect(screen.getByText("test-instance")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("tab", { name: "Config" }));
    await waitFor(() => {
      expect(screen.getByText("Secrets")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Add Secret" }));

    expect(screen.getByPlaceholderText("SECRET_KEY_NAME")).toBeInTheDocument();
  });

  it("clicking Rename opens inline edit, submitting calls renameInstance", async () => {
    const user = userEvent.setup();
    render(<InstanceDetailClient instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("test-instance")).toBeInTheDocument();
    });

    const renameBtn = screen.getByRole("button", { name: /rename/i });
    await user.click(renameBtn);

    const input = screen.getByDisplayValue("test-instance");
    expect(input).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "renamed-bot");

    const confirmBtn = screen.getByRole("button", { name: /confirm rename/i });
    await user.click(confirmBtn);

    const { renameInstance } = await import("@/lib/api");
    expect(renameInstance).toHaveBeenCalledWith("inst-001", "renamed-bot");
  });

  it("shows invalid JSON indicator in real-time as user types", async () => {
    const user = userEvent.setup();
    render(<InstanceDetailClient instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("test-instance")).toBeInTheDocument();
    });

    const configTab = screen.getByRole("tab", { name: "Config" });
    await user.click(configTab);

    const editor = await screen.findByRole("textbox", { name: /instance configuration/i });

    await user.clear(editor);
    await user.type(editor, "{{} not valid json");

    await waitFor(() => {
      expect(screen.getByText("Invalid JSON")).toBeInTheDocument();
    });
  });

  it("clears invalid JSON indicator when user fixes the JSON", async () => {
    const user = userEvent.setup();
    render(<InstanceDetailClient instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("test-instance")).toBeInTheDocument();
    });

    const configTab = screen.getByRole("tab", { name: "Config" });
    await user.click(configTab);

    const editor = await screen.findByRole("textbox", { name: /instance configuration/i });

    await user.clear(editor);
    await user.type(editor, "{{} broken");

    await waitFor(() => {
      expect(screen.getByText("Invalid JSON")).toBeInTheDocument();
    });

    await user.clear(editor);
    await user.type(editor, '{{"model": "claude"}');

    await waitFor(() => {
      expect(screen.queryByText("Invalid JSON")).not.toBeInTheDocument();
    });
  });

  it("disables save button when JSON is invalid", async () => {
    const user = userEvent.setup();
    render(<InstanceDetailClient instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("test-instance")).toBeInTheDocument();
    });

    const configTab = screen.getByRole("tab", { name: "Config" });
    await user.click(configTab);

    const editor = await screen.findByRole("textbox", { name: /instance configuration/i });

    await user.clear(editor);
    await user.type(editor, "not json");

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /save config/i })).toBeDisabled();
    });
  });

  it("shows invalid JSON indicator after a successful save when user edits to invalid JSON", async () => {
    const user = userEvent.setup();
    render(<InstanceDetailClient instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("test-instance")).toBeInTheDocument();
    });

    const configTab = screen.getByRole("tab", { name: "Config" });
    await user.click(configTab);

    // Save the config successfully first
    const saveBtn = screen.getByText("Save Config");
    await user.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText("Config saved")).toBeInTheDocument();
    });

    // Now edit to invalid JSON — the indicator must appear immediately
    const editor = await screen.findByRole("textbox", { name: /instance configuration/i });
    await user.clear(editor);
    await user.type(editor, "not valid json {{");

    await waitFor(() => {
      expect(screen.getByText("Invalid JSON")).toBeInTheDocument();
    });
  });

  it("rename cancel restores original name", async () => {
    const user = userEvent.setup();
    render(<InstanceDetailClient instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("test-instance")).toBeInTheDocument();
    });

    const renameBtn = screen.getByRole("button", { name: /rename/i });
    await user.click(renameBtn);

    const input = screen.getByDisplayValue("test-instance");
    await user.clear(input);
    await user.type(input, "something-else");

    await user.keyboard("{Escape}");

    expect(screen.getByText("test-instance")).toBeInTheDocument();
  });
});
