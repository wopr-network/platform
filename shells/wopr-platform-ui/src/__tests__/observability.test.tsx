import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Polyfill ResizeObserver for Radix Select (LogsViewer uses Select component)
if (typeof globalThis.ResizeObserver === "undefined") {
  class MockResizeObserver {
    observe() {
      /* no-op stub */
    }
    unobserve() {
      /* no-op stub */
    }
    disconnect() {
      /* no-op stub */
    }
  }
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
}

// Mock recharts to avoid canvas/SVG issues in jsdom
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  BarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="bar-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  Bar: () => <div data-testid="bar" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
}));

// Mock @core/lib/api (the actual API module) — mocked at the @core/ path
// because that's the alias path used in tests. The real module at @/ is
// identical due to the alias; mocking @core/ covers both.
vi.mock("@core/lib/api", () => ({
  getInstanceLogs: vi.fn(),
  getInstanceMetrics: vi.fn(),
}));

// Mock lucide-react icons used by the observability components
vi.mock("lucide-react", () => ({
  AlertTriangleIcon: () => <span data-testid="alert-icon" />,
  RefreshCw: () => <span data-testid="refresh-icon" />,
}));

// Mock the internal @core UI components so logs-viewer.tsx and
// metrics-dashboard.tsx can be imported without @/ alias issues.
// The Skeleton mock exposes data-testid="skeleton" for stable querying.
vi.mock("@core/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => <div data-testid="skeleton" className={className} />,
}));

vi.mock("@core/components/ui/button", () => ({
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@core/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@core/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock("@core/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-value={value}>{children}</div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

vi.mock("@core/lib/utils", () => ({
  cn: (...args: string[]) => args.filter(Boolean).join(" "),
}));

import { LogsViewer } from "@core/components/observability/logs-viewer";
import { MetricsDashboard } from "@core/components/observability/metrics-dashboard";
import { getInstanceLogs, getInstanceMetrics } from "@core/lib/api";

describe("LogsViewer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows loading skeleton before logs arrive", async () => {
    // Never resolve — keeps the component permanently in loading state
    vi.mocked(getInstanceLogs).mockReturnValue(
      new Promise((_resolve) => {
        /* never resolves — holds component in loading state */
      }),
    );

    render(<LogsViewer instanceId="inst-001" />);

    await waitFor(() => {
      // Loading skeleton: bg-zinc-950 container with 12 Skeleton elements
      const skeletons = screen.getAllByTestId("skeleton");
      expect(skeletons.length).toBe(12);
    });
  });

  it("shows empty state when API returns no logs", async () => {
    vi.mocked(getInstanceLogs).mockResolvedValue([]);

    render(<LogsViewer instanceId="inst-001" />);

    await waitFor(() => {
      expect(screen.queryByText("No logs match the current filters.")).not.toBeNull();
      expect(screen.queryByText("Try broadening your search or changing the level filter.")).not.toBeNull();
      // Entry count shows 0 entries
      expect(screen.queryByText("(0 entries)")).not.toBeNull();
    });
  });
});

describe("MetricsDashboard", () => {
  it("shows loading skeleton before metrics arrive", async () => {
    // Never resolve — keeps the component permanently in loading state
    vi.mocked(getInstanceMetrics).mockReturnValue(
      new Promise((_resolve) => {
        /* never resolves — holds component in loading state */
      }),
    );

    render(<MetricsDashboard instanceId="inst-001" />);

    await waitFor(() => {
      // Loading skeleton: 4 cards, each with title (h-4 w-24) and chart (h-32 w-full)
      const skeletons = screen.getAllByTestId("skeleton");
      expect(skeletons.length).toBe(8);
    });
  });
});
