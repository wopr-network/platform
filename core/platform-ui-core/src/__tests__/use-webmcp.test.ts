import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWebMCP } from "@/hooks/use-webmcp";
import { useSession } from "@/lib/auth-client";

const mockRegisterWebMCPTools = vi.fn();
const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
};
const mockSession = { user: { id: "u1", name: "Test" } };

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: vi.fn(() => ({ data: { user: mockSession.user } })),
}));

vi.mock("@/lib/webmcp/register", () => ({
  registerWebMCPTools: (...args: unknown[]) => mockRegisterWebMCPTools(...args),
}));

describe("useWebMCP", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockRegisterWebMCPTools.mockReturnValue(true);
    vi.mocked(useSession).mockReturnValue({ data: { user: mockSession.user } } as ReturnType<
      typeof useSession
    >);
  });

  it("registers tools when user is authenticated", () => {
    renderHook(() => useWebMCP());

    expect(mockRegisterWebMCPTools).toHaveBeenCalledOnce();
    expect(mockRegisterWebMCPTools).toHaveBeenCalledWith(true, expect.any(Function), {
      router: mockRouter,
    });
  });

  it("does not re-register on re-render (idempotent ref guard)", () => {
    const { rerender } = renderHook(() => useWebMCP());
    rerender();
    rerender();

    // Called once on mount, not again on re-renders
    expect(mockRegisterWebMCPTools).toHaveBeenCalledOnce();
  });

  it("passes isAuthenticated=false when session has no user", async () => {
    const { useSession } = await import("@/lib/auth-client");
    vi.mocked(useSession).mockReturnValue({
      data: null,
    } as ReturnType<typeof useSession>);

    renderHook(() => useWebMCP());

    expect(mockRegisterWebMCPTools).toHaveBeenCalledWith(false, expect.any(Function), {
      router: mockRouter,
    });
  });

  it("resets registered ref when session becomes unauthenticated then re-registers on re-auth", async () => {
    const { useSession } = await import("@/lib/auth-client");
    const mockUseSession = vi.mocked(useSession);

    // Start authenticated
    mockUseSession.mockReturnValue({
      data: { user: mockSession.user },
    } as ReturnType<typeof useSession>);
    const { rerender } = renderHook(() => useWebMCP());
    expect(mockRegisterWebMCPTools).toHaveBeenCalledTimes(1);

    // Become unauthenticated
    mockUseSession.mockReturnValue({ data: null } as ReturnType<typeof useSession>);
    mockRegisterWebMCPTools.mockReturnValue(false);
    rerender();

    // Re-authenticate
    mockUseSession.mockReturnValue({
      data: { user: mockSession.user },
    } as ReturnType<typeof useSession>);
    mockRegisterWebMCPTools.mockReturnValue(true);
    rerender();

    // Should have called register again after re-auth
    expect(mockRegisterWebMCPTools).toHaveBeenCalledTimes(3);
  });

  it("retries registration on next effect when registerWebMCPTools returns false", async () => {
    const { useSession } = await import("@/lib/auth-client");
    const mockUseSession = vi.mocked(useSession);

    // Start with registration failing
    mockRegisterWebMCPTools.mockReturnValue(false);
    mockUseSession.mockReturnValue({
      data: { user: mockSession.user },
    } as ReturnType<typeof useSession>);

    const { rerender } = renderHook(() => useWebMCP());
    expect(mockRegisterWebMCPTools).toHaveBeenCalledTimes(1);

    // Simulate a session change that re-triggers the effect
    mockRegisterWebMCPTools.mockReturnValue(true);
    mockUseSession.mockReturnValue({
      data: { user: { ...mockSession.user, name: "Updated" } },
    } as ReturnType<typeof useSession>);
    rerender();

    // Should retry since ref was never set to true
    expect(mockRegisterWebMCPTools).toHaveBeenCalledTimes(2);
  });
});
