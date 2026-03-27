import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VpsInfoPanel } from "@/components/bot-settings/vps-info-panel";

const mockGetVpsInfo = vi.fn();

vi.mock("@/lib/api", () => ({
  getVpsInfo: (...args: unknown[]) => mockGetVpsInfo(...args),
}));

describe("VpsInfoPanel", () => {
  it("renders nothing when VPS info is null (no VPS)", async () => {
    mockGetVpsInfo.mockResolvedValue(null);
    const { container } = render(<VpsInfoPanel botId="bot-1" />);
    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("renders VPS details when active", async () => {
    mockGetVpsInfo.mockResolvedValue({
      botId: "bot-1",
      status: "active",
      hostname: "bot-1.platform.vps",
      sshConnectionString: "ssh platform@bot-1.platform.vps",
      diskSizeGb: 20,
      createdAt: "2026-01-15T00:00:00Z",
    });
    render(<VpsInfoPanel botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByText("VPS")).toBeInTheDocument();
    });
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("bot-1.platform.vps")).toBeInTheDocument();
    expect(screen.getByText("20 GB SSD")).toBeInTheDocument();
    expect(screen.getByText("2 GB RAM / 2 vCPU")).toBeInTheDocument();
    expect(screen.getByText("ssh platform@bot-1.platform.vps")).toBeInTheDocument();
  });

  it("shows Active since date", async () => {
    mockGetVpsInfo.mockResolvedValue({
      botId: "bot-1",
      status: "active",
      hostname: "bot-1.platform.vps",
      sshConnectionString: null,
      diskSizeGb: 20,
      createdAt: "2026-01-15T00:00:00Z",
    });
    render(<VpsInfoPanel botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByText("Active since")).toBeInTheDocument();
    });
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("shows SSH provisioning message when no connection string on active VPS", async () => {
    mockGetVpsInfo.mockResolvedValue({
      botId: "bot-1",
      status: "active",
      hostname: "bot-1.platform.vps",
      sshConnectionString: null,
      diskSizeGb: 20,
      createdAt: "2026-01-15T00:00:00Z",
    });
    render(<VpsInfoPanel botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByText(/SSH access is being provisioned/)).toBeInTheDocument();
    });
  });

  it("shows Canceling badge for canceling status", async () => {
    mockGetVpsInfo.mockResolvedValue({
      botId: "bot-1",
      status: "canceling",
      hostname: "bot-1.platform.vps",
      sshConnectionString: null,
      diskSizeGb: 20,
      createdAt: "2026-01-15T00:00:00Z",
    });
    render(<VpsInfoPanel botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByText("Canceling")).toBeInTheDocument();
    });
  });

  it("renders error message when getVpsInfo rejects", async () => {
    mockGetVpsInfo.mockRejectedValue(new Error("Network error"));
    render(<VpsInfoPanel botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load VPS info/i)).toBeInTheDocument();
    });
  });

  it("shows Canceled badge for canceled status", async () => {
    mockGetVpsInfo.mockResolvedValue({
      botId: "bot-1",
      status: "canceled",
      hostname: null,
      sshConnectionString: null,
      diskSizeGb: 20,
      createdAt: "2026-01-15T00:00:00Z",
    });
    render(<VpsInfoPanel botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByText("Canceled")).toBeInTheDocument();
    });
  });
});
