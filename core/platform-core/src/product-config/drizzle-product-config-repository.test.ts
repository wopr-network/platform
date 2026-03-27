import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DrizzleDb } from "../db/index.js";
import { products } from "../db/schema/products.js";
import { createTestDb } from "../test/db.js";
import { DrizzleProductConfigRepository } from "./drizzle-product-config-repository.js";

const PRODUCT_SEED = {
  slug: "test-product",
  brandName: "Test Brand",
  productName: "Test Product",
  domain: "test.example.com",
  appDomain: "app.test.example.com",
  cookieDomain: ".test.example.com",
  storagePrefix: "test",
};

describe("DrizzleProductConfigRepository", () => {
  let db: DrizzleDb;
  let pool: PGlite;
  let repo: DrizzleProductConfigRepository;

  beforeAll(async () => {
    const result = await createTestDb();
    db = result.db as unknown as DrizzleDb;
    pool = result.pool;
    repo = new DrizzleProductConfigRepository(db);
  });

  afterAll(async () => {
    await pool.close();
  });

  it("getBySlug returns null for unknown slug", async () => {
    const result = await repo.getBySlug("no-such-slug");
    expect(result).toBeNull();
  });

  it("getBySlug returns full config for seeded product with empty related tables", async () => {
    await db.insert(products).values(PRODUCT_SEED);

    const config = await repo.getBySlug("test-product");

    expect(config).not.toBeNull();
    expect(config?.product.slug).toBe("test-product");
    expect(config?.product.brandName).toBe("Test Brand");
    expect(config?.navItems).toHaveLength(0);
    expect(config?.domains).toHaveLength(0);
    expect(config?.features).toBeNull();
    expect(config?.fleet).toBeNull();
    expect(config?.billing).toBeNull();
  });

  it("replaceNavItems then getBySlug returns sorted nav items", async () => {
    const config = await repo.getBySlug("test-product");
    if (!config) throw new Error("product not found");
    const productId = config.product.id;

    await repo.replaceNavItems(productId, [
      { label: "Beta", href: "/beta", sortOrder: 2 },
      { label: "Alpha", href: "/alpha", sortOrder: 1 },
      { label: "Gamma", href: "/gamma", sortOrder: 3, requiresRole: "admin" },
    ]);

    const updated = await repo.getBySlug("test-product");
    expect(updated?.navItems).toHaveLength(3);
    expect(updated?.navItems[0].label).toBe("Alpha");
    expect(updated?.navItems[1].label).toBe("Beta");
    expect(updated?.navItems[2].label).toBe("Gamma");
    expect(updated?.navItems[2].requiresRole).toBe("admin");
  });

  it("upsertFeatures then getBySlug returns features", async () => {
    const config = await repo.getBySlug("test-product");
    if (!config) throw new Error("product not found");
    const productId = config.product.id;

    await repo.upsertFeatures(productId, {
      chatEnabled: false,
      onboardingEnabled: true,
      onboardingDefaultModel: "gpt-4o",
      onboardingMaxCredits: 50,
    });

    const updated = await repo.getBySlug("test-product");
    expect(updated?.features).not.toBeNull();
    expect(updated?.features?.chatEnabled).toBe(false);
    expect(updated?.features?.onboardingDefaultModel).toBe("gpt-4o");
    expect(updated?.features?.onboardingMaxCredits).toBe(50);
  });

  it("upsertFleetConfig with lifecycle ephemeral and billingModel none", async () => {
    const config = await repo.getBySlug("test-product");
    if (!config) throw new Error("product not found");
    const productId = config.product.id;

    await repo.upsertFleetConfig(productId, {
      containerImage: "ghcr.io/example/app:latest",
      lifecycle: "ephemeral",
      billingModel: "none",
      containerPort: 8080,
      maxInstances: 10,
    });

    const updated = await repo.getBySlug("test-product");
    expect(updated?.fleet).not.toBeNull();
    expect(updated?.fleet?.containerImage).toBe("ghcr.io/example/app:latest");
    expect(updated?.fleet?.lifecycle).toBe("ephemeral");
    expect(updated?.fleet?.billingModel).toBe("none");
    expect(updated?.fleet?.containerPort).toBe(8080);
    expect(updated?.fleet?.maxInstances).toBe(10);
  });

  it("listAll returns all products", async () => {
    // Insert a second product
    await db.insert(products).values({
      slug: "second-product",
      brandName: "Second Brand",
      productName: "Second Product",
      domain: "second.example.com",
      appDomain: "app.second.example.com",
      cookieDomain: ".second.example.com",
      storagePrefix: "second",
    });

    const all = await repo.listAll();
    const slugs = all.map((c) => c.product.slug);
    expect(slugs).toContain("test-product");
    expect(slugs).toContain("second-product");
    expect(all.length).toBeGreaterThanOrEqual(2);
  });
});
