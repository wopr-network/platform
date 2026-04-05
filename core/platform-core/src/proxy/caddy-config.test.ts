import { describe, expect, it } from "vitest";
import { type CaddyConfigOptions, generateCaddyConfig, type ProductRouteConfig } from "./caddy-config.js";
import type { ProxyRoute } from "./types.js";

function makeProduct(overrides: Partial<ProductRouteConfig> = {}): ProductRouteConfig {
  return {
    slug: "testapp",
    domain: "testapp.dev",
    uiUpstream: "testapp-ui:3002",
    apiUpstream: "core:3001",
    ...overrides,
  };
}

function makeOpts(overrides: Partial<CaddyConfigOptions> = {}): CaddyConfigOptions {
  return {
    cloudflareApiToken: "cf-test-token",
    products: [makeProduct()],
    ...overrides,
  };
}

function makeRoute(overrides: Partial<ProxyRoute> = {}): ProxyRoute {
  return {
    instanceId: "inst-1",
    upstreamHost: "203.0.113.2",
    upstreamPort: 7437,
    subdomain: "inst-1",
    healthy: true,
    ...overrides,
  };
}

describe("generateCaddyConfig", () => {
  it("generates product routes with no instance routes", () => {
    const config = generateCaddyConfig(makeOpts());
    const routes = (config.apps as any).http.servers.srv0.routes;

    // Product generates: domain→UI, api.domain→core, *.domain→core
    expect(routes.length).toBeGreaterThanOrEqual(3);
  });

  it("generates empty routes with no products", () => {
    const config = generateCaddyConfig(makeOpts({ products: [] }));
    const routes = (config.apps as any).http.servers.srv0.routes;

    expect(routes).toEqual([]);
  });

  it("routes product domain to UI upstream", () => {
    const config = generateCaddyConfig(makeOpts());
    const routes = (config.apps as any).http.servers.srv0.routes;

    // First route: domain → UI
    expect(routes[0].match).toEqual([{ host: ["testapp.dev"] }]);
  });

  it("routes api subdomain to core upstream", () => {
    const config = generateCaddyConfig(makeOpts());
    const routes = (config.apps as any).http.servers.srv0.routes;

    // Second route: api.domain → core
    expect(routes[1].match).toEqual([{ host: ["api.testapp.dev"] }]);
  });

  it("routes wildcard subdomain to core for tenant proxy", () => {
    const config = generateCaddyConfig(makeOpts());
    const routes = (config.apps as any).http.servers.srv0.routes;

    // Third route: *.domain → core
    expect(routes[2].match).toEqual([{ host: ["*.testapp.dev"] }]);
  });

  it("includes instance routes when provided", () => {
    const config = generateCaddyConfig(makeOpts({ instanceRoutes: [makeRoute()] }));
    const routes = (config.apps as any).http.servers.srv0.routes;

    // 3 product routes + 1 instance route
    expect(routes.length).toBe(4);

    // Instance route: subdomain.domain → container
    const instanceRoute = routes[3];
    expect(instanceRoute.match).toEqual([{ host: ["inst-1.testapp.dev"] }]);
  });

  it("handles multiple products", () => {
    const config = generateCaddyConfig(
      makeOpts({
        products: [
          makeProduct({ slug: "alpha", domain: "alpha.dev", uiUpstream: "alpha-ui:3002" }),
          makeProduct({ slug: "beta", domain: "beta.dev", uiUpstream: "beta-ui:3003" }),
        ],
      }),
    );
    const routes = (config.apps as any).http.servers.srv0.routes;

    // Each product: domain, api.domain = 2 routes, then 1 wildcard catch-all
    // alpha: alpha.dev, api.alpha.dev
    // beta: beta.dev, api.beta.dev
    // wildcard: *.alpha.dev, *.beta.dev (merged into one route)
    expect(routes.length).toBe(5);
  });

  it("configures TLS with cloudflare DNS challenge", () => {
    const config = generateCaddyConfig(makeOpts({ cloudflareApiToken: "my-cf-token" }));
    const tls = (config.apps as any).tls;

    expect(tls.automation.policies[0].issuers[0].challenges.dns.provider.api_token).toBe("my-cf-token");
  });

  it("includes HTTP→HTTPS redirect server", () => {
    const config = generateCaddyConfig(makeOpts());
    const redirect = (config.apps as any).http.servers.srv_redirect;

    expect(redirect.listen).toEqual([":80"]);
    expect(redirect.routes[0].handle[0].status_code).toBe(301);
  });

  it("uses correct upstream dial format for instances", () => {
    const config = generateCaddyConfig(
      makeOpts({ instanceRoutes: [makeRoute({ upstreamHost: "198.51.100.50", upstreamPort: 9000 })] }),
    );
    const routes = (config.apps as any).http.servers.srv0.routes;
    const instanceRoute = routes[routes.length - 1];

    expect(instanceRoute.handle[0]).toEqual(
      expect.objectContaining({
        handler: "reverse_proxy",
        upstreams: [{ dial: "198.51.100.50:9000" }],
      }),
    );
  });
});
