import { describe, expect, it } from "vitest";

// proxy.ts reads process.env at module level
process.env.NEXT_PUBLIC_API_URL = "";

const { validateCsrfOrigin } = await import("../proxy");

// Helper: create a minimal NextRequest-like object for validateCsrfOrigin
function makeMutationRequest(pathname: string, method: string, origin?: string, host = "localhost:3000") {
  return {
    headers: new Headers({
      ...(origin ? { origin } : {}),
      host,
    }),
    nextUrl: { protocol: "http:", pathname },
    method,
    cookies: { get: () => undefined },
  } as unknown as import("next/server").NextRequest;
}

describe("CSRF_EXEMPT_PATHS", () => {
  it("validateCsrfOrigin rejects cross-origin POST", () => {
    const req = makeMutationRequest("/api/auth/callback/github", "POST", "https://evil.com", "localhost:3000");
    expect(validateCsrfOrigin(req)).toBe(false);
  });

  it("validateCsrfOrigin accepts same-origin POST", () => {
    const req = makeMutationRequest("/api/auth/callback/github", "POST", "http://localhost:3000", "localhost:3000");
    expect(validateCsrfOrigin(req)).toBe(true);
  });
});

// To test the middleware CSRF exemption behavior, we need to call the default export.
// We import the middleware and check that known OAuth callback POSTs are allowed through
// even without Origin/Referer headers.
const middleware = (await import("../proxy")).default;

function makeFullRequest(
  pathname: string,
  method: string,
  opts: { origin?: string; host?: string; sessionCookie?: string } = {},
) {
  const { origin, host = "localhost:3000", sessionCookie } = opts;
  const headers = new Headers({ host });
  if (origin) headers.set("origin", origin);

  const cookies = new Map<string, { name: string; value: string }>();
  if (sessionCookie) {
    cookies.set("better-auth.session_token", {
      name: "better-auth.session_token",
      value: sessionCookie,
    });
  }

  return {
    headers,
    nextUrl: {
      protocol: "http:",
      pathname,
      clone: () => ({ protocol: "http:", pathname }),
    },
    url: `http://${host}${pathname}`,
    method,
    cookies: { get: (name: string) => cookies.get(name) },
  } as unknown as import("next/server").NextRequest;
}

describe("Middleware CSRF exemption for OAuth callbacks", () => {
  it("allows POST to /api/auth/callback/github without Origin header", async () => {
    const req = makeFullRequest("/api/auth/callback/github", "POST");
    const res = await middleware(req);
    // Should NOT be a 403 CSRF error
    expect(res.status).not.toBe(403);
  });

  it("allows POST to /api/auth/callback/google without Origin header", async () => {
    const req = makeFullRequest("/api/auth/callback/google", "POST");
    const res = await middleware(req);
    expect(res.status).not.toBe(403);
  });

  it("allows POST to /api/auth/callback/discord without Origin header", async () => {
    const req = makeFullRequest("/api/auth/callback/discord", "POST");
    const res = await middleware(req);
    expect(res.status).not.toBe(403);
  });

  it("blocks POST to /api/auth/callback/unknown-provider without Origin header", async () => {
    const req = makeFullRequest("/api/auth/callback/unknown-provider", "POST");
    const res = await middleware(req);
    expect(res.status).toBe(403);
  });

  it("blocks POST to /api/auth/callback/ (bare prefix) without Origin header", async () => {
    const req = makeFullRequest("/api/auth/callback/", "POST");
    const res = await middleware(req);
    expect(res.status).toBe(403);
  });

  it("blocks POST to /api/auth/callback without Origin header", async () => {
    const req = makeFullRequest("/api/auth/callback", "POST");
    const res = await middleware(req);
    expect(res.status).toBe(403);
  });

  it("blocks POST to /api/auth/callback/github/evil without Origin header", async () => {
    const req = makeFullRequest("/api/auth/callback/github/evil", "POST");
    const res = await middleware(req);
    expect(res.status).toBe(403);
  });

  it("does not exempt PUT to /api/auth/callback/github", async () => {
    const req = makeFullRequest("/api/auth/callback/github", "PUT");
    const res = await middleware(req);
    expect(res.status).toBe(403);
  });
});
