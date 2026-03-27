import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import middleware, { validateCsrfOrigin } from "../proxy";

// Minimal NextRequest-compatible mock for testing Origin/Referer validation
function mockRequest(opts: { method: string; url: string; headers?: Record<string, string> }) {
  const url = new URL(opts.url);
  const headers = new Headers(opts.headers ?? {});
  if (!headers.has("host")) {
    headers.set("host", url.host);
  }
  return {
    method: opts.method,
    url: opts.url,
    nextUrl: url,
    headers,
    cookies: { get: () => undefined },
  } as unknown as Parameters<typeof validateCsrfOrigin>[0];
}

describe("CSRF Origin validation", () => {
  it("allows POST with matching Origin header", () => {
    const req = mockRequest({
      method: "POST",
      url: "https://localhost:3000/api/instances",
      headers: { origin: "https://localhost:3000" },
    });
    expect(validateCsrfOrigin(req)).toBe(true);
  });

  it("blocks POST with cross-origin Origin header", () => {
    const req = mockRequest({
      method: "POST",
      url: "https://localhost:3000/api/instances",
      headers: { origin: "https://evil.com" },
    });
    expect(validateCsrfOrigin(req)).toBe(false);
  });

  it("blocks POST with no Origin or Referer", () => {
    const req = mockRequest({
      method: "POST",
      url: "https://localhost:3000/api/instances",
    });
    expect(validateCsrfOrigin(req)).toBe(false);
  });

  it("allows POST with matching Referer when Origin is absent", () => {
    const req = mockRequest({
      method: "POST",
      url: "https://localhost:3000/api/instances",
      headers: { referer: "https://localhost:3000/instances/new" },
    });
    expect(validateCsrfOrigin(req)).toBe(true);
  });

  it("blocks POST with cross-origin Referer when Origin is absent", () => {
    const req = mockRequest({
      method: "POST",
      url: "https://localhost:3000/api/instances",
      headers: { referer: "https://evil.com/attack" },
    });
    expect(validateCsrfOrigin(req)).toBe(false);
  });

  it("blocks request when host header is missing", () => {
    const headers = new Headers();
    // Explicitly do not set host
    const req = {
      method: "POST",
      url: "https://localhost:3000/api/instances",
      nextUrl: new URL("https://localhost:3000/api/instances"),
      headers,
      cookies: { get: () => undefined },
    } as unknown as Parameters<typeof validateCsrfOrigin>[0];
    expect(validateCsrfOrigin(req)).toBe(false);
  });

  it("blocks POST with malformed Referer URL", () => {
    const req = mockRequest({
      method: "POST",
      url: "https://localhost:3000/api/instances",
      headers: { referer: "not-a-url" },
    });
    expect(validateCsrfOrigin(req)).toBe(false);
  });

  it("allows same-origin request over HTTP (development)", () => {
    const req = mockRequest({
      method: "POST",
      url: "http://localhost:3000/api/instances",
      headers: { origin: "http://localhost:3000" },
    });
    expect(validateCsrfOrigin(req)).toBe(true);
  });

  it("blocks HTTP origin against HTTPS host", () => {
    const req = mockRequest({
      method: "POST",
      url: "https://localhost:3000/api/instances",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
      },
    });
    // http:// origin against https:// host must be blocked to prevent
    // protocol downgrade attacks (CSRF from HTTP origin to HTTPS endpoint)
    expect(validateCsrfOrigin(req)).toBe(false);
  });
});

/** Build a NextRequest for full middleware integration tests. */
function buildNextRequest(
  path: string,
  opts: { method?: string; headers?: Record<string, string>; host?: string } = {},
): NextRequest {
  const url = new URL(path, "https://localhost");
  const headers = new Headers(opts.headers ?? {});
  if (opts.host) headers.set("host", opts.host);
  else if (!headers.has("host")) headers.set("host", "localhost");
  return new NextRequest(url, { method: opts.method ?? "GET", headers });
}

describe("CSRF on /api/auth routes", () => {
  it("blocks POST /api/auth/sign-in/email without Origin", async () => {
    const req = buildNextRequest("/api/auth/sign-in/email", {
      method: "POST",
      host: "localhost",
    });
    const res = await middleware(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("CSRF validation failed");
  });

  it("allows POST /api/auth/sign-in/email with matching Origin", async () => {
    const req = buildNextRequest("/api/auth/sign-in/email", {
      method: "POST",
      headers: { host: "localhost", origin: "https://localhost" },
    });
    const res = await middleware(req);
    expect(res.status).not.toBe(403);
  });

  it("allows POST /api/auth/callback/google without Origin (OAuth exempt)", async () => {
    const req = buildNextRequest("/api/auth/callback/google", {
      method: "POST",
      host: "localhost",
    });
    const res = await middleware(req);
    expect(res.status).not.toBe(403);
  });

  it("blocks POST /api/auth/sign-up/email with cross-origin Origin", async () => {
    const req = buildNextRequest("/api/auth/sign-up/email", {
      method: "POST",
      headers: { host: "localhost", origin: "https://evil.com" },
    });
    const res = await middleware(req);
    expect(res.status).toBe(403);
  });

  it("blocks DELETE /api/auth/sign-out without Origin", async () => {
    const req = buildNextRequest("/api/auth/sign-out", {
      method: "DELETE",
      host: "localhost",
    });
    const res = await middleware(req);
    expect(res.status).toBe(403);
  });

  it("allows GET /api/auth/get-session without Origin (GET is not a mutation)", async () => {
    const req = buildNextRequest("/api/auth/get-session", {
      method: "GET",
      host: "localhost",
    });
    const res = await middleware(req);
    expect(res.status).not.toBe(403);
  });

  it("allows POST /api/auth/callback exactly (no trailing slash)", async () => {
    const req = buildNextRequest("/api/auth/callback", {
      method: "POST",
      host: "localhost",
    });
    const res = await middleware(req);
    expect(res.status).not.toBe(403);
  });

  it("blocks POST /api/auth/callbackevil (path traversal attempt)", async () => {
    const req = buildNextRequest("/api/auth/callbackevil", {
      method: "POST",
      host: "localhost",
    });
    const res = await middleware(req);
    expect(res.status).toBe(403);
  });
});
