import { render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    fleet: {
      listInstances: {
        useQuery: vi.fn().mockReturnValue({
          data: {
            bots: [
              {
                id: "bot-1",
                name: "my-bot",
                state: "running",
                health: "healthy",
                uptime: null,
                stats: null,
              },
            ],
          },
          isLoading: false,
          error: null,
          refetch: vi.fn(),
          isFetching: false,
          dataUpdatedAt: Date.now(),
        }),
      },
    },
  },
}));

vi.mock("@/lib/api", () => ({
  mapBotStatusToFleetInstance: vi.fn(
    (bot: {
      id: string;
      name: string;
      state: string;
      health: string | null;
      uptime: string | null;
      stats: null;
    }) => ({
      id: bot.id,
      name: bot.name,
      status: bot.state === "running" ? "running" : "stopped",
      health: bot.health === "healthy" ? "healthy" : "degraded",
      uptime: null,
      pluginCount: 0,
      sessionCount: 0,
      provider: "",
    }),
  ),
  getImageStatus: vi.fn().mockResolvedValue({
    currentDigest: "sha256:aaa",
    latestDigest: "sha256:aaa",
    updateAvailable: false,
  }),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { variants, initial, animate, ...rest } = props;
      return <div {...rest}>{children}</div>;
    },
  },
}));

vi.mock("@/hooks/use-image-status", () => ({
  useImageStatus: vi.fn().mockReturnValue({ updateAvailable: false, error: null }),
}));

import { FleetHealth } from "@/components/observability/fleet-health";

describe("FleetHealth timestamp", () => {
  it("shows 'Updated just now' after data loads", async () => {
    render(<FleetHealth />);

    await waitFor(() => {
      expect(screen.getByText("my-bot")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText(/Updated just now/)).toBeInTheDocument();
    });
  });

  it("does not show timestamp during initial loading", async () => {
    const { trpc } = await import("@/lib/trpc");
    vi.mocked(trpc.fleet.listInstances.useQuery).mockReturnValueOnce({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
      dataUpdatedAt: 0,
    } as unknown as ReturnType<typeof trpc.fleet.listInstances.useQuery>);
    render(<FleetHealth />);
    expect(screen.queryByText(/Updated/)).not.toBeInTheDocument();
  });
});
