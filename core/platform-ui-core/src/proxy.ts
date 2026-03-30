import { type NextRequest, NextResponse } from "next/server";
import { getBrandConfig } from "@/lib/brand-config";

/**
 * Middleware — CSP headers, CSRF protection, nonce generation, tenant cookie forwarding.
 *
 * NO auth checks. Pages that need auth use useRequireAuth() from @/lib/require-auth.
 */

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const CSRF_EXEMPT_AUTH_PATHS = [
  "/api/auth/callback",
];

const TENANT_COOKIE_NAME = getBrandConfig().tenantCookieName;

const NONCE_STYLES_ENABLED = true;

/** Derive API origin from request hostname. Convention: api.<domain>. */
function getApiOrigin(host: string): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    try {
      return new URL(process.env.NEXT_PUBLIC_API_URL).origin;
    } catch {
      /* fall through */
    }
  }
  if (!host || host === "localhost" || host.startsWith("localhost:")) return "";
  const hostname = host.split(":")[0];
  if (hostname.startsWith("staging.")) {
    const base = hostname.replace(/^staging\./, "");
    return `https://staging.api.${base}`;
  }
  return `https://api.${hostname}`;
}

/** Build the CSP header value with a per-request nonce. */
function buildCsp(nonce: string, requestUrl?: string, requestHost?: string): string {
  const isHttps = requestUrl ? requestUrl.startsWith("https://") : false;
  const api = getApiOrigin(requestHost ?? "");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://js.stripe.com`,
    ...(NONCE_STYLES_ENABLED
      ? [`style-src-elem 'self' 'unsafe-inline' 'nonce-${nonce}'`, "style-src-attr 'unsafe-inline'"]
      : ["style-src 'self' 'unsafe-inline'"]),
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' https://api.stripe.com${api ? ` ${api}` : ""}`,
    "frame-src https://js.stripe.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    ...(isHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function validateCsrfOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");
  if (!host) return false;
  const protocol = request.nextUrl.protocol;
  const allowedOrigin = `${protocol}//${host}`;
  if (origin) return origin === allowedOrigin;
  if (referer) {
    try {
      return new URL(referer).origin === allowedOrigin;
    } catch {
      return false;
    }
  }
  return false;
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const nonce = crypto.randomUUID();
  const cspHeaderValue = buildCsp(nonce, request.url, request.headers.get("host") ?? "");

  function withCsp(response: NextResponse): NextResponse {
    response.headers.set("Content-Security-Policy", cspHeaderValue);
    response.headers.set("Vary", "*");
    return response;
  }

  function nextWithNonce(): NextResponse {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.delete("x-tenant-id");
    const tenantCookie = request.cookies.get(TENANT_COOKIE_NAME);
    if (tenantCookie?.value) {
      requestHeaders.set("x-tenant-id", tenantCookie.value);
    }
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // CSRF protection on API mutations
  if (pathname.startsWith("/api") && MUTATION_METHODS.has(request.method)) {
    const isCsrfExempt =
      CSRF_EXEMPT_AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) && request.method === "POST";
    if (!isCsrfExempt && !validateCsrfOrigin(request)) {
      return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
    }
  }

  // Everything gets CSP + nonce. Auth is handled by pages via useRequireAuth().
  return withCsp(nextWithNonce());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
