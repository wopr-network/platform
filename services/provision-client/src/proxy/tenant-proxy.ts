import type { MiddlewareHandler } from "hono";
import type { RouteResolver } from "./route-table.js";

/** DNS label rules (RFC 1123). */
const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/** Default reserved subdomains. */
const DEFAULT_RESERVED = new Set(["app", "api", "staging", "www", "mail", "admin", "dashboard", "status", "docs"]);

/** Default headers safe to forward upstream. */
const DEFAULT_FORWARDED_HEADERS = [
  "content-type",
  "accept",
  "accept-language",
  "accept-encoding",
  "content-length",
  "x-request-id",
  "user-agent",
];

/** Options for creating the tenant proxy middleware. */
export interface TenantProxyOptions {
  /** The platform domain (e.g. "runpaperclip.ai", "wopr.bot"). */
  domain: string;

  /** Route resolver — where to find container URLs for subdomains. */
  routes: RouteResolver;

  /**
   * Resolve the authenticated user ID from the request context.
   * Return undefined to reject as 401.
   * If not provided, proxy runs without auth (not recommended for production).
   */
  resolveUserId?: (c: Parameters<MiddlewareHandler>[0]) => Promise<string | undefined>;

  /**
   * Check whether the user has access to this tenant.
   * If not provided, all authenticated users can access all tenants.
   */
  checkAccess?: (userId: string, subdomain: string) => Promise<boolean>;

  /** Additional reserved subdomains beyond the defaults. */
  reservedSubdomains?: string[];

  /** Additional headers to forward upstream. */
  forwardedHeaders?: string[];

  /** Header prefix for identity headers injected into upstream requests. */
  headerPrefix?: string;

  /** Called on upstream errors. */
  onError?: (subdomain: string, err: unknown) => void;
}

/**
 * Extract the tenant subdomain from a Host header value.
 */
export function extractTenantSubdomain(host: string, domain: string, reserved: Set<string>): string | null {
  const hostname = host.split(":")[0].toLowerCase();
  const suffix = `.${domain}`;
  if (!hostname.endsWith(suffix)) return null;

  const subdomain = hostname.slice(0, -suffix.length);
  if (!subdomain || subdomain.includes(".")) return null;
  if (reserved.has(subdomain)) return null;
  if (!SUBDOMAIN_RE.test(subdomain)) return null;

  return subdomain;
}

/**
 * Build sanitized headers for upstream requests.
 */
export function buildUpstreamHeaders(
  incoming: Headers,
  userId: string,
  subdomain: string,
  forwardList: string[],
  prefix: string,
): Headers {
  const headers = new Headers();
  for (const key of forwardList) {
    const val = incoming.get(key);
    if (val) headers.set(key, val);
  }
  headers.set(`x-${prefix}-user-id`, userId);
  headers.set(`x-${prefix}-tenant`, subdomain);
  return headers;
}

/**
 * Create tenant subdomain proxy middleware for Hono.
 *
 * Requests to `{subdomain}.{domain}` are authenticated and proxied
 * to the container registered for that subdomain.
 *
 * Requests to the root domain, reserved subdomains, or unrecognized
 * hosts fall through to the next middleware.
 */
export function createTenantProxy(opts: TenantProxyOptions): MiddlewareHandler {
  const reserved = new Set([...DEFAULT_RESERVED, ...(opts.reservedSubdomains ?? [])]);
  const forwardList = [...DEFAULT_FORWARDED_HEADERS, ...(opts.forwardedHeaders ?? [])];
  const prefix = opts.headerPrefix ?? "wopr";

  return async (c, next) => {
    const host = c.req.header("host");
    if (!host) return next();

    const subdomain = extractTenantSubdomain(host, opts.domain, reserved);
    if (!subdomain) return next();

    // Auth check
    if (opts.resolveUserId) {
      const userId = await opts.resolveUserId(c);
      if (!userId) {
        return c.json({ error: "Authentication required" }, 401);
      }

      // Access check
      if (opts.checkAccess) {
        const allowed = await opts.checkAccess(userId, subdomain);
        if (!allowed) {
          return c.json({ error: "Not authorized for this tenant" }, 403);
        }
      }

      // Resolve upstream
      const upstream = await opts.routes.resolve(subdomain);
      if (!upstream) {
        return c.json({ error: "Tenant not found" }, 404);
      }

      const url = new URL(c.req.url);
      const targetUrl = `${upstream}${url.pathname}${url.search}`;
      const upstreamHeaders = buildUpstreamHeaders(c.req.raw.headers, userId, subdomain, forwardList, prefix);

      let response: Response;
      try {
        response = await fetch(targetUrl, {
          method: c.req.method,
          headers: upstreamHeaders,
          body: c.req.method !== "GET" && c.req.method !== "HEAD" ? c.req.raw.body : undefined,
          // @ts-expect-error duplex needed for streaming request bodies
          duplex: "half",
        });
      } catch (err) {
        opts.onError?.(subdomain, err);
        return c.json({ error: "Bad Gateway: container unavailable" }, 502);
      }

      return new Response(response.body, {
        status: response.status,
        headers: response.headers,
      });
    }

    // No auth resolver — just proxy
    const upstream = await opts.routes.resolve(subdomain);
    if (!upstream) {
      return c.json({ error: "Tenant not found" }, 404);
    }

    const url = new URL(c.req.url);
    const targetUrl = `${upstream}${url.pathname}${url.search}`;

    let response: Response;
    try {
      response = await fetch(targetUrl, {
        method: c.req.method,
        headers: c.req.raw.headers,
        body: c.req.method !== "GET" && c.req.method !== "HEAD" ? c.req.raw.body : undefined,
        // @ts-expect-error duplex needed for streaming request bodies
        duplex: "half",
      });
    } catch (err) {
      opts.onError?.(subdomain, err);
      return c.json({ error: "Bad Gateway: container unavailable" }, 502);
    }

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  };
}
