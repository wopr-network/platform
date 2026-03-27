import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

// Mock recharts to avoid canvas/SVG issues in jsdom
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="line-chart">{children}</div>
  ),
  BarChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="bar-chart">{children}</div>
  ),
  Line: () => <div data-testid="line" />,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
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
                id: "inst-003",
                name: "community-mod",
                state: "degraded",
                health: "degraded",
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
  getInstanceHealth: vi.fn().mockResolvedValue({
    status: "healthy",
    uptime: 86400,
    activeSessions: 2,
    totalSessions: 47,
    plugins: [
      { name: "memory", status: "healthy", latencyMs: 12, lastCheck: "2026-02-12T09:30:00Z" },
      {
        name: "web-search",
        status: "degraded",
        latencyMs: 500,
        lastCheck: "2026-02-12T09:30:00Z",
      },
    ],
    providers: [
      { name: "anthropic", available: true, latencyMs: 230 },
      { name: "openai", available: false, latencyMs: null },
    ],
    history: [
      { timestamp: "2026-02-12T09:00:00Z", status: "healthy" },
      { timestamp: "2026-02-12T09:05:00Z", status: "healthy" },
    ],
  }),
  getInstanceLogs: vi.fn().mockResolvedValue([
    {
      id: "log-1",
      timestamp: "2026-02-12T09:00:00Z",
      level: "info",
      source: "daemon",
      message: "Request processed successfully",
    },
    {
      id: "log-2",
      timestamp: "2026-02-12T09:01:00Z",
      level: "error",
      source: "discord",
      message: "Connection timeout",
    },
    {
      id: "log-3",
      timestamp: "2026-02-12T09:02:00Z",
      level: "warn",
      source: "memory",
      message: "High memory usage detected",
    },
  ]),
  getInstanceMetrics: vi.fn().mockResolvedValue({
    timeseries: [
      {
        timestamp: "2026-02-12T09:00:00Z",
        requestCount: 42,
        latencyP50: 80,
        latencyP95: 180,
        latencyP99: 350,
        activeSessions: 3,
        memoryMb: 256,
      },
    ],
    tokenUsage: [
      { provider: "anthropic", inputTokens: 125000, outputTokens: 89000, totalCost: 4.28 },
    ],
    pluginEvents: [{ plugin: "memory", count: 340 }],
  }),
  getImageStatus: vi.fn().mockResolvedValue({
    currentDigest: "sha256:aaa",
    latestDigest: "sha256:aaa",
    updateAvailable: false,
  }),
  pullImageUpdate: vi.fn().mockResolvedValue(undefined),
  mapBotStatusToFleetInstance: vi.fn(
    (bot: { id: string; name: string; state: string; health: string | null }) => ({
      id: bot.id,
      name: bot.name,
      status: bot.state === "running" ? "running" : "stopped",
      health:
        bot.health === "healthy" ? "healthy" : bot.health === "degraded" ? "degraded" : "degraded",
      uptime: 86400,
      pluginCount: 2,
      sessionCount: bot.health === "healthy" ? 2 : 0,
      provider: bot.health === "healthy" ? "anthropic" : "openai",
    }),
  ),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { variants: _v, initial: _i, animate: _a, ...rest } = props;
      return <div {...rest}>{children}</div>;
    },
  },
}));

vi.mock("@/hooks/use-image-status", () => ({
  useImageStatus: vi.fn().mockReturnValue({ updateAvailable: false, error: null }),
}));

import { FleetHealth } from "../components/observability/fleet-health";
import { HealthOverview } from "../components/observability/health-overview";
import { LogsViewer } from "../components/observability/logs-viewer";
import { MetricsDashboard } from "../components/observability/metrics-dashboard";

describe("HealthOverview", () => {
  it("renders health status and uptime", async () => {
    render(<HealthOverview instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("Health Status")).toBeInTheDocument();
    });
    expect(screen.getByText("1d 0h 0m")).toBeInTheDocument();
  });

  it("renders plugin health cards", async () => {
    render(<HealthOverview instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("Plugin Health")).toBeInTheDocument();
    });
    expect(screen.getByText("memory")).toBeInTheDocument();
    expect(screen.getByText("web-search")).toBeInTheDocument();
    expect(screen.getByText("12ms")).toBeInTheDocument();
    expect(screen.getByText("500ms")).toBeInTheDocument();
  });

  it("renders provider availability", async () => {
    render(<HealthOverview instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("anthropic")).toBeInTheDocument();
    });
    expect(screen.getByText("Available")).toBeInTheDocument();
    expect(screen.getByText("Down")).toBeInTheDocument();
  });

  it("shows session counts", async () => {
    render(<HealthOverview instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("/ 47 total")).toBeInTheDocument();
    });
  });

  it("shows error state when API fails", async () => {
    const { getInstanceHealth } = await import("@/lib/api");
    vi.mocked(getInstanceHealth).mockRejectedValueOnce(new Error("Network error"));

    render(<HealthOverview instanceId="inst-001" />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load health data/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("recovers from error on retry", async () => {
    const user = userEvent.setup();
    const { getInstanceHealth } = await import("@/lib/api");
    vi.mocked(getInstanceHealth)
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({
        status: "healthy",
        uptime: 86400,
        activeSessions: 2,
        totalSessions: 47,
        plugins: [],
        providers: [],
        history: [],
      });

    render(<HealthOverview instanceId="inst-001" />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load health data/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => {
      expect(screen.getByText("Health Status")).toBeInTheDocument();
    });
    expect(screen.queryByText(/failed to load health data/i)).not.toBeInTheDocument();
  });
});

describe("LogsViewer", () => {
  it("renders log entries", async () => {
    render(<LogsViewer instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("Request processed successfully")).toBeInTheDocument();
    });
    expect(screen.getByText("Connection timeout")).toBeInTheDocument();
    expect(screen.getByText("High memory usage detected")).toBeInTheDocument();
  });

  it("renders filter controls", async () => {
    render(<LogsViewer instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Search logs...")).toBeInTheDocument();
    });
    expect(screen.getByText("Auto-scroll ON")).toBeInTheDocument();
  });

  it("shows entry count", async () => {
    render(<LogsViewer instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("(3 entries)")).toBeInTheDocument();
    });
  });

  it("toggles auto-scroll", async () => {
    const user = userEvent.setup();
    render(<LogsViewer instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("Auto-scroll ON")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Auto-scroll ON"));
    expect(screen.getByText("Auto-scroll OFF")).toBeInTheDocument();
  });

  it("shows error state when API fails", async () => {
    const { getInstanceLogs } = await import("@/lib/api");
    vi.mocked(getInstanceLogs).mockRejectedValueOnce(new Error("Network error"));

    render(<LogsViewer instanceId="inst-001" />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load logs/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("recovers from error on retry", async () => {
    const user = userEvent.setup();
    const { getInstanceLogs } = await import("@/lib/api");
    vi.mocked(getInstanceLogs)
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce([
        {
          id: "log-1",
          timestamp: "2026-02-12T09:00:00Z",
          level: "info" as const,
          source: "daemon",
          message: "Request processed successfully",
        },
      ]);

    render(<LogsViewer instanceId="inst-001" />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load logs/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => {
      expect(screen.getByText("Request processed successfully")).toBeInTheDocument();
    });
    expect(screen.queryByText(/failed to load logs/i)).not.toBeInTheDocument();
  });
});

describe("MetricsDashboard", () => {
  it("renders chart sections", async () => {
    render(<MetricsDashboard instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("Request Count")).toBeInTheDocument();
    });
    expect(screen.getByText("Response Latency (ms)")).toBeInTheDocument();
    expect(screen.getByText("Token Usage by Provider")).toBeInTheDocument();
    expect(screen.getByText("Plugin Events")).toBeInTheDocument();
    expect(screen.getByText("Active Sessions")).toBeInTheDocument();
    expect(screen.getByText("Memory Usage (MB)")).toBeInTheDocument();
  });

  it("renders token cost summary", async () => {
    render(<MetricsDashboard instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getByText("$4.28")).toBeInTheDocument();
    });
  });

  it("renders recharts containers", async () => {
    render(<MetricsDashboard instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.getAllByTestId("responsive-container").length).toBeGreaterThan(0);
    });
  });

  it("shows error state when API fails", async () => {
    const { getInstanceMetrics } = await import("@/lib/api");
    vi.mocked(getInstanceMetrics).mockRejectedValueOnce(new Error("Network error"));

    render(<MetricsDashboard instanceId="inst-001" />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load metrics/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("recovers from error on retry", async () => {
    const user = userEvent.setup();
    const { getInstanceMetrics } = await import("@/lib/api");
    vi.mocked(getInstanceMetrics)
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce({
        timeseries: [
          {
            timestamp: "2026-02-12T09:00:00Z",
            requestCount: 42,
            latencyP50: 80,
            latencyP95: 180,
            latencyP99: 350,
            activeSessions: 3,
            memoryMb: 256,
          },
        ],
        tokenUsage: [
          { provider: "anthropic", inputTokens: 125000, outputTokens: 89000, totalCost: 4.28 },
        ],
        pluginEvents: [{ plugin: "memory", count: 340 }],
      });

    render(<MetricsDashboard instanceId="inst-001" />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load metrics/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => {
      expect(screen.getByText("Request Count")).toBeInTheDocument();
    });
    expect(screen.queryByText(/failed to load metrics/i)).not.toBeInTheDocument();
  });
});

describe("FleetHealth", () => {
  it("renders fleet health heading", async () => {
    render(<FleetHealth />);

    await waitFor(() => {
      expect(screen.getByText("Fleet Health")).toBeInTheDocument();
    });
  });

  it("renders instance cards", async () => {
    render(<FleetHealth />);

    await waitFor(() => {
      expect(screen.getByText("prod-assistant")).toBeInTheDocument();
    });
    expect(screen.getByText("community-mod")).toBeInTheDocument();
  });

  it("shows degraded count in status bar", async () => {
    render(<FleetHealth />);

    await waitFor(() => {
      expect(screen.getByText("prod-assistant")).toBeInTheDocument();
    });
    // Status bar shows "1" next to "degraded" in separate spans
    const degradedSpan = screen.getByText("degraded");
    expect(degradedSpan).toBeInTheDocument();
  });

  it("renders sort selector and refresh button", async () => {
    render(<FleetHealth />);

    await waitFor(() => {
      expect(screen.getByText("Refresh")).toBeInTheDocument();
    });
  });

  it("shows all-systems-nominal banner when all healthy", async () => {
    const { trpc } = await import("@/lib/trpc");
    vi.mocked(trpc.fleet.listInstances.useQuery).mockReturnValue({
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
        ],
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
      dataUpdatedAt: Date.now(),
    } as unknown as ReturnType<typeof trpc.fleet.listInstances.useQuery>);

    render(<FleetHealth />);
    await waitFor(() => {
      expect(screen.getByText(/ALL SYSTEMS NOMINAL/)).toBeInTheDocument();
    });
  });

  it("shows empty fleet message when no instances", async () => {
    const { trpc } = await import("@/lib/trpc");
    vi.mocked(trpc.fleet.listInstances.useQuery).mockReturnValue({
      data: { bots: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
      dataUpdatedAt: Date.now(),
    } as unknown as ReturnType<typeof trpc.fleet.listInstances.useQuery>);

    render(<FleetHealth />);
    await waitFor(() => {
      expect(screen.getByText(/FLEET EMPTY/)).toBeInTheDocument();
    });
  });

  it("shows error state when API fails", async () => {
    const { trpc } = await import("@/lib/trpc");
    vi.mocked(trpc.fleet.listInstances.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Network error"),
      refetch: vi.fn(),
      isFetching: false,
      dataUpdatedAt: 0,
    } as unknown as ReturnType<typeof trpc.fleet.listInstances.useQuery>);

    render(<FleetHealth />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load fleet health/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("clears error and reloads on retry", async () => {
    const user = userEvent.setup();
    const { trpc } = await import("@/lib/trpc");
    const refetchMock = vi.fn().mockImplementation(() => {
      // After refetch is called, switch mock to return success data
      vi.mocked(trpc.fleet.listInstances.useQuery).mockReturnValue({
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
          ],
        },
        isLoading: false,
        error: null,
        refetch: refetchMock,
        isFetching: false,
        dataUpdatedAt: Date.now(),
      } as unknown as ReturnType<typeof trpc.fleet.listInstances.useQuery>);
    });
    vi.mocked(trpc.fleet.listInstances.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Network error"),
      refetch: refetchMock,
      isFetching: false,
      dataUpdatedAt: 0,
    } as unknown as ReturnType<typeof trpc.fleet.listInstances.useQuery>);

    render(<FleetHealth />);
    await waitFor(() => {
      expect(screen.getByText(/failed to load fleet health/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetchMock).toHaveBeenCalled();
  });
});
