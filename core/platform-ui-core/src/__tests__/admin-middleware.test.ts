import { beforeEach, describe, expect, it, vi } from "vitest";

// We test the middleware function directly by importing from the module.
// The middleware was renamed from proxy.ts to middleware.ts by WOP-1128.
import middleware from "../proxy";

// Minimal NextRequest-compatible mock
function mockRequest(opts: {
  method?: string;
  url: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}) {
  const url = new URL(opts.url);
  const headers = new Headers(opts.headers ?? {});
  if (!headers.has("host")) {
    headers.set("host", url.host);
  }
  const cookieMap = new Map(
    Object.entries(opts.cookies ?? {}).map(([k, v]) => [k, { name: k, value: v }]),
  );
  return {
    method: opts.method ?? "GET",
    url: opts.url,
    nextUrl: url,
    headers,
    cookies: {
      get: (name: string) => cookieMap.get(name),
      getAll: () => [...cookieMap.values()],
      has: (name: string) => cookieMap.has(name),
    },
  } as unknown as Parameters<typeof middleware>[0];
}

// Mock global fetch for Better Auth session calls
const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = originalFetch;
});

describe("Admin route middleware authorization", () => {
  it("redirects non-admin users from /admin/tenants to /marketplace", async () => {
    // Mock Better Auth get-session returning a regular user
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        session: { id: "s1" },
        user: { id: "u1", role: "user" },
      }),
    });

    const req = mockRequest({
      url: "https://localhost:3000/admin/tenants",
      cookies: { "better-auth.session_token": "valid-token" },
    });

    const res = await middleware(req);
    // Should redirect to /marketplace
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/marketplace");
  });

  it("allows platform_admin users to access /admin/tenants", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        session: { id: "s1" },
        user: { id: "u1", role: "platform_admin" },
      }),
    });

    const req = mockRequest({
      url: "https://localhost:3000/admin/tenants",
      cookies: { "better-auth.session_token": "valid-token" },
    });

    const res = await middleware(req);
    // Should pass through (not a redirect)
    expect(res.status).not.toBe(307);
  });

  it("redirects unauthenticated users from /admin to /login", async () => {
    const req = mockRequest({
      url: "https://localhost:3000/admin/tenants",
      // No session cookie
    });

    const res = await middleware(req);
    // Existing auth check should redirect to /login
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("redirects to /marketplace when session fetch fails", async () => {
    // Simulate network error or 500 from Better Auth
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const req = mockRequest({
      url: "https://localhost:3000/admin/tenants",
      cookies: { "better-auth.session_token": "valid-token" },
    });

    const res = await middleware(req);
    // On failure, deny access (fail closed)
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/marketplace");
  });

  it("sets no-cache headers on admin page responses for admin users", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        session: { id: "s1" },
        user: { id: "u1", role: "platform_admin" },
      }),
    });

    const req = mockRequest({
      url: "https://localhost:3000/admin/tenants",
      cookies: { "better-auth.session_token": "valid-token" },
    });

    const res = await middleware(req);
    expect(res.headers.get("cache-control")).toBe("no-store, no-cache, must-revalidate");
    expect(res.headers.get("pragma")).toBe("no-cache");
  });

  it("does not set restrictive cache headers on non-admin pages", async () => {
    const req = mockRequest({
      url: "https://localhost:3000/marketplace",
      cookies: { "better-auth.session_token": "valid-token" },
    });

    const res = await middleware(req);
    expect(res.headers.get("cache-control")).toBeNull();
    expect(res.headers.get("pragma")).toBeNull();
  });

  it("does not call get-session for non-admin routes", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;

    const req = mockRequest({
      url: "https://localhost:3000/marketplace",
      cookies: { "better-auth.session_token": "valid-token" },
    });

    await middleware(req);
    // Should NOT have called Better Auth — not an admin route
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
