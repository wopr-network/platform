/**
 * PlatformContainer — the central DI container for platform-core.
 *
 * Products compose a container at boot time, enabling only the feature
 * slices they need. Nullable sub-containers (fleet, crypto, stripe,
 * gateway, hotPool) let each product opt in without pulling unused deps.
 */

import type { Pool } from "pg";
import type Stripe from "stripe";
import type { IUserRoleRepository } from "../auth/user-role-repository.js";
import type { ICryptoChargeRepository } from "../billing/crypto/charge-store.js";
import type { IPaymentProcessor } from "../billing/index.js";
import type { IWebhookSeenRepository } from "../billing/webhook-seen-repository.js";
import { logger } from "../config/logger.js";
import type { IAutoTopupSettingsRepository } from "../credits/auto-topup-settings-repository.js";
import type { ILedger } from "../credits/ledger.js";
import type { ITenantCustomerRepository } from "../credits/tenant-customer-repository.js";
import type { IAuthUserRepository } from "../db/auth-user-repository.js";
import type { DrizzleDb } from "../db/index.js";
import type { INotificationPreferencesRepository } from "../email/index.js";
import type { ContainerPlacementStrategy } from "../fleet/container-placement.js";
import type { FleetManager } from "../fleet/fleet-manager.js";
import type { FleetResolver } from "../fleet/fleet-resolver.js";
import type { NodeRegistry } from "../fleet/node-registry.js";
import type { OrgInstanceResolver } from "../fleet/org-instance-resolver.js";
import type { IPageContextRepository } from "../fleet/page-context-repository.js";
import type { IProfileStore } from "../fleet/profile-store.js";
import type { IServiceKeyRepository } from "../gateway/service-key-repository.js";
import type { IMeterAggregator } from "../metering/index.js";
import type { IAffiliateRepository } from "../monetization/affiliate/drizzle-affiliate-repository.js";
import type { IDividendRepository } from "../monetization/credits/dividend-repository.js";
import type { ISpendingLimitsRepository } from "../monetization/drizzle-spending-limits-repository.js";
import type { CreditPriceMap } from "../monetization/index.js";
import type { ProductConfig } from "../product-config/repository-types.js";
import type { ProductConfigService } from "../product-config/service.js";
import type { ProxyManagerInterface } from "../proxy/types.js";
import type { IOrgMemberRepository } from "../tenancy/org-member-repository.js";
import type { OrgService } from "../tenancy/org-service.js";
import type { BootConfig } from "./boot-config.js";

// ---------------------------------------------------------------------------
// Feature sub-containers
// ---------------------------------------------------------------------------

export interface FleetServices {
  manager: FleetManager;
  proxy: ProxyManagerInterface;
  profileStore: IProfileStore;
  serviceKeyRepo: IServiceKeyRepository;
  nodeRegistry: NodeRegistry;
  placementStrategy: ContainerPlacementStrategy;
  fleetResolver: FleetResolver;
  orgInstanceResolver: OrgInstanceResolver;
}

export interface CryptoServices {
  chargeRepo: ICryptoChargeRepository;
  webhookSeenRepo: IWebhookSeenRepository;
}

export interface StripeServices {
  stripe: Stripe;
  webhookSecret: string;
  customerRepo: ITenantCustomerRepository;
  processor: {
    handleWebhook(payload: Buffer, signature: string): Promise<unknown>;
    handleVerifiedEvent(event: Stripe.Event): Promise<unknown>;
  };
}

export interface GatewayServices {
  serviceKeyRepo: IServiceKeyRepository;
  meter: import("../metering/emitter.js").MeterEmitter;
  budgetChecker: import("../monetization/budget/budget-checker.js").IBudgetChecker;
}

/** @deprecated Pool is now per-node on FleetManager + composite on Fleet — use container.fleetComposite. */
export type HotPoolServices = import("../fleet/fleet.js").Fleet;

// ---------------------------------------------------------------------------
// Main container
// ---------------------------------------------------------------------------

export interface PlatformContainer {
  db: DrizzleDb;
  pool: Pool;
  productConfig: ProductConfig;
  productConfigService: ProductConfigService;
  creditLedger: ILedger;
  webhookSeenRepo: IWebhookSeenRepository;
  orgMemberRepo: IOrgMemberRepository;
  orgService: OrgService;
  userRoleRepo: IUserRoleRepository;
  authUserRepo: IAuthUserRepository;

  // Billing/monetization repos needed by core tRPC routers
  meterAggregator: IMeterAggregator | null;
  autoTopupSettingsRepo: IAutoTopupSettingsRepository | null;
  dividendRepo: IDividendRepository | null;
  spendingLimitsRepo: ISpendingLimitsRepository | null;
  affiliateRepo: IAffiliateRepository | null;
  notificationPrefsRepo: INotificationPreferencesRepository | null;
  pageContextRepo: IPageContextRepository | null;
  priceMap: CreditPriceMap | null;
  processor: IPaymentProcessor | null;
  tenantCustomerRepo: ITenantCustomerRepository | null;

  /** Null when the product does not use fleet management. */
  fleet: FleetServices | null;
  /** Null when the product does not accept crypto payments. */
  crypto: CryptoServices | null;
  /** Null when the product does not use Stripe billing. */
  stripe: StripeServices | null;
  /** Null when crypto payments are not configured. */
  cryptoClient: import("../billing/crypto/client.js").CryptoServiceClient | null;
  /** Null when the product does not expose a metered inference gateway. */
  gateway: GatewayServices | null;
  /** Null when the product does not use a hot-pool of pre-provisioned instances. */
  fleetComposite: import("../fleet/fleet.js").Fleet | null;
  /** Instance lifecycle service — orchestrates create, provision, billing. Null only when fleet is disabled. */
  instanceService: import("../fleet/instance-service.js").InstanceService | null;
  /** Per-product OAuth provider config. Null when auth is not configured. */
  productAuthManager: import("../auth/product-auth-manager.js").ProductAuthManager | null;
  /** Node agent WebSocket + registration manager. Null when fleet is disabled. */
  nodeConnectionManager: import("../fleet/node-connection-manager.js").NodeConnectionManager | null;
  /** Leader election — gates singleton background services. Always present. */
  leaderElection: import("../leader/leader-election.js").LeaderElection;
}

// ---------------------------------------------------------------------------
// buildContainer — construct a PlatformContainer from a BootConfig
// ---------------------------------------------------------------------------

/**
 * Build a fully-wired PlatformContainer from a declarative BootConfig.
 *
 * Construction order mirrors the proven boot sequence from product index.ts
 * files: DB pool -> Drizzle -> migrations -> productConfig -> credit ledger
 * -> org repos -> org service -> user role repo -> feature services.
 *
 * Feature sub-containers (fleet, crypto, stripe, gateway) are only
 * constructed when their corresponding feature flag is enabled in
 * `bootConfig.features`. Disabled features yield `null`.
 */
export async function buildContainer(bootConfig: BootConfig): Promise<PlatformContainer> {
  logger.info("Building container", {
    slug: bootConfig.slug,
    features: bootConfig.features,
    hasSecrets: {
      stripe: !!bootConfig.secrets?.stripeSecretKey,
      crypto: !!bootConfig.secrets?.cryptoServiceKey,
      cryptoUrl: !!bootConfig.secrets?.cryptoServiceUrl,
      openrouter: !!bootConfig.secrets?.openrouterApiKey,
      betterAuth: !!bootConfig.secrets?.betterAuthSecret,
    },
  });
  // 1. Database pool — reuse existing or create new
  let pool: Pool;
  if (bootConfig.pool) {
    pool = bootConfig.pool;
  } else {
    if (!bootConfig.databaseUrl) {
      throw new Error("buildContainer: databaseUrl is required when pool is not provided");
    }
    const { Pool: PgPool } = await import("pg");
    pool = new PgPool({ connectionString: bootConfig.databaseUrl });
  }

  // 2. Drizzle ORM instance
  const { createDb } = await import("../db/index.js");
  const db = createDb(pool);

  // 3. Run Drizzle migrations (skip when caller provided their own pool —
  //    they are responsible for running product-specific migrations first)
  if (!bootConfig.pool) {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const migrationsFolder = path.resolve(__dirname, "..", "..", "drizzle", "migrations");
    await migrate(db as never, { migrationsFolder });
  }

  // 4. Bootstrap product config from DB (auto-seeds from presets if needed)
  const { platformBoot } = await import("../product-config/boot.js");
  const { config: productConfig, service: productConfigService } = await platformBoot({ slug: bootConfig.slug, db });

  // 5. Credit ledger
  const { DrizzleLedger } = await import("../credits/ledger.js");
  const creditLedger: ILedger = new DrizzleLedger(db as never);
  await creditLedger.seedSystemAccounts();

  // 6. Org repositories + OrgService
  const { DrizzleOrgMemberRepository } = await import("../tenancy/org-member-repository.js");
  const { DrizzleOrgRepository } = await import("../tenancy/drizzle-org-repository.js");
  const { OrgService: OrgServiceClass } = await import("../tenancy/org-service.js");
  const { BetterAuthUserRepository } = await import("../db/auth-user-repository.js");

  const orgMemberRepo: IOrgMemberRepository = new DrizzleOrgMemberRepository(db as never);
  const orgRepo = new DrizzleOrgRepository(db as never);
  const authUserRepo = new BetterAuthUserRepository(pool);
  const orgService = new OrgServiceClass(orgRepo, orgMemberRepo, db as never, {
    userRepo: authUserRepo,
  });

  // 7. User role repository
  const { DrizzleUserRoleRepository } = await import("../auth/user-role-repository.js");
  const userRoleRepo: IUserRoleRepository = new DrizzleUserRoleRepository(db as never);

  // 7a. Billing/monetization repos for core tRPC routers
  const { DrizzleUsageSummaryRepository } = await import("../metering/drizzle-usage-summary-repository.js");
  const { DrizzleMeterAggregator } = await import("../metering/aggregator.js");
  const usageSummaryRepo = new DrizzleUsageSummaryRepository(db as never);
  const meterAggregator: IMeterAggregator = new DrizzleMeterAggregator(usageSummaryRepo);

  const { DrizzleAutoTopupSettingsRepository } = await import("../credits/auto-topup-settings-repository.js");
  const autoTopupSettingsRepo: IAutoTopupSettingsRepository = new DrizzleAutoTopupSettingsRepository(db as never);

  const { DrizzleSpendingLimitsRepository } = await import("../monetization/drizzle-spending-limits-repository.js");
  const spendingLimitsRepo: ISpendingLimitsRepository = new DrizzleSpendingLimitsRepository(db as never);

  const { DrizzleDividendRepository } = await import("../monetization/credits/dividend-repository.js");
  const dividendRepo: IDividendRepository = new DrizzleDividendRepository(db as never);

  const { DrizzleAffiliateRepository } = await import("../monetization/affiliate/drizzle-affiliate-repository.js");
  const affiliateRepo: IAffiliateRepository = new DrizzleAffiliateRepository(db as never);

  const { DrizzleNotificationPreferencesStore } = await import("../email/index.js");
  const notificationPrefsRepo: INotificationPreferencesRepository = new DrizzleNotificationPreferencesStore(
    db as never,
  );

  const { DrizzlePageContextRepository } = await import("../fleet/page-context-repository.js");
  const pageContextRepo: IPageContextRepository = new DrizzlePageContextRepository(db as never);

  // 8. Fleet services (when enabled)
  //
  // ALL Docker access goes through the NodeRegistry. The registry reads
  // fleet nodes from the `nodes` DB table. Day 1: one row (localhost,
  // local socket). Scale day: add rows, each with its own Docker host.
  // No parallel paths — the registry IS the source of truth.
  let fleet: FleetServices | null = null;
  if (bootConfig.features.fleet) {
    const { DrizzleBotProfileStore } = await import("../fleet/drizzle-profile-store.js");
    const { ProxyManager } = await import("../proxy/manager.js");
    const { DrizzleServiceKeyRepository } = await import("../gateway/service-key-repository.js");
    const { NodeRegistry: NodeRegistryClass } = await import("../fleet/node-registry.js");
    const { createContainerPlacementStrategy } = await import("../fleet/container-placement.js");
    const { FleetResolver: FleetResolverClass } = await import("../fleet/fleet-resolver.js");
    const { OrgInstanceResolver: OrgInstanceResolverClass } = await import("../fleet/org-instance-resolver.js");

    const profileStore: IProfileStore = new DrizzleBotProfileStore(db);
    // Build product route configs for Caddy from DB — zero hardcoded infra
    const allProducts = await productConfigService.listAll();
    const productRouteConfigs = allProducts
      .filter((pc) => pc.product?.domain && pc.product?.slug)
      .map((pc) => {
        const p = pc.product;
        if (!p.uiService) throw new Error(`Product ${p.slug} has no uiService in DB`);
        if (!p.uiPort) throw new Error(`Product ${p.slug} has no uiPort in DB`);
        return {
          slug: p.slug,
          domain: p.domain,
          uiUpstream: `${p.uiService}:${p.uiPort}`,
          apiUpstream: `${p.apiService || "core"}:${p.apiPort || 3001}`,
        };
      });

    const proxy: ProxyManagerInterface = new ProxyManager({
      caddyAdminUrl: "http://caddy:2019",
      cloudflareApiToken:
        bootConfig.secrets?.cloudflareCaddyDnsToken ??
        (() => {
          throw new Error("cloudflareCaddyDnsToken not in Vault — wildcard TLS will not work");
        })(),
      products: productRouteConfigs,
    });
    const serviceKeyRepo: IServiceKeyRepository = new DrizzleServiceKeyRepository(db as never);

    // Build node registry from DB — single source of truth for all Docker hosts
    const nodeRegistry = new NodeRegistryClass();
    await nodeRegistry.loadFromDb(db, profileStore);

    const placementStrategy = createContainerPlacementStrategy("least-loaded");
    const fleetResolver = new FleetResolverClass(proxy);
    const orgInstanceResolver = new OrgInstanceResolverClass({ profileStore, proxyManager: proxy });

    // The "manager" and "docker" are from the local node — for backwards compat
    // with callers that haven't migrated to node-aware fleet operations yet.
    // All new code should go through nodeRegistry.getFleetManager(nodeId).
    const localNode = nodeRegistry.get("local");
    if (!localNode) throw new Error("No local fleet node registered — ensure a 'local' row exists in the nodes table");

    fleet = {
      manager: localNode.fleet,
      proxy,
      profileStore,
      serviceKeyRepo,
      nodeRegistry,
      placementStrategy,
      fleetResolver,
      orgInstanceResolver,
    };
  }

  // 8b. Webhook replay guard (shared by Stripe + crypto webhooks)
  const { DrizzleWebhookSeenRepository } = await import("../billing/drizzle-webhook-seen-repository.js");
  const webhookSeenRepo: IWebhookSeenRepository = new DrizzleWebhookSeenRepository(db as never);

  // 9. Crypto services (when enabled)
  let crypto: CryptoServices | null = null;
  let cryptoClient: import("../billing/crypto/client.js").CryptoServiceClient | null = null;
  if (bootConfig.features.crypto) {
    const { DrizzleCryptoChargeRepository } = await import("../billing/crypto/charge-store.js");
    const { CryptoServiceClient } = await import("../billing/crypto/client.js");

    const chargeRepo: ICryptoChargeRepository = new DrizzleCryptoChargeRepository(db as never);
    const cryptoUrl = bootConfig.secrets?.cryptoServiceUrl ?? "";
    const cryptoKey = bootConfig.secrets?.cryptoServiceKey ?? "";
    if (cryptoUrl) {
      cryptoClient = new CryptoServiceClient({ baseUrl: cryptoUrl, serviceKey: cryptoKey });
      logger.info("Crypto service client initialized", { baseUrl: cryptoUrl });
    } else {
      logger.warn("Crypto feature enabled but no CRYPTO_SERVICE_URL — crypto payments disabled");
    }

    crypto = { chargeRepo, webhookSeenRepo };
  } else {
    logger.info("Crypto feature disabled (no CRYPTO_SERVICE_KEY)");
  }

  // 10. Stripe services (when enabled)
  // Stripe keys come from DB (product_billing_config) first, then BootConfig as fallback.
  let stripe: StripeServices | null = null;
  const stripeKey =
    productConfig.billing?.stripeSecretKey ?? bootConfig.secrets?.stripeSecretKey ?? bootConfig.stripeSecretKey;
  const stripeWhSecret =
    productConfig.billing?.stripeWebhookSecret ??
    bootConfig.secrets?.stripeWebhookSecret ??
    bootConfig.stripeWebhookSecret ??
    "";
  if (bootConfig.features.stripe && stripeKey) {
    logger.info("Stripe initialized", {
      keyPrefix: `${stripeKey.slice(0, 12)}...`,
      priceCount: Object.keys(productConfig?.billing?.creditPrices ?? {}).length,
    });
    const StripeModule = await import("stripe");
    const StripeClass = StripeModule.default;
    const stripeClient: Stripe = new StripeClass(stripeKey);

    const { DrizzleTenantCustomerRepository } = await import("../billing/stripe/tenant-store.js");
    const { loadCreditPriceMap } = await import("../billing/stripe/credit-prices.js");
    const { StripePaymentProcessor } = await import("../billing/stripe/stripe-payment-processor.js");

    const customerRepo = new DrizzleTenantCustomerRepository(db as never);
    const priceMap = loadCreditPriceMap(productConfig?.billing?.creditPrices as Record<string, unknown> | undefined);
    const processor = new StripePaymentProcessor({
      stripe: stripeClient,
      tenantRepo: customerRepo,
      webhookSecret: stripeWhSecret,
      priceMap,
      creditLedger,
    });

    stripe = {
      stripe: stripeClient,
      webhookSecret: stripeWhSecret,
      customerRepo,
      processor,
    };
  }

  // 11. Gateway services (when enabled)
  let gateway: GatewayServices | null = null;
  if (bootConfig.features.gateway) {
    const { DrizzleServiceKeyRepository } = await import("../gateway/service-key-repository.js");
    const { MeterEmitter } = await import("../metering/emitter.js");
    const { DrizzleMeterEventRepository } = await import("../metering/meter-event-repository.js");
    const { DrizzleBudgetChecker } = await import("../monetization/budget/budget-checker.js");

    const serviceKeyRepo: IServiceKeyRepository = new DrizzleServiceKeyRepository(db as never);
    const meter = new MeterEmitter(new DrizzleMeterEventRepository(db as never), { flushIntervalMs: 5_000 });
    const budgetChecker = new DrizzleBudgetChecker(db as never, { cacheTtlMs: 30_000 });
    gateway = { serviceKeyRepo, meter, budgetChecker };
  }

  // 12. Stripe-derived billing deps (only when stripe is enabled)
  let priceMap: CreditPriceMap | null = null;
  let processor: IPaymentProcessor | null = null;
  let tenantCustomerRepo: ITenantCustomerRepository | null = null;
  if (stripe) {
    const { loadCreditPriceMap } = await import("../billing/stripe/credit-prices.js");
    priceMap = loadCreditPriceMap(productConfig?.billing?.creditPrices as Record<string, unknown> | undefined);
    processor = stripe.processor as unknown as IPaymentProcessor;
    tenantCustomerRepo = stripe.customerRepo;
  }

  // 13. Leader election
  const { LeaderElection: LeaderElectionClass } = await import("../leader/leader-election.js");
  const { DrizzleLeaderLeaseRepository } = await import("../leader/leader-lease-repository.js");
  const leaderElection = new LeaderElectionClass(new DrizzleLeaderLeaseRepository(db));

  // 14. Build the container (hotPool bound after construction)
  const result: PlatformContainer = {
    db,
    pool,
    productConfig,
    productConfigService,
    creditLedger,
    webhookSeenRepo,
    cryptoClient,
    orgMemberRepo,
    orgService,
    userRoleRepo,
    authUserRepo,
    meterAggregator,
    autoTopupSettingsRepo,
    dividendRepo,
    spendingLimitsRepo,
    affiliateRepo,
    notificationPrefsRepo,
    pageContextRepo,
    priceMap,
    processor,
    tenantCustomerRepo,
    fleet,
    crypto,
    stripe,
    gateway,
    fleetComposite: null,
    instanceService: null,
    productAuthManager: null,
    nodeConnectionManager: null,
    leaderElection,
  };

  // Pool repository — shared by every per-node FleetManager and the Fleet composite.
  const { DrizzlePoolRepository } = await import("./services/pool-repository.js");
  const poolRepo = new DrizzlePoolRepository(db);

  // Wire warm pool through the Fleet composite + per-node FleetManagers.
  // No more HotPool singleton — pool ops live on FleetManager (per-node leaf)
  // and Fleet (composite). The composite owns the spec registry and the ticker;
  // each leaf creates/cleans its own warm containers.
  if (bootConfig.features.hotPool && fleet) {
    const secrets = bootConfig.secrets;
    const poolConfig = {
      provisionSecret: secrets?.provisionSecret ?? bootConfig.provisionSecret ?? "",
      registryAuth:
        secrets?.registryUsername && secrets?.registryPassword
          ? {
              username: secrets.registryUsername,
              password: secrets.registryPassword,
              serveraddress: secrets.registryUrl ?? "https://registry.wopr.bot",
            }
          : undefined,
    };

    // Each per-node FleetManager gets the pool repo + config.
    // The Fleet composite (created below) will push specs onto each via
    // registerPoolSpec, so leaves know what to replenish.
    for (const node of fleet.nodeRegistry.list()) {
      node.fleet.setDeps({ poolRepo, poolConfig });
    }
  }

  // Bind InstanceService — orchestrates create, provision, billing
  if (fleet) {
    const { InstanceService } = await import("../fleet/instance-service.js");
    const { DrizzleBotInstanceRepository } = await import("../fleet/drizzle-bot-instance-repository.js");
    const { DrizzleNodeRepository } = await import("../fleet/drizzle-node-repository.js");
    const { Fleet } = await import("../fleet/fleet.js");
    const { FleetMembershipAdapter, DbInstanceLocator } = await import("../fleet/fleet-wiring.js");
    const botInstanceRepo = new DrizzleBotInstanceRepository(result.db);
    const nodeRepo = new DrizzleNodeRepository(result.db);

    // Wire DB-backed node resolution into registry + fleet managers
    fleet.nodeRegistry.setRepos(botInstanceRepo, nodeRepo);
    for (const node of fleet.nodeRegistry.list()) {
      node.fleet.setResolveHost((nodeId, containerName) =>
        fleet.nodeRegistry.resolveUpstreamHost(nodeId, containerName),
      );
    }

    // Build the Fleet composite. NodeConnectionManager isn't created until
    // mount-routes.ts wires it up later, so connectivity defers to the
    // container reference: until then, treat every registered node as
    // connected (single-node baseline).
    const membership = new FleetMembershipAdapter(fleet.nodeRegistry, {
      isConnected: (nodeId) => result.nodeConnectionManager?.isConnected(nodeId) ?? true,
    });
    const locator = new DbInstanceLocator(botInstanceRepo);
    const fleetComposite = new Fleet(membership, locator, fleet.placementStrategy);

    // Register pool specs for every fleet-enabled product. The composite
    // pushes each spec to every per-node FleetManager so they know what to
    // replenish on the next tick.
    if (bootConfig.features.hotPool) {
      const products = bootConfig.standalone
        ? (await result.productConfigService.listAll()).filter((pc) => pc.fleet && pc.product?.slug)
        : [result.productConfig].filter((pc) => pc.fleet);
      for (const pc of products) {
        const f = pc.fleet;
        if (!f) continue;
        const slug = pc.product?.slug ?? "default";
        const dbSize = await poolRepo.getPoolSize(slug);
        fleetComposite.registerPoolSpec(slug, {
          image: f.containerImage,
          port: f.containerPort,
          network: f.dockerNetwork,
          sizePerNode: dbSize,
        });
      }
    }

    // Ticker is started by lifecycle.ts under leader election (so non-leader
    // replicas don't double-replenish).
    result.fleetComposite = fleetComposite;

    const secrets = bootConfig.secrets;
    result.instanceService = new InstanceService({
      creditLedger: result.creditLedger,
      profileStore: fleet.profileStore,
      botInstanceRepo,
      serviceKeyRepo: fleet.serviceKeyRepo,
      provisionSecret: secrets?.provisionSecret ?? bootConfig.provisionSecret ?? null,
      nodeRegistry: fleet.nodeRegistry,
      placementStrategy: fleet.placementStrategy,
      fleetResolver: fleet.fleetResolver,
      poolRepo,
    });
  }

  // Bind per-product OAuth manager (standalone mode)
  if (bootConfig.standalone && bootConfig.auth) {
    const { ProductAuthManager } = await import("../auth/product-auth-manager.js");
    const { setProductAuthManager } = await import("../trpc/auth-social-router.js");

    const authManager = new ProductAuthManager(db, result.productConfigService);
    result.productAuthManager = authManager;
    setProductAuthManager(authManager);

    // Seed auth config for all products from Vault
    const allProducts = await result.productConfigService.listAll();
    for (const pc of allProducts) {
      if (!pc.product?.id || !pc.product?.slug) continue;
      try {
        // Read per-product Vault data
        const { resolveVaultConfig, VaultConfigProvider } = await import("../config/vault-provider.js");
        const vaultConfig = resolveVaultConfig();
        if (vaultConfig) {
          const vault = new VaultConfigProvider(vaultConfig);
          const prodData = await vault.read(`${pc.product.slug}/prod`).catch(() => ({}) as Record<string, string>);
          await authManager.seedFromVault(String(pc.product.id), pc.product.slug, prodData);
        }
      } catch {
        // Non-fatal — product may not have Vault secrets yet
      }
    }
  }

  return result;
}
