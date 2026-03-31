/**
 * mountRoutes — wire shared HTTP routes and middleware onto a Hono app.
 *
 * Mounts routes conditionally based on which feature sub-containers are
 * present on the PlatformContainer. Products call this after building the
 * container; tRPC routers (admin, fleet-update, etc.) are mounted
 * separately by products since they need product-specific auth context.
 *
 * When `standalone` config is provided, core also mounts:
 *   - Internal service auth middleware on /trpc/* and /api/*
 *   - Core tRPC router (billing, settings, profile, page-context, org, fleet)
 *   - Product config endpoint GET /api/products/:slug
 *   - BetterAuth routes at /api/auth/* (when auth config is provided)
 */

import type { Hono } from "hono";
import { cors } from "hono/cors";
import { createVerifyEmailRoutesLazy } from "../api/routes/verify-email.js";
import { deriveCorsOrigins } from "../product-config/repository-types.js";
import type { BootConfig, RoutePlugin } from "./boot-config.js";
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
  openrouterApiKey?: string | null;
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
 *   2b. Internal service auth + tRPC + product config (standalone mode)
 *   2c. BetterAuth routes (when auth config provided)
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
  bootConfig?: Pick<BootConfig, "standalone" | "auth" | "chat" | "slug">,
): Promise<void> {
  // 1. CORS middleware
  // In standalone mode, allow origins from ALL products. In single-product mode, use boot-time config.
  let corsOrigins: string[];
  if (bootConfig?.standalone) {
    const allProducts = await container.productConfigService.listAll();
    corsOrigins = allProducts.flatMap((pc) => deriveCorsOrigins(pc.product, pc.domains));
  } else {
    corsOrigins = deriveCorsOrigins(container.productConfig.product, container.productConfig.domains);
  }
  app.use(
    "*",
    cors({
      origin: corsOrigins,
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: [
        "Content-Type",
        "Authorization",
        "X-Request-ID",
        "X-Tenant-ID",
        "X-Session-ID",
        "X-Product",
        "X-User-Id",
        "X-User-Roles",
        "X-Auth-Method",
      ],
      credentials: true,
    }),
  );

  // 1b. Per-request product config resolution (standalone mode)
  // Resolves X-Product header → ProductConfig via cached service lookup.
  // Downstream handlers read c.get("productConfig") instead of container.productConfig.
  if (bootConfig?.standalone) {
    app.use("*", async (c, next) => {
      const slug = c.req.header("x-product") ?? bootConfig.slug ?? "core";
      const resolved = await container.productConfigService.getBySlug(slug);
      if (resolved) {
        (c as unknown as { set(k: string, v: unknown): void }).set("productConfig", resolved);
      }
      return next();
    });
  }

  // 2. Health endpoint (always available)
  app.get("/health", (c) => c.json({ ok: true }));

  // 2b. Email verification endpoint (verify link from signup email)
  app.route(
    "/api/auth",
    createVerifyEmailRoutesLazy(
      () => container.pool,
      () => container.creditLedger,
      { uiOrigin: process.env.UI_ORIGIN },
    ),
  );

  // 2c. Standalone mode — internal auth + core tRPC + product config endpoint
  if (bootConfig?.standalone) {
    const { internalServiceAuth } = await import("../auth/internal-service-auth.js");
    const authMiddleware = internalServiceAuth({
      allowedTokens: bootConfig.standalone.allowedServiceTokens,
    });

    // Apply internal auth to /trpc/* and /api/* (but NOT /v1/* — gateway has its own auth,
    // and NOT /api/auth/* — BetterAuth login/signup/OAuth must be public)
    app.use("/trpc/*", authMiddleware);
    app.use("/api/*", async (c, next) => {
      // BetterAuth routes must bypass internal auth — they handle browser sessions directly
      if (c.req.path.startsWith("/api/auth")) return next();
      // Health check endpoint must be public (used by docker healthcheck / LB)
      if (c.req.path === "/api/health" || c.req.path === "/health") return next();
      // Product config endpoint — UIs call this on boot to get brand config
      if (c.req.path.startsWith("/api/products")) return next();
      // Chat SSE streams use browser session auth, not internal service auth
      if (c.req.path.startsWith("/api/chat")) return next();
      // Webhooks use their own signature verification (Stripe/crypto), not service tokens
      if (c.req.path.startsWith("/api/webhooks")) return next();
      return authMiddleware(c as never, next);
    });

    // Wire org member repo into tRPC middleware
    const { setTrpcOrgMemberRepo } = await import("../trpc/init.js");
    setTrpcOrgMemberRepo(container.orgMemberRepo);

    // Build CoreRouterDeps from the container
    const { createAssertOrgAdminOrOwner } = await import("../trpc/auth-helpers.js");
    const assertOrgAdminOrOwner = createAssertOrgAdminOrOwner(container.orgMemberRepo);

    /** Assert a container field exists (guaranteed in standalone mode). */
    function need<T>(value: T | null | undefined, name: string): T {
      if (value == null) throw new Error(`Standalone mode requires ${name} — check BootConfig.features`);
      return value;
    }

    const { createCoreRouter } = await import("../trpc/routers/core-router.js");
    const coreRouter = createCoreRouter({
      billing: {
        processor: need(container.processor, "processor"),
        tenantRepo: container.tenantCustomerRepo as never,
        creditLedger: container.creditLedger,
        meterAggregator: need(container.meterAggregator, "meterAggregator"),
        priceMap: container.priceMap ?? undefined,
        autoTopupSettingsStore: need(container.autoTopupSettingsRepo, "autoTopupSettingsRepo"),
        dividendRepo: need(container.dividendRepo, "dividendRepo"),
        spendingLimitsRepo: need(container.spendingLimitsRepo, "spendingLimitsRepo"),
        affiliateRepo: need(container.affiliateRepo, "affiliateRepo"),
        productConfig: container.productConfig,
        assertOrgAdminOrOwner,
      },
      settings: {
        serviceName: `${bootConfig.slug ?? "core"}-platform`,
        getNotificationPrefsStore: () => need(container.notificationPrefsRepo, "notificationPrefsRepo"),
      },
      profile: {
        getUser: (userId) => container.authUserRepo.getUser(userId),
        updateUser: (userId, data) => container.authUserRepo.updateUser(userId, data),
        changePassword: (userId, currentPassword, newPassword) =>
          container.authUserRepo.changePassword(userId, currentPassword, newPassword),
      },
      pageContext: {
        repo: need(container.pageContextRepo, "pageContextRepo"),
      },
      org: {
        orgService: container.orgService,
        authUserRepo: container.authUserRepo,
        creditLedger: container.creditLedger,
        meterAggregator: container.meterAggregator ?? undefined,
        processor: container.processor ?? undefined,
        priceMap: container.priceMap ?? undefined,
      },
      ...(container.fleet
        ? {
            fleet: {
              creditLedger: container.creditLedger,
              profileStore: container.fleet.profileStore,
              productConfig: container.productConfig, // Fallback — createInstance resolves per-product via resolveProductConfig
              serviceKeyRepo: container.fleet.serviceKeyRepo,
              assertOrgAdminOrOwner,
              getFleetForInstance: (_instanceId: string) => need(container.fleet, "fleet").manager as never,
              provisionSecret: config.provisionSecret,
              resolveProductConfig: (slug: string) => container.productConfigService.getBySlug(slug),
              poolRepo: container.poolRepo ?? undefined,
            },
          }
        : {}),
    });

    // Mount tRPC endpoint with internal context
    const { fetchRequestHandler } = await import("@trpc/server/adapters/fetch");
    const { createInternalTRPCContext } = await import("../trpc/internal-context.js");
    app.all("/trpc/*", async (c) => {
      const response = await fetchRequestHandler({
        endpoint: "/trpc",
        req: c.req.raw,
        router: coreRouter,
        createContext: () => createInternalTRPCContext(c as never),
      });
      return response;
    });

    // Product config endpoint — UI servers call this on boot to get brand config
    const { toBrandConfig } = await import("../product-config/repository-types.js");
    app.get("/api/products/:slug", async (c) => {
      const slug = c.req.param("slug");
      const productConfig = await container.productConfigService.getBySlug(slug);
      if (!productConfig) return c.json({ error: "Product not found" }, 404);
      return c.json(toBrandConfig(productConfig));
    });
  }

  // 2d. BetterAuth routes (when auth config provided)
  if (bootConfig?.auth) {
    const { initBetterAuth, runAuthMigrations, getAuth } = await import("../auth/better-auth.js");

    // In standalone mode, resolve all product domains for multi-brand auth.
    // BetterAuth needs to trust origins from ALL products, not just one.
    let baseURL: string | undefined;
    let cookieDomain: string | undefined;
    let trustedOrigins: string[] | undefined;

    if (bootConfig.standalone) {
      // Multi-product: trust all product domains
      const allProducts = await container.productConfigService.listAll();
      trustedOrigins = [];
      for (const pc of allProducts) {
        const p = pc.product;
        trustedOrigins.push(`https://${p.domain}`, `https://${p.appDomain}`);
        for (const d of pc.domains) {
          if (d.role !== "redirect") trustedOrigins.push(`https://${d.host}`);
        }
      }
      // No single baseURL or cookieDomain in multi-product mode — per-request resolution
      // happens via the Origin header matching trustedOrigins
    } else {
      // Single-product mode (backwards compat)
      const productDomain = container.productConfig.product?.domain;
      baseURL = productDomain ? `https://api.${productDomain}` : undefined;
      cookieDomain = productDomain ? `.${productDomain}` : undefined;
      trustedOrigins = productDomain ? [`https://${productDomain}`, `https://app.${productDomain}`] : undefined;
    }

    initBetterAuth({
      pool: container.pool,
      db: container.db,
      secret: bootConfig.auth.secret,
      baseURL,
      cookieDomain,
      trustedOrigins,
      socialProviders: bootConfig.auth.socialProviders,
      onUserCreated: async (userId) => {
        try {
          const { grantSignupCredits } = await import("../credits/signup-grant.js");
          const granted = await grantSignupCredits(container.creditLedger, userId);
          if (granted) {
            const { logger } = await import("../config/logger.js");
            logger.info(`Granted welcome credits to user ${userId}`);
          }
        } catch {
          // Non-fatal — credit grant failure shouldn't block signup
        }
        try {
          const org = await container.orgService.getOrCreatePersonalOrg(userId, "My Workspace");
          const { logger } = await import("../config/logger.js");
          logger.info(`Auto-created org ${org.id} for user ${userId}`);
        } catch {
          // Non-fatal — org creation failure shouldn't block signup
        }
      },
    });
    await runAuthMigrations();

    const { createAuthRoutes } = await import("../api/routes/auth.js");
    app.route("/api/auth", createAuthRoutes(getAuth()));
  }

  // 2e. Chat routes (when chat backend is provided)
  if (bootConfig?.chat) {
    const { createChatRoutes } = await import("../chat/routes.js");
    app.route("/api/chat", createChatRoutes({ backend: bootConfig.chat.backend }));
  }

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
        instanceImage: fleetConfig?.containerImage ?? "registry.wopr.bot/wopr:managed",
        containerPort: fleetConfig?.containerPort ?? 3000,
        maxInstancesPerTenant: fleetConfig?.maxInstances ?? 5,
      }),
    );
  }

  // 6. Metered inference gateway (when gateway is enabled)
  if (container.gateway) {
    // Fallback margin — only used when tenant has no product slug (shouldn't happen in production)
    const fallbackMargin =
      (container.productConfig.billing?.marginConfig as { default?: number } | null)?.default ?? 4.0;

    const gw = container.gateway;
    const { mountGateway } = await import("../gateway/index.js");
    mountGateway(app, {
      meter: gw.meter,
      budgetChecker: gw.budgetChecker,
      creditLedger: container.creditLedger,
      // Margin and model are resolved per-tenant at key resolution time.
      // The proxy reads tenant.margin and tenant.defaultModel directly.
      // These fallbacks exist only for tests and edge cases.
      defaultMargin: fallbackMargin,
      providers: {
        openrouter: config.openrouterApiKey ? { apiKey: config.openrouterApiKey } : undefined,
      },
      resolveServiceKey: async (key: string) => {
        const tenant = await gw.serviceKeyRepo.resolve(key);
        if (!tenant) return null;

        // Resolve product config and attach margin + model to the tenant.
        // Everything comes from the DB, nothing from boot state.
        if (tenant.productSlug) {
          const pc = await container.productConfigService.getBySlug(tenant.productSlug);
          if (pc) {
            const mc = pc.billing?.marginConfig as { default?: number } | null;
            tenant.margin = mc?.default ?? fallbackMargin;
            // defaultModel lives on product presets
            const preset = pc.product as unknown as { defaultModel?: string };
            tenant.defaultModel = preset?.defaultModel ?? null;
          }
        }

        return tenant;
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
