import { type NextRequest, NextResponse } from "next/server";
import { getBrandConfig } from "@/lib/brand-config";
import { logger } from "@/lib/logger";
import { sanitizeRedirectUrl } from "@/lib/utils";

const log = logger("middleware");

/** Derive API origin from request hostname. Convention: api.<domain>. */
function getApiOrigin(host: string): string {
  // Explicit override for local dev
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

/**
 * Only add upgrade-insecure-requests when actually serving over HTTPS.
 * Checking NODE_ENV breaks local dev in Docker (NODE_ENV=production but no TLS).
 * Computed per-request in buildCsp() from the request URL protocol.
 */

/**
 * Nonce-based style-src toggle.
 *
 * Enabled — style-src uses nonce-based policy instead of 'unsafe-inline'.
 * Tailwind v4 compiles styles at build time (no runtime injection).
 * framer-motion nonce support is provided via MotionConfig in the root layout.
 */
const NONCE_STYLES_ENABLED = true;

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

const publicPaths = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
  "/auth/verify",
  "/api/auth/",
];

/** Paths that are public only when matched exactly (not as a prefix). */
const publicExactPaths = new Set([
  "/",
  "/og",
  "/terms",
  "/privacy",
  "/pricing",
  "/status",
  // Health endpoint must be publicly accessible for infra probes (uptime monitors,
  // Kubernetes liveness/readiness, load balancers) that do not carry session cookies.
  "/api/health",
  // Better Auth root endpoint — sub-paths matched via publicPaths prefix list (/api/auth/).
  "/api/auth",
]);

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Mutation paths under /api/auth that are exempt from CSRF origin validation.
 * OAuth identity providers POST to callback URLs cross-origin — these cannot
 * carry a matching Origin header, so we must allow them through.
 * All other /api/auth mutations (sign-in, sign-up, sign-out, etc.) are
 * validated like any other /api route.
 */
const CSRF_EXEMPT_AUTH_PATHS = [
  "/api/auth/callback", // e.g. /api/auth/callback/google, /api/auth/callback/github
];

const PLATFORM_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const TENANT_COOKIE_NAME = getBrandConfig().tenantCookieName;

/** Post-auth landing page — configurable per brand (default: /marketplace). */
const HOME_PATH = (() => {
  const p = (process.env.NEXT_PUBLIC_BRAND_HOME_PATH || "/marketplace").trim();
  if (!p || /^https?:\/\//i.test(p)) return "/marketplace";
  return p.startsWith("/") ? p : `/${p}`;
})();

/**
 * Validate that a state-changing request originates from this application.
 * Checks the Origin header (preferred) with Referer as fallback.
 * Returns true if the request is safe, false if it should be blocked.
 */
export function validateCsrfOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const host = request.headers.get("host");

  if (!host) return false;

  // Build the allowed origin using the request's actual protocol only,
  // preventing protocol downgrade attacks (e.g. HTTP origin to HTTPS endpoint)
  const protocol = request.nextUrl.protocol; // "https:" or "http:"
  const allowedOrigin = `${protocol}//${host}`;

  // Check Origin header first (most reliable)
  if (origin) {
    return origin === allowedOrigin;
  }

  // Fall back to Referer header
  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      return refererOrigin === allowedOrigin;
    } catch {
      // Malformed referer URL — treat as non-matching origin
      return false;
    }
  }

  // No Origin or Referer on a mutation request is suspicious — block it.
  // Legitimate browser form submissions and fetch() calls include Origin.
  return false;
}

/**
 * Fetch the authenticated user's role from Better Auth's get-session endpoint.
 * Returns the role string (e.g. "platform_admin", "user") or null if the
 * session is invalid or the request fails. Fails closed: any error → null.
 */
async function getSessionRole(request: NextRequest): Promise<string | null> {
  const sessionCookie =
    request.cookies.get("better-auth.session_token") ??
    request.cookies.get("__Secure-better-auth.session_token");

  if (!sessionCookie?.value.trim()) return null;

  try {
    const res = await fetch(`${PLATFORM_BASE_URL}/api/auth/get-session`, {
      headers: {
        cookie: `${sessionCookie.name}=${sessionCookie.value}`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.user?.role ?? null;
  } catch (e) {
    log.warn("Failed to fetch user role for middleware routing", e);
    return null;
  }
}

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") || "";

  // Generate a per-request nonce for CSP
  const nonce = crypto.randomUUID();
  const cspHeaderValue = buildCsp(nonce, request.url, request.headers.get("host") ?? "");

  /** Apply CSP and cache-busting headers to any response before returning it. */
  function withCsp(response: NextResponse): NextResponse {
    response.headers.set("Content-Security-Policy", cspHeaderValue);
    // Nonce is passed to server components via request headers (not response headers).
    // See nextWithNonce() below — it uses NextResponse.next({ request: { headers } }).
    response.headers.set("Vary", "*");
    return response;
  }

  /**
   * Create a NextResponse.next() that forwards the CSP nonce to server components
   * via request headers, without exposing it in the HTTP response.
   */
  function nextWithNonce(): NextResponse {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);

    // Strip any client-supplied x-tenant-id before conditionally setting from the
    // trusted HttpOnly cookie. Without this delete, a client that sends their own
    // x-tenant-id header could spoof a tenant when no cookie is present.
    requestHeaders.delete("x-tenant-id");

    // Forward HttpOnly tenant cookie as request header for server components
    const tenantCookie = request.cookies.get(TENANT_COOKIE_NAME);
    if (tenantCookie?.value) {
      requestHeaders.set("x-tenant-id", tenantCookie.value);
    }

    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  // CSRF protection: validate Origin/Referer on state-changing API requests.
  if (pathname.startsWith("/api") && MUTATION_METHODS.has(request.method)) {
    // OAuth callback endpoints receive cross-origin POSTs from identity providers (POST only)
    const isCsrfExempt =
      CSRF_EXEMPT_AUTH_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) &&
      request.method === "POST";
    if (!isCsrfExempt && !validateCsrfOrigin(request)) {
      return NextResponse.json({ error: "CSRF validation failed" }, { status: 403 });
    }
  }

  // Redirect authenticated users from "/" to the app subdomain if on the marketing domain.
  // On the app subdomain, redirect to HOME_PATH. On the base domain, redirect to app subdomain.
  // NOTE: This check requires the Better Auth server to set the session cookie with
  // domain=".<base-domain>" so it is visible on both the app and marketing subdomains.
  // See: wopr-platform/src/auth/better-auth.ts advanced.cookies.session_token.attributes.domain
  if (pathname === "/") {
    const sessionToken =
      request.cookies.get("better-auth.session_token") ??
      request.cookies.get("__Secure-better-auth.session_token");
    if (sessionToken?.value.trim()) {
      const appDomain =
        process.env.NEXT_PUBLIC_BRAND_APP_DOMAIN || process.env.NEXT_PUBLIC_APP_DOMAIN;
      if (appDomain && !host.startsWith("app.")) {
        // On marketing domain — redirect to the app subdomain
        const appUrl = new URL(`https://${appDomain}`);
        appUrl.pathname = HOME_PATH;
        return withCsp(NextResponse.redirect(appUrl));
      }
      // On app subdomain (or no configured app domain) — redirect to home
      return withCsp(NextResponse.redirect(new URL(HOME_PATH, request.url)));
    }
  }

  // --- Admin route authorization (server-side) ---
  // Non-admins are redirected before any page JS loads.
  // Unauthenticated users fall through to the session check below (→ /login).
  if (pathname.startsWith("/admin")) {
    const sessionCookie =
      request.cookies.get("better-auth.session_token") ??
      request.cookies.get("__Secure-better-auth.session_token");
    if (sessionCookie?.value.trim()) {
      const role = await getSessionRole(request);
      if (role !== "platform_admin") {
        return withCsp(NextResponse.redirect(new URL(HOME_PATH, request.url)));
      }
      // Admin confirmed — serve page with anti-cache headers so revocation
      // is detected on the very next navigation (browser must revalidate).
      const response = nextWithNonce();
      response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
      response.headers.set("Pragma", "no-cache");
      response.headers.set("Expires", "0");
      return withCsp(response);
    }
    // No session cookie → fall through to the session check below which redirects to /login
  }

  // Allow public paths
  if (publicExactPaths.has(pathname) || publicPaths.some((p) => pathname.startsWith(p))) {
    return withCsp(nextWithNonce());
  }

  // Allow static files (but not API paths with dots, e.g. /api/config.json)
  if (pathname.startsWith("/_next") || (pathname.includes(".") && !pathname.startsWith("/api"))) {
    return withCsp(nextWithNonce());
  }

  // Check for session cookie (Better Auth uses "better-auth.session_token" by default).
  // NOTE: Bearer token auth (Authorization: Bearer <token>) is intentionally not supported
  // here. This is a browser-facing UI application; all API consumers are the Next.js
  // front-end itself (cookie-based). Automation/SDK/CLI clients should use the platform
  // API directly (wopr-platform), which issues and validates Bearer tokens independently.
  const sessionToken =
    request.cookies.get("better-auth.session_token") ??
    request.cookies.get("__Secure-better-auth.session_token");

  if (!sessionToken || !sessionToken.value.trim()) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", sanitizeRedirectUrl(pathname));
    return withCsp(NextResponse.redirect(loginUrl));
  }

  return withCsp(nextWithNonce());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
