import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({
  listSnapshots: vi.fn(),
  createSnapshot: vi.fn(),
  restoreSnapshot: vi.fn(),
  deleteSnapshot: vi.fn(),
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/api-config", async () => {
  const actual = await vi.importActual("@/lib/api-config");
  return { ...actual };
});

vi.mock("@/lib/fetch-utils", () => ({
  handleUnauthorized: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {},
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { BackupsTab } from "@/components/bot-settings/backups-tab";
import { createSnapshot, deleteSnapshot, listSnapshots, restoreSnapshot } from "@/lib/api";

const mockListSnapshots = vi.mocked(listSnapshots);
const mockCreateSnapshot = vi.mocked(createSnapshot);
const mockRestoreSnapshot = vi.mocked(restoreSnapshot);
const mockDeleteSnapshot = vi.mocked(deleteSnapshot);

const MOCK_SNAPSHOTS = [
  {
    id: "snap-1",
    instanceId: "bot-1",
    name: "Before plugin install",
    type: "on-demand" as const,
    trigger: "manual" as const,
    sizeMb: 42,
    createdAt: "2026-02-20T10:00:00Z",
    expiresAt: null,
  },
  {
    id: "snap-2",
    instanceId: "bot-1",
    name: null,
    type: "nightly" as const,
    trigger: "scheduled" as const,
    sizeMb: 100,
    createdAt: "2026-02-19T03:00:00Z",
    expiresAt: 1740700800,
  },
  {
    id: "snap-3",
    instanceId: "bot-1",
    name: null,
    type: "pre-restore" as const,
    trigger: "manual" as const,
    sizeMb: 42,
    createdAt: "2026-02-18T12:00:00Z",
    expiresAt: null,
  },
];

describe("BackupsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state then renders snapshot list", async () => {
    mockListSnapshots.mockResolvedValueOnce(MOCK_SNAPSHOTS);
    render(<BackupsTab botId="bot-1" />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Before plugin install")).toBeInTheDocument();
    });
    expect(mockListSnapshots).toHaveBeenCalledWith("bot-1");
  });

  it("shows empty state when no snapshots", async () => {
    mockListSnapshots.mockResolvedValueOnce([]);
    render(<BackupsTab botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByText(/no backups yet/i)).toBeInTheDocument();
    });
  });

  it("shows snapshot type badges", async () => {
    mockListSnapshots.mockResolvedValueOnce(MOCK_SNAPSHOTS);
    render(<BackupsTab botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByText("Manual")).toBeInTheDocument();
      expect(screen.getByText("Nightly")).toBeInTheDocument();
      expect(screen.getByText("Auto (pre-restore)")).toBeInTheDocument();
    });
  });

  it("creates a snapshot with name", async () => {
    mockListSnapshots.mockResolvedValue([]);
    mockCreateSnapshot.mockResolvedValueOnce({
      snapshot: MOCK_SNAPSHOTS[0],
      estimatedMonthlyCost: "$0.01/month",
    });
    const user = userEvent.setup();
    render(<BackupsTab botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByText(/no backups yet/i)).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /create backup/i }));
    const input = screen.getByPlaceholderText(/backup name/i);
    await user.type(input, "My checkpoint");
    await user.click(screen.getByRole("button", { name: /^save$/i }));
    expect(mockCreateSnapshot).toHaveBeenCalledWith("bot-1", "My checkpoint");
  });

  it("shows restore confirmation dialog", async () => {
    mockListSnapshots.mockResolvedValueOnce(MOCK_SNAPSHOTS);
    const user = userEvent.setup();
    render(<BackupsTab botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByText("Before plugin install")).toBeInTheDocument();
    });
    const restoreButtons = screen.getAllByRole("button", {
      name: /restore/i,
    });
    await user.click(restoreButtons[0]);
    expect(screen.getByText(/are you sure/i)).toBeInTheDocument();
    expect(screen.getByText(/this will overwrite/i)).toBeInTheDocument();
  });

  it("restores a snapshot after confirmation", async () => {
    mockListSnapshots.mockResolvedValue(MOCK_SNAPSHOTS);
    mockRestoreSnapshot.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<BackupsTab botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByText("Before plugin install")).toBeInTheDocument();
    });
    const restoreButtons = screen.getAllByRole("button", {
      name: /restore/i,
    });
    await user.click(restoreButtons[0]);
    await user.click(screen.getByRole("button", { name: /^confirm restore$/i }));
    expect(mockRestoreSnapshot).toHaveBeenCalledWith("bot-1", "snap-1");
  });

  it("deletes a snapshot after confirmation", async () => {
    mockListSnapshots.mockResolvedValue(MOCK_SNAPSHOTS);
    mockDeleteSnapshot.mockResolvedValueOnce(undefined);
    const user = userEvent.setup();
    render(<BackupsTab botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByText("Before plugin install")).toBeInTheDocument();
    });
    const deleteButtons = screen.getAllByRole("button", {
      name: /delete/i,
    });
    await user.click(deleteButtons[0]);
    await user.click(screen.getByRole("button", { name: /^confirm delete$/i }));
    expect(mockDeleteSnapshot).toHaveBeenCalledWith("bot-1", "snap-1");
  });

  it("shows error when list fails", async () => {
    mockListSnapshots.mockRejectedValueOnce(new Error("Network error"));
    render(<BackupsTab botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("shows retry button in list area when error is set", async () => {
    mockListSnapshots.mockRejectedValueOnce(new Error("Network error"));
    render(<BackupsTab botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    });
  });

  it("retries load when retry button is clicked", async () => {
    mockListSnapshots
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(MOCK_SNAPSHOTS);
    const user = userEvent.setup();
    render(<BackupsTab botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => {
      expect(screen.getByText("Before plugin install")).toBeInTheDocument();
    });
  });

  it("does not dismiss dialog while async op is in progress", async () => {
    mockListSnapshots.mockResolvedValue(MOCK_SNAPSHOTS);
    let resolveDelete!: () => void;
    mockDeleteSnapshot.mockImplementationOnce(
      () =>
        new Promise<undefined>((res) => {
          resolveDelete = () => res(undefined);
        }),
    );
    const user = userEvent.setup();
    render(<BackupsTab botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByText("Before plugin install")).toBeInTheDocument();
    });
    const deleteButtons = screen.getAllByRole("button", { name: /delete/i });
    await user.click(deleteButtons[0]);
    await user.click(screen.getByRole("button", { name: /^confirm delete$/i }));
    // While deleting, the dialog should still be open (button changes to "Deleting...")
    expect(screen.getByRole("button", { name: /deleting/i })).toBeInTheDocument();
    resolveDelete();
  });
});
