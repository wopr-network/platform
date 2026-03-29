/**
 * mountRoutes — wire shared HTTP routes and middleware onto a Hono app.
 *
 * Mounts routes conditionally based on which feature sub-containers are
 * present on the PlatformContainer. Products call this after building the
 * container; tRPC routers (admin, fleet-update, etc.) are mounted
 * separately by products since they need product-specific auth context.
 */

import type { Hono } from "hono";
import { cors } from "hono/cors";
import { deriveCorsOrigins } from "../product-config/repository-types.js";
import type { RoutePlugin } from "./boot-config.js";
import type { PlatformContainer } from "./container.js";
import { createTenantProxyMiddleware } from "./middleware/tenant-proxy.js";
import { createCryptoWebhookRoutes } from "./routes/crypto-webhook.js";
import { createProvisionWebhookRoutes } from "./routes/provision-webhook.js";
import { createStripeWebhookRoutes } from "./routes/stripe-webhook.js";

// ---------------------------------------------------------------------------
// Config accepted at mount time
// ---------------------------------------------------------------------------

export interface MountConfig {
  provisionSecret: string;
  cryptoServiceKey?: string;
  platformDomain: string;
}

// ---------------------------------------------------------------------------
// mountRoutes
// ---------------------------------------------------------------------------

/**
 * Mount all shared routes and middleware onto a Hono app based on the
 * container's enabled feature slices.
 *
 * Mount order:
 *   1. CORS middleware (from productConfig domain list)
 *   2. Health endpoint (always)
 *   3. Crypto webhook (if crypto enabled)
 *   4. Stripe webhook (if stripe enabled)
 *   5. Provision webhook (if fleet enabled)
 *   6. Product-specific route plugins
 *   7. Tenant proxy middleware (catch-all — must be last)
 */
export async function mountRoutes(
  app: Hono,
  container: PlatformContainer,
  config: MountConfig,
  plugins: RoutePlugin[] = [],
): Promise<void> {
  // 1. CORS middleware
  const origins = deriveCorsOrigins(container.productConfig.product, container.productConfig.domains);
  app.use(
    "*",
    cors({
      origin: origins,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization", "X-Request-ID", "X-Tenant-ID", "X-Session-ID"],
      credentials: true,
    }),
  );

  // 2. Health endpoint (always available)
  app.get("/health", (c) => c.json({ ok: true }));

  // 3. Crypto webhook (when crypto payments are enabled)
  if (container.crypto) {
    app.route(
      "/api/webhooks/crypto",
      createCryptoWebhookRoutes(container, {
        provisionSecret: config.provisionSecret,
        cryptoServiceKey: config.cryptoServiceKey,
      }),
    );
  }

  // 4. Stripe webhook (when stripe billing is enabled)
  if (container.stripe) {
    app.route("/api/webhooks/stripe", createStripeWebhookRoutes(container));
  }

  // 5. Provision webhook (when fleet management is enabled)
  if (container.fleet) {
    const fleetConfig = container.productConfig.fleet;
    app.route(
      "/api/provision",
      createProvisionWebhookRoutes(container, {
        provisionSecret: config.provisionSecret,
        instanceImage: fleetConfig?.containerImage ?? "ghcr.io/default:latest",
        containerPort: fleetConfig?.containerPort ?? 3000,
        maxInstancesPerTenant: fleetConfig?.maxInstances ?? 5,
      }),
    );
  }

  // 6. Metered inference gateway (when gateway is enabled)
  if (container.gateway) {
    // Validate billing config exists in DB — fail hard, no silent defaults
    const billingConfig = container.productConfig.billing;
    const marginConfig = billingConfig?.marginConfig as { default?: number } | null;
    if (!marginConfig?.default) {
      throw new Error(
        "Gateway enabled but product_billing_config.margin_config.default is not set. " +
          "Seed the DB: INSERT INTO product_billing_config (product_id, margin_config) VALUES ('<id>', '{\"default\": 4.0}')",
      );
    }

    // Live margin — reads from productConfig per-request (DB-cached with TTL)
    const initialMargin = marginConfig.default;
    const resolveMargin = (): number => {
      const cfg = container.productConfig.billing?.marginConfig as { default?: number } | null;
      return cfg?.default ?? initialMargin;
    };

    const gw = container.gateway;
    const { mountGateway } = await import("../gateway/index.js");
    mountGateway(app, {
      meter: gw.meter,
      budgetChecker: gw.budgetChecker,
      creditLedger: container.creditLedger,
      resolveMargin,
      providers: {
        openrouter: process.env.OPENROUTER_API_KEY
          ? { apiKey: process.env.OPENROUTER_API_KEY, baseUrl: process.env.OPENROUTER_BASE_URL || undefined }
          : undefined,
      },
      resolveServiceKey: async (key: string) => {
        const tenant = await gw.serviceKeyRepo.resolve(key);
        return tenant ?? null;
      },
    });
  }

  // 7. Product-specific route plugins
  for (const plugin of plugins) {
    app.route(plugin.path, plugin.handler(container));
  }

  // 7. Tenant proxy middleware (catch-all — MUST be last)
  if (container.fleet) {
    app.use(
      "*",
      createTenantProxyMiddleware(container, {
        platformDomain: config.platformDomain,
        resolveUser: async (req: Request) => {
          try {
            const { getAuth } = await import("../auth/better-auth.js");
            const auth = getAuth();
            const session = await auth.api.getSession({ headers: req.headers });
            if (!session?.user) return undefined;
            return {
              id: session.user.id,
              email: session.user.email ?? undefined,
              name: session.user.name ?? undefined,
            };
          } catch {
            return undefined;
          }
        },
      }),
    );
  }
}
