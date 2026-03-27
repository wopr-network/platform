import { describe, expect, it } from "vitest";
import type { BootConfig, FeatureFlags } from "../boot-config.js";
import type { CryptoServices, FleetServices, GatewayServices, HotPoolServices, StripeServices } from "../container.js";
import { createTestContainer } from "../test-container.js";

// ---------------------------------------------------------------------------
// PlatformContainer interface
// ---------------------------------------------------------------------------

describe("PlatformContainer", () => {
  it("allows null feature services", () => {
    const c = createTestContainer();
    expect(c.fleet).toBeNull();
    expect(c.crypto).toBeNull();
    expect(c.stripe).toBeNull();
    expect(c.gateway).toBeNull();
    expect(c.hotPool).toBeNull();
  });

  it("requires core services to be present", () => {
    const c = createTestContainer();
    expect(c.db).toBeDefined();
    expect(c.pool).toBeDefined();
    expect(c.productConfig).toBeDefined();
    expect(c.creditLedger).toBeDefined();
    expect(c.orgMemberRepo).toBeDefined();
    expect(c.orgService).toBeDefined();
    expect(c.userRoleRepo).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// BootConfig shape
// ---------------------------------------------------------------------------

describe("BootConfig", () => {
  it("requires slug and provisionSecret", () => {
    const config: BootConfig = {
      slug: "test-product",
      databaseUrl: "postgres://localhost/test",
      provisionSecret: "s3cret",
      features: {
        fleet: false,
        crypto: false,
        stripe: false,
        gateway: false,
        hotPool: false,
      },
    };

    expect(config.slug).toBe("test-product");
    expect(config.provisionSecret).toBe("s3cret");
  });

  it("accepts optional fields", () => {
    const config: BootConfig = {
      slug: "full",
      databaseUrl: "postgres://localhost/full",
      provisionSecret: "secret",
      host: "127.0.0.1",
      port: 4000,
      features: {
        fleet: true,
        crypto: true,
        stripe: true,
        gateway: true,
        hotPool: true,
      },
      stripeSecretKey: "sk_test_xxx",
      stripeWebhookSecret: "whsec_xxx",
      cryptoServiceKey: "csk_xxx",
      routes: [],
    };

    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(4000);
    expect(config.features.fleet).toBe(true);
  });

  it("FeatureFlags has all five toggles", () => {
    const flags: FeatureFlags = {
      fleet: true,
      crypto: false,
      stripe: true,
      gateway: false,
      hotPool: true,
    };

    expect(Object.keys(flags)).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// createTestContainer
// ---------------------------------------------------------------------------

describe("createTestContainer", () => {
  it("returns valid defaults", () => {
    const c = createTestContainer();

    expect(c.fleet).toBeNull();
    expect(c.crypto).toBeNull();
    expect(c.stripe).toBeNull();
    expect(c.gateway).toBeNull();
    expect(c.hotPool).toBeNull();
    expect(c.productConfig.product).toBeDefined();
  });

  it("allows overrides for core services", () => {
    const customConfig = {
      product: { slug: "custom", name: "Custom" } as never,
      navItems: [],
      domains: [],
      features: null,
      fleet: null,
      billing: null,
    };

    const c = createTestContainer({ productConfig: customConfig });
    expect(c.productConfig.product).toEqual({ slug: "custom", name: "Custom" });
  });

  it("stub ledger methods return sensible defaults", async () => {
    const c = createTestContainer();

    expect(await c.creditLedger.balance("t1")).toBe(0);
    expect(await c.creditLedger.hasReferenceId("ref")).toBe(false);
    expect(await c.creditLedger.history("t1")).toEqual([]);
    expect(await c.creditLedger.tenantsWithBalance()).toEqual([]);
    expect(await c.creditLedger.lifetimeSpendBatch([])).toEqual(new Map());
  });

  it("stub orgMemberRepo methods return sensible defaults", async () => {
    const c = createTestContainer();

    expect(await c.orgMemberRepo.findMember("org1", "u1")).toBeNull();
    expect(await c.orgMemberRepo.listMembers("org1")).toEqual([]);
    expect(await c.orgMemberRepo.countAdminsAndOwners("org1")).toBe(0);
  });

  it("stub userRoleRepo methods return sensible defaults", async () => {
    const c = createTestContainer();

    expect(await c.userRoleRepo.getTenantIdByUserId("u1")).toBeNull();
    expect(await c.userRoleRepo.isPlatformAdmin("u1")).toBe(false);
    expect(await c.userRoleRepo.listRolesByUser("u1")).toEqual([]);
  });

  it("allows enabling feature services via overrides", () => {
    const fleet: FleetServices = {
      manager: {} as never,
      docker: {} as never,
      proxy: {} as never,
      profileStore: {} as never,
      serviceKeyRepo: {} as never,
    };

    const crypto: CryptoServices = {
      chargeRepo: {} as never,
      webhookSeenRepo: {} as never,
    };

    const stripe: StripeServices = {
      stripe: {} as never,
      webhookSecret: "whsec_test",
      customerRepo: {} as never,
      processor: {} as never,
    };

    const gateway: GatewayServices = {
      serviceKeyRepo: {} as never,
    };

    const hotPool: HotPoolServices = {
      start: async () => ({ stop: () => {} }),
      claim: async () => null,
      getPoolSize: async () => 2,
      setPoolSize: async () => {},
    };

    const c = createTestContainer({ fleet, crypto, stripe, gateway, hotPool });

    expect(c.fleet).not.toBeNull();
    expect(c.crypto).not.toBeNull();
    expect(c.stripe).not.toBeNull();
    expect(c.stripe?.webhookSecret).toBe("whsec_test");
    expect(c.gateway).not.toBeNull();
    expect(c.hotPool).not.toBeNull();
  });

  it("overrides merge without affecting other defaults", () => {
    const c = createTestContainer({ gateway: { serviceKeyRepo: {} as never } });

    // Overridden field
    expect(c.gateway).not.toBeNull();

    // Other feature services remain null
    expect(c.fleet).toBeNull();
    expect(c.crypto).toBeNull();
    expect(c.stripe).toBeNull();
    expect(c.hotPool).toBeNull();

    // Core services still present
    expect(c.creditLedger).toBeDefined();
    expect(c.orgMemberRepo).toBeDefined();
  });
});
