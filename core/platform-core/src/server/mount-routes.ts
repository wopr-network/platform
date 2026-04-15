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
import { DrizzleBotInstanceRepository } from "../fleet/drizzle-bot-instance-repository.js";
import { deriveCorsOrigins } from "../product-config/repository-types.js";
import type { BootConfig, RoutePlugin } from "./boot-config.js";
import type { PlatformContainer } from "./container.js";
import { createTenantProxyMiddleware } from "./middleware/tenant-proxy.js";
import { createCryptoWebhookRoutes } from "./routes/crypto-webhook.js";
import { createOnboardingChatRoutes } from "./routes/onboarding-chat.js";
import { createProvisionWebhookRoutes } from "./routes/provision-webhook.js";
import { createStripeWebhookRoutes } from "./routes/stripe-webhook.js";

// ---------------------------------------------------------------------------
// Config accepted at mount time
// ---------------------------------------------------------------------------

/**
 * Resolve product slug from request headers: X-Product → Origin → Host.
 * Used by all middleware that needs to know which product a request is for.
 */
/**
 * Resolve product slug from request headers: X-Product → Origin → Referer → Host.
 * Throws if the product cannot be determined — an unresolved product is a bug, not a fallback.
 */
async function resolveProductSlug(
  req: { header(name: string): string | undefined },
  productConfigService: PlatformContainer["productConfigService"],
): Promise<string> {
  const explicit = req.header("x-product");
  if (explicit) return explicit;

  const candidates: string[] = [];
  const origin = req.header("origin") ?? "";
  const referer = req.header("referer") ?? "";
  try {
    if (origin) candidates.push(new URL(origin).hostname);
  } catch {
    /* skip */
  }
  try {
    if (referer) candidates.push(new URL(referer).hostname);
  } catch {
    /* skip */
  }
  const reqHost = req.header("host")?.split(":")[0];
  if (reqHost) {
    candidates.push(reqHost);
    if (reqHost.startsWith("api.")) candidates.push(reqHost.slice(4));
    // Instance subdomains: breeee.runpaperclip.com → runpaperclip.com
    const parts = reqHost.split(".");
    if (parts.length > 2) candidates.push(parts.slice(1).join("."));
  }

  const allProducts = await productConfigService.listAll();
  for (const candidate of candidates) {
    for (const pc of allProducts) {
      if (pc.product?.domain === candidate || pc.product?.appDomain === candidate) {
        if (!pc.product.slug) throw new Error(`Product matched domain ${candidate} but has no slug`);
        return pc.product.slug;
      }
      if (pc.domains?.some((d) => d.host === candidate)) {
        if (!pc.product?.slug) throw new Error(`Product matched domain ${candidate} but has no slug`);
        return pc.product.slug;
      }
    }
  }

  throw new Error(
    `Cannot resolve product from request (origin=${origin}, host=${reqHost}). Every request must be attributable to a product.`,
  );
}

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
  bootConfig?: Pick<BootConfig, "standalone" | "auth" | "chat" | "slug" | "secrets" | "databaseUrl" | "features">,
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
      const { logger } = await import("../config/logger.js");
      // Health check is internal (localhost, no Origin) — skip product resolution
      if (c.req.path === "/health" || c.req.path === "/api/health") return next();
      // Internal node agent routes — infrastructure, not product-scoped
      if (c.req.path.startsWith("/internal/")) return next();
      // Gateway routes authenticate via API key, not product header — skip product resolution
      if (c.req.path.startsWith("/v1/") || c.req.path.startsWith("/gateway/")) return next();
      let slug: string;
      try {
        slug = await resolveProductSlug(c.req, container.productConfigService);
      } catch (err) {
        logger.warn("Product resolution failed", {
          host: c.req.header("host"),
          origin: c.req.header("origin"),
          path: c.req.path,
          method: c.req.method,
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
      const resolved = await container.productConfigService.getBySlug(slug);
      logger.info("Product resolved", {
        slug,
        resolved: Boolean(resolved),
        host: c.req.header("host"),
        path: c.req.path,
        method: c.req.method,
      });
      if (resolved) {
        const ctx = c as unknown as { set(k: string, v: unknown): void };
        ctx.set("productConfig", resolved);
        ctx.set("product", slug);
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
      {
        productConfigService: container.productConfigService,
        resolveProductSlug: (req) => resolveProductSlug(req, container.productConfigService),
      },
    ),
  );

  // 2c. Standalone mode — internal auth + core tRPC + product config endpoint
  if (bootConfig?.standalone) {
    const { internalServiceAuth } = await import("../auth/internal-service-auth.js");
    const authMiddleware = internalServiceAuth({
      allowedTokens: bootConfig.standalone.allowedServiceTokens,
    });

    // Apply internal auth to /trpc/* and /api/*. Browser requests use session cookies
    // (no service token), so fall through to BetterAuth session validation.
    const { getAuthForProduct: getAuthForTrpc } = await import("../auth/better-auth.js");
    const { logger: trpcAuthLogger } = await import("../config/logger.js");
    app.use("/trpc/*", async (c, next) => {
      const ctx = c as unknown as { set(k: string, v: unknown): void };
      const path = c.req.path;

      // If a service token is present, use internal auth (server-to-server)
      if (c.req.header("Authorization")) {
        trpcAuthLogger.debug("tRPC auth: service token", { path });
        return authMiddleware(c as never, next);
      }

      // No service token — try BetterAuth session (browser direct calls)
      trpcAuthLogger.info("tRPC auth: no token, trying session", {
        path,
        hasCookies: !!c.req.header("cookie"),
        origin: c.req.header("origin") ?? "(none)",
      });

      const slug = await resolveProductSlug(c.req, container.productConfigService);
      const auth = await getAuthForTrpc(slug);
      const session = await auth.api.getSession({ headers: c.req.raw.headers });

      if (!session?.user) {
        trpcAuthLogger.warn("tRPC auth: no valid session", { path, slug });
        return c.json({ error: "Unauthorized" }, 401);
      }

      const role = (session.user as Record<string, unknown>).role ?? "user";
      trpcAuthLogger.info("tRPC auth: session valid", {
        path,
        userId: session.user.id,
        role,
        slug,
      });

      // Resolve tenant and verify product matches
      const tenantId = c.req.header("x-tenant-id") ?? session.user.id;
      const { tenants: tenantsTable } = await import("../db/schema/index.js");
      const { eq } = await import("drizzle-orm");
      const [tenant] = await container.db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);
      if (tenant) {
        if (!tenant.productSlug) {
          // First request for this tenant — stamp it with the product
          await container.db.update(tenantsTable).set({ productSlug: slug }).where(eq(tenantsTable.id, tenantId));
          trpcAuthLogger.info("Stamped tenant with product", { tenantId, slug });
        } else if (tenant.productSlug !== slug) {
          trpcAuthLogger.warn("Product mismatch", {
            tenantId,
            tenantProduct: tenant.productSlug,
            requestProduct: slug,
          });
          return c.json({ error: `Tenant belongs to ${tenant.productSlug}, not ${slug}` }, 403);
        }
      }

      // Set context variables that tRPC handlers expect
      ctx.set("userId", session.user.id);
      ctx.set("userEmail", session.user.email ?? "");
      ctx.set("tenantId", tenantId);
      ctx.set("product", slug);
      ctx.set("user", { id: session.user.id, roles: [role] });
      ctx.set("userRoles", [role]);
      ctx.set("authMethod", "session");
      ctx.set("requestId", c.req.header("x-request-id") ?? crypto.randomUUID());
      ctx.set("serviceName", "browser");
      return next();
    });
    app.use("/api/*", async (c, next) => {
      const { logger: apiAuthLogger } = await import("../config/logger.js");
      // BetterAuth routes must bypass internal auth — they handle browser sessions directly
      if (c.req.path.startsWith("/api/auth")) {
        apiAuthLogger.debug("api/* bypass: auth route", { path: c.req.path });
        return next();
      }
      // Health check endpoint must be public (used by docker healthcheck / LB)
      if (c.req.path === "/api/health" || c.req.path === "/health") return next();
      // Product config endpoint — UIs call this on boot to get brand config
      if (c.req.path.startsWith("/api/products")) {
        apiAuthLogger.debug("api/* bypass: products", { path: c.req.path });
        return next();
      }
      // Settings/profile use browser session auth (handled in the route handlers)
      if (c.req.path.startsWith("/api/settings")) {
        apiAuthLogger.debug("api/* bypass: settings", { path: c.req.path });
        return next();
      }
      // Chat SSE streams use browser session auth, not internal service auth
      if (c.req.path.startsWith("/api/chat")) {
        apiAuthLogger.debug("api/* bypass: chat", { path: c.req.path });
        return next();
      }
      // Onboarding chat uses browser session auth (platform service key generated server-side)
      if (c.req.path.startsWith("/api/onboarding-chat")) return next();
      // Webhooks use their own signature verification (Stripe/crypto), not service tokens
      if (c.req.path.startsWith("/api/webhooks")) return next();
      // Tenant subdomain requests are authenticated by the tenant proxy middleware — skip internal auth
      if (container.fleet) {
        const host = c.req.header("host")?.split(":")[0]?.toLowerCase() ?? "";
        const allProducts = await container.productConfigService.listAll();
        const isTenantSubdomain = allProducts.some((pc) => {
          const domain = pc.product?.domain;
          if (!domain) return false;
          const suffix = `.${domain}`;
          if (!host.endsWith(suffix)) return false;
          const sub = host.slice(0, -suffix.length);
          return sub && !sub.includes(".") && sub !== "api" && sub !== "app" && sub !== "www";
        });
        if (isTenantSubdomain) {
          const { logger } = await import("../config/logger.js");
          logger.info("Skipping internal auth for tenant subdomain", {
            host,
            path: c.req.path,
            method: c.req.method,
          });
          return next();
        }
      }
      const { logger: authLogger } = await import("../config/logger.js");
      authLogger.info("Applying internal auth middleware", {
        host: c.req.header("host"),
        path: c.req.path,
        method: c.req.method,
      });
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
        productConfigService: container.productConfigService,
        cryptoClient: container.cryptoClient ?? undefined,
        cryptoChargeRepo: container.crypto?.chargeRepo,
        db: container.db,
        assertOrgAdminOrOwner,
      },
      settings: {
        serviceName: `${bootConfig.slug}-platform`,
        getNotificationPrefsStore: () => need(container.notificationPrefsRepo, "notificationPrefsRepo"),
      },
      profile: {
        getUser: (userId) => container.authUserRepo.getUser(userId),
        updateUser: (userId, data) => container.authUserRepo.updateUser(userId, data),
        changePassword: (userId, currentPassword, newPassword) =>
          container.authUserRepo.changePassword(userId, currentPassword, newPassword),
        deleteUser: async (userId) => {
          const { logger } = await import("../config/logger.js");
          // Delete all user data — instances should already be destroyed by the UI
          await container.pool.query("DELETE FROM bot_profiles WHERE user_id = $1", [userId]);
          await container.pool.query("DELETE FROM bot_instances WHERE user_id = $1", [userId]);
          await container.pool.query('DELETE FROM "session" WHERE "userId" = $1', [userId]);
          await container.pool.query('DELETE FROM "account" WHERE "userId" = $1', [userId]);
          await container.pool.query('DELETE FROM "user" WHERE id = $1', [userId]);
          logger.info("Account deleted", { userId });
        },
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
              botInstanceRepo: new DrizzleBotInstanceRepository(container.db),
              productConfig: container.productConfig, // Fallback — createInstance resolves per-product via resolveProductConfig
              serviceKeyRepo: container.fleet.serviceKeyRepo,
              assertOrgAdminOrOwner,
              fleet: need(container.fleetComposite, "fleetComposite"),
              provisionSecret: config.provisionSecret,
              resolveProductConfig: (slug: string) => container.productConfigService.getBySlug(slug),
              instanceService: need(container.instanceService, "instanceService"),
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

    // Enabled social providers per product — public endpoint for login page OAuth buttons
    app.get("/api/auth/providers", async (c) => {
      let slug = c.req.header("x-product") ?? c.req.query("slug") ?? null;
      // Resolve from Origin/Referer domain if no explicit slug
      if (!slug) {
        const origin = c.req.header("origin") ?? c.req.header("referer") ?? "";
        try {
          const host = new URL(origin).hostname;
          const allProducts = await container.productConfigService.listAll();
          for (const pc of allProducts) {
            if (pc.product?.domain === host || pc.product?.appDomain === host) {
              slug = pc.product.slug ?? null;
              break;
            }
            if (pc.domains?.some((d) => d.host === host)) {
              slug = pc.product?.slug ?? null;
              break;
            }
          }
        } catch {
          // Invalid URL
        }
      }
      if (!slug) return c.json({ error: "Cannot resolve product from request" }, 400);
      if (!container.productAuthManager) return c.json([]);
      const providers = await container.productAuthManager.getEnabledProviders(slug);
      return c.json(providers);
    });
  }

  // 2c-REST. Settings/profile REST shims — the UI calls these as REST, core has the data in authUserRepo.
  if (bootConfig?.standalone) {
    const { getAuthForProduct: getAuthForSettings } = await import("../auth/better-auth.js");
    const { logger: settingsLogger } = await import("../config/logger.js");

    async function resolveUserFromSession(req: Request): Promise<{ id: string } | null> {
      const slug = await resolveProductSlug(
        { header: (n: string) => req.headers.get(n) ?? undefined },
        container.productConfigService,
      );
      const auth = await getAuthForSettings(slug);
      const session = await auth.api.getSession({ headers: req.headers });
      return session?.user ? { id: session.user.id } : null;
    }

    app.get("/api/settings/profile", async (c) => {
      const user = await resolveUserFromSession(c.req.raw);
      if (!user) return c.json({ error: "Unauthorized" }, 401);
      const profile = await container.authUserRepo.getUser(user.id);
      if (!profile) return c.json({ error: "User not found" }, 404);
      return c.json(profile);
    });

    app.patch("/api/settings/profile", async (c) => {
      const user = await resolveUserFromSession(c.req.raw);
      if (!user) return c.json({ error: "Unauthorized" }, 401);
      const data = await c.req.json();
      const updated = await container.authUserRepo.updateUser(user.id, data);
      return c.json(updated);
    });

    app.post("/api/settings/change-password", async (c) => {
      const user = await resolveUserFromSession(c.req.raw);
      if (!user) return c.json({ error: "Unauthorized" }, 401);
      const { currentPassword, newPassword } = await c.req.json();
      await container.authUserRepo.changePassword(user.id, currentPassword, newPassword);
      return c.json({ ok: true });
    });

    settingsLogger.info("Mounted REST settings/profile endpoints");
  }

  // 2d. BetterAuth routes (when auth config provided)
  if (bootConfig?.auth) {
    const { initBetterAuth, runAuthMigrations } = await import("../auth/better-auth.js");

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

    // Wire per-product auth manager into BetterAuth
    if (container.productAuthManager) {
      const { setAuthProductManager } = await import("../auth/better-auth.js");
      setAuthProductManager(container.productAuthManager);
    }

    // Auth routes — resolve per-product BetterAuth instance at request time.
    // Product slug comes from X-Product header (set by UI server-side requests)
    // or from the Origin header → product domain lookup.
    const { getAuthForProduct } = await import("../auth/better-auth.js");
    const { logger: authRouteLogger } = await import("../config/logger.js");
    app.all("/api/auth/*", async (c) => {
      const path = c.req.path;
      const method = c.req.method;
      const slug = await resolveProductSlug(c.req, container.productConfigService);

      // Log auth route resolution for debugging session issues
      const cookieHeader = c.req.header("cookie") ?? "";
      const allCookieNames = cookieHeader
        .split(";")
        .map((c) => c.trim().split("=")[0])
        .filter(Boolean);
      const fullUrl = c.req.url;
      const hasCode = fullUrl.includes("code=");
      const hasState = fullUrl.includes("state=");
      authRouteLogger.info("Auth route", {
        method,
        path,
        slug,
        origin: c.req.header("origin") ?? "(none)",
        cookies: allCookieNames,
        hasCode,
        hasState,
      });

      const auth = await getAuthForProduct(slug);
      const rawResponse = await auth.handler(c.req.raw);

      // BetterAuth returns a raw Response that bypasses Hono's CORS middleware.
      // We must add CORS headers manually.
      const origin = c.req.header("origin");
      const resHeaders = new Headers(rawResponse.headers);
      if (origin && corsOrigins.includes(origin)) {
        resHeaders.set("Access-Control-Allow-Origin", origin);
        resHeaders.set("Access-Control-Allow-Credentials", "true");
        resHeaders.set(
          "Access-Control-Allow-Headers",
          "Content-Type,Authorization,X-Product,X-Tenant-ID,X-Session-ID,X-Request-ID",
        );
        authRouteLogger.debug("CORS headers added", { origin, path });
      } else {
        authRouteLogger.warn("CORS origin mismatch", {
          origin: origin ?? "(none)",
          corsOriginsCount: corsOrigins.length,
          corsOriginsSample: corsOrigins.slice(0, 4),
          path,
        });
      }
      const response = new Response(rawResponse.body, {
        status: rawResponse.status,
        statusText: rawResponse.statusText,
        headers: resHeaders,
      });

      // Log response for session validation calls (safe — never crashes)
      try {
        if (path.includes("get-session")) {
          const cloned = response.clone();
          const body = await cloned.text().catch(() => "");
          const raw = body ? JSON.parse(body) : null;
          const parsed = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
          authRouteLogger.info("Auth get-session response", {
            slug,
            status: response.status,
            hasSession: !!parsed.session,
            userId: (parsed.user as Record<string, unknown>)?.id ?? null,
            cors: response.headers.get("access-control-allow-origin") ?? "(missing)",
            bodyLen: body.length,
          });
        } else if (path.includes("callback")) {
          authRouteLogger.info("Auth callback response", {
            slug,
            status: response.status,
            location: response.headers.get("location")?.slice(0, 100) ?? "(none)",
          });
        }
      } catch (logErr) {
        authRouteLogger.warn("Auth response logging failed", { error: String(logErr) });
      }

      return response;
    });
  }

  // 2e. Chat routes. Two paths:
  //   - bootConfig.chat.backend  → explicit backend (custom product impls)
  //   - features.chat === true   → default stack: GatewayChatBackend +
  //                                DrizzleChatMessageRepository persistence
  // Explicit backend wins when both are present.
  if (bootConfig?.chat || bootConfig?.features?.chat) {
    const { createChatRoutes } = await import("../chat/routes.js");
    const { DrizzleChatMessageRepository } = await import("../chat/repository.js");
    const messageRepo = new DrizzleChatMessageRepository(container.db);

    let backend = bootConfig.chat?.backend;
    if (!backend) {
      // Build the default GatewayChatBackend. It streams via the core
      // inference gateway and mints per-request service keys so metering
      // attributes correctly.
      const { GatewayChatBackend } = await import("../chat/gateway-backend.js");
      const serviceKeyRepo = container.fleet?.serviceKeyRepo;
      if (!serviceKeyRepo) {
        throw new Error(
          "features.chat requires fleet.serviceKeyRepo; enable features.fleet or pass a custom chat.backend",
        );
      }
      const slug = bootConfig.slug;
      // Gateway runs in-process; hardcoded localhost:3001 matches the pattern
      // onboarding-chat.ts uses and avoids threading port config through
      // MountConfig. Can be overridden via CHAT_GATEWAY_URL env if ever needed.
      const gatewayUrl = process.env.CHAT_GATEWAY_URL ?? "http://localhost:3001/v1/chat/completions";
      backend = new GatewayChatBackend({
        gatewayUrl,
        getServiceKey: () => serviceKeyRepo.generate("__platform__", "chat", slug),
      });
    }

    app.route("/api/chat", createChatRoutes({ backend, messageRepo }));
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
    // 5a. Onboarding chat SSE (when fleet management is enabled — needs serviceKeyRepo)
    app.route("/api/onboarding-chat", createOnboardingChatRoutes(container));
  }

  // 5b. Node agent registration routes (when fleet is enabled).
  // HTTP-only: POST /internal/nodes/register + /register-token. Agents
  // use this to obtain their nodeId, nodeSecret, and dbUrl, then connect
  // to Postgres directly and run their AgentWorker against pending_operations.
  // No WebSocket anywhere.
  if (container.fleet && bootConfig?.standalone) {
    const { createNodeAgentRoutes } = await import("./routes/node-agent.js");
    const { DrizzleNodeRepository } = await import("../fleet/drizzle-node-repository.js");
    const nodeRepo = new DrizzleNodeRepository(container.db);

    // Vault for reading Spaces credentials to pass to node agents
    const { resolveVaultConfig, VaultConfigProvider } = await import("../config/vault-provider.js");
    const vaultConfig = resolveVaultConfig();
    const vault = vaultConfig ? new VaultConfigProvider(vaultConfig) : null;

    // Build the per-agent Postgres URL using the shared `wopr_agent` role.
    // Returns null when the agent password isn't configured (dev/test, or
    // before secrets.agentDbPassword is set in Vault). The URL embeds the
    // password and `application_name=agent-<id>`; the agent sets the
    // `agent.node_id` GUC on connect to satisfy RLS.
    const agentPassword = bootConfig?.secrets?.agentDbPassword;
    const agentDbUrlBuilder = agentPassword
      ? (nodeId: string): string | null => {
          try {
            const url = new URL(bootConfig.databaseUrl);
            url.username = "wopr_agent";
            url.password = agentPassword;
            url.searchParams.set("application_name", `agent-${nodeId}`);
            return url.toString();
          } catch {
            return null;
          }
        }
      : null;

    app.route("/internal/nodes", createNodeAgentRoutes({ nodeRepo, vault, agentDbUrlBuilder }));

    const { logger: nodeLogger } = await import("../config/logger.js");
    nodeLogger.info("Mounted node agent routes at /internal/nodes");
  }

  // 6. Metered inference gateway (when gateway is enabled)
  if (container.gateway) {
    // Fallback margin — only used when tenant has no product slug (shouldn't happen in production)
    const fallbackMargin =
      (container.productConfig.billing?.marginConfig as { default?: number } | null)?.default ?? 4.0;

    const gw = container.gateway;
    const { mountGateway } = await import("../gateway/index.js");
    const { DrizzleIncidentRepo } = await import("../gateway/incident-repo.js");
    const incidentRepo = new DrizzleIncidentRepo(container.db);
    mountGateway(app, {
      meter: gw.meter,
      budgetChecker: gw.budgetChecker,
      creditLedger: container.creditLedger,
      incidentRepo,
      providers: {
        openrouter: config.openrouterApiKey ? { apiKey: config.openrouterApiKey } : undefined,
      },
      resolveServiceKey: async (key: string) => {
        const tenant = await gw.serviceKeyRepo.resolve(key);
        if (!tenant) return null;

        // Resolve product config from DB. Returns alongside tenant — handlers
        // read product-level fields (margin, model priority, floor rates) from
        // ProductConfig, not from the tenant object.
        const pc = tenant.productSlug ? await container.productConfigService.getBySlug(tenant.productSlug) : null;

        // Fallback product config for tenants without a product slug (shouldn't happen in production)
        const productConfig: import("../product-config/repository-types.js").ProductConfig = pc ?? {
          product: { slug: tenant.productSlug ?? "unknown" } as import("../product-config/repository-types.js").Product,
          navItems: [],
          domains: [],
          features: null,
          billing: {
            marginConfig: { default: fallbackMargin },
          } as unknown as import("../product-config/repository-types.js").ProductBillingConfig,
          fleet: null,
        };

        return { tenant, productConfig };
      },
    });
  }

  // 7. Product-specific route plugins
  for (const plugin of plugins) {
    app.route(plugin.path, plugin.handler(container));
  }

  // 7. Tenant proxy middleware (catch-all — MUST be last)
  if (container.fleet) {
    app.use("*", createTenantProxyMiddleware(container, { resolveUser: buildTenantProxyResolveUser(container) }));
  }
}

/**
 * Shared resolveUser factory for the tenant proxy — matches a request's
 * host against the product config to pick which BetterAuth instance to
 * consult, then returns the authenticated session's user info.
 *
 * Exported so the WS upgrade handler (attached at the HTTP server level
 * in bootPlatformServer) can reuse the exact same auth resolution.
 */
export function buildTenantProxyResolveUser(container: PlatformContainer) {
  return async (req: Request) => {
    try {
      const { getAuthForProduct } = await import("../auth/better-auth.js");
      const host = req.headers.get("host")?.split(":")[0] ?? "";
      const parts = host.split(".");
      const parentDomain = parts.length > 2 ? parts.slice(1).join(".") : host;
      const allProds = await container.productConfigService.listAll();
      const matched = allProds.find((pc) => pc.product?.domain === parentDomain);
      const slug = matched?.product?.slug ?? "wopr";
      const auth = await getAuthForProduct(slug);
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
  };
}
