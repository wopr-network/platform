import { logger } from "../config/logger.js";
import type { ProductRouteConfig } from "./caddy-config.js";
import { generateCaddyConfig } from "./caddy-config.js";
import type { ProxyManagerInterface } from "./types.js";

const DEFAULT_CADDY_ADMIN_URL = "http://localhost:2019";

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
 * Manages the Caddy reverse-proxy config for the platform's product domains.
 *
 * Per-instance subdomain routing is no longer used — Caddy gets a static
 * product config (root domain → UI, api.domain → core, *.domain → core)
 * and the tenant-proxy middleware in core handles instance dispatch via
 * the /_sidecar/* path.
 */
export class ProxyManager implements ProxyManagerInterface {
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

      logger.info("Caddy config reloaded");
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
