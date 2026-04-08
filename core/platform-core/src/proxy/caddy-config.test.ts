import { describe, expect, it } from "vitest";
import { type CaddyConfigOptions, generateCaddyConfig, type ProductRouteConfig } from "./caddy-config.js";

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
});
