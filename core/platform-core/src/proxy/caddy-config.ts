/**
 * Caddy JSON config generator.
 *
 * Produces a complete Caddy config from product definitions + dynamic instance routes.
 * Pushed to Caddy's admin API at boot — no Caddyfile needed.
 * CF DNS token from Vault enables wildcard TLS for instance subdomains.
 */

export interface ProductRouteConfig {
  /** Product slug (e.g., "paperclip") */
  slug: string;
  /** Root domain (e.g., "runpaperclip.com") */
  domain: string;
  /** UI container hostname:port (e.g., "paperclip-ui:3002") */
  uiUpstream: string;
  /** API upstream hostname:port (e.g., "core:3001") */
  apiUpstream: string;
}

export interface CaddyConfigOptions {
  /** Cloudflare API token for DNS-01 TLS challenge (wildcard certs). */
  cloudflareApiToken: string;
  /** Static product route configs (UIs + API). */
  products: ProductRouteConfig[];
  /** Core server upstream (default: "core:3001"). */
  coreUpstream?: string;
}

function route(match: Record<string, unknown>[], handle: unknown[]) {
  return { match, handle };
}

function hostMatch(...hosts: string[]) {
  return { host: hosts };
}

const proxyHeaders = {
  "X-Real-IP": ["{http.request.remote.host}"],
  "X-Forwarded-For": ["{http.request.remote.host}"],
  "X-Forwarded-Proto": ["{http.request.scheme}"],
};

function reverseProxyWithHeaders(upstream: string) {
  return {
    handler: "reverse_proxy",
    upstreams: [{ dial: upstream }],
    headers: { request: { set: proxyHeaders } },
  };
}

/**
 * Generate a complete Caddy JSON config.
 *
 * Includes:
 * - Static product routes (UI + API per product)
 * - Wildcard subdomain routes for instance proxying (→ core)
 * - TLS automation with Cloudflare DNS-01 challenge
 * - Dynamic instance routes (healthy/unhealthy)
 */
export function generateCaddyConfig(options: CaddyConfigOptions): Record<string, unknown> {
  const { cloudflareApiToken, products, coreUpstream = "core:3001" } = options;

  const routes: unknown[] = [];
  const wildcardDomains: string[] = [];

  // Static product routes
  for (const product of products) {
    // Root domain → UI
    routes.push(route([hostMatch(product.domain)], [reverseProxyWithHeaders(product.uiUpstream)]));

    // api.domain → core
    routes.push(route([hostMatch(`api.${product.domain}`)], [reverseProxyWithHeaders(product.apiUpstream)]));

    // *.domain → core (tenant proxy handles routing to instance containers)
    wildcardDomains.push(`*.${product.domain}`);
  }

  // Wildcard routes → core (catch-all for instance subdomains)
  if (wildcardDomains.length > 0) {
    routes.push(route([hostMatch(...wildcardDomains)], [reverseProxyWithHeaders(coreUpstream)]));
  }

  // Collect all domains for TLS
  const allDomains: string[] = [];
  for (const product of products) {
    allDomains.push(product.domain, `api.${product.domain}`, `*.${product.domain}`);
  }

  return {
    apps: {
      http: {
        servers: {
          srv0: {
            listen: [":443"],
            routes,
          },
          // HTTP → HTTPS redirect
          srv_redirect: {
            listen: [":80"],
            routes: [
              {
                handle: [
                  {
                    handler: "static_response",
                    headers: {
                      Location: ["https://{http.request.host}{http.request.uri}"],
                    },
                    status_code: 301,
                  },
                ],
              },
            ],
          },
        },
      },
      tls: {
        automation: {
          policies: [
            {
              subjects: allDomains,
              issuers: [
                {
                  module: "acme",
                  challenges: {
                    dns: {
                      provider: {
                        name: "cloudflare",
                        api_token: cloudflareApiToken,
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    },
  };
}
