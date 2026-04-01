import { resolve4, resolve6 } from "node:dns/promises";
import { isIP } from "node:net";
import { logger } from "../config/logger.js";
import type { ProductRouteConfig } from "./caddy-config.js";
import { generateCaddyConfig } from "./caddy-config.js";
import type { ProxyManagerInterface, ProxyRoute } from "./types.js";

/**
 * Normalize an IPv6 address to its full canonical form for reliable comparison.
 * Expands :: shorthand and pads each group to 4 hex digits.
 */
function normalizeIPv6(ip: string): string {
  // Handle IPv4-mapped IPv6 (::ffff:a.b.c.d)
  const v4MappedMatch = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4MappedMatch) {
    return `v4mapped:${v4MappedMatch[1]}`;
  }

  // Split on :: to expand the zero-fill shorthand
  const halves = ip.split("::");
  let groups: string[];
  if (halves.length === 2) {
    const left = halves[0] ? halves[0].split(":") : [];
    const right = halves[1] ? halves[1].split(":") : [];
    const missing = 8 - left.length - right.length;
    const fill = Array(missing).fill("0000");
    groups = [...left, ...fill, ...right];
  } else {
    groups = ip.split(":");
  }

  return groups.map((g) => g.padStart(4, "0").toLowerCase()).join(":");
}

const DEFAULT_CADDY_ADMIN_URL = "http://localhost:2019";

/** Regex for valid DNS subdomain labels (RFC 1123). */
const SUBDOMAIN_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Returns true if the given IPv4 address string belongs to a private/reserved range.
 */
function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return false;
  const [a, b] = parts;
  return (
    a === 127 || // 127.0.0.0/8  loopback
    a === 10 || // 10.0.0.0/8   private
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12 private
    (a === 192 && b === 168) || // 192.168.0.0/16 private
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local
    a === 0 // 0.0.0.0/8
  );
}

/**
 * Returns true if the given IPv4 address is a trusted internal address.
 * This allows Docker container IPs (172.16.0.0/12) and loopback (127.0.0.0/8 and ::1)
 * to be used as upstream hosts for internally-routed requests (e.g. WOPR bot containers).
 */
function isTrustedInternalIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return false;
  const [a, b] = parts;
  return (
    a === 127 || // 127.0.0.0/8  loopback
    (a === 172 && b >= 16 && b <= 31) // 172.16.0.0/12 Docker default bridge network
  );
}

/**
 * Returns true if the given IPv6 address string belongs to a private/reserved range.
 * Normalizes to canonical form first to catch non-standard representations.
 */
function isPrivateIPv6(ip: string): boolean {
  const canonical = normalizeIPv6(ip);

  // Handle IPv4-mapped IPv6 addresses (::ffff:a.b.c.d) — delegate to IPv4 check
  if (canonical.startsWith("v4mapped:")) {
    return isPrivateIPv4(canonical.slice("v4mapped:".length));
  }

  return (
    canonical === "0000:0000:0000:0000:0000:0000:0000:0001" || // ::1 loopback
    canonical.startsWith("fe80") || // link-local
    canonical.startsWith("fc") || // unique local
    canonical.startsWith("fd") || // unique local
    canonical === "0000:0000:0000:0000:0000:0000:0000:0000" // :: unspecified
  );
}

/**
 * Validate that an upstream host is not a private/internal IP address,
 * unless it is a trusted internal address (loopback or Docker container range).
 * Resolves hostnames via DNS and checks all resolved IPs against private ranges.
 * Throws if the host resolves to or is a non-trusted private IP.
 */
async function validateUpstreamHost(host: string): Promise<void> {
  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    // Allow trusted internal IPs (loopback + Docker 172.16.0.0/12)
    if (isTrustedInternalIPv4(host)) return;
    if (isPrivateIPv4(host)) {
      throw new Error(`Upstream host "${host}" resolves to a private IP address`);
    }
    return;
  }
  if (ipVersion === 6) {
    if (isPrivateIPv6(host)) {
      throw new Error(`Upstream host "${host}" resolves to a private IP address`);
    }
    return;
  }

  // It's a hostname — normalize to lowercase since DNS is case-insensitive
  const normalizedHost = host.toLowerCase();

  // Reject obviously dangerous names first
  if (normalizedHost === "localhost" || normalizedHost.endsWith(".local") || normalizedHost.endsWith(".internal")) {
    throw new Error(`Upstream host "${host}" resolves to a private IP address`);
  }

  // Allow internal WOPR container hostnames — these resolve to Docker bridge
  // IPs (172.x.x.x) which are only reachable inside the Docker network.
  // DNS resolution would fail from the host since the names are only
  // resolvable via Docker's embedded DNS server.
  if (/^wopr-[a-z0-9][a-z0-9_-]*$/.test(normalizedHost)) {
    return;
  }

  // Resolve DNS and validate all resulting IPs
  const ips: string[] = [];
  let v4NotFound = false;
  try {
    const ipv4 = await resolve4(normalizedHost);
    ips.push(...ipv4);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      v4NotFound = true; // No A records — host may be IPv6-only
    } else {
      throw new Error(`DNS resolution failed for "${host}": ${code ?? "unknown error"}`);
    }
  }
  try {
    const ipv6 = await resolve6(normalizedHost);
    ips.push(...ipv6);
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      // No AAAA records — host may be IPv4-only
    } else if (v4NotFound) {
      // Both lookups failed with non-ENOTFOUND — reject
      throw new Error(`DNS resolution failed for "${host}": ${code ?? "unknown error"}`);
    }
    // If v4 succeeded but v6 fails transiently, we still have IPs to check
  }

  if (ips.length === 0) {
    throw new Error(`Upstream host "${host}" could not be resolved`);
  }

  for (const ip of ips) {
    if (isIP(ip) === 4 && isTrustedInternalIPv4(ip)) continue; // Allow trusted internal IPs
    if (isIP(ip) === 4 && isPrivateIPv4(ip)) {
      throw new Error(`Upstream host "${host}" resolves to a private IP address`);
    }
    if (isIP(ip) === 6 && isPrivateIPv6(ip)) {
      throw new Error(`Upstream host "${host}" resolves to a private IP address`);
    }
  }
}

export interface ProxyManagerOptions {
  /** Caddy admin API URL (default: "http://localhost:2019") */
  caddyAdminUrl?: string;
  /** Cloudflare API token for wildcard TLS. */
  cloudflareApiToken: string;
  /** Static product route configs. */
  products: ProductRouteConfig[];
  /** Core server upstream (default: "core:3001"). */
  coreUpstream?: string;
}

/**
 * Manages proxy routes and syncs them to Caddy via its admin API.
 */
export class ProxyManager implements ProxyManagerInterface {
  private readonly routes = new Map<string, ProxyRoute>();
  private readonly caddyAdminUrl: string;
  private readonly cloudflareApiToken: string;
  private readonly products: ProductRouteConfig[];
  private readonly coreUpstream: string;
  private running = false;

  constructor(options: ProxyManagerOptions) {
    if (!options.cloudflareApiToken) throw new Error("cloudflareApiToken is required");
    if (!options.products || options.products.length === 0) throw new Error("products is required");
    this.caddyAdminUrl = options.caddyAdminUrl ?? DEFAULT_CADDY_ADMIN_URL;
    this.cloudflareApiToken = options.cloudflareApiToken;
    this.products = options.products;
    this.coreUpstream = options.coreUpstream ?? "core:3001";
  }

  async addRoute(route: ProxyRoute): Promise<void> {
    if (!SUBDOMAIN_RE.test(route.subdomain)) {
      throw new Error(`Invalid subdomain "${route.subdomain}": must match /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/`);
    }
    await validateUpstreamHost(route.upstreamHost);
    this.routes.set(route.instanceId, route);
    logger.info(`Added proxy route for instance ${route.instanceId} -> ${route.upstreamHost}:${route.upstreamPort}`);
  }

  removeRoute(instanceId: string): void {
    const removed = this.routes.delete(instanceId);
    if (removed) {
      logger.info(`Removed proxy route for instance ${instanceId}`);
    }
  }

  updateHealth(instanceId: string, healthy: boolean): void {
    const route = this.routes.get(instanceId);
    if (route) {
      route.healthy = healthy;
      logger.info(`Updated health for instance ${instanceId}: ${healthy ? "healthy" : "unhealthy"}`);
    }
  }

  getRoutes(): ProxyRoute[] {
    return [...this.routes.values()];
  }

  /**
   * Mark the proxy manager as started. Does not start Caddy itself --
   * Caddy is expected to be running as a separate process/container.
   */
  async start(): Promise<void> {
    this.running = true;
    if (this.products.length === 0) throw new Error("No products configured — cannot start proxy manager");
    if (!this.cloudflareApiToken) throw new Error("cloudflareCaddyDnsToken missing — wildcard TLS requires it");
    logger.info("Proxy manager starting — pushing Caddyfile to Caddy admin API");
    try {
      await this.pushCaddyfile();
    } catch (err) {
      logger.warn("Proxy manager failed to push Caddyfile — falling back to static config", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async stop(): Promise<void> {
    this.running = false;
    logger.info("Proxy manager stopped");
  }

  /**
   * Push current route config to Caddy via its admin API.
   */
  async reload(): Promise<void> {
    if (!this.running) {
      logger.warn("Proxy manager not running, skipping reload");
      return;
    }

    if (!this.cloudflareApiToken) {
      throw new Error("Cannot reload Caddy: cloudflareApiToken not configured");
    }
    const config = generateCaddyConfig({
      cloudflareApiToken: this.cloudflareApiToken,
      products: this.products,
      instanceRoutes: this.getRoutes(),
      coreUpstream: this.coreUpstream,
    });
    const url = `${this.caddyAdminUrl}/load`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: this.caddyAdminUrl,
          Host: new URL(this.caddyAdminUrl).host,
        },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Caddy reload failed (${response.status}): ${body}`);
      }

      logger.info(`Caddy config reloaded with ${this.routes.size} route(s)`);
    } catch (err) {
      logger.error("Failed to reload Caddy config", {
        error: err instanceof Error ? err.message : String(err),
        cause: err instanceof Error && err.cause ? String(err.cause) : undefined,
        url,
      });
      throw err;
    }
  }

  /**
   * Generate a Caddyfile string and push it to Caddy's admin API.
   * Includes static product routes + wildcard subdomain routes with CF DNS TLS.
   * The CF token stays in memory — never written to disk.
   */
  private async pushCaddyfile(): Promise<void> {
    const lines: string[] = [
      "{",
      `\tadmin 0.0.0.0:2019 {`,
      `\t\torigins caddy:2019 core:2019 localhost:2019`,
      `\t}`,
      "}",
      "",
    ];

    for (const p of this.products) {
      // Root domain → UI
      lines.push(`${p.domain} {`);
      lines.push(`\treverse_proxy ${p.uiUpstream}`);
      lines.push("}");

      // api.domain → core
      lines.push(`api.${p.domain} {`);
      lines.push(`\treverse_proxy ${p.apiUpstream}`);
      lines.push("}");

      // *.domain → core (tenant proxy handles routing)
      lines.push(`*.${p.domain} {`);
      lines.push(`\ttls {`);
      lines.push(`\t\tdns cloudflare ${this.cloudflareApiToken}`);
      lines.push(`\t}`);
      lines.push(`\thandle {`);
      lines.push(`\t\treverse_proxy ${this.coreUpstream}`);
      lines.push(`\t}`);
      lines.push("}");

      lines.push("");
    }

    const caddyfile = lines.join("\n");
    const url = `${this.caddyAdminUrl}/load`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/caddyfile",
        Origin: this.caddyAdminUrl,
        Host: new URL(this.caddyAdminUrl).host,
      },
      body: caddyfile,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Caddy load failed (${response.status}): ${body}`);
    }

    logger.info(`Caddy config pushed via admin API`, {
      products: this.products.map((p) => p.slug),
      wildcards: this.products.map((p) => `*.${p.domain}`),
    });
  }

  /** Whether the proxy manager is currently active. */
  get isRunning(): boolean {
    return this.running;
  }
}
