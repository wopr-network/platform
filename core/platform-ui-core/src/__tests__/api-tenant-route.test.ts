import { describe, expect, it, vi } from "vitest";

// Mock brand-config before importing route
vi.mock("@/lib/brand-config", () => ({
  getBrandConfig: vi.fn(() => ({
    tenantCookieName: "platform_tenant_id",
  })),
}));

// We test the route handler directly
import { DELETE, POST } from "@/app/api/tenant/route";

function makeRequest(method: string, body?: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/tenant", {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("POST /api/tenant", () => {
  it("sets HttpOnly cookie with the provided tenantId", async () => {
    const req = makeRequest("POST", { tenantId: "org-123" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain("platform_tenant_id=org-123");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toContain("Max-Age=2592000");
    expect(setCookie).toContain("Path=/");
  });

  it("rejects missing tenantId", async () => {
    const req = makeRequest("POST", {});
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects empty tenantId", async () => {
    const req = makeRequest("POST", { tenantId: "" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("rejects tenantId with invalid characters", async () => {
    const req = makeRequest("POST", { tenantId: "org;evil=true" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/tenant", () => {
  it("clears the tenant cookie", async () => {
    const res = await DELETE();

    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("platform_tenant_id=");
    expect(setCookie).toContain("Max-Age=0");
  });
});
