import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { resolveSecrets } from "@wopr-network/platform-core/config";
import { logger } from "@wopr-network/platform-core/config/logger";
import { bootPlatformServer } from "@wopr-network/platform-core/server";
import { createTRPCContext, setTrpcOrgMemberRepo } from "@wopr-network/platform-core/trpc";

import { LOCAL_NODE_ID, type NodeConfig, NodeRegistry } from "./fleet/node-registry.js";
import { setOrgInstanceResolverDeps } from "./fleet/org-instance-resolver.js";
import { createPlacementStrategy } from "./fleet/placement.js";
import { setFleetResolverProxy } from "./proxy/fleet-resolver.js";
import { setAuthHelpersDeps } from "./trpc/auth-helpers.js";
import {
  appRouter,
  setAdminRouterDeps,
  setBillingRouterDeps,
  setFleetRouterDeps,
  setOrgRouterDeps,
  setPageContextRouterDeps,
  setProductConfigRouterDeps,
  setProfileRouterDeps,
  setSettingsRouterDeps,
  setTrpcDb,
} from "./trpc/index.js";

const slug = process.env.PRODUCT_SLUG ?? "paperclip";

// Resolve secrets from Vault (production) or env fallback (local dev)
const secrets = await resolveSecrets(slug);

// Build DATABASE_URL from Vault secret + compose infra
const dbHost = process.env.DB_HOST ?? "postgres";
const dbName = process.env.DB_NAME ?? `${slug}_platform`;
const dbPort = process.env.DB_PORT ?? "5432";
const databaseUrl =
  process.env.DATABASE_URL ?? `postgresql://${slug}:${secrets.dbPassword}@${dbHost}:${dbPort}/${dbName}`;

const platform = await bootPlatformServer({
  slug,
  secrets,
  databaseUrl,
  host: process.env.HOST ?? "0.0.0.0",
  port: Number(process.env.PORT ?? 3001),
  features: {
    fleet: !!databaseUrl,
    crypto: !!databaseUrl,
    stripe: !!secrets.stripeSecretKey,
    gateway: !!databaseUrl,
    hotPool: false,
  },
});

const { container } = platform;

// ---------------------------------------------------------------------------
// Wire all product-level deps from the container
// ---------------------------------------------------------------------------

setTrpcOrgMemberRepo(container.orgMemberRepo);
setProductConfigRouterDeps(container.productConfigService as never, slug);
setTrpcDb(container.db);
setAuthHelpersDeps(container.orgMemberRepo);

// ---------------------------------------------------------------------------
// Wire billing, settings, profile, page-context, and org tRPC router deps
// (dropped during PRs #47-49 refactor — restored here)
// ---------------------------------------------------------------------------
{
  // --- Billing deps ---
  if (container.stripe) {
    const { loadCreditPriceMap } = await import("@wopr-network/platform-core/billing");
    const { DrizzleMeterAggregator, DrizzleUsageSummaryRepository } = await import(
      "@wopr-network/platform-core/metering"
    );
    const { DrizzleAutoTopupSettingsRepository } = await import("@wopr-network/platform-core/credits");
    const { DrizzleSpendingLimitsRepository } = await import(
      "@wopr-network/platform-core/monetization/drizzle-spending-limits-repository"
    );
    const { DrizzleDividendRepository } = await import(
      "@wopr-network/platform-core/monetization/credits/dividend-repository"
    );
    const { DrizzleAffiliateRepository } = await import(
      "@wopr-network/platform-core/monetization/affiliate/drizzle-affiliate-repository"
    );

    const priceMap = loadCreditPriceMap();
    const usageSummaryRepo = new DrizzleUsageSummaryRepository(container.db);
    const meterAggregator = new DrizzleMeterAggregator(usageSummaryRepo);
    const autoTopupSettingsStore = new DrizzleAutoTopupSettingsRepository(container.db);
    const spendingLimitsRepo = new DrizzleSpendingLimitsRepository(container.db);
    const dividendRepo = new DrizzleDividendRepository(container.db);
    const affiliateRepo = new DrizzleAffiliateRepository(container.db);

    setBillingRouterDeps({
      processor: container.stripe.processor as never,
      tenantRepo: container.stripe.customerRepo as never,
      creditLedger: container.creditLedger,
      meterAggregator,
      priceMap,
      autoTopupSettingsStore,
      dividendRepo,
      spendingLimitsRepo,
      affiliateRepo,
      productConfig: container.productConfig,
    });

    // Wire org router with optional billing-related deps
    const { BetterAuthUserRepository } = await import("@wopr-network/platform-core/db");
    const authUserRepo = new BetterAuthUserRepository(container.pool);
    setOrgRouterDeps({
      orgService: container.orgService,
      authUserRepo,
      creditLedger: container.creditLedger,
      meterAggregator,
      processor: container.stripe.processor as never,
      priceMap,
    });

    logger.info("Billing + org tRPC routers wired (Stripe + all repositories)");
  } else {
    // Wire org router without billing deps (Stripe not configured)
    const { BetterAuthUserRepository } = await import("@wopr-network/platform-core/db");
    const authUserRepo = new BetterAuthUserRepository(container.pool);
    setOrgRouterDeps({
      orgService: container.orgService,
      authUserRepo,
      creditLedger: container.creditLedger,
    });
    logger.warn("Stripe secret key not available — billing tRPC procedures will fail until configured");
  }

  // --- Settings deps ---
  const { DrizzleNotificationPreferencesStore } = await import("@wopr-network/platform-core/email");
  const notificationPrefsStore = new DrizzleNotificationPreferencesStore(container.db);
  setSettingsRouterDeps({
    getNotificationPrefsStore: () => notificationPrefsStore,
  });

  // --- Profile deps (delegates to BetterAuth user table via raw SQL) ---
  const { BetterAuthUserRepository: AuthUserRepo } = await import("@wopr-network/platform-core/db");
  const profileAuthUserRepo = new AuthUserRepo(container.pool);
  setProfileRouterDeps({
    getUser: (userId) => profileAuthUserRepo.getUser(userId),
    updateUser: (userId, data) => profileAuthUserRepo.updateUser(userId, data),
    changePassword: (userId, currentPassword, newPassword) =>
      profileAuthUserRepo.changePassword(userId, currentPassword, newPassword),
  });

  // --- Page context deps ---
  const { DrizzlePageContextRepository } = await import("@wopr-network/platform-core/fleet/page-context-repository");
  setPageContextRouterDeps({ repo: new DrizzlePageContextRepository(container.db) });

  logger.info("tRPC router dependencies initialized (billing, settings, profile, page-context, org)");
}

if (container.fleet) {
  const { docker, profileStore, proxy, serviceKeyRepo } = container.fleet;

  // NodeRegistry — multi-node Docker host management
  const nodeRegistry = new NodeRegistry();
  const fleetNodesEnv = process.env.FLEET_NODES ?? "";
  let nodeConfigs: NodeConfig[] = [];
  if (fleetNodesEnv) {
    try {
      nodeConfigs = JSON.parse(fleetNodesEnv);
    } catch {
      logger.warn("Failed to parse FLEET_NODES — using local node only");
    }
  }
  if (nodeConfigs.length > 0) {
    for (const nodeConfig of nodeConfigs) {
      nodeRegistry.register(nodeConfig, profileStore);
    }
  } else {
    nodeRegistry.register(
      { id: LOCAL_NODE_ID, name: "local", host: "localhost", useContainerNames: true },
      profileStore,
    );
  }

  const placementStrategy = createPlacementStrategy(process.env.FLEET_PLACEMENT_STRATEGY ?? "least-loaded");

  setFleetResolverProxy(proxy);
  setOrgInstanceResolverDeps(profileStore, proxy);
  setAdminRouterDeps({
    db: container.db,
    pool: container.pool,
    creditLedger: container.creditLedger,
    profileStore,
    nodeRegistry,
    serviceKeyRepo,
  });
  setFleetRouterDeps({
    pool: container.pool,
    docker,
    creditLedger: container.creditLedger,
    profileStore,
    productConfig: container.productConfig,
    nodeRegistry,
    placementStrategy,
    serviceKeyRepo,
  });
}

// ---------------------------------------------------------------------------
// Initialize BetterAuth — must be called before start()
// ---------------------------------------------------------------------------
{
  const { initBetterAuth, runAuthMigrations } = await import("@wopr-network/platform-core/auth/better-auth");
  const productDomain = container.productConfig.product?.domain;
  initBetterAuth({
    pool: container.pool,
    db: container.db,
    secret: secrets.betterAuthSecret,
    cookieDomain: productDomain ? `.${productDomain}` : undefined,
    onUserCreated: async (userId) => {
      try {
        const { grantSignupCredits } = await import("@wopr-network/platform-core/credits");
        const granted = await grantSignupCredits(container.creditLedger, userId);
        if (granted) logger.info(`Granted welcome credits to user ${userId}`);
      } catch (err) {
        logger.error("Failed to grant signup credits:", err);
      }
      try {
        if (container.orgService) {
          const org = await container.orgService.getOrCreatePersonalOrg(userId, "My Workspace");
          logger.info(`Auto-created org ${org.id} for user ${userId}`);
        }
      } catch (err) {
        logger.error("Failed to auto-create org:", err);
      }
    },
  });
  await runAuthMigrations();
  logger.info("better-auth initialized and migrations applied");
}

// Mount auth routes
{
  const { createAuthRoutes } = await import("@wopr-network/platform-core/api/routes/auth");
  const { getAuth } = await import("@wopr-network/platform-core/auth/better-auth");
  platform.app.route("/api/auth", createAuthRoutes(getAuth()));
}

// Mount product-level tRPC router
platform.app.all("/trpc/*", async (c) => {
  const response = await fetchRequestHandler({
    endpoint: "/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => createTRPCContext(c.req.raw),
  });
  return response;
});

await platform.start();

process.on("SIGINT", () => platform.stop().then(() => process.exit(0)));
process.on("SIGTERM", () => platform.stop().then(() => process.exit(0)));
