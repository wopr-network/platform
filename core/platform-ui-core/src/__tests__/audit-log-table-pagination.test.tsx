import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/admin",
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: () => ({ data: null, isPending: false, error: null }),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    fetchAuditLog: vi.fn(),
  };
});

import { AuditLogTable } from "@/components/admin/audit-log-table";
import { fetchAuditLog } from "@/lib/api";

const mockFetchAuditLog = vi.mocked(fetchAuditLog);

function makeEvents(count: number, startIndex: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `evt-${startIndex + i}`,
    action: `bot.action${startIndex + i}`,
    resourceType: "bot",
    resourceId: `bot-${startIndex + i}`,
    resourceName: `Bot ${startIndex + i}`,
    details: `Detail ${startIndex + i}`,
    createdAt: new Date(Date.now() - (startIndex + i) * 3600000).toISOString(),
  }));
}

describe("AuditLogTable pagination", () => {
  it("initial load requests offset 0", async () => {
    mockFetchAuditLog.mockResolvedValueOnce({
      events: makeEvents(50, 0),
      total: 120,
      hasMore: true,
    });
    render(<AuditLogTable />);

    await screen.findByText("Bot 0");
    expect(mockFetchAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0, limit: 50 }),
    );
  });

  it("clicking Next requests offset 50 (page 2)", async () => {
    mockFetchAuditLog.mockResolvedValueOnce({
      events: makeEvents(50, 0),
      total: 120,
      hasMore: true,
    });
    const user = userEvent.setup();
    render(<AuditLogTable />);
    await screen.findByText("Bot 0");

    mockFetchAuditLog.mockResolvedValueOnce({
      events: makeEvents(50, 50),
      total: 120,
      hasMore: true,
    });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Bot 50");

    expect(mockFetchAuditLog).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 50, limit: 50 }),
    );
  });

  it("disables Next when hasMore is false", async () => {
    mockFetchAuditLog.mockResolvedValueOnce({
      events: makeEvents(50, 0),
      total: 120,
      hasMore: true,
    });
    const user = userEvent.setup();
    render(<AuditLogTable />);
    await screen.findByText("Bot 0");

    mockFetchAuditLog.mockResolvedValueOnce({
      events: makeEvents(50, 50),
      total: 120,
      hasMore: true,
    });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Bot 50");

    mockFetchAuditLog.mockResolvedValueOnce({
      events: makeEvents(20, 100),
      total: 120,
      hasMore: false,
    });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Bot 100");

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("shows correct range on page 2", async () => {
    mockFetchAuditLog.mockResolvedValueOnce({
      events: makeEvents(50, 0),
      total: 120,
      hasMore: true,
    });
    const user = userEvent.setup();
    render(<AuditLogTable />);
    await screen.findByText("Bot 0");

    mockFetchAuditLog.mockResolvedValueOnce({
      events: makeEvents(50, 50),
      total: 120,
      hasMore: true,
    });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("Bot 50");

    expect(screen.getByText(/Showing 51-100 of 120/)).toBeInTheDocument();
  });
});
