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

import type { IncomingMessage } from "node:http";
import http from "node:http";
import https from "node:https";
import type { Duplex } from "node:stream";
import type { MiddlewareHandler } from "hono";
import { logger } from "../../config/logger.js";
import { DrizzleBotInstanceRepository } from "../../fleet/drizzle-bot-instance-repository.js";
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

    // --- Resolve the user's instance from bot_instances ---
    //
    // One query: every instance whose tenant is owned by this user or
    // whose tenant is an org the user is a member of. Post-profile-store,
    // bot_instances is the single source of truth; there's no parallel
    // profile layer to walk.
    const botInstanceRepo = new DrizzleBotInstanceRepository(container.db);
    const instances = await botInstanceRepo.findByUser(user.id);
    const instance = instances[0];
    if (!instance) {
      logger.warn("Tenant proxy: no instance for user", { userId: user.id, path: url.pathname });
      return c.json({ error: "Tenant not found" }, 404);
    }
    const tenantName = instance.name;

    // --- Resolve upstream from the Fleet composite ---

    let upstream: string | null = null;
    try {
      const liveInstance = await container.fleetComposite.getInstance(instance.id);
      upstream = liveInstance.url;
      logger.info("Tenant proxy: resolved from Instance", {
        instanceId: instance.id,
        containerName: liveInstance.containerName,
        upstream,
      });
    } catch (err) {
      logger.warn("Tenant proxy: getInstance failed", {
        instanceId: instance.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    if (!upstream) {
      logger.warn("Tenant proxy: no upstream", {
        tenantName,
        instanceId: instance.id,
        productSlug: instance.productSlug,
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

/**
 * Node http.Server `upgrade` handler that proxies WebSocket upgrades for
 * `/_sidecar/*` paths through to the authenticated user's container.
 *
 * The HTTP middleware uses `fetch()` which only speaks HTTP — WS upgrades
 * fall through to the Hono router as plain GETs and the upstream sidecar
 * returns 404. This handler intercepts the raw Node upgrade event before
 * Hono sees it, mirrors the same auth + tenant resolution, then pipes the
 * client socket to a TCP socket opened on the upstream container.
 *
 * Live event consumers (live-run transcripts, sidebar live-count) depend on
 * this working.
 */
export function createTenantProxyUpgradeHandler(
  container: PlatformContainer,
  config: TenantProxyConfig,
): (req: IncomingMessage, socket: Duplex, head: Buffer) => void {
  const { resolveUser } = config;

  function reject(socket: Duplex, statusLine: string, message: string) {
    const safe = message.replace(/[\r\n]+/g, " ").trim();
    socket.write(`HTTP/1.1 ${statusLine}\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\n${safe}`);
    socket.destroy();
  }

  function toFetchRequest(req: IncomingMessage): Request {
    const host = req.headers.host ?? "localhost";
    const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "http";
    const url = `${proto}://${host}${req.url ?? "/"}`;
    const headers = new Headers();
    for (const [key, raw] of Object.entries(req.headers)) {
      if (raw == null) continue;
      if (Array.isArray(raw)) for (const v of raw) headers.append(key, v);
      else headers.set(key, String(raw));
    }
    return new Request(url, { method: req.method ?? "GET", headers });
  }

  return (req, clientSocket, head) => {
    // We only handle /_sidecar/* WS upgrades. Leave everything else for
    // other upgrade listeners (there are none today, but this stays safe).
    if (!req.url?.startsWith("/_sidecar")) return;

    (async () => {
      if (!container.fleet || !container.fleetComposite) {
        return reject(clientSocket, "503 Service Unavailable", "Fleet services unavailable");
      }

      let user: ProxyUserInfo | undefined;
      try {
        user = await resolveUser(toFetchRequest(req));
      } catch (err) {
        logger.warn("Tenant proxy WS: resolveUser threw", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
      if (!user) return reject(clientSocket, "401 Unauthorized", "Authentication required");

      const botInstanceRepo = new DrizzleBotInstanceRepository(container.db);
      const instances = await botInstanceRepo.findByUser(user.id);
      const instance = instances[0];
      if (!instance) return reject(clientSocket, "404 Not Found", "Tenant not found");

      let upstream: string | null = null;
      try {
        const liveInstance = await container.fleetComposite.getInstance(instance.id);
        upstream = liveInstance.url;
      } catch (err) {
        logger.warn("Tenant proxy WS: getInstance failed", {
          instanceId: instance.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      if (!upstream) return reject(clientSocket, "503 Service Unavailable", "Container unavailable");

      const upstreamUrl = new URL(upstream);
      const path = (req.url ?? "/").replace(/^\/_sidecar/, "") || "/";

      const upstreamHeaders = buildUpstreamHeaders(toFetchRequest(req).headers, user, instance.name);
      // Convert fetch Headers back to a plain object for http.request
      const headersObj: Record<string, string> = {};
      upstreamHeaders.forEach((v, k) => {
        headersObj[k] = v;
      });
      // Preserve the upgrade handshake headers (the allowlist doesn't copy
      // them — they're protocol-level, not application-level).
      for (const key of [
        "upgrade",
        "connection",
        "sec-websocket-key",
        "sec-websocket-version",
        "sec-websocket-protocol",
        "sec-websocket-extensions",
      ]) {
        const raw = req.headers[key];
        if (raw == null) continue;
        headersObj[key] = Array.isArray(raw) ? raw.join(", ") : String(raw);
      }

      const client = upstreamUrl.protocol === "https:" ? https : http;
      const upstreamReq = client.request({
        host: upstreamUrl.hostname,
        port: upstreamUrl.port || (upstreamUrl.protocol === "https:" ? 443 : 80),
        path,
        method: req.method ?? "GET",
        headers: headersObj,
        // agent: false — the default global agent pools keep-alive
        // connections and rewrites Connection: Upgrade to keep-alive,
        // causing the upstream to see a plain GET instead of a handshake.
        agent: false,
      });

      logger.info("Tenant proxy WS: forwarding upgrade", {
        tenantName: instance.name,
        path: req.url,
        targetUrl: `${upstream}${path}`,
        userId: user.id,
      });

      upstreamReq.on("upgrade", (upRes, upSocket, upHead) => {
        const statusLine = `HTTP/1.1 ${upRes.statusCode} ${upRes.statusMessage ?? "Switching Protocols"}`;
        const headerLines = Object.entries(upRes.headers)
          .flatMap(([k, v]) => {
            if (v == null) return [];
            const vals = Array.isArray(v) ? v : [v];
            return vals.map((val) => `${k}: ${val}`);
          })
          .join("\r\n");
        clientSocket.write(`${statusLine}\r\n${headerLines}\r\n\r\n`);
        if (upHead.length > 0) clientSocket.write(upHead);
        if (head.length > 0) upSocket.write(head);
        upSocket.pipe(clientSocket).pipe(upSocket);
        upSocket.on("error", () => clientSocket.destroy());
        clientSocket.on("error", () => upSocket.destroy());
      });

      upstreamReq.on("response", (upRes) => {
        // Upstream returned a regular HTTP response instead of upgrading —
        // forward the status so the client sees the failure reason.
        reject(clientSocket, `${upRes.statusCode} ${upRes.statusMessage ?? ""}`.trim(), "Upstream refused upgrade");
        upRes.resume();
      });

      upstreamReq.on("error", (err) => {
        logger.warn("Tenant proxy WS: upstream error", {
          tenantName: instance.name,
          error: err instanceof Error ? err.message : String(err),
        });
        if (!clientSocket.destroyed) clientSocket.destroy();
      });

      upstreamReq.end();
    })().catch((err) => {
      logger.error("Tenant proxy WS: unexpected error", {
        error: err instanceof Error ? err.message : String(err),
      });
      if (!clientSocket.destroyed) clientSocket.destroy();
    });
  };
}
