import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
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

vi.mock("@/lib/admin-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/admin-api")>();
  return {
    ...actual,
    getUsersList: vi.fn(),
    bulkGrantCredits: vi.fn(),
    bulkSuspendTenants: vi.fn(),
    bulkReactivateTenants: vi.fn(),
  };
});

import { TenantTable } from "@/components/admin/tenant-table";
import { getUsersList } from "@/lib/admin-api";

const mockGetUsersList = vi.mocked(getUsersList);

function makeUsers(count: number, startIndex: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `id-${startIndex + i}`,
    tenant_id: `tenant-${startIndex + i}`,
    email: `user${startIndex + i}@test.com`,
    name: `User ${startIndex + i}`,
    status: "active" as const,
    role: "user",
    credit_balance_cents: 1000,
    agent_count: 1,
    last_seen: null,
    created_at: Date.now(),
  }));
}

describe("TenantTable pagination", () => {
  it("page 1 requests offset 0", async () => {
    mockGetUsersList.mockResolvedValueOnce({ users: makeUsers(25, 0), total: 60 });
    render(<TenantTable />);

    await screen.findByText("user0@test.com");
    expect(mockGetUsersList).toHaveBeenCalledWith(
      expect.objectContaining({ offset: 0, limit: 25 }),
    );
  });

  it("clicking Next requests offset 25 (not 50)", async () => {
    mockGetUsersList.mockResolvedValueOnce({ users: makeUsers(25, 0), total: 60 });
    const user = userEvent.setup();
    render(<TenantTable />);

    await screen.findByText("user0@test.com");

    mockGetUsersList.mockResolvedValueOnce({ users: makeUsers(25, 25), total: 60 });
    await user.click(screen.getByRole("button", { name: "Next" }));

    await screen.findByText("user25@test.com");
    expect(mockGetUsersList).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 25, limit: 25 }),
    );
  });

  it("shows correct range text on page 2", async () => {
    mockGetUsersList.mockResolvedValueOnce({ users: makeUsers(25, 0), total: 60 });
    const user = userEvent.setup();
    render(<TenantTable />);
    await screen.findByText("user0@test.com");

    mockGetUsersList.mockResolvedValueOnce({ users: makeUsers(25, 25), total: 60 });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("user25@test.com");

    expect(screen.getByText(/Showing 26-50 of 60/)).toBeInTheDocument();
  });

  it("disables Next on last page", async () => {
    mockGetUsersList.mockResolvedValueOnce({ users: makeUsers(25, 0), total: 60 });
    const user = userEvent.setup();
    render(<TenantTable />);
    await screen.findByText("user0@test.com");

    mockGetUsersList.mockResolvedValueOnce({ users: makeUsers(25, 25), total: 60 });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("user25@test.com");

    mockGetUsersList.mockResolvedValueOnce({ users: makeUsers(10, 50), total: 60 });
    await user.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("user50@test.com");

    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  it("Previous is disabled on page 1", async () => {
    mockGetUsersList.mockResolvedValueOnce({ users: makeUsers(25, 0), total: 60 });
    render(<TenantTable />);
    await screen.findByText("user0@test.com");

    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
  });

  it("hides pagination when total <= PAGE_SIZE", async () => {
    mockGetUsersList.mockResolvedValueOnce({ users: makeUsers(10, 0), total: 10 });
    render(<TenantTable />);
    await screen.findByText("user0@test.com");

    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous" })).not.toBeInTheDocument();
  });
});
