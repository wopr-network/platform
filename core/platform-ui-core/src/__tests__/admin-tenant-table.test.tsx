import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/admin-api", () => ({
  getUsersList: vi.fn(),
  suspendTenant: vi.fn(),
  reactivateTenant: vi.fn(),
  grantCredits: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/admin/tenants",
  redirect: vi.fn(),
}));

import { TenantTable } from "@/components/admin/tenant-table";
import { getUsersList } from "@/lib/admin-api";

const mockGetUsersList = vi.mocked(getUsersList);

const fakeUsers = [
  {
    id: "u1",
    email: "alice@example.com",
    name: "Alice",
    tenant_id: "t1",
    status: "active",
    role: "user",
    credit_balance_cents: 5000,
    agent_count: 2,
    last_seen: Date.now(),
    created_at: Date.now() - 86400000,
  },
  {
    id: "u2",
    email: "bob@example.com",
    name: "Bob",
    tenant_id: "t2",
    status: "suspended",
    role: "user",
    credit_balance_cents: 0,
    agent_count: 0,
    last_seen: null,
    created_at: Date.now() - 172800000,
  },
];

describe("TenantTable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetUsersList.mockResolvedValue({ users: fakeUsers, total: 2 });
  });

  it("renders user rows after loading", async () => {
    render(<TenantTable />);
    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument();
      expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    });
  });

  it("shows search input", () => {
    render(<TenantTable />);
    expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
  });

  it("calls getUsersList with search param on input", async () => {
    const user = userEvent.setup();
    render(<TenantTable />);
    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, "alice");
    await waitFor(
      () => {
        expect(mockGetUsersList).toHaveBeenCalledWith(expect.objectContaining({ search: "alice" }));
      },
      { timeout: 2000 },
    );
  });

  it("displays credit balance formatted as dollars", async () => {
    render(<TenantTable />);
    await waitFor(() => {
      expect(screen.getByText("$50.00")).toBeInTheDocument();
    });
  });

  it("shows status badge for suspended users", async () => {
    render(<TenantTable />);
    await waitFor(() => {
      expect(screen.getByText("suspended")).toBeInTheDocument();
    });
  });
});
