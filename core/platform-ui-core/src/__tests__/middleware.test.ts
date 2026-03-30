import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import middleware, { config, validateCsrfOrigin } from "../proxy";

/**
 * Build a real NextRequest for the given path with optional cookies and headers.
 * Uses https://localhost as the base URL so `nextUrl.protocol` is "https:".
 */
function buildRequest(
  path: string,
  opts: {
    method?: string;
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
    host?: string;
  } = {},
): NextRequest {
  const url = new URL(path, "https://localhost");
  const headers = new Headers(opts.headers ?? {});
  // opts.host takes explicit precedence; fall back to existing header or "localhost"
  if (opts.host) {
    headers.set("host", opts.host);
  } else if (!headers.has("host")) {
    headers.set("host", "localhost");
  }

  const req = new NextRequest(url, {
    method: opts.method ?? "GET",
    headers,
  });

  if (opts.cookies) {
    for (const [name, value] of Object.entries(opts.cookies)) {
      req.cookies.set(name, value);
    }
  }

  return req;
}

function isPassThrough(res: Response): boolean {
  return res.headers.get("x-middleware-next") === "1";
}

describe("middleware", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ---------------------------------------------------------------------------
  // Pass-through with CSP (middleware no longer does auth — useRequireAuth handles it)
  // ---------------------------------------------------------------------------
  describe("pass-through with CSP", () => {
    it("passes /dashboard through without session cookie", async () => {
      const req = buildRequest("/dashboard");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
      expect(res.headers.get("content-security-policy")).not.toBeNull();
    });

    it("passes /marketplace through without session cookie", async () => {
      const req = buildRequest("/marketplace");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("passes /settings through without session cookie", async () => {
      const req = buildRequest("/settings");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Authenticated pass-through
  // ---------------------------------------------------------------------------
  describe("authenticated pass-through", () => {
    it("passes /dashboard through with a valid session cookie", async () => {
      const req = buildRequest("/dashboard", {
        cookies: { "better-auth.session_token": "valid-token" },
      });
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("passes /marketplace through with a valid session cookie", async () => {
      const req = buildRequest("/marketplace", {
        cookies: { "better-auth.session_token": "valid-token" },
      });
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("passes /settings/profile through with a valid session cookie", async () => {
      const req = buildRequest("/settings/profile", {
        cookies: { "better-auth.session_token": "valid-token" },
      });
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("accepts __Secure- prefixed session cookie as authenticated", async () => {
      const req = buildRequest("/dashboard", {
        cookies: { "__Secure-better-auth.session_token": "valid-token" },
      });
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("forwards x-nonce request header on authenticated non-admin routes", async () => {
      const req = buildRequest("/dashboard", {
        cookies: { "better-auth.session_token": "valid-token" },
      });
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
      // CSP header must contain a nonce
      const csp = res.headers.get("content-security-policy") ?? "";
      const nonceMatch = csp.match(/'nonce-([^']+)'/);
      expect(nonceMatch).not.toBeNull();
      // The nonce must NOT be in the response headers (security)
      expect(res.headers.get("x-nonce")).toBeNull();
      // Verify the response was created via nextWithNonce() — it sets x-middleware-request-x-nonce
      // NextResponse.next({ request: { headers } }) propagates custom headers with this prefix
      const requestNonce = res.headers.get("x-middleware-request-x-nonce");
      expect(requestNonce).toBe(nonceMatch?.[1]);
    });
  });

  // ---------------------------------------------------------------------------
  // Public routes — prefix match
  // ---------------------------------------------------------------------------
  describe("public routes (prefix match)", () => {
    it("allows /login without authentication", async () => {
      const req = buildRequest("/login");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("allows /signup without authentication", async () => {
      const req = buildRequest("/signup");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("allows /forgot-password without authentication", async () => {
      const req = buildRequest("/forgot-password");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("allows /reset-password without authentication", async () => {
      const req = buildRequest("/reset-password");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("allows /auth/callback without authentication", async () => {
      const req = buildRequest("/auth/callback");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("allows /auth/verify without authentication", async () => {
      const req = buildRequest("/auth/verify");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("allows /login/extra (prefix match extends beyond exact path)", async () => {
      const req = buildRequest("/login/extra");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Public routes — exact match only
  // ---------------------------------------------------------------------------
  describe("public routes (exact match only)", () => {
    it("allows /terms without authentication (exact)", async () => {
      const req = buildRequest("/terms");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("allows /privacy without authentication (exact)", async () => {
      const req = buildRequest("/privacy");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("allows /pricing without authentication (exact)", async () => {
      const req = buildRequest("/pricing");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("passes /terms/extra through (auth handled client-side)", async () => {
      const req = buildRequest("/terms/extra");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("passes /pricing/enterprise through (auth handled client-side)", async () => {
      const req = buildRequest("/pricing/enterprise");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("passes /privacy/policy through (auth handled client-side)", async () => {
      const req = buildRequest("/privacy/policy");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Root path (/) — special handling
  // ---------------------------------------------------------------------------
  describe("root path", () => {
    it("passes GET / through with CSP (auth handled client-side)", async () => {
      const req = buildRequest("/");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
      expect(res.headers.get("content-security-policy")).not.toBeNull();
    });

    it("passes authenticated GET / through with CSP", async () => {
      const req = buildRequest("/", {
        cookies: { "better-auth.session_token": "valid-token" },
      });
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // Static files and API routes — always pass through
  // ---------------------------------------------------------------------------
  describe("static files and API routes", () => {
    it("allows /_next/static paths without authentication", async () => {
      const req = buildRequest("/_next/static/chunk.js");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("allows paths with file extensions (favicon.ico)", async () => {
      const req = buildRequest("/favicon.ico");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("allows /api/health without authentication (public exact path for infra probes)", async () => {
      const req = buildRequest("/api/health");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("allows /api/auth/session without authentication", async () => {
      const req = buildRequest("/api/auth/session");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("passes /api/something through (auth handled client-side)", async () => {
      const req = buildRequest("/api/something");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("passes /api/something through with a valid session cookie", async () => {
      const req = buildRequest("/api/something", {
        cookies: { "better-auth.session_token": "valid-token" },
      });
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });

    it("allows /api/auth/callback without authentication (public)", async () => {
      const req = buildRequest("/api/auth/callback");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // All routes pass through (auth is handled client-side by useRequireAuth)
  // ---------------------------------------------------------------------------
  describe("all routes pass through with CSP", () => {
    it("passes /admin through (auth handled client-side)", async () => {
      const req = buildRequest("/admin");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
      expect(res.headers.get("content-security-policy")).not.toBeNull();
    });

    it("passes /admin/users through", async () => {
      const req = buildRequest("/admin/users");
      const res = await middleware(req);
      expect(isPassThrough(res)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // CSRF protection — integration-level (validateCsrfOrigin unit tests are in csrf-middleware.test.ts)
  // ---------------------------------------------------------------------------
  describe("CSRF protection (middleware integration)", () => {
    it("blocks POST to /api/foo without Origin header", async () => {
      const req = buildRequest("/api/foo", {
        method: "POST",
        host: "localhost",
      });
      const res = await middleware(req);
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("CSRF validation failed");
    });

    it("allows POST to /api/foo with matching Origin", async () => {
      const req = buildRequest("/api/foo", {
        method: "POST",
        headers: {
          host: "localhost",
          origin: "https://localhost",
        },
      });
      const res = await middleware(req);
      expect(res.status).not.toBe(403);
    });

    it("exempts POST /api/auth routes from CSRF check", async () => {
      const req = buildRequest("/api/auth/callback", {
        method: "POST",
        host: "localhost",
        // No Origin header
      });
      const res = await middleware(req);
      expect(res.status).not.toBe(403);
    });

    it("blocks DELETE to /api/auth routes (only POST is exempt)", async () => {
      const req = buildRequest("/api/auth/callback", {
        method: "DELETE",
        host: "localhost",
      });
      const res = await middleware(req);
      expect(res.status).toBe(403);
    });

    it("blocks PUT to /api/auth routes (only POST is exempt)", async () => {
      const req = buildRequest("/api/auth/callback", {
        method: "PUT",
        host: "localhost",
      });
      const res = await middleware(req);
      expect(res.status).toBe(403);
    });

    it("allows GET to /api/foo without Origin (GET is not a mutation)", async () => {
      const req = buildRequest("/api/foo", {
        method: "GET",
        host: "localhost",
      });
      const res = await middleware(req);
      expect(res.status).not.toBe(403);
    });

    it("blocks DELETE to /api/foo without Origin", async () => {
      const req = buildRequest("/api/foo", {
        method: "DELETE",
        host: "localhost",
      });
      const res = await middleware(req);
      expect(res.status).toBe(403);
    });
  });
});

// ---------------------------------------------------------------------------
// validateCsrfOrigin — additional edge cases not in csrf-middleware.test.ts
// ---------------------------------------------------------------------------
describe("validateCsrfOrigin", () => {
  it("returns true when Origin matches host exactly", () => {
    const req = buildRequest("/api/foo", {
      method: "POST",
      host: "example.com",
      headers: { origin: "https://example.com" },
    });
    expect(validateCsrfOrigin(req)).toBe(true);
  });

  it("returns false when Origin mismatches host", () => {
    const req = buildRequest("/api/foo", {
      method: "POST",
      host: "example.com",
      headers: { origin: "https://evil.com" },
    });
    expect(validateCsrfOrigin(req)).toBe(false);
  });

  it("returns false when no Origin and no Referer", () => {
    const req = buildRequest("/api/foo", {
      method: "POST",
      host: "example.com",
    });
    expect(validateCsrfOrigin(req)).toBe(false);
  });

  it("falls back to Referer when Origin is absent", () => {
    const req = buildRequest("/api/foo", {
      method: "POST",
      host: "example.com",
      headers: { referer: "https://example.com/some/page" },
    });
    expect(validateCsrfOrigin(req)).toBe(true);
  });

  it("returns false for an invalid Referer URL", () => {
    const req = buildRequest("/api/foo", {
      method: "POST",
      host: "example.com",
      headers: { referer: "not-a-url" },
    });
    expect(validateCsrfOrigin(req)).toBe(false);
  });

  it("returns false when no host header present", () => {
    const url = new URL("/api/foo", "https://localhost");
    const headers = new Headers(); // No host header
    const req = new NextRequest(url, { method: "POST", headers });
    expect(validateCsrfOrigin(req)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CSP nonce header
// ---------------------------------------------------------------------------
describe("CSP nonce in middleware", () => {
  it("sets a Content-Security-Policy header with a nonce in script-src", async () => {
    const req = buildRequest("/login");
    const res = await middleware(req);
    const csp = res.headers.get("content-security-policy");
    expect(csp).not.toBeNull();
    expect(csp).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=_-]+'[^;]*/);
    // script-src must not use 'unsafe-inline' (nonce replaces it)
    const scriptSrc = csp?.split(";").find((d) => d.trim().startsWith("script-src"));
    expect(scriptSrc).not.toContain("'unsafe-inline'");
  });

  it("generates a different nonce per request", async () => {
    const res1 = await middleware(buildRequest("/login"));
    const res2 = await middleware(buildRequest("/login"));
    const csp1 = res1.headers.get("content-security-policy") ?? "";
    const csp2 = res2.headers.get("content-security-policy") ?? "";
    const nonce1 = csp1.match(/'nonce-([^']+)'/)?.[1];
    const nonce2 = csp2.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce1).toMatch(/^[A-Za-z0-9+/=_-]+$/);
    expect(nonce2).toMatch(/^[A-Za-z0-9+/=_-]+$/);
    expect(nonce1).not.toBe(nonce2);
  });

  it("includes 'strict-dynamic' in script-src", async () => {
    const req = buildRequest("/login");
    const res = await middleware(req);
    const csp = res.headers.get("content-security-policy");
    expect(csp).toContain("'strict-dynamic'");
  });

  it("keeps https://js.stripe.com in script-src for CSP Level 2 fallback", async () => {
    const req = buildRequest("/login");
    const res = await middleware(req);
    const csp = res.headers.get("content-security-policy");
    expect(csp).toContain("https://js.stripe.com");
  });

  it("does NOT expose the nonce via x-nonce response header", async () => {
    const req = buildRequest("/login");
    const res = await middleware(req);
    // Nonce must not leak in response headers — it's forwarded via request headers only
    expect(res.headers.get("x-nonce")).toBeNull();
    // CSP header must still contain the nonce
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toMatch(/'nonce-[A-Za-z0-9+/=_-]+'/);
  });

  it("preserves all other CSP directives (default-src, style-src, connect-src, etc.)", async () => {
    const req = buildRequest("/login");
    const res = await middleware(req);
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("default-src 'self'");
    expect(csp).toMatch(/style-src-elem 'self' 'unsafe-inline' 'nonce-[A-Za-z0-9+/=_-]+'/);

    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("frame-src https://js.stripe.com");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
  });

  it("does not set Cache-Control on nonce-carrying non-admin responses", async () => {
    const req = buildRequest("/login");
    const res = await middleware(req);
    expect(res.headers.get("cache-control")).toBeNull();
  });

  it("sets Vary: * on nonce-carrying responses", async () => {
    const req = buildRequest("/login");
    const res = await middleware(req);
    expect(res.headers.get("vary")).toBe("*");
  });
});

// ---------------------------------------------------------------------------
// CSP style-src directive
// ---------------------------------------------------------------------------
describe("CSP style-src directive", () => {
  it("uses nonce-based style-src (NONCE_STYLES_ENABLED = true)", async () => {
    const req = buildRequest("/login", {
      cookies: { "better-auth.session_token": "tok" },
    });
    const res = await middleware(req);
    const csp = res.headers.get("content-security-policy") ?? "";
    // Must contain nonce + unsafe-inline in style-src-elem
    // (unsafe-inline needed for framer-motion dynamic style injection)
    expect(csp).toMatch(/style-src-elem 'self' 'unsafe-inline' 'nonce-[A-Za-z0-9+/=_-]+'/);
    expect(csp).toContain("style-src-attr 'unsafe-inline'");
  });
});

// ---------------------------------------------------------------------------
// Tenant cookie forwarding (WOP-2114)
// ---------------------------------------------------------------------------
describe("tenant cookie forwarding", () => {
  it("forwards tenant cookie as x-tenant-id request header for authenticated users", async () => {
    const req = buildRequest("/marketplace", {
      cookies: {
        "better-auth.session_token": "valid-token",
        platform_tenant_id: "org-456",
      },
    });
    const res = await middleware(req);
    expect(isPassThrough(res)).toBe(true);
    expect(res.headers.get("x-middleware-request-x-tenant-id")).toBe("org-456");
  });

  it("does not set x-tenant-id header when no tenant cookie present", async () => {
    const req = buildRequest("/marketplace", {
      cookies: { "better-auth.session_token": "valid-token" },
    });
    const res = await middleware(req);
    expect(isPassThrough(res)).toBe(true);
    expect(res.headers.get("x-middleware-request-x-tenant-id")).toBeNull();
  });

  it("strips client-supplied x-tenant-id header when no tenant cookie is set (spoofing prevention)", async () => {
    const req = buildRequest("/marketplace", {
      cookies: { "better-auth.session_token": "valid-token" },
      headers: { "x-tenant-id": "attacker-tenant" },
    });
    const res = await middleware(req);
    expect(isPassThrough(res)).toBe(true);
    // The attacker's header must not be forwarded to server components
    expect(res.headers.get("x-middleware-request-x-tenant-id")).toBeNull();
  });

  it("replaces client-supplied x-tenant-id with the trusted cookie value when cookie is set", async () => {
    const req = buildRequest("/marketplace", {
      cookies: {
        "better-auth.session_token": "valid-token",
        platform_tenant_id: "real-tenant",
      },
      headers: { "x-tenant-id": "attacker-tenant" },
    });
    const res = await middleware(req);
    expect(isPassThrough(res)).toBe(true);
    // Must be the cookie value, not the client-supplied value
    expect(res.headers.get("x-middleware-request-x-tenant-id")).toBe("real-tenant");
  });
});

// ---------------------------------------------------------------------------
// config export
// ---------------------------------------------------------------------------
describe("middleware config", () => {
  it("exports a matcher that excludes _next/static, _next/image, and favicon.ico", () => {
    const pattern = config.matcher[0];
    expect(pattern).toContain("_next/static");
    expect(pattern).toContain("favicon.ico");
  });
});
