import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AuditLogResponse } from "@/lib/api";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/settings/activity",
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: () => ({ data: null, isPending: false, error: null }),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  }),
}));

const MOCK_AUDIT_RESPONSE: AuditLogResponse = {
  events: [
    {
      id: "evt-1",
      action: "bot.create",
      resourceType: "bot",
      resourceId: "bot-123",
      resourceName: "My Bot",
      details: "Created from template",
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: "evt-2",
      action: "billing.credit_purchase",
      resourceType: "billing",
      resourceId: "txn-456",
      resourceName: null,
      details: "$10.00",
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
  ],
  total: 2,
  hasMore: false,
};

const EMPTY_RESPONSE: AuditLogResponse = {
  events: [],
  total: 0,
  hasMore: false,
};

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    fetchAuditLog: vi.fn(),
  };
});

import ActivityPage from "@/app/(dashboard)/settings/activity/page";
import { fetchAuditLog } from "@/lib/api";

const mockFetchAuditLog = vi.mocked(fetchAuditLog);

describe("ActivityPage", () => {
  it("renders audit events in a table", async () => {
    mockFetchAuditLog.mockResolvedValueOnce(MOCK_AUDIT_RESPONSE);
    render(<ActivityPage />);

    expect(await screen.findByText("Bot Create")).toBeInTheDocument();
    expect(screen.getByText("My Bot")).toBeInTheDocument();
    expect(screen.getByText("Created from template")).toBeInTheDocument();
    expect(screen.getByText("Billing Credit Purchase")).toBeInTheDocument();
    expect(screen.getByText("$10.00")).toBeInTheDocument();
    expect(screen.getByText("2 total events")).toBeInTheDocument();
  });

  it("shows empty state when no events", async () => {
    mockFetchAuditLog.mockResolvedValueOnce(EMPTY_RESPONSE);
    render(<ActivityPage />);

    expect(await screen.findByText("No activity yet.")).toBeInTheDocument();
  });

  it("shows error state with retry button", async () => {
    mockFetchAuditLog.mockRejectedValueOnce(new Error("Network error"));
    render(<ActivityPage />);

    expect(await screen.findByText("Failed to load activity log.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows loading skeletons initially", () => {
    mockFetchAuditLog.mockReturnValue(
      new Promise(() => {
        /* never resolves — keep loading state for test */
      }),
    );
    render(<ActivityPage />);

    expect(screen.queryByText("Action")).not.toBeInTheDocument();
  });

  it("sends search param to fetchAuditLog after debounce", async () => {
    mockFetchAuditLog.mockResolvedValueOnce(MOCK_AUDIT_RESPONSE);
    const user = userEvent.setup();
    render(<ActivityPage />);

    await screen.findByText("Bot Create");

    mockFetchAuditLog.mockResolvedValueOnce({
      events: [MOCK_AUDIT_RESPONSE.events[1]],
      total: 1,
      hasMore: false,
    });

    const searchInput = screen.getByPlaceholderText("Search...");
    await user.type(searchInput, "billing");

    // Wait for debounce (300ms) + API call
    await vi.waitFor(
      () => {
        expect(mockFetchAuditLog).toHaveBeenLastCalledWith(
          expect.objectContaining({ search: "billing", offset: 0 }),
        );
      },
      { timeout: 1000 },
    );
  });

  it("shows pagination when total exceeds page size", async () => {
    mockFetchAuditLog.mockResolvedValueOnce({
      events: MOCK_AUDIT_RESPONSE.events,
      total: 100,
      hasMore: true,
    });
    render(<ActivityPage />);

    await screen.findByText("Bot Create");
    expect(screen.getByText(/Showing 1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("page 2 requests offset 50 (not 100)", async () => {
    mockFetchAuditLog.mockResolvedValueOnce({
      events: MOCK_AUDIT_RESPONSE.events,
      total: 100,
      hasMore: true,
    });
    const user = userEvent.setup();
    render(<ActivityPage />);

    await screen.findByText("Bot Create");

    mockFetchAuditLog.mockResolvedValueOnce({
      events: MOCK_AUDIT_RESPONSE.events,
      total: 100,
      hasMore: false,
    });
    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(mockFetchAuditLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 50, limit: 50 }),
    );
  });

  it("calls fetchAuditLog with correct params", async () => {
    mockFetchAuditLog.mockResolvedValueOnce(MOCK_AUDIT_RESPONSE);
    render(<ActivityPage />);

    await screen.findByText("Bot Create");

    expect(mockFetchAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: undefined }));
  });
});
