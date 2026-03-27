import { Hono } from "hono";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { ProxyRoute } from "../../../proxy/types.js";
import { createTestContainer } from "../../test-container.js";
import {
  buildUpstreamHeaders,
  createTenantProxyMiddleware,
  extractTenantSubdomain,
  type ProxyUserInfo,
  type TenantProxyConfig,
} from "../tenant-proxy.js";

// ---------------------------------------------------------------------------
// extractTenantSubdomain unit tests
// ---------------------------------------------------------------------------

describe("extractTenantSubdomain", () => {
  const domain = "example.com";

  it("extracts a valid subdomain", () => {
    expect(extractTenantSubdomain("alice.example.com", domain)).toBe("alice");
  });

  it("returns null for the root domain", () => {
    expect(extractTenantSubdomain("example.com", domain)).toBeNull();
  });

  it("returns null for reserved subdomains", () => {
    expect(extractTenantSubdomain("app.example.com", domain)).toBeNull();
    expect(extractTenantSubdomain("api.example.com", domain)).toBeNull();
    expect(extractTenantSubdomain("admin.example.com", domain)).toBeNull();
  });

  it("returns null for nested subdomains", () => {
    expect(extractTenantSubdomain("deep.alice.example.com", domain)).toBeNull();
  });

  it("strips port before matching", () => {
    expect(extractTenantSubdomain("alice.example.com:3000", domain)).toBe("alice");
  });

  it("returns null for non-matching domain", () => {
    expect(extractTenantSubdomain("alice.other.com", domain)).toBeNull();
  });

  it("returns null for invalid subdomain characters", () => {
    expect(extractTenantSubdomain("al!ce.example.com", domain)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildUpstreamHeaders unit tests
// ---------------------------------------------------------------------------

describe("buildUpstreamHeaders", () => {
  it("copies only allowlisted headers and injects platform headers", () => {
    const incoming = new Headers({
      "content-type": "application/json",
      "x-evil-header": "should-not-pass",
      host: "alice.example.com",
    });
    const user: ProxyUserInfo = { id: "u1", email: "a@b.com", name: "Alice" };
    const result = buildUpstreamHeaders(incoming, user, "alice");

    expect(result.get("content-type")).toBe("application/json");
    expect(result.get("x-evil-header")).toBeNull();
    expect(result.get("x-platform-user-id")).toBe("u1");
    expect(result.get("x-platform-tenant")).toBe("alice");
    expect(result.get("x-platform-user-email")).toBe("a@b.com");
    expect(result.get("x-platform-user-name")).toBe("Alice");
    expect(result.get("host")).toBe("alice.example.com");
  });
});

// ---------------------------------------------------------------------------
// createTenantProxyMiddleware integration tests
// ---------------------------------------------------------------------------

describe("createTenantProxyMiddleware", () => {
  const DOMAIN = "example.com";
  let resolveUser: Mock<(req: Request) => Promise<ProxyUserInfo | undefined>>;
  let config: TenantProxyConfig;

  beforeEach(() => {
    resolveUser = vi.fn<(req: Request) => Promise<ProxyUserInfo | undefined>>();
    config = { platformDomain: DOMAIN, resolveUser };
  });

  function createApp(container: ReturnType<typeof createTestContainer>) {
    const app = new Hono();
    app.use("/*", createTenantProxyMiddleware(container, config));
    app.get("/fallthrough", (c) => c.json({ fallthrough: true }));
    return app;
  }

  it("passes through non-tenant requests (no subdomain)", async () => {
    const container = createTestContainer();
    const app = createApp(container);
    const res = await app.request("http://example.com/fallthrough");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fallthrough).toBe(true);
    // resolveUser should not be called for non-tenant requests
    expect(resolveUser).not.toHaveBeenCalled();
  });

  it("returns 401 for unauthenticated tenant requests", async () => {
    const container = createTestContainer({
      fleet: {
        profileStore: { list: vi.fn().mockResolvedValue([]) } as never,
        proxy: { getRoutes: vi.fn().mockReturnValue([]) } as never,
        manager: {} as never,
        docker: {} as never,
        serviceKeyRepo: {} as never,
      },
    });
    resolveUser.mockResolvedValue(undefined);
    const app = createApp(container);

    const res = await app.request("http://alice.example.com/dashboard", {
      headers: { host: "alice.example.com" },
    });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toContain("Authentication required");
  });

  it("returns 503 when fleet services are not available", async () => {
    const container = createTestContainer({ fleet: null });
    const app = createApp(container);

    const res = await app.request("http://alice.example.com/dashboard", {
      headers: { host: "alice.example.com" },
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toContain("Fleet services unavailable");
  });

  it("returns 403 when user is not a member of the tenant", async () => {
    const mockProfile = { name: "alice", tenantId: "tenant-1" };
    const container = createTestContainer({
      fleet: {
        profileStore: { list: vi.fn().mockResolvedValue([mockProfile]) } as never,
        proxy: {
          getRoutes: vi
            .fn()
            .mockReturnValue([{ subdomain: "alice", upstreamHost: "127.0.0.1", upstreamPort: 4000, healthy: true }]),
        } as never,
        manager: {} as never,
        docker: {} as never,
        serviceKeyRepo: {} as never,
      },
      orgMemberRepo: {
        findMember: vi.fn().mockResolvedValue(null),
        listMembers: vi.fn(),
        addMember: vi.fn(),
        updateMemberRole: vi.fn(),
        removeMember: vi.fn(),
        countAdminsAndOwners: vi.fn(),
        listInvites: vi.fn(),
        createInvite: vi.fn(),
        findInviteById: vi.fn(),
        findInviteByToken: vi.fn(),
        deleteInvite: vi.fn(),
        deleteAllMembers: vi.fn(),
        deleteAllInvites: vi.fn(),
        listOrgsByUser: vi.fn(),
        markInviteAccepted: vi.fn(),
      },
    });
    resolveUser.mockResolvedValue({ id: "user-99", email: "user@test.com" });
    const app = createApp(container);

    const res = await app.request("http://alice.example.com/dashboard", {
      headers: { host: "alice.example.com" },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("not a member");
  });

  it("proxies correctly when authorized", async () => {
    const mockProfile = { name: "alice", tenantId: "tenant-1" };
    const upstreamRoute: ProxyRoute = {
      instanceId: "inst-1",
      subdomain: "alice",
      upstreamHost: "127.0.0.1",
      upstreamPort: 4000,
      healthy: true,
    };
    const container = createTestContainer({
      fleet: {
        profileStore: { list: vi.fn().mockResolvedValue([mockProfile]) } as never,
        proxy: { getRoutes: vi.fn().mockReturnValue([upstreamRoute]) } as never,
        manager: {} as never,
        docker: {} as never,
        serviceKeyRepo: {} as never,
      },
      orgMemberRepo: {
        findMember: vi.fn().mockResolvedValue({ orgId: "tenant-1", userId: "user-1", role: "member" }),
        listMembers: vi.fn(),
        addMember: vi.fn(),
        updateMemberRole: vi.fn(),
        removeMember: vi.fn(),
        countAdminsAndOwners: vi.fn(),
        listInvites: vi.fn(),
        createInvite: vi.fn(),
        findInviteById: vi.fn(),
        findInviteByToken: vi.fn(),
        deleteInvite: vi.fn(),
        deleteAllMembers: vi.fn(),
        deleteAllInvites: vi.fn(),
        listOrgsByUser: vi.fn(),
        markInviteAccepted: vi.fn(),
      },
    });
    resolveUser.mockResolvedValue({ id: "user-1", email: "user@test.com" });

    // Mock global fetch to simulate upstream response
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ upstream: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    try {
      const app = createApp(container);
      const res = await app.request("http://alice.example.com/api/data?q=1", {
        headers: { host: "alice.example.com" },
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.upstream).toBe(true);

      // Verify fetch was called with the correct upstream URL
      const fetchCall = (globalThis.fetch as Mock).mock.calls[0];
      expect(fetchCall[0]).toBe("http://127.0.0.1:4000/api/data?q=1");

      // Verify platform headers were injected
      const headers = fetchCall[1].headers as Headers;
      expect(headers.get("x-platform-user-id")).toBe("user-1");
      expect(headers.get("x-platform-tenant")).toBe("alice");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns 502 when upstream fetch fails", async () => {
    const mockProfile = { name: "bob", tenantId: "user-1" };
    const upstreamRoute: ProxyRoute = {
      instanceId: "inst-2",
      subdomain: "bob",
      upstreamHost: "127.0.0.1",
      upstreamPort: 4001,
      healthy: true,
    };
    const container = createTestContainer({
      fleet: {
        profileStore: { list: vi.fn().mockResolvedValue([mockProfile]) } as never,
        proxy: { getRoutes: vi.fn().mockReturnValue([upstreamRoute]) } as never,
        manager: {} as never,
        docker: {} as never,
        serviceKeyRepo: {} as never,
      },
    });
    // tenantId === userId means personal tenant, so validateTenantAccess returns true
    resolveUser.mockResolvedValue({ id: "user-1" });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    try {
      const app = createApp(container);
      const res = await app.request("http://bob.example.com/test", {
        headers: { host: "bob.example.com" },
      });
      expect(res.status).toBe(502);
      const body = await res.json();
      expect(body.error).toContain("Bad Gateway");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("returns 404 when subdomain has no upstream route", async () => {
    const container = createTestContainer({
      fleet: {
        profileStore: { list: vi.fn().mockResolvedValue([]) } as never,
        proxy: { getRoutes: vi.fn().mockReturnValue([]) } as never,
        manager: {} as never,
        docker: {} as never,
        serviceKeyRepo: {} as never,
      },
    });
    resolveUser.mockResolvedValue({ id: "user-1" });
    const app = createApp(container);

    const res = await app.request("http://ghost.example.com/test", {
      headers: { host: "ghost.example.com" },
    });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("Tenant not found");
  });
});
