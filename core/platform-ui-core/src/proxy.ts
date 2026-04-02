import { type NextRequest, NextResponse } from "next/server";

/**
 * Middleware — CSP headers, CSRF protection, nonce generation, tenant cookie forwarding.
 *
 * NO auth checks. Pages that need auth use useRequireAuth() from @/lib/require-auth.
 */

const MUTATION_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const CSRF_EXEMPT_AUTH_PATHS = ["/api/auth/callback"];

// Middleware runs at edge before initBrandConfig(). Read cookie name from
// env var directly — this is the ONE place process.env is acceptable for
// brand config, because middleware can't await the core API.
const TENANT_COOKIE_NAME =
  process.env.NEXT_PUBLIC_BRAND_TENANT_COOKIE ||
  `${process.env.NEXT_PUBLIC_BRAND_STORAGE_PREFIX || "platform"}_tenant_id`;

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
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src 'self' https://api.stripe.com${api ? ` ${api}` : ""}`,
    "frame-src 'self' https://js.stripe.com",
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

  // Sidecar proxy: forward /_sidecar/* to the user's instance backend
  if (pathname.startsWith("/_sidecar")) {
    // Resolve instance URL dynamically from the platform API
    const internalApiUrl = process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL;
    if (!internalApiUrl) {
      return NextResponse.json({ error: "API not configured" }, { status: 502 });
    }

    // Forward auth cookies to the internal API to get the user's instance
    const cookieHeader = request.headers.get("cookie") || "";
    const tenantCookie = request.cookies.get(TENANT_COOKIE_NAME);
    const tenantId = tenantCookie?.value;

    let instanceUrl: string | null = null;
    try {
      const listRes = await fetch(
        `${internalApiUrl}/api/trpc/fleet.listInstances?input=%7B%7D`,
        {
          headers: {
            cookie: cookieHeader,
            ...(tenantId ? { "x-tenant-id": tenantId } : {}),
          },
        },
      );
      if (listRes.ok) {
        const data = await listRes.json() as { result?: { data?: Array<{ name?: string; status?: string }> } };
        const instances = data.result?.data ?? [];
        const running = instances.find((i) => i.status === "running") ?? instances[0];
        if (running?.name) {
          // Container name convention: paperclip-{instance-name} on port 3100
          instanceUrl = `http://paperclip-${running.name}:3100`;
        }
      }
    } catch {
      // Fall through to error
    }

    if (!instanceUrl) {
      return NextResponse.json({ error: "No running instance found" }, { status: 502 });
    }

    const targetPath = pathname.replace(/^\/_sidecar/, "") || "/";
    const targetUrl = `${instanceUrl}${targetPath}${request.nextUrl.search}`;

    const proxyHeaders = new Headers(request.headers);
    proxyHeaders.delete("host");
    if (tenantId) {
      proxyHeaders.set("x-tenant-id", tenantId);
    }
    proxyHeaders.set("x-paperclip-deployment-mode", "hosted_proxy");

    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers: proxyHeaders,
      body: request.method !== "GET" && request.method !== "HEAD" ? request.body : undefined,
      redirect: "manual",
    });

    const responseHeaders = new Headers(upstream.headers);
    // Remove transfer-encoding since Next.js handles chunking
    responseHeaders.delete("transfer-encoding");
    // Allow embedding in same-origin iframe — upstream may send DENY
    responseHeaders.delete("x-frame-options");
    responseHeaders.set("content-security-policy", "frame-ancestors 'self'");

    return new NextResponse(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  }

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
