import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub fetch globally before any module imports
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("@/lib/api-config", () => ({
  API_BASE_URL: "http://test:3001/api",
  PLATFORM_BASE_URL: "http://test:3001",
}));

describe("DividendStats", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.resetModules();
  });

  it("renders fallback dashes when API returns non-ok response (no error message shown)", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.resolve({}),
    });

    const { DividendStats } = await import("@/components/pricing/dividend-stats");
    render(<DividendStats />);

    // Wait for fetch to complete (loaded=true), then verify fallback dashes
    await waitFor(() => {
      expect(screen.getByTestId("pool-amount")).toHaveTextContent("--");
    });
    expect(screen.getByTestId("active-users")).toHaveTextContent("--");
    expect(screen.getByTestId("projected-dividend")).toHaveTextContent("--");
    // fetchDividendStats returns null (no throw) → .catch() never runs → no red error paragraph
    expect(screen.queryByText(/failed to load/i)).not.toBeInTheDocument();
  });

  it("renders live data when API succeeds", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          poolAmountDollars: 2500.0,
          activeUsers: 8000,
          projectedDailyDividend: 0.31,
        }),
    });

    const { DividendStats } = await import("@/components/pricing/dividend-stats");
    render(<DividendStats />);

    // useCountUp with prefers-reduced-motion: true sets value immediately
    await waitFor(() => {
      expect(screen.getByTestId("pool-amount")).toHaveTextContent("$2500.00");
    });
    expect(screen.getByTestId("active-users")).toHaveTextContent("8,000");
    expect(screen.getByTestId("projected-dividend")).toHaveTextContent("~$0.31");
  });

  it("renders fallback dashes when fetch rejects (network error)", async () => {
    mockFetch.mockRejectedValue(new Error("Network failure"));

    const { DividendStats } = await import("@/components/pricing/dividend-stats");
    render(<DividendStats />);

    // Wait for fetch to complete, then verify fallback dashes
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    // fetchDividendStats catches network errors and returns null → component shows "--"
    await waitFor(() => {
      expect(screen.getByTestId("pool-amount")).toHaveTextContent("--");
    });
    expect(screen.getByTestId("active-users")).toHaveTextContent("--");
    expect(screen.getByTestId("projected-dividend")).toHaveTextContent("--");
  });

  it("renders error message when fetchDividendStats throws", async () => {
    // To hit the component's .catch() branch, mock the API module directly
    // so fetchDividendStats rejects instead of catching internally
    vi.doMock("@/lib/api", async (importOriginal) => {
      const orig = await importOriginal<typeof import("@/lib/api")>();
      return {
        ...orig,
        fetchDividendStats: vi.fn().mockRejectedValue(new Error("Unexpected failure")),
      };
    });

    const { DividendStats } = await import("@/components/pricing/dividend-stats");
    render(<DividendStats />);

    await waitFor(() => {
      expect(screen.getByText("Unexpected failure")).toBeInTheDocument();
    });
    // Error text should be red
    expect(screen.getByText("Unexpected failure")).toHaveClass("text-red-500");
    // Data fields should show "--" (never populated)
    expect(screen.getByTestId("pool-amount")).toHaveTextContent("--");
    expect(screen.getByTestId("active-users")).toHaveTextContent("--");
    expect(screen.getByTestId("projected-dividend")).toHaveTextContent("--");

    vi.unmock("@/lib/api"); // clean up factory registration so future tests are unaffected
  });
});
