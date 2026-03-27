import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StorageTab } from "@/components/bot-settings/storage-tab";

vi.mock("@/lib/bot-settings-data", () => ({
  getStorageTier: vi.fn().mockResolvedValue({ tier: "standard" }),
  getStorageUsage: vi.fn().mockResolvedValue({
    usedBytes: 1_073_741_824,
    totalBytes: 5_368_709_120,
    availableBytes: 4_294_967_296,
  }),
  setStorageTier: vi.fn().mockResolvedValue({ tier: "plus" }),
}));

describe("StorageTab", () => {
  it("shows loading state initially", () => {
    render(<StorageTab botId="bot-1" />);
    expect(screen.getByText("Loading storage info...")).toBeInTheDocument();
  });

  it("renders used/total storage after loading", async () => {
    render(<StorageTab botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByText(/1\.0 GB of 5 GB/)).toBeInTheDocument();
    });
  });

  it("renders usage percentage", async () => {
    render(<StorageTab botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByText("20%")).toBeInTheDocument();
    });
  });

  it("renders all four storage tier cards", async () => {
    render(<StorageTab botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByText("Standard")).toBeInTheDocument();
    });
    expect(screen.getByText("Plus")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("Max")).toBeInTheDocument();
  });

  it("shows tier descriptions with GB amounts", async () => {
    render(<StorageTab botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByText(/5 GB — included with your bot/)).toBeInTheDocument();
    });
    expect(screen.getByText(/20 GB/)).toBeInTheDocument();
    expect(screen.getByText(/50 GB/)).toBeInTheDocument();
    expect(screen.getByText(/100 GB/)).toBeInTheDocument();
  });

  it("marks the current tier with a Current badge", async () => {
    render(<StorageTab botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByText("Current")).toBeInTheDocument();
    });
  });

  it("shows Included for standard tier and daily costs for paid tiers", async () => {
    render(<StorageTab botId="bot-1" />);
    await waitFor(() => {
      expect(screen.getByText("Included")).toBeInTheDocument();
    });
    expect(screen.getByText("+3¢ / day")).toBeInTheDocument();
    expect(screen.getByText("+8¢ / day")).toBeInTheDocument();
    expect(screen.getByText("+15¢ / day")).toBeInTheDocument();
  });

  it("shows billing explanation text", async () => {
    render(<StorageTab botId="bot-1" />);
    await waitFor(() => {
      expect(
        screen.getByText(/Storage costs are billed daily from your credit balance/),
      ).toBeInTheDocument();
    });
  });
});
