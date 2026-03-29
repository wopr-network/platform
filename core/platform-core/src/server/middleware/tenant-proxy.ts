/**
 * Tenant subdomain proxy middleware.
 *
 * Extracts the tenant subdomain from the Host header, authenticates
 * the user, verifies tenant membership via orgMemberRepo, resolves
 * the fleet container URL, and proxies the request upstream.
 *
 * Ported from paperclip-platform with fail-closed semantics:
 * - If fleet services are unavailable, returns 503 (not silent skip)
 * - Auth check runs before tenant ownership check
 * - Upstream headers are sanitized via allowlist
 */

import type { MiddlewareHandler } from "hono";
import type { PlatformContainer } from "../container.js";

/** Reserved subdomains that should never resolve to a tenant. */
const RESERVED_SUBDOMAINS = new Set(["app", "api", "staging", "www", "mail", "admin", "dashboard", "status", "docs"]);

/** DNS label rules (RFC 1123). */
const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Headers safe to forward to upstream containers.
 *
 * This is an allowlist -- only these headers are copied from the incoming
 * request. All x-platform-* headers are injected server-side after auth
 * resolution, preventing client-side spoofing.
 */
const FORWARDED_HEADERS = [
  "content-type",
  "accept",
  "accept-language",
  "accept-encoding",
  "content-length",
  "x-request-id",
  "user-agent",
  "origin",
  "referer",
  "cookie",
];

/** Resolved user identity for upstream header injection. */
export interface ProxyUserInfo {
  id: string;
  email?: string;
  name?: string;
}

export interface TenantProxyConfig {
  /** The platform root domain (e.g. "runpaperclip.com"). */
  platformDomain: string;

  /**
   * Resolve the authenticated user from the request.
   * Products wire this to their auth system (BetterAuth, etc.).
   */
  resolveUser: (req: Request) => Promise<ProxyUserInfo | undefined>;
}

/**
 * Extract the tenant subdomain from a Host header value.
 *
 * "alice.example.com" -> "alice"
 * "example.com"       -> null (root domain)
 * "app.example.com"   -> null (reserved)
 */
export function extractTenantSubdomain(host: string, platformDomain: string): string | null {
  const hostname = host.split(":")[0].toLowerCase();
  const suffix = `.${platformDomain}`;
  if (!hostname.endsWith(suffix)) return null;

  const subdomain = hostname.slice(0, -suffix.length);
  if (!subdomain || subdomain.includes(".")) return null;
  if (RESERVED_SUBDOMAINS.has(subdomain)) return null;
  if (!SUBDOMAIN_RE.test(subdomain)) return null;

  return subdomain;
}

/**
 * Build sanitized headers for upstream requests.
 *
 * Only allowlisted headers are forwarded. All x-platform-* headers are
 * injected server-side from the authenticated session -- never copied from
 * the incoming request -- to prevent spoofing.
 */
export function buildUpstreamHeaders(incoming: Headers, user: ProxyUserInfo, tenantSubdomain: string): Headers {
  const headers = new Headers();
  for (const key of FORWARDED_HEADERS) {
    const val = incoming.get(key);
    if (val) headers.set(key, val);
  }
  // Forward original Host so upstream hostname allowlist doesn't reject
  const host = incoming.get("host");
  if (host) headers.set("host", host);
  headers.set("x-platform-user-id", user.id);
  headers.set("x-paperclip-user-id", user.id); // compat: Paperclip sidecar reads this header
  headers.set("x-platform-tenant", tenantSubdomain);
  if (user.email) headers.set("x-platform-user-email", user.email);
  if (user.name) headers.set("x-platform-user-name", user.name);
  return headers;
}

/**
 * Resolve the upstream container URL for a tenant subdomain.
 *
 * First checks the in-memory proxy route table (populated during
 * provisioning). Falls back to deriving from the persistent profile
 * data so that routing survives server restarts without needing
 * Caddy or in-memory state.
 */
function resolveContainerUrl(
  container: PlatformContainer,
  subdomain: string,
  profile: { name: string; env?: Record<string, string> },
): string | null {
  if (!container.fleet) return null;

  // Fast path: in-memory route table (populated during provisioning)
  const routes = container.fleet.proxy.getRoutes();
  const route = routes.find((r) => r.subdomain === subdomain);
  if (route?.healthy) {
    return `http://${route.upstreamHost}:${route.upstreamPort}`;
  }

  // Fallback: derive from persistent profile data (survives restarts)
  const containerName = `wopr-${profile.name.replace(/_/g, "-")}`;
  const port = profile.env?.PORT || "3100";
  return `http://${containerName}:${port}`;
}

/**
 * Create a tenant subdomain proxy middleware.
 *
 * If the request Host identifies a tenant subdomain, authenticates the user,
 * resolves the fleet container URL, and proxies the request. Non-tenant
 * requests (root domain, reserved subdomains) pass through to next().
 *
 * Fail-closed: if fleet services or orgMemberRepo are unavailable, returns
 * 503 instead of silently skipping checks.
 */
export function createTenantProxyMiddleware(
  container: PlatformContainer,
  config: TenantProxyConfig,
): MiddlewareHandler {
  const { platformDomain, resolveUser } = config;

  return async (c, next) => {
    const host = c.req.header("host");
    if (!host) return next();

    const subdomain = extractTenantSubdomain(host, platformDomain);
    if (!subdomain) return next();

    // --- Fail-closed checks ---

    // Fleet services must be available for tenant proxying
    if (!container.fleet) {
      return c.json({ error: "Fleet services unavailable" }, 503);
    }

    // Authenticate -- reject unauthenticated requests
    const user = await resolveUser(c.req.raw);
    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    // Verify tenant ownership -- user must belong to the org that owns this subdomain
    const profiles = await container.fleet.profileStore.list();
    const profile = profiles.find((p) => p.name === subdomain);
    if (!profile) {
      return c.json({ error: "Tenant not found" }, 404);
    }
    const { validateTenantAccess } = await import("../../auth/index.js");
    const hasAccess = await validateTenantAccess(user.id, profile.tenantId, container.orgMemberRepo);
    if (!hasAccess) {
      return c.json({ error: "Forbidden: not a member of this tenant" }, 403);
    }

    // Resolve fleet container URL (route table or profile fallback)
    const upstream = resolveContainerUrl(container, subdomain, profile);
    if (!upstream) {
      return c.json({ error: "Container unavailable" }, 503);
    }

    const url = new URL(c.req.url);
    const targetUrl = `${upstream}${url.pathname}${url.search}`;
    const upstreamHeaders = buildUpstreamHeaders(c.req.raw.headers, user, subdomain);

    let response: Response;
    try {
      response = await fetch(targetUrl, {
        method: c.req.method,
        headers: upstreamHeaders,
        body: c.req.method !== "GET" && c.req.method !== "HEAD" ? c.req.raw.body : undefined,
        // @ts-expect-error duplex needed for streaming request bodies
        duplex: "half",
      });
    } catch {
      return c.json({ error: "Bad Gateway: upstream container unavailable" }, 502);
    }

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  };
}
