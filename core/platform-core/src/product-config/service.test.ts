import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IProductConfigRepository, Product, ProductConfig } from "./repository-types.js";
import { ProductConfigService } from "./service.js";

function makeConfig(slug: string): ProductConfig {
  const product: Product = {
    id: "test-id",
    slug,
    brandName: "Test",
    productName: "Test",
    tagline: "",
    domain: "test.com",
    appDomain: "app.test.com",
    cookieDomain: ".test.com",
    companyLegal: "",
    priceLabel: "",
    defaultImage: "",
    emailSupport: "",
    emailPrivacy: "",
    emailLegal: "",
    fromEmail: "",
    homePath: "/dashboard",
    storagePrefix: "test",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return { product, navItems: [], domains: [], features: null, fleet: null, billing: null };
}

function mockRepo(): IProductConfigRepository {
  return {
    getBySlug: vi.fn().mockResolvedValue(makeConfig("test")),
    listAll: vi.fn().mockResolvedValue([makeConfig("test")]),
    upsertProduct: vi.fn().mockResolvedValue(makeConfig("test").product),
    replaceNavItems: vi.fn().mockResolvedValue(undefined),
    upsertFeatures: vi.fn().mockResolvedValue(undefined),
    upsertFleetConfig: vi.fn().mockResolvedValue(undefined),
    upsertBillingConfig: vi.fn().mockResolvedValue(undefined),
  };
}

describe("ProductConfigService", () => {
  let repo: ReturnType<typeof mockRepo>;
  let service: ProductConfigService;

  beforeEach(() => {
    repo = mockRepo();
    service = new ProductConfigService(repo, { ttlMs: 100 });
  });

  // --- Cache behavior ---

  it("caches getBySlug results", async () => {
    await service.getBySlug("test");
    await service.getBySlug("test");
    expect(repo.getBySlug).toHaveBeenCalledOnce();
  });

  it("refetches after TTL expires", async () => {
    await service.getBySlug("test");
    await new Promise((r) => setTimeout(r, 150));
    await service.getBySlug("test");
    expect(repo.getBySlug).toHaveBeenCalledTimes(2);
  });

  it("does not cache null results", async () => {
    (repo.getBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await service.getBySlug("missing");
    await service.getBySlug("missing");
    expect(repo.getBySlug).toHaveBeenCalledTimes(2);
  });

  // --- Auto-invalidation ---

  it("upsertProduct invalidates cache", async () => {
    await service.getBySlug("test");
    expect(repo.getBySlug).toHaveBeenCalledOnce();

    await service.upsertProduct("test", { brandName: "Updated" });

    await service.getBySlug("test");
    expect(repo.getBySlug).toHaveBeenCalledTimes(2);
  });

  it("replaceNavItems invalidates cache", async () => {
    await service.getBySlug("test");
    await service.replaceNavItems("test", "test-id", []);
    await service.getBySlug("test");
    expect(repo.getBySlug).toHaveBeenCalledTimes(2);
  });

  it("upsertFeatures invalidates cache", async () => {
    await service.getBySlug("test");
    await service.upsertFeatures("test", "test-id", { chatEnabled: false });
    await service.getBySlug("test");
    expect(repo.getBySlug).toHaveBeenCalledTimes(2);
  });

  it("upsertFleetConfig invalidates cache", async () => {
    await service.getBySlug("test");
    await service.upsertFleetConfig("test", "test-id", { lifecycle: "ephemeral" });
    await service.getBySlug("test");
    expect(repo.getBySlug).toHaveBeenCalledTimes(2);
  });

  it("upsertBillingConfig invalidates cache", async () => {
    await service.getBySlug("test");
    await service.upsertBillingConfig("test", "test-id", { affiliateMaxCap: 100 });
    await service.getBySlug("test");
    expect(repo.getBySlug).toHaveBeenCalledTimes(2);
  });

  // --- Brand config derivation ---

  it("getBrandConfig returns derived brand config", async () => {
    const brand = await service.getBrandConfig("test");
    expect(brand).not.toBeNull();
    expect(brand?.brandName).toBe("Test");
    expect(brand?.domain).toBe("test.com");
  });

  it("getBrandConfig returns null for missing product", async () => {
    (repo.getBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const brand = await service.getBrandConfig("missing");
    expect(brand).toBeNull();
  });
});
