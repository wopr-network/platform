/**
 * PlatformContainer — the central DI container for platform-core.
 *
 * Products compose a container at boot time, enabling only the feature
 * slices they need. Nullable sub-containers (fleet, crypto, stripe,
 * gateway, hotPool) let each product opt in without pulling unused deps.
 */

import type Docker from "dockerode";
import type { Pool } from "pg";
import type Stripe from "stripe";
import type { IUserRoleRepository } from "../auth/user-role-repository.js";
import type { ICryptoChargeRepository } from "../billing/crypto/charge-store.js";
import type { IWebhookSeenRepository } from "../billing/webhook-seen-repository.js";
import type { ILedger } from "../credits/ledger.js";
import type { ITenantCustomerRepository } from "../credits/tenant-customer-repository.js";
import type { DrizzleDb } from "../db/index.js";
import type { FleetManager } from "../fleet/fleet-manager.js";
import type { IProfileStore } from "../fleet/profile-store.js";
import type { IServiceKeyRepository } from "../gateway/service-key-repository.js";
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
  docker: Docker;
  proxy: ProxyManagerInterface;
  profileStore: IProfileStore;
  serviceKeyRepo: IServiceKeyRepository;
}

export interface CryptoServices {
  chargeRepo: ICryptoChargeRepository;
  webhookSeenRepo: IWebhookSeenRepository;
}

export interface StripeServices {
  stripe: Stripe;
  webhookSecret: string;
  customerRepo: ITenantCustomerRepository;
  processor: { handleWebhook(payload: Buffer, signature: string): Promise<unknown> };
}

export interface GatewayServices {
  serviceKeyRepo: IServiceKeyRepository;
}

export interface HotPoolServices {
  /** Start the pool manager (replenish loop + cleanup). */
  start: () => Promise<{ stop: () => void }>;
  /** Claim a warm instance from the pool. Returns null if empty. */
  claim: (
    name: string,
    tenantId: string,
    adminUser: { id: string; email: string; name: string },
  ) => Promise<{ id: string; name: string; subdomain: string } | null>;
  /** Get current pool size from DB. */
  getPoolSize: () => Promise<number>;
  /** Set pool size in DB. */
  setPoolSize: (size: number) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Main container
// ---------------------------------------------------------------------------

export interface PlatformContainer {
  db: DrizzleDb;
  pool: Pool;
  productConfig: ProductConfig;
  productConfigService: ProductConfigService;
  creditLedger: ILedger;
  orgMemberRepo: IOrgMemberRepository;
  orgService: OrgService;
  userRoleRepo: IUserRoleRepository;

  /** Null when the product does not use fleet management. */
  fleet: FleetServices | null;
  /** Null when the product does not accept crypto payments. */
  crypto: CryptoServices | null;
  /** Null when the product does not use Stripe billing. */
  stripe: StripeServices | null;
  /** Null when the product does not expose a metered inference gateway. */
  gateway: GatewayServices | null;
  /** Null when the product does not use a hot-pool of pre-provisioned instances. */
  hotPool: HotPoolServices | null;
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
    const migrationsFolder = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../drizzle");
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

  // 8. Fleet services (when enabled)
  let fleet: FleetServices | null = null;
  if (bootConfig.features.fleet) {
    const { FleetManager: FleetManagerClass } = await import("../fleet/fleet-manager.js");
    const { ProfileStore } = await import("../fleet/profile-store.js");
    const { ProxyManager } = await import("../proxy/manager.js");
    const { DrizzleServiceKeyRepository } = await import("../gateway/service-key-repository.js");
    const DockerModule = await import("dockerode");
    const DockerClass = DockerModule.default ?? DockerModule;

    const docker: Docker = new (DockerClass as new () => Docker)();
    const fleetDataDir = productConfig.fleet?.fleetDataDir ?? "/data/fleet";
    const profileStore: IProfileStore = new ProfileStore(fleetDataDir);
    const proxy: ProxyManagerInterface = new ProxyManager();
    const serviceKeyRepo: IServiceKeyRepository = new DrizzleServiceKeyRepository(db as never);
    const manager: FleetManager = new FleetManagerClass(
      docker,
      profileStore,
      undefined, // platformDiscovery
      undefined, // networkPolicy
      proxy,
    );

    fleet = { manager, docker, proxy, profileStore, serviceKeyRepo };
  }

  // 9. Crypto services (when enabled)
  let crypto: CryptoServices | null = null;
  if (bootConfig.features.crypto) {
    const { DrizzleCryptoChargeRepository } = await import("../billing/crypto/charge-store.js");
    const { DrizzleWebhookSeenRepository } = await import("../billing/drizzle-webhook-seen-repository.js");

    const chargeRepo: ICryptoChargeRepository = new DrizzleCryptoChargeRepository(db as never);
    const webhookSeenRepo: IWebhookSeenRepository = new DrizzleWebhookSeenRepository(db as never);

    crypto = { chargeRepo, webhookSeenRepo };
  }

  // 10. Stripe services (when enabled)
  let stripe: StripeServices | null = null;
  if (bootConfig.features.stripe && bootConfig.stripeSecretKey) {
    const StripeModule = await import("stripe");
    const StripeClass = StripeModule.default;
    const stripeClient: Stripe = new StripeClass(bootConfig.stripeSecretKey);

    const { DrizzleTenantCustomerRepository } = await import("../billing/stripe/tenant-store.js");
    const { loadCreditPriceMap } = await import("../billing/stripe/credit-prices.js");
    const { StripePaymentProcessor } = await import("../billing/stripe/stripe-payment-processor.js");

    const customerRepo = new DrizzleTenantCustomerRepository(db as never);
    const priceMap = loadCreditPriceMap();
    const processor = new StripePaymentProcessor({
      stripe: stripeClient,
      tenantRepo: customerRepo,
      webhookSecret: bootConfig.stripeWebhookSecret ?? "",
      priceMap,
      creditLedger,
    });

    stripe = {
      stripe: stripeClient,
      webhookSecret: bootConfig.stripeWebhookSecret ?? "",
      customerRepo,
      processor,
    };
  }

  // 11. Gateway services (when enabled)
  let gateway: GatewayServices | null = null;
  if (bootConfig.features.gateway) {
    const { DrizzleServiceKeyRepository } = await import("../gateway/service-key-repository.js");
    const serviceKeyRepo: IServiceKeyRepository = new DrizzleServiceKeyRepository(db as never);
    gateway = { serviceKeyRepo };
  }

  // 12. Build the container (hotPool bound after construction)
  const result: PlatformContainer = {
    db,
    pool,
    productConfig,
    productConfigService,
    creditLedger,
    orgMemberRepo,
    orgService,
    userRoleRepo,
    fleet,
    crypto,
    stripe,
    gateway,
    hotPool: null,
  };

  // Bind hot pool after container construction (closures need the full container)
  if (bootConfig.features.hotPool && fleet) {
    const { startHotPool, setPoolSize: setSize, getPoolSize: getSize } = await import("./services/hot-pool.js");
    const { claimPoolInstance } = await import("./services/hot-pool-claim.js");
    const { DrizzlePoolRepository } = await import("./services/pool-repository.js");
    const poolRepo = new DrizzlePoolRepository(pool);

    const hotPoolConfig = { provisionSecret: bootConfig.provisionSecret };
    result.hotPool = {
      start: () => startHotPool(result, poolRepo, hotPoolConfig),
      claim: (name, tenantId, adminUser) =>
        claimPoolInstance(result, poolRepo, name, tenantId, adminUser, hotPoolConfig),
      getPoolSize: () => getSize(poolRepo),
      setPoolSize: (size) => setSize(poolRepo, size),
    };
  }

  return result;
}
