import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
  useSession: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  redirect: vi.fn(),
}));

import { AdminGuard } from "@/components/admin/admin-guard";
import { useSession } from "@/lib/auth-client";

const mockUseSession = vi.mocked(useSession);

describe("AdminGuard", () => {
  it("renders children when user is platform_admin", () => {
    mockUseSession.mockReturnValue({
      data: {
        session: {} as never,
        user: {
          id: "1",
          name: "Admin",
          email: "a@b.com",
          role: "platform_admin",
        },
      },
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);

    render(
      <AdminGuard>
        <div>Admin Content</div>
      </AdminGuard>,
    );
    expect(screen.getByText("Admin Content")).toBeInTheDocument();
  });

  it("shows access denied when user is not admin", () => {
    mockUseSession.mockReturnValue({
      data: {
        session: {} as never,
        user: { id: "2", name: "User", email: "u@b.com", role: "user" },
      },
      isPending: false,
      isRefetching: false,
      error: null,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useSession>);

    render(
      <AdminGuard>
        <div>Admin Content</div>
      </AdminGuard>,
    );
    expect(screen.queryByText("Admin Content")).not.toBeInTheDocument();
    expect(screen.getByText(/access denied/i)).toBeInTheDocument();
  });

  it("shows skeleton when session is loading", () => {
    mockUseSession.mockReturnValue({
      data: null,
      isPending: true,
      error: null,
    } as ReturnType<typeof useSession>);

    render(
      <AdminGuard>
        <div>Admin Content</div>
      </AdminGuard>,
    );
    expect(screen.queryByText("Admin Content")).not.toBeInTheDocument();
  });
});
