import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock framer-motion so CountUp animation resolves in tests.
// CountUp uses useMotionValue → useTransform → animate. The effects run in
// declaration order (animate effect first, then the rounded.on subscription).
// We defer the motion-value set via queueMicrotask so Effect 2 has time to
// register its listener before the value propagates.
vi.mock("framer-motion", () => {
  const React = require("react");

  function makeMotionValue(initial: number) {
    let current = initial;
    const listeners: Array<(v: number) => void> = [];
    return {
      get: () => current,
      set: (v: number) => {
        current = v;
        for (const l of listeners) l(v);
      },
      on: (_event: string, cb: (v: number) => void) => {
        listeners.push(cb);
        return () => {
          const i = listeners.indexOf(cb);
          if (i !== -1) listeners.splice(i, 1);
        };
      },
    };
  }

  return {
    motion: new Proxy(
      {},
      {
        get:
          (_target, tag: string) =>
          ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
            React.createElement(tag, props, children),
      },
    ),
    AnimatePresence: ({ children }: React.PropsWithChildren) => children,
    useMotionValue: makeMotionValue,
    useTransform: (mv: ReturnType<typeof makeMotionValue>, fn: (v: number) => number) => {
      const derived = makeMotionValue(fn(mv.get()));
      mv.on("change", (v) => derived.set(fn(v)));
      return derived;
    },
    // Defer the set so Effect 2 (rounded.on subscription) registers before propagation.
    animate: (mv: ReturnType<typeof makeMotionValue>, target: number) => {
      queueMicrotask(() => mv.set(target));
      return {
        stop: () => {
          /* no-op */
        },
      };
    },
  };
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      fleet: { listInstances: { invalidate: vi.fn() } },
    }),
    fleet: {
      listInstances: {
        useQuery: vi.fn().mockReturnValue({
          data: {
            bots: [
              {
                id: "inst-001",
                name: "prod-assistant",
                state: "running",
                health: "healthy",
                uptime: null,
                stats: null,
              },
              {
                id: "inst-002",
                name: "dev-bot",
                state: "stopped",
                health: "healthy",
                uptime: null,
                stats: null,
              },
              {
                id: "inst-003",
                name: "community-mod",
                state: "running",
                health: "degraded",
                uptime: null,
                stats: null,
              },
            ],
          },
          isLoading: false,
          error: null,
          dataUpdatedAt: Date.now(),
        }),
      },
    },
  },
}));

vi.mock("@/lib/api", () => ({
  mapBotStatusToFleetInstance: vi.fn(
    (bot: { id: string; name: string; state: string; health: string | null }) => ({
      id: bot.id,
      name: bot.name,
      status: bot.state === "running" ? "running" : "stopped",
      health: bot.health === "healthy" ? "healthy" : "degraded",
      uptime: bot.id === "inst-001" ? 86400 : null,
      pluginCount: bot.id === "inst-001" ? 2 : bot.id === "inst-002" ? 1 : 3,
      sessionCount: bot.id === "inst-001" ? 5 : 0,
      provider: bot.id === "inst-001" ? "anthropic" : "openai",
    }),
  ),
  getActivityFeed: vi.fn().mockResolvedValue([
    {
      id: "evt-1",
      timestamp: "2026-02-14T16:30:00Z",
      actor: "admin",
      action: "created instance",
      target: "prod-assistant",
      targetHref: "/instances/inst-001",
    },
    {
      id: "evt-2",
      timestamp: "2026-02-14T16:15:00Z",
      actor: "admin",
      action: "installed plugin",
      target: "memory v1.2.0",
      targetHref: "/plugins",
    },
  ]),
  getFleetResources: vi.fn().mockResolvedValue({
    totalCpuPercent: 35,
    totalMemoryMb: 768,
    memoryCapacityMb: 2048,
  }),
  getDividendStats: vi.fn().mockResolvedValue({
    poolCents: 50000,
    activeUsers: 120,
    perUserCents: 416,
    nextDistributionAt: "2026-03-03T00:00:00Z",
    userEligible: true,
    userLastPurchaseAt: "2026-03-01T12:00:00Z",
    userWindowExpiresAt: "2026-03-08T12:00:00Z",
  }),
}));

import { CommandCenter } from "../components/dashboard/command-center";

describe("CommandCenter", () => {
  it("renders the page heading", () => {
    render(<CommandCenter />);
    expect(screen.getByText("Command Center")).toBeInTheDocument();
    expect(screen.getByText("Fleet overview and quick actions")).toBeInTheDocument();
  });

  it("renders fleet summary cards with counts after loading", async () => {
    render(<CommandCenter />);

    await waitFor(() => {
      expect(screen.getByTestId("running-count")).toHaveTextContent("2");
    });
    expect(screen.getByTestId("stopped-count")).toHaveTextContent("1");
    expect(screen.getByTestId("degraded-count")).toHaveTextContent("1");
  });

  it("shows resource usage", async () => {
    render(<CommandCenter />);

    await waitFor(() => {
      expect(screen.getByTestId("cpu-usage")).not.toHaveTextContent("--");
    });
    expect(screen.getByTestId("memory-usage")).not.toHaveTextContent("--");
  });

  it("renders the activity feed", async () => {
    render(<CommandCenter />);
    await waitFor(() => {
      expect(screen.getByText("created instance")).toBeInTheDocument();
    });
    expect(screen.getByText("Recent Activity")).toBeInTheDocument();
    expect(screen.getByText("installed plugin")).toBeInTheDocument();
  });

  it("renders quick action buttons with correct links", () => {
    render(<CommandCenter />);

    const launchLink = screen.getByText("Add Another Platform").closest("a");
    expect(launchLink).toHaveAttribute("href", "/instances/new");

    const healthLink = screen.getByText("Fleet Health").closest("a");
    expect(healthLink).toHaveAttribute("href", "/fleet/health");

    const pluginsLink = screen.getByText("Manage Plugins").closest("a");
    expect(pluginsLink).toHaveAttribute("href", "/plugins");

    const billingLink = screen.getByText("Billing Overview").closest("a");
    expect(billingLink).toHaveAttribute("href", "/billing/usage");
  });

  it("activity feed items are clickable links", async () => {
    render(<CommandCenter />);
    await waitFor(() => {
      expect(screen.getByText("created instance")).toBeInTheDocument();
    });
    const activityLink = screen.getAllByText("prod-assistant")[0].closest("a");
    expect(activityLink).toHaveAttribute("href", "/instances/inst-001");
  });

  it("shows empty state when no activity", async () => {
    const { getActivityFeed } = await import("@/lib/api");
    (getActivityFeed as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    render(<CommandCenter />);
    await waitFor(() => {
      expect(screen.getByText(/STANDING BY/)).toBeInTheDocument();
    });
  });

  it("shows dividend stats when available", async () => {
    render(<CommandCenter />);

    await waitFor(() => {
      expect(screen.getByText("your daily share")).toBeInTheDocument();
    });
  });

  it("shows error banner when activity endpoint fails", async () => {
    const { getActivityFeed } = await import("@/lib/api");
    (getActivityFeed as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("Not found"));
    render(<CommandCenter />);
    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(screen.getByText(/Not found/)).toBeInTheDocument();
  });
});
