import { describe, expect, it, vi } from "vitest";
import type { BootConfig } from "../boot-config.js";

// ---------------------------------------------------------------------------
// Mocks — all class mocks use real classes (not arrow fns) so `new` works.
// ---------------------------------------------------------------------------

// Mock pg.Pool
const mockPoolEnd = vi.fn().mockResolvedValue(undefined);
const poolConstructorCalls: Array<{ connectionString: string }> = [];
class MockPoolClass {
  connectionString: string;
  end = mockPoolEnd;
  query = vi.fn().mockResolvedValue({ rows: [] });
  constructor(opts: { connectionString: string }) {
    this.connectionString = opts.connectionString;
    poolConstructorCalls.push(opts);
  }
}
vi.mock("pg", () => ({ Pool: MockPoolClass }));

// Mock drizzle db creation
const mockDb = { __brand: "drizzle-db" } as never;
vi.mock("../../db/index.js", () => ({
  createDb: vi.fn(() => mockDb),
}));

// Mock drizzle migrator
const mockMigrate = vi.fn().mockResolvedValue(undefined);
vi.mock("drizzle-orm/node-postgres/migrator", () => ({
  migrate: mockMigrate,
}));

// Mock platformBoot
const mockProductConfig = {
  product: {
    slug: "test",
    brandName: "Test",
    domain: "test.dev",
    appDomain: "app.test.dev",
    fromEmail: "hi@test.dev",
    emailSupport: "support@test.dev",
  },
  navItems: [],
  domains: [],
  features: null,
  fleet: null,
  billing: null,
};
const mockPlatformBoot = vi.fn().mockResolvedValue({
  service: {},
  config: mockProductConfig,
  corsOrigins: ["https://test.dev"],
  seeded: false,
});
vi.mock("../../product-config/boot.js", () => ({
  platformBoot: (...args: unknown[]) => mockPlatformBoot(...args),
}));

// Mock DrizzleLedger
const mockSeedSystemAccounts = vi.fn().mockResolvedValue(undefined);
class MockDrizzleLedgerClass {
  seedSystemAccounts = mockSeedSystemAccounts;
  balance = vi.fn().mockResolvedValue(0);
  credit = vi.fn();
  debit = vi.fn();
  post = vi.fn();
  hasReferenceId = vi.fn().mockResolvedValue(false);
  history = vi.fn().mockResolvedValue([]);
  tenantsWithBalance = vi.fn().mockResolvedValue([]);
  memberUsage = vi.fn().mockResolvedValue([]);
  lifetimeSpend = vi.fn().mockResolvedValue(0);
  lifetimeSpendBatch = vi.fn().mockResolvedValue(new Map());
  expiredCredits = vi.fn().mockResolvedValue([]);
  trialBalance = vi.fn().mockResolvedValue({ balanced: true });
  accountBalance = vi.fn().mockResolvedValue(0);
  existsByReferenceIdLike = vi.fn().mockResolvedValue(false);
  sumPurchasesForPeriod = vi.fn().mockResolvedValue(0);
  getActiveTenantIdsInWindow = vi.fn().mockResolvedValue([]);
  debitCapped = vi.fn().mockResolvedValue(null);
}
vi.mock("../../credits/ledger.js", async (importOriginal) => {
  const orig = await importOriginal<Record<string, unknown>>();
  return { ...orig, DrizzleLedger: MockDrizzleLedgerClass };
});

// Mock org/tenancy
class MockDrizzleOrgMemberRepositoryClass {
  listMembers = vi.fn().mockResolvedValue([]);
  addMember = vi.fn();
}
vi.mock("../../tenancy/org-member-repository.js", () => ({
  DrizzleOrgMemberRepository: MockDrizzleOrgMemberRepositoryClass,
}));

class MockDrizzleOrgRepositoryClass {}
vi.mock("../../tenancy/drizzle-org-repository.js", () => ({
  DrizzleOrgRepository: MockDrizzleOrgRepositoryClass,
}));

const orgServiceConstructorCalls: unknown[][] = [];
class MockOrgServiceClass {
  getOrCreatePersonalOrg = vi.fn();
  constructor(...args: unknown[]) {
    orgServiceConstructorCalls.push(args);
  }
}
vi.mock("../../tenancy/org-service.js", () => ({
  OrgService: MockOrgServiceClass,
}));

// Mock auth
class MockBetterAuthUserRepositoryClass {}
vi.mock("../../db/auth-user-repository.js", () => ({
  BetterAuthUserRepository: MockBetterAuthUserRepositoryClass,
}));

class MockDrizzleUserRoleRepositoryClass {
  isPlatformAdmin = vi.fn().mockResolvedValue(false);
  listRolesByUser = vi.fn().mockResolvedValue([]);
  getTenantIdByUserId = vi.fn().mockResolvedValue(null);
  grantRole = vi.fn();
  revokeRole = vi.fn().mockResolvedValue(false);
  listUsersByRole = vi.fn().mockResolvedValue([]);
}
vi.mock("../../auth/user-role-repository.js", () => ({
  DrizzleUserRoleRepository: MockDrizzleUserRoleRepositoryClass,
}));

// Mock fleet deps (only imported when fleet is enabled)
class MockFleetManagerClass {
  __brand = "fleet-manager";
}
vi.mock("../../fleet/fleet-manager.js", () => ({
  FleetManager: MockFleetManagerClass,
}));

class MockProfileStoreClass {
  __brand = "profile-store";
}
vi.mock("../../fleet/profile-store.js", () => ({
  ProfileStore: MockProfileStoreClass,
}));

class MockProxyManagerClass {
  __brand = "proxy-manager";
}
vi.mock("../../proxy/manager.js", () => ({
  ProxyManager: MockProxyManagerClass,
}));

class MockDrizzleServiceKeyRepositoryClass {
  __brand = "service-key-repo";
}
vi.mock("../../gateway/service-key-repository.js", () => ({
  DrizzleServiceKeyRepository: MockDrizzleServiceKeyRepositoryClass,
}));

class MockDockerClass {
  __brand = "docker";
}
vi.mock("dockerode", () => ({
  default: MockDockerClass,
}));

// Mock crypto deps
class MockDrizzleCryptoChargeRepositoryClass {
  __brand = "charge-repo";
}
vi.mock("../../billing/crypto/charge-store.js", () => ({
  DrizzleCryptoChargeRepository: MockDrizzleCryptoChargeRepositoryClass,
}));

class MockDrizzleWebhookSeenRepositoryClass {
  __brand = "webhook-seen-repo";
}
vi.mock("../../billing/drizzle-webhook-seen-repository.js", () => ({
  DrizzleWebhookSeenRepository: MockDrizzleWebhookSeenRepositoryClass,
}));

// Mock stripe deps
class MockStripeClass {
  __brand = "stripe-client";
}
vi.mock("stripe", () => ({
  default: MockStripeClass,
}));

class MockDrizzleTenantCustomerRepositoryClass {
  __brand = "tenant-customer-repo";
}
vi.mock("../../billing/stripe/tenant-store.js", () => ({
  DrizzleTenantCustomerRepository: MockDrizzleTenantCustomerRepositoryClass,
}));

vi.mock("../../billing/stripe/credit-prices.js", () => ({
  loadCreditPriceMap: vi.fn(() => new Map()),
}));

class MockStripePaymentProcessorClass {
  __brand = "stripe-processor";
  handleWebhook = vi.fn();
}
vi.mock("../../billing/stripe/stripe-payment-processor.js", () => ({
  StripePaymentProcessor: MockStripePaymentProcessorClass,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseBootConfig(overrides?: Partial<BootConfig>): BootConfig {
  return {
    slug: "test-product",
    databaseUrl: "postgres://localhost:5432/testdb",
    provisionSecret: "test-secret",
    features: {
      fleet: false,
      crypto: false,
      stripe: false,
      gateway: false,
      hotPool: false,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildContainer", () => {
  // Dynamic import so mocks are registered before the module loads
  async function loadBuildContainer() {
    const mod = await import("../container.js");
    return mod.buildContainer;
  }

  it("throws on empty databaseUrl", async () => {
    const buildContainer = await loadBuildContainer();
    const config = baseBootConfig({ databaseUrl: "" });

    await expect(buildContainer(config)).rejects.toThrow("databaseUrl is required");
  });

  it("creates pool with correct connectionString", async () => {
    const buildContainer = await loadBuildContainer();
    const config = baseBootConfig();
    poolConstructorCalls.length = 0;

    const container = await buildContainer(config);

    expect(poolConstructorCalls).toContainEqual({
      connectionString: "postgres://localhost:5432/testdb",
    });
    expect(container.pool).toBeDefined();
  });

  it("calls platformBoot with correct slug", async () => {
    const buildContainer = await loadBuildContainer();
    const config = baseBootConfig({ slug: "paperclip" });

    await buildContainer(config);

    expect(mockPlatformBoot).toHaveBeenCalledWith(expect.objectContaining({ slug: "paperclip" }));
  });

  it("seeds system accounts after creating ledger", async () => {
    const buildContainer = await loadBuildContainer();
    const config = baseBootConfig();

    await buildContainer(config);

    expect(mockSeedSystemAccounts).toHaveBeenCalled();
  });

  it("core services are always present", async () => {
    const buildContainer = await loadBuildContainer();
    const config = baseBootConfig();

    const container = await buildContainer(config);

    expect(container.db).toBeDefined();
    expect(container.pool).toBeDefined();
    expect(container.productConfig).toBeDefined();
    expect(container.creditLedger).toBeDefined();
    expect(container.orgMemberRepo).toBeDefined();
    expect(container.orgService).toBeDefined();
    expect(container.userRoleRepo).toBeDefined();
  });

  it("returns null for all disabled features", async () => {
    const buildContainer = await loadBuildContainer();
    const config = baseBootConfig();

    const container = await buildContainer(config);

    expect(container.fleet).toBeNull();
    expect(container.crypto).toBeNull();
    expect(container.stripe).toBeNull();
    expect(container.gateway).toBeNull();
    expect(container.hotPool).toBeNull();
  });

  it("builds fleet services when feature is enabled", async () => {
    const buildContainer = await loadBuildContainer();
    const config = baseBootConfig({
      features: { fleet: true, crypto: false, stripe: false, gateway: false, hotPool: false },
    });

    const container = await buildContainer(config);

    expect(container.fleet).not.toBeNull();
    expect(container.fleet?.manager).toBeDefined();
    expect(container.fleet?.docker).toBeDefined();
    expect(container.fleet?.proxy).toBeDefined();
    expect(container.fleet?.profileStore).toBeDefined();
    expect(container.fleet?.serviceKeyRepo).toBeDefined();
  });

  it("builds crypto services when feature is enabled", async () => {
    const buildContainer = await loadBuildContainer();
    const config = baseBootConfig({
      features: { fleet: false, crypto: true, stripe: false, gateway: false, hotPool: false },
    });

    const container = await buildContainer(config);

    expect(container.crypto).not.toBeNull();
    expect(container.crypto?.chargeRepo).toBeDefined();
    expect(container.crypto?.webhookSeenRepo).toBeDefined();
  });

  it("builds stripe services when feature is enabled and key provided", async () => {
    const buildContainer = await loadBuildContainer();
    const config = baseBootConfig({
      features: { fleet: false, crypto: false, stripe: true, gateway: false, hotPool: false },
      stripeSecretKey: "sk_test_123",
      stripeWebhookSecret: "whsec_test_456",
    });

    const container = await buildContainer(config);

    expect(container.stripe).not.toBeNull();
    expect(container.stripe?.stripe).toBeDefined();
    expect(container.stripe?.webhookSecret).toBe("whsec_test_456");
    expect(container.stripe?.customerRepo).toBeDefined();
    expect(container.stripe?.processor).toBeDefined();
  });

  it("returns null stripe when feature enabled but no secret key", async () => {
    const buildContainer = await loadBuildContainer();
    const config = baseBootConfig({
      features: { fleet: false, crypto: false, stripe: true, gateway: false, hotPool: false },
      // stripeSecretKey intentionally omitted
    });

    const container = await buildContainer(config);

    expect(container.stripe).toBeNull();
  });

  it("builds gateway services when feature is enabled", async () => {
    const buildContainer = await loadBuildContainer();
    const config = baseBootConfig({
      features: { fleet: false, crypto: false, stripe: false, gateway: true, hotPool: false },
    });

    const container = await buildContainer(config);

    expect(container.gateway).not.toBeNull();
    expect(container.gateway?.serviceKeyRepo).toBeDefined();
  });

  it("runs migrations before building services", async () => {
    const buildContainer = await loadBuildContainer();
    const config = baseBootConfig();

    await buildContainer(config);

    expect(mockMigrate).toHaveBeenCalled();
    // Migration should be called before platformBoot
    const migrateOrder = mockMigrate.mock.invocationCallOrder[0];
    const bootOrder = mockPlatformBoot.mock.invocationCallOrder[0];
    expect(migrateOrder).toBeLessThan(bootOrder);
  });

  it("constructs OrgService with orgRepo, memberRepo, db, and authUserRepo", async () => {
    const buildContainer = await loadBuildContainer();
    const config = baseBootConfig();
    orgServiceConstructorCalls.length = 0;

    await buildContainer(config);

    expect(orgServiceConstructorCalls.length).toBeGreaterThan(0);
    const [orgRepo, memberRepo, db, options] = orgServiceConstructorCalls[0];
    expect(orgRepo).toBeInstanceOf(MockDrizzleOrgRepositoryClass);
    expect(memberRepo).toBeInstanceOf(MockDrizzleOrgMemberRepositoryClass);
    expect(db).toBe(mockDb);
    expect(options).toEqual(expect.objectContaining({ userRepo: expect.any(MockBetterAuthUserRepositoryClass) }));
  });
});
