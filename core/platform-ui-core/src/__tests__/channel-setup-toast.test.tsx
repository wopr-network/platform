import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock sonner
vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("botId=bot-1"),
}));

// Mock getManifest to reject
vi.mock("@/lib/mock-manifests", () => ({
  getManifest: vi.fn().mockRejectedValue(new Error("network failure")),
}));

// Mock connectChannel
vi.mock("@/lib/api", () => ({
  apiFetch: vi.fn(),
  connectChannel: vi.fn(),
}));

import ChannelSetupPage from "@/app/channels/setup/[plugin]/page";

function Wrapper() {
  return (
    <Suspense fallback={<div>loading</div>}>
      <ChannelSetupPage params={Promise.resolve({ plugin: "discord" })} />
    </Suspense>
  );
}

describe("ChannelSetupPage manifest load error", () => {
  afterEach(() => cleanup());

  it("shows toast.error when manifest fails to load", async () => {
    await act(async () => {
      render(<Wrapper />);
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to load channel setup. Please try again.");
    });
  });

  it("still renders inline error UI", async () => {
    await act(async () => {
      render(<Wrapper />);
    });

    await waitFor(() => {
      expect(screen.getByText("LOAD ERROR")).toBeInTheDocument();
    });
  });
});
