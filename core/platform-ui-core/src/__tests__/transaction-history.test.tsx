import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreditHistoryResponse } from "@/lib/api";

const mockGetCreditHistory = vi.fn<(cursor?: string) => Promise<CreditHistoryResponse>>();

vi.mock("@/lib/api", () => ({
  getCreditHistory: (...args: unknown[]) => mockGetCreditHistory(args[0] as string | undefined),
}));

// Must import AFTER vi.mock
const { TransactionHistory } = await import("@/components/billing/transaction-history");

describe("TransactionHistory", () => {
  beforeEach(() => {
    mockGetCreditHistory.mockReset();
  });

  it("shows loading skeletons initially", () => {
    // Never resolve — keeps component in loading state
    // biome-ignore lint/suspicious/noEmptyBlockStatements: intentionally never-resolving promise for loading state test
    mockGetCreditHistory.mockReturnValue(new Promise(() => {}));
    render(<TransactionHistory />);
    expect(screen.getByText("Transaction History")).toBeInTheDocument();
    // 4 skeleton rows are rendered (no transaction text visible)
    expect(screen.queryByText("No transactions yet.")).toBeNull();
  });

  it("renders empty state when no transactions", async () => {
    mockGetCreditHistory.mockResolvedValue({ transactions: [], nextCursor: null });
    render(<TransactionHistory />);
    await waitFor(() => {
      expect(screen.getByText("No transactions yet.")).toBeInTheDocument();
    });
  });

  it("renders transaction descriptions", async () => {
    mockGetCreditHistory.mockResolvedValue({
      transactions: [
        {
          id: "tx-1",
          type: "purchase",
          description: "Credit top-up",
          amount: 25.0,
          createdAt: "2025-06-15T10:00:00Z",
        },
      ],
      nextCursor: null,
    });
    render(<TransactionHistory />);
    await waitFor(() => {
      expect(screen.getByText("Credit top-up")).toBeInTheDocument();
    });
  });

  it("renders positive amounts with + prefix and emerald color", async () => {
    mockGetCreditHistory.mockResolvedValue({
      transactions: [
        {
          id: "tx-1",
          type: "purchase",
          description: "Top-up",
          amount: 50.0,
          createdAt: "2025-06-15T10:00:00Z",
        },
      ],
      nextCursor: null,
    });
    render(<TransactionHistory />);
    await waitFor(() => {
      const amountEl = screen.getByText("+$50.00");
      expect(amountEl).toBeInTheDocument();
      expect(amountEl.className).toContain("text-emerald-500");
    });
  });

  it("renders negative amounts with - prefix and red color", async () => {
    mockGetCreditHistory.mockResolvedValue({
      transactions: [
        {
          id: "tx-1",
          type: "bot_runtime",
          description: "Bot usage",
          amount: -3.5,
          createdAt: "2025-06-15T10:00:00Z",
        },
      ],
      nextCursor: null,
    });
    render(<TransactionHistory />);
    await waitFor(() => {
      const amountEl = screen.getByText("-$3.50");
      expect(amountEl).toBeInTheDocument();
      expect(amountEl.className).toContain("text-red-500");
    });
  });

  it("renders correct type badge labels", async () => {
    mockGetCreditHistory.mockResolvedValue({
      transactions: [
        {
          id: "tx-1",
          type: "purchase",
          description: "a",
          amount: 10,
          createdAt: "2025-01-01T00:00:00Z",
        },
        {
          id: "tx-2",
          type: "signup_credit",
          description: "b",
          amount: 5,
          createdAt: "2025-01-01T00:00:00Z",
        },
        {
          id: "tx-3",
          type: "bot_runtime",
          description: "c",
          amount: -2,
          createdAt: "2025-01-01T00:00:00Z",
        },
        {
          id: "tx-4",
          type: "refund",
          description: "d",
          amount: 3,
          createdAt: "2025-01-01T00:00:00Z",
        },
        {
          id: "tx-5",
          type: "bonus",
          description: "e",
          amount: 1,
          createdAt: "2025-01-01T00:00:00Z",
        },
        {
          id: "tx-6",
          type: "adjustment",
          description: "f",
          amount: -1,
          createdAt: "2025-01-01T00:00:00Z",
        },
        {
          id: "tx-7",
          type: "community_dividend",
          description: "g",
          amount: 2,
          createdAt: "2025-01-01T00:00:00Z",
        },
      ],
      nextCursor: null,
    });
    render(<TransactionHistory />);
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
    mockGetCreditHistory.mockResolvedValue({
      transactions: [
        {
          id: "tx-1",
          type: "purchase",
          description: "Top-up",
          amount: 10,
          createdAt: "2025-06-15T10:00:00Z",
        },
      ],
      nextCursor: null,
    });
    render(<TransactionHistory />);
    await waitFor(() => {
      // toLocaleDateString("en-US", { month: "short", day: "numeric" }) → "Jun 15"
      expect(screen.getByText("Jun 15")).toBeInTheDocument();
    });
  });

  it("shows error state with retry button", async () => {
    mockGetCreditHistory.mockRejectedValue(new Error("Network error"));
    render(<TransactionHistory />);
    await waitFor(() => {
      expect(screen.getByText("Failed to load transactions.")).toBeInTheDocument();
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });
  });

  it("retries loading on retry button click", async () => {
    const user = userEvent.setup();
    // First call fails, second succeeds
    mockGetCreditHistory
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce({ transactions: [], nextCursor: null });

    render(<TransactionHistory />);
    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Retry"));
    await waitFor(() => {
      expect(screen.getByText("No transactions yet.")).toBeInTheDocument();
    });
    expect(mockGetCreditHistory).toHaveBeenCalledTimes(2);
  });

  it("shows 'Load more' button when cursor exists", async () => {
    mockGetCreditHistory.mockResolvedValue({
      transactions: [
        {
          id: "tx-1",
          type: "purchase",
          description: "Top-up",
          amount: 10,
          createdAt: "2025-01-01T00:00:00Z",
        },
      ],
      nextCursor: "next-page-cursor",
    });
    render(<TransactionHistory />);
    await waitFor(() => {
      expect(screen.getByText("Load more")).toBeInTheDocument();
    });
  });

  it("does not show 'Load more' when cursor is null", async () => {
    mockGetCreditHistory.mockResolvedValue({
      transactions: [
        {
          id: "tx-1",
          type: "purchase",
          description: "Top-up",
          amount: 10,
          createdAt: "2025-01-01T00:00:00Z",
        },
      ],
      nextCursor: null,
    });
    render(<TransactionHistory />);
    await waitFor(() => {
      expect(screen.getByText("Top-up")).toBeInTheDocument();
    });
    expect(screen.queryByText("Load more")).toBeNull();
  });

  it("loads more transactions on 'Load more' click", async () => {
    const user = userEvent.setup();
    mockGetCreditHistory
      .mockResolvedValueOnce({
        transactions: [
          {
            id: "tx-1",
            type: "purchase",
            description: "First batch",
            amount: 10,
            createdAt: "2025-01-01T00:00:00Z",
          },
        ],
        nextCursor: "cursor-2",
      })
      .mockResolvedValueOnce({
        transactions: [
          {
            id: "tx-2",
            type: "refund",
            description: "Second batch",
            amount: 5,
            createdAt: "2025-01-02T00:00:00Z",
          },
        ],
        nextCursor: null,
      });

    render(<TransactionHistory />);
    await waitFor(() => {
      expect(screen.getByText("First batch")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Load more"));
    await waitFor(() => {
      expect(screen.getByText("Second batch")).toBeInTheDocument();
    });
    // Both batches visible
    expect(screen.getByText("First batch")).toBeInTheDocument();
    // Cursor was passed to second call
    expect(mockGetCreditHistory).toHaveBeenCalledWith("cursor-2");
  });

  it("shows inline error when load-more fails but keeps existing transactions", async () => {
    const user = userEvent.setup();
    mockGetCreditHistory
      .mockResolvedValueOnce({
        transactions: [
          {
            id: "tx-1",
            type: "purchase",
            description: "Existing",
            amount: 10,
            createdAt: "2025-01-01T00:00:00Z",
          },
        ],
        nextCursor: "cursor-2",
      })
      .mockRejectedValueOnce(new Error("fail"));

    render(<TransactionHistory />);
    await waitFor(() => {
      expect(screen.getByText("Existing")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Load more"));
    await waitFor(() => {
      expect(screen.getByText("Failed to load more transactions.")).toBeInTheDocument();
    });
    // Original transaction still visible
    expect(screen.getByText("Existing")).toBeInTheDocument();
  });
});
