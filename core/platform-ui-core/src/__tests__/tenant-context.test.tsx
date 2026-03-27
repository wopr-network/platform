import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
  useSession: vi.fn(() => ({
    data: { user: { id: "user-1", name: "Test User", image: null } },
    isPending: false,
  })),
}));

const mockQuery = vi.hoisted(() => vi.fn().mockResolvedValue([]));
vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {
    org: { listMyOrganizations: { query: mockQuery } },
  },
}));

import {
  getActiveTenantId,
  setServerTenantId,
  TenantProvider,
  useTenant,
} from "@/lib/tenant-context";

function createWrapper(initialTenantId?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TenantProvider initialTenantId={initialTenantId}>{children}</TenantProvider>
    </QueryClientProvider>
  );
}

describe("useTenant", () => {
  beforeEach(() => {
    setServerTenantId("");
    mockQuery.mockResolvedValue([]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))));
  });

  it("defaults to the user's personal account when no initial tenant", async () => {
    const { result } = renderHook(() => useTenant(), {
      wrapper: createWrapper(),
    });

    await vi.waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.activeTenantId).toBe("user-1");
  });

  it("uses initialTenantId from server when provided", async () => {
    mockQuery.mockResolvedValue([{ id: "org-1", name: "My Team", image: null }]);

    const { result } = renderHook(() => useTenant(), {
      wrapper: createWrapper("org-1"),
    });

    await vi.waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.activeTenantId).toBe("org-1");
  });

  it("calls /api/tenant on switchTenant instead of writing document.cookie", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", mockFetch);

    mockQuery.mockResolvedValue([{ id: "org-1", name: "My Team", image: null }]);

    const { result } = renderHook(() => useTenant(), {
      wrapper: createWrapper(),
    });

    await vi.waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    act(() => {
      result.current.switchTenant("org-1");
    });

    expect(result.current.activeTenantId).toBe("org-1");
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/tenant",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ tenantId: "org-1" }),
      }),
    );
  });

  it("falls back to personal if stored tenant is not in list", async () => {
    mockQuery.mockResolvedValue([]);

    const { result } = renderHook(() => useTenant(), {
      wrapper: createWrapper("org-deleted"),
    });

    await vi.waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.activeTenantId).toBe("user-1");
  });

  it("gracefully handles listMyOrganizations failure", async () => {
    mockQuery.mockRejectedValue(new Error("Not implemented"));

    const { result } = renderHook(() => useTenant(), {
      wrapper: createWrapper(),
    });

    await vi.waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.tenants).toHaveLength(1);
    expect(result.current.tenants[0].type).toBe("personal");
  });
});

describe("getActiveTenantId", () => {
  beforeEach(() => {
    setServerTenantId("");
  });

  it("returns the server-injected tenant ID", () => {
    setServerTenantId("org-1");
    expect(getActiveTenantId()).toBe("org-1");
  });

  it("returns empty string when nothing set", () => {
    expect(getActiveTenantId()).toBe("");
  });
});
