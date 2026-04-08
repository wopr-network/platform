/**
 * Sidecar tenant proxy middleware.
 *
 * Routes `/_sidecar/*` requests to the authenticated user's tenant container.
 * Subdomain-based routing was retired — there is no `alice.example.com`
 * mode anymore. Container URLs come from the Fleet composite via
 * Instance.url (Docker DNS, owner-node resolved from bot_instances.node_id).
 *
 * Fail-closed semantics:
 * - If fleet services are unavailable, returns 503
 * - Auth check runs before tenant ownership check
 * - Upstream headers are sanitized via allowlist
 */

import type { MiddlewareHandler } from "hono";
import { validateTenantAccess } from "../../auth/index.js";
import { logger } from "../../config/logger.js";
import type { PlatformContainer } from "../container.js";

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
  /**
   * Resolve the authenticated user from the request.
   * Products wire this to their auth system (BetterAuth, etc.).
   */
  resolveUser: (req: Request) => Promise<ProxyUserInfo | undefined>;
}

/**
 * Build sanitized headers for upstream requests.
 *
 * Only allowlisted headers are forwarded. All x-platform-* headers are
 * injected server-side from the authenticated session — never copied from
 * the incoming request — to prevent spoofing.
 */
export function buildUpstreamHeaders(incoming: Headers, user: ProxyUserInfo, tenantName: string): Headers {
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
  headers.set("x-platform-tenant", tenantName);
  if (user.email) headers.set("x-platform-user-email", user.email);
  if (user.name) headers.set("x-platform-user-name", user.name);
  return headers;
}

/**
 * Create the sidecar tenant proxy middleware.
 *
 * Routes `/_sidecar/*` → the authenticated user's tenant container.
 * Container URLs come from Fleet.getInstance(profile.id), which resolves
 * the owning node via bot_instances.node_id.
 */
export function createTenantProxyMiddleware(
  container: PlatformContainer,
  config: TenantProxyConfig,
): MiddlewareHandler {
  const { resolveUser } = config;

  return async (c, next) => {
    const url = new URL(c.req.url);
    if (!url.pathname.startsWith("/_sidecar")) return next();

    // --- Fail-closed checks ---

    if (!container.fleet || !container.fleetComposite) {
      logger.warn("Tenant proxy: fleet unavailable", { path: url.pathname });
      return c.json({ error: "Fleet services unavailable" }, 503);
    }

    const user = await resolveUser(c.req.raw);
    if (!user) {
      logger.warn("Tenant proxy: unauthenticated", { path: url.pathname });
      return c.json({ error: "Authentication required" }, 401);
    }

    // --- Resolve the user's tenant profile ---

    const profiles = await container.fleet.profileStore.list();
    let profile: (typeof profiles)[number] | undefined;
    for (const p of profiles) {
      const hasAccess = await validateTenantAccess(user.id, p.tenantId, container.orgMemberRepo);
      if (hasAccess) {
        profile = p;
        break;
      }
    }
    if (!profile) {
      logger.warn("Tenant proxy: no instance for user", { userId: user.id, path: url.pathname });
      return c.json({ error: "Tenant not found" }, 404);
    }
    const tenantName = profile.name;

    // --- Resolve upstream from the Fleet composite ---

    let upstream: string | null = null;
    try {
      const instance = await container.fleetComposite.getInstance(profile.id);
      upstream = instance.url;
      logger.info("Tenant proxy: resolved from Instance", {
        instanceId: profile.id,
        containerName: instance.containerName,
        upstream,
      });
    } catch (err) {
      logger.warn("Tenant proxy: getInstance failed", {
        instanceId: profile.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (!upstream) {
      logger.warn("Tenant proxy: no upstream", {
        tenantName,
        instanceId: profile.id,
        productSlug: profile.productSlug,
      });
      return c.json({ error: "Container unavailable" }, 503);
    }

    // --- Proxy the request ---

    const proxyPath = url.pathname.replace(/^\/_sidecar/, "") || "/";
    const targetUrl = `${upstream}${proxyPath}${url.search}`;
    const upstreamHeaders = buildUpstreamHeaders(c.req.raw.headers, user, tenantName);

    logger.info("Tenant proxy: forwarding", {
      tenantName,
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
        tenantName,
        targetUrl,
        error: err instanceof Error ? err.message : String(err),
      });
      return c.json({ error: "Bad Gateway: upstream container unavailable" }, 502);
    }

    logger.info("Tenant proxy: response", {
      tenantName,
      path: url.pathname,
      upstreamStatus: response.status,
    });

    // Sidecar mode: strip framing headers so the embed works.
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete("x-frame-options");
    responseHeaders.set("content-security-policy", "frame-ancestors 'self'");
    return new Response(response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  };
}
