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
    latestDigest: "sha256:bbb",
    updateAvailable: true,
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

import { FleetHealth } from "@/components/observability/fleet-health";

describe("FleetHealth update indicator", () => {
  it("shows UPD indicator on card when update is available", async () => {
    render(<FleetHealth />);

    await waitFor(() => {
      expect(screen.getByText("my-bot")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("UPD")).toBeInTheDocument();
    });
  });
});
