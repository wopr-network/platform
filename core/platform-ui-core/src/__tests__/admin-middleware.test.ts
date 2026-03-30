import { describe, expect, it } from "vitest";

// We test the middleware function directly by importing from the module.
import middleware, { validateCsrfOrigin } from "../proxy";

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
  const cookieMap = new Map(Object.entries(opts.cookies ?? {}).map(([k, v]) => [k, { name: k, value: v }]));
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

describe("Middleware — CSP, CSRF, nonce, tenant forwarding", () => {
  it("sets Content-Security-Policy header on responses", async () => {
    const req = mockRequest({
      url: "https://localhost:3000/marketplace",
    });

    const res = await middleware(req);
    expect(res.headers.get("content-security-policy")).not.toBeNull();
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'");
  });

  it("sets Vary header on responses", async () => {
    const req = mockRequest({
      url: "https://localhost:3000/marketplace",
    });

    const res = await middleware(req);
    expect(res.headers.get("vary")).toBe("*");
  });

  it("passes through GET requests to any route without auth check", async () => {
    const req = mockRequest({
      url: "https://localhost:3000/admin/tenants",
    });

    const res = await middleware(req);
    // Middleware no longer checks auth — just sets CSP headers and passes through
    expect(res.status).not.toBe(307);
    expect(res.headers.get("content-security-policy")).not.toBeNull();
  });

  it("rejects CSRF-invalid POST to /api routes with 403", async () => {
    const req = mockRequest({
      method: "POST",
      url: "https://localhost:3000/api/some-endpoint",
      headers: {
        host: "localhost:3000",
        // No origin or referer — CSRF fails
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(403);
  });

  it("allows CSRF-valid POST to /api routes", async () => {
    const req = mockRequest({
      method: "POST",
      url: "https://localhost:3000/api/some-endpoint",
      headers: {
        host: "localhost:3000",
        origin: "https://localhost:3000",
      },
    });

    const res = await middleware(req);
    expect(res.status).not.toBe(403);
  });

  it("exempts /api/auth/callback POST from CSRF checks", async () => {
    const req = mockRequest({
      method: "POST",
      url: "https://localhost:3000/api/auth/callback",
      headers: {
        host: "localhost:3000",
        // No origin — would normally fail CSRF
      },
    });

    const res = await middleware(req);
    expect(res.status).not.toBe(403);
  });

  it("does not perform CSRF checks on GET requests to /api", async () => {
    const req = mockRequest({
      method: "GET",
      url: "https://localhost:3000/api/some-endpoint",
    });

    const res = await middleware(req);
    expect(res.status).not.toBe(403);
  });
});

describe("validateCsrfOrigin", () => {
  it("returns true when origin matches host", () => {
    const req = mockRequest({
      url: "https://localhost:3000/api/test",
      headers: {
        host: "localhost:3000",
        origin: "https://localhost:3000",
      },
    });
    expect(validateCsrfOrigin(req)).toBe(true);
  });

  it("returns false when origin does not match host", () => {
    const req = mockRequest({
      url: "https://localhost:3000/api/test",
      headers: {
        host: "localhost:3000",
        origin: "https://evil.com",
      },
    });
    expect(validateCsrfOrigin(req)).toBe(false);
  });

  it("returns false when no host header", () => {
    const req = mockRequest({
      url: "https://localhost:3000/api/test",
      headers: {
        origin: "https://localhost:3000",
      },
    });
    // Override host to empty
    req.headers.delete("host");
    expect(validateCsrfOrigin(req)).toBe(false);
  });
});
