/**
 * Tenant subdomain proxy middleware.
 *
 * Extracts the tenant subdomain from the Host header, authenticates
 * the user, verifies tenant membership via orgMemberRepo, resolves
 * the fleet container URL, and proxies the request upstream.
 *
 * Fail-closed semantics:
 * - If fleet services are unavailable, returns 503 (not silent skip)
 * - Auth check runs before tenant ownership check
 * - Upstream headers are sanitized via allowlist
 */

import type { MiddlewareHandler } from "hono";
import { validateTenantAccess } from "../../auth/index.js";
import { logger } from "../../config/logger.js";
import type { PlatformContainer } from "../container.js";

/** Reserved subdomains that should never resolve to a tenant. */
const RESERVED_SUBDOMAINS = new Set(["app", "api", "staging", "www", "mail", "admin", "dashboard", "status", "docs"]);

/** DNS label rules (RFC 1123). */
const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Headers safe to forward to upstream containers.
 *
 * This is an allowlist — only these headers are copied from the incoming
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
  /** All product root domains (e.g. ["runpaperclip.com", "wopr.bot", "nemopod.com"]). */
  platformDomains: string[];

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
 * injected server-side from the authenticated session — never copied from
 * the incoming request — to prevent spoofing.
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
 * Create a tenant subdomain proxy middleware.
 *
 * Two modes:
 * 1. Subdomain: alice.runpaperclip.com → proxy to alice's container
 * 2. Path: runpaperclip.com/_sidecar/* → proxy to the user's instance
 *
 * Container URLs come from the Instance object (Docker inspect) — never
 * reconstructed from naming conventions.
 */
export function createTenantProxyMiddleware(
  container: PlatformContainer,
  config: TenantProxyConfig,
): MiddlewareHandler {
  const { platformDomains, resolveUser } = config;

  return async (c, next) => {
    const host = c.req.header("host");
    if (!host) return next();

    const url = new URL(c.req.url);
    const isSidecarProxy = url.pathname.startsWith("/_sidecar");
    let subdomain: string | null = null;

    if (!isSidecarProxy) {
      for (const domain of platformDomains) {
        subdomain = extractTenantSubdomain(host, domain);
        if (subdomain) break;
      }
    }
    if (!subdomain && !isSidecarProxy) return next();

    // --- Fail-closed checks ---

    if (!container.fleet) {
      logger.warn("Tenant proxy: fleet unavailable", { path: url.pathname });
      return c.json({ error: "Fleet services unavailable" }, 503);
    }

    const user = await resolveUser(c.req.raw);
    if (!user) {
      logger.warn("Tenant proxy: unauthenticated", { path: url.pathname, isSidecarProxy });
      return c.json({ error: "Authentication required" }, 401);
    }

    // --- Resolve the target profile ---

    const profiles = await container.fleet.profileStore.list();
    let profile: (typeof profiles)[number] | undefined;

    if (isSidecarProxy) {
      // /_sidecar/ mode: find the user's instance by tenant access
      for (const p of profiles) {
        const hasAccess = await validateTenantAccess(user.id, p.tenantId, container.orgMemberRepo);
        if (hasAccess) {
          profile = p;
          subdomain = p.name;
          break;
        }
      }
      if (!profile) {
        logger.warn("Tenant proxy: no instance for user", { userId: user.id, path: url.pathname });
        return c.json({ error: "Tenant not found" }, 404);
      }
    } else {
      profile = profiles.find((p) => p.name === subdomain);
      if (!profile) {
        logger.warn("Tenant proxy: subdomain not found", { subdomain, path: url.pathname });
        return c.json({ error: "Tenant not found" }, 404);
      }
      const hasAccess = await validateTenantAccess(user.id, profile.tenantId, container.orgMemberRepo);
      if (!hasAccess) {
        logger.warn("Tenant proxy: access denied", { subdomain, userId: user.id });
        return c.json({ error: "Forbidden: not a member of this tenant" }, 403);
      }
    }

    // --- Resolve container URL from the Instance object ---

    let upstream: string | null = null;

    // Fast path: in-memory route table (populated during provisioning)
    const routes = container.fleet.proxy.getRoutes();
    const route = routes.find((r) => r.subdomain === subdomain);
    if (route?.healthy) {
      upstream = `http://${route.upstreamHost}:${route.upstreamPort}`;
      logger.info("Tenant proxy: resolved from route table", { subdomain, upstream });
    }

    // Primary path: get the Instance from fleet (Docker inspect — the truth)
    if (!upstream && profile.id) {
      try {
        const instance = await container.fleet.manager.getInstance(profile.id);
        upstream = instance.url;
        logger.info("Tenant proxy: resolved from Instance", {
          subdomain,
          instanceId: profile.id,
          containerName: instance.containerName,
          upstream,
        });
      } catch (err) {
        logger.warn("Tenant proxy: getInstance failed", {
          subdomain,
          instanceId: profile.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!upstream) {
      logger.warn("Tenant proxy: no upstream", { subdomain, instanceId: profile.id, productSlug: profile.productSlug });
      return c.json({ error: "Container unavailable" }, 503);
    }

    // --- Proxy the request ---

    const proxyPath = isSidecarProxy ? url.pathname.replace(/^\/_sidecar/, "") || "/" : url.pathname;
    const targetUrl = `${upstream}${proxyPath}${url.search}`;
    const upstreamHeaders = buildUpstreamHeaders(c.req.raw.headers, user, subdomain ?? profile.name);

    logger.info("Tenant proxy: forwarding", {
      subdomain,
      method: c.req.method,
      path: url.pathname,
      targetUrl,
      userId: user.id,
    });

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
      logger.error("Tenant proxy: upstream fetch failed", {
        subdomain,
        targetUrl,
        error: err instanceof Error ? err.message : String(err),
      });
      return c.json({ error: "Bad Gateway: upstream container unavailable" }, 502);
    }

    logger.info("Tenant proxy: response", {
      subdomain,
      path: url.pathname,
      upstreamStatus: response.status,
    });

    const responseHeaders = new Headers(response.headers);
    if (isSidecarProxy) {
      responseHeaders.delete("x-frame-options");
      responseHeaders.set("content-security-policy", "frame-ancestors 'self'");
    }
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  };
}
