import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/api", () => ({
  fetchPlatformHealth: vi.fn(),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => {
      const { initial: _i, animate: _a, variants: _v, whileHover: _w, ...rest } = props;
      return <div {...rest}>{children}</div>;
    },
  },
}));

import { StatusPage } from "../components/status/status-page";
import { fetchPlatformHealth } from "../lib/api";

const mockFetch = fetchPlatformHealth as ReturnType<typeof vi.fn>;

describe("StatusPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows loading skeleton initially", () => {
    mockFetch.mockReturnValue(
      new Promise(() => {
        /* never resolves — keep loading state for test */
      }),
    );
    render(<StatusPage />);
    expect(screen.getByText("Platform Status")).toBeInTheDocument();
  });

  it("shows all systems operational when healthy", async () => {
    vi.useRealTimers();
    mockFetch.mockResolvedValue({
      status: "healthy",
      services: [
        { name: "database", status: "healthy", latencyMs: 2 },
        { name: "redis", status: "healthy", latencyMs: 1 },
      ],
      version: "1.0.0",
      uptime: 86400,
    });
    render(<StatusPage />);
    await waitFor(() => {
      expect(screen.getByText(/ALL SYSTEMS OPERATIONAL/)).toBeInTheDocument();
    });
    expect(screen.getByText("database")).toBeInTheDocument();
    expect(screen.getByText("redis")).toBeInTheDocument();
  });

  it("shows degraded banner when status is degraded", async () => {
    vi.useRealTimers();
    mockFetch.mockResolvedValue({
      status: "degraded",
      services: [
        { name: "database", status: "healthy", latencyMs: 2 },
        { name: "redis", status: "degraded", latencyMs: 150 },
      ],
      version: "1.0.0",
      uptime: 86400,
    });
    render(<StatusPage />);
    await waitFor(() => {
      expect(screen.getByText(/PARTIAL DEGRADATION/)).toBeInTheDocument();
    });
  });

  it("shows error state when fetch fails", async () => {
    vi.useRealTimers();
    mockFetch.mockResolvedValue(null);
    render(<StatusPage />);
    await waitFor(() => {
      expect(screen.getByText(/Unable to reach/)).toBeInTheDocument();
    });
  });
});
