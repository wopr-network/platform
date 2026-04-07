import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { trpcVanillaProxy } from "./setup.js";

// Mock tRPC hook return value
const mockUseQuery = vi.fn();
const mockRefetch = vi.fn();

vi.mock("@/lib/trpc", () => ({
  trpc: {
    billing: {
      creditsDailySummary: {
        useQuery: (...args: unknown[]) => mockUseQuery(...args),
      },
    },
  },
  trpcVanilla: trpcVanillaProxy,
}));

// Must import AFTER vi.mock
const { TransactionHistory } = await import("@/components/billing/transaction-history");

const NANO = 1_000_000_000;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("TransactionHistory", () => {
  beforeEach(() => {
    mockUseQuery.mockReset();
    mockRefetch.mockReset();
  });

  it("shows loading skeletons initially", () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: mockRefetch,
    });
    render(<TransactionHistory />, { wrapper: createWrapper() });
    expect(screen.getByText("Transaction History")).toBeInTheDocument();
    expect(screen.queryByText("No transactions yet.")).toBeNull();
  });

  it("renders empty state when no transactions", async () => {
    mockUseQuery.mockReturnValue({
      data: { rows: [] },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    render(<TransactionHistory />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText("No transactions yet.")).toBeInTheDocument();
    });
  });

  it("renders transaction descriptions", async () => {
    mockUseQuery.mockReturnValue({
      data: {
        rows: [
          {
            id: "tx-1",
            entryType: "purchase",
            description: "Credit top-up",
            signedAmountNano: 25 * NANO,
            entryCount: 1,
            postedAt: "2025-06-15T10:00:00Z",
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    render(<TransactionHistory />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText("Credit top-up")).toBeInTheDocument();
    });
  });

  it("renders positive amounts with + prefix and emerald color", async () => {
    mockUseQuery.mockReturnValue({
      data: {
        rows: [
          {
            id: "tx-1",
            entryType: "purchase",
            description: "Top-up",
            signedAmountNano: 50 * NANO,
            entryCount: 1,
            postedAt: "2025-06-15T10:00:00Z",
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    render(<TransactionHistory />, { wrapper: createWrapper() });
    await waitFor(() => {
      const amountEl = screen.getByText("+$50.00");
      expect(amountEl).toBeInTheDocument();
      expect(amountEl.className).toContain("text-emerald-500");
    });
  });

  it("renders negative amounts with - prefix and red color", async () => {
    mockUseQuery.mockReturnValue({
      data: {
        rows: [
          {
            id: "tx-1",
            entryType: "bot_runtime",
            description: "Bot usage",
            signedAmountNano: -3.5 * NANO,
            entryCount: 1,
            postedAt: "2025-06-15T10:00:00Z",
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    render(<TransactionHistory />, { wrapper: createWrapper() });
    await waitFor(() => {
      const amountEl = screen.getByText("-$3.50");
      expect(amountEl).toBeInTheDocument();
      expect(amountEl.className).toContain("text-red-500");
    });
  });

  it("renders correct type badge labels", async () => {
    mockUseQuery.mockReturnValue({
      data: {
        rows: [
          {
            id: "tx-1",
            entryType: "purchase",
            description: "a",
            signedAmountNano: 10 * NANO,
            entryCount: 1,
            postedAt: "2025-01-01T00:00:00Z",
          },
          {
            id: "tx-2",
            entryType: "signup_credit",
            description: "b",
            signedAmountNano: 5 * NANO,
            entryCount: 1,
            postedAt: "2025-01-01T00:00:00Z",
          },
          {
            id: "tx-3",
            entryType: "bot_runtime",
            description: "c",
            signedAmountNano: -2 * NANO,
            entryCount: 1,
            postedAt: "2025-01-01T00:00:00Z",
          },
          {
            id: "tx-4",
            entryType: "refund",
            description: "d",
            signedAmountNano: 3 * NANO,
            entryCount: 1,
            postedAt: "2025-01-01T00:00:00Z",
          },
          {
            id: "tx-5",
            entryType: "bonus",
            description: "e",
            signedAmountNano: 1 * NANO,
            entryCount: 1,
            postedAt: "2025-01-01T00:00:00Z",
          },
          {
            id: "tx-6",
            entryType: "adjustment",
            description: "f",
            signedAmountNano: -1 * NANO,
            entryCount: 1,
            postedAt: "2025-01-01T00:00:00Z",
          },
          {
            id: "tx-7",
            entryType: "community_dividend",
            description: "g",
            signedAmountNano: 2 * NANO,
            entryCount: 1,
            postedAt: "2025-01-01T00:00:00Z",
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    render(<TransactionHistory />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText("Purchase")).toBeInTheDocument();
      expect(screen.getByText("Signup credit")).toBeInTheDocument();
      expect(screen.getByText("Bot runtime")).toBeInTheDocument();
      expect(screen.getByText("Refund")).toBeInTheDocument();
      expect(screen.getByText("Bonus")).toBeInTheDocument();
      expect(screen.getByText("Adjustment")).toBeInTheDocument();
      expect(screen.getByText("Dividend")).toBeInTheDocument();
    });
  });

  it("renders formatted dates", async () => {
    mockUseQuery.mockReturnValue({
      data: {
        rows: [
          {
            id: "tx-1",
            entryType: "purchase",
            description: "Top-up",
            signedAmountNano: 10 * NANO,
            entryCount: 1,
            postedAt: "2025-06-15T10:00:00Z",
          },
        ],
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });
    render(<TransactionHistory />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText("Jun 15")).toBeInTheDocument();
    });
  });

  it("shows error state with retry button", async () => {
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("Network error"),
      refetch: mockRefetch,
    });
    render(<TransactionHistory />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText("Failed to load transactions.")).toBeInTheDocument();
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
  });

  it("retries loading on retry button click", async () => {
    const user = userEvent.setup();
    mockUseQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("fail"),
      refetch: mockRefetch,
    });

    render(<TransactionHistory />, { wrapper: createWrapper() });
    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Retry"));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});
