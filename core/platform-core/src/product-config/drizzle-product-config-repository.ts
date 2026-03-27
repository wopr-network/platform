import { asc, eq } from "drizzle-orm";
import type { DrizzleDb } from "../db/index.js";
import { productBillingConfig, productFeatures, productFleetConfig } from "../db/schema/product-config.js";
import { productDomains, productNavItems, products } from "../db/schema/products.js";
import type {
  IProductConfigRepository,
  NavItemInput,
  Product,
  ProductBillingConfig as ProductBillingConfigType,
  ProductBrandUpdate,
  ProductConfig,
  ProductDomain,
  ProductFeatures as ProductFeaturesType,
  ProductFleetConfig as ProductFleetConfigType,
  ProductNavItem,
} from "./repository-types.js";

export class DrizzleProductConfigRepository implements IProductConfigRepository {
  constructor(private db: DrizzleDb) {}

  async getBySlug(slug: string): Promise<ProductConfig | null> {
    const [product] = await this.db.select().from(products).where(eq(products.slug, slug)).limit(1);

    if (!product) return null;

    const [navItems, domains, featuresRows, fleetRows, billingRows] = await Promise.all([
      this.db
        .select()
        .from(productNavItems)
        .where(eq(productNavItems.productId, product.id))
        .orderBy(asc(productNavItems.sortOrder)),
      this.db.select().from(productDomains).where(eq(productDomains.productId, product.id)),
      this.db.select().from(productFeatures).where(eq(productFeatures.productId, product.id)).limit(1),
      this.db.select().from(productFleetConfig).where(eq(productFleetConfig.productId, product.id)).limit(1),
      this.db.select().from(productBillingConfig).where(eq(productBillingConfig.productId, product.id)).limit(1),
    ]);

    return {
      product: this.mapProduct(product),
      navItems: navItems.map((n) => this.mapNavItem(n)),
      domains: domains.map((d) => this.mapDomain(d)),
      features: featuresRows[0] ? this.mapFeatures(featuresRows[0]) : null,
      fleet: fleetRows[0] ? this.mapFleet(fleetRows[0]) : null,
      billing: billingRows[0] ? this.mapBilling(billingRows[0]) : null,
    };
  }

  async listAll(): Promise<ProductConfig[]> {
    const allProducts = await this.db.select().from(products);
    const configs = await Promise.all(allProducts.map((p) => this.getBySlug(p.slug)));
    return configs.filter((c): c is ProductConfig => c !== null);
  }

  async upsertProduct(slug: string, data: ProductBrandUpdate): Promise<Product> {
    const base = {
      slug,
      storagePrefix: slug,
      domain: "",
      appDomain: "",
      cookieDomain: "",
      brandName: "",
      productName: "",
    };
    const [result] = await this.db
      .insert(products)
      .values({ ...base, ...data })
      .onConflictDoUpdate({
        target: products.slug,
        set: { ...(data as Record<string, unknown>), updatedAt: new Date() },
      })
      .returning();
    return this.mapProduct(result);
  }

  async replaceNavItems(productId: string, items: NavItemInput[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(productNavItems).where(eq(productNavItems.productId, productId));
      if (items.length > 0) {
        await tx.insert(productNavItems).values(
          items.map((item) => ({
            productId,
            label: item.label,
            href: item.href,
            icon: item.icon ?? null,
            sortOrder: item.sortOrder,
            requiresRole: item.requiresRole ?? null,
            enabled: item.enabled !== false,
          })),
        );
      }
    });
  }

  async upsertFeatures(productId: string, data: Partial<ProductFeaturesType>): Promise<void> {
    const { productId: _, ...rest } = data as Record<string, unknown>;
    await this.db
      .insert(productFeatures)
      // biome-ignore lint/suspicious/noExplicitAny: Drizzle partial upsert requires unknown spread
      .values({ productId, ...rest } as any)
      .onConflictDoUpdate({
        target: productFeatures.productId,
        // biome-ignore lint/suspicious/noExplicitAny: Drizzle partial upsert requires unknown spread
        set: { ...rest, updatedAt: new Date() } as any,
      });
  }

  async upsertFleetConfig(productId: string, data: Partial<ProductFleetConfigType>): Promise<void> {
    const { productId: _, ...rest } = data as Record<string, unknown>;
    await this.db
      .insert(productFleetConfig)
      // biome-ignore lint/suspicious/noExplicitAny: Drizzle partial upsert requires unknown spread
      .values({ productId, containerImage: "", ...rest } as any)
      .onConflictDoUpdate({
        target: productFleetConfig.productId,
        // biome-ignore lint/suspicious/noExplicitAny: Drizzle partial upsert requires unknown spread
        set: { ...rest, updatedAt: new Date() } as any,
      });
  }

  async upsertBillingConfig(productId: string, data: Partial<ProductBillingConfigType>): Promise<void> {
    // TODO: stripeSecretKey and stripeWebhookSecret must be encrypted via the credential vault
    // (CRYPTO_SERVICE_KEY) before reaching this method. The schema stores encrypted ciphertext.
    const { productId: _, ...rest } = data as Record<string, unknown>;
    await this.db
      .insert(productBillingConfig)
      // biome-ignore lint/suspicious/noExplicitAny: Drizzle partial upsert requires unknown spread
      .values({ productId, ...rest } as any)
      .onConflictDoUpdate({
        target: productBillingConfig.productId,
        // biome-ignore lint/suspicious/noExplicitAny: Drizzle partial upsert requires unknown spread
        set: { ...rest, updatedAt: new Date() } as any,
      });
  }

  // ---------------------------------------------------------------------------
  // Mappers
  // ---------------------------------------------------------------------------

  private mapProduct(row: typeof products.$inferSelect): Product {
    return {
      id: row.id,
      slug: row.slug,
      brandName: row.brandName,
      productName: row.productName,
      tagline: row.tagline,
      domain: row.domain,
      appDomain: row.appDomain,
      cookieDomain: row.cookieDomain,
      companyLegal: row.companyLegal,
      priceLabel: row.priceLabel,
      defaultImage: row.defaultImage,
      emailSupport: row.emailSupport,
      emailPrivacy: row.emailPrivacy,
      emailLegal: row.emailLegal,
      fromEmail: row.fromEmail,
      homePath: row.homePath,
      storagePrefix: row.storagePrefix,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapNavItem(row: typeof productNavItems.$inferSelect): ProductNavItem {
    return {
      id: row.id,
      productId: row.productId,
      label: row.label,
      href: row.href,
      icon: row.icon ?? null,
      sortOrder: row.sortOrder,
      requiresRole: row.requiresRole ?? null,
      enabled: row.enabled,
    };
  }

  private mapDomain(row: typeof productDomains.$inferSelect): ProductDomain {
    return {
      id: row.id,
      productId: row.productId,
      host: row.host,
      role: row.role as "canonical" | "redirect",
    };
  }

  private mapFeatures(row: typeof productFeatures.$inferSelect): ProductFeaturesType {
    return {
      productId: row.productId,
      chatEnabled: row.chatEnabled,
      onboardingEnabled: row.onboardingEnabled,
      onboardingDefaultModel: row.onboardingDefaultModel ?? null,
      onboardingSystemPrompt: row.onboardingSystemPrompt ?? null,
      onboardingMaxCredits: row.onboardingMaxCredits,
      onboardingWelcomeMsg: row.onboardingWelcomeMsg ?? null,
      sharedModuleBilling: row.sharedModuleBilling,
      sharedModuleMonitoring: row.sharedModuleMonitoring,
      sharedModuleAnalytics: row.sharedModuleAnalytics,
    };
  }

  private mapFleet(row: typeof productFleetConfig.$inferSelect): ProductFleetConfigType {
    return {
      productId: row.productId,
      containerImage: row.containerImage,
      containerPort: row.containerPort,
      lifecycle: row.lifecycle as ProductFleetConfigType["lifecycle"],
      billingModel: row.billingModel as ProductFleetConfigType["billingModel"],
      maxInstances: row.maxInstances,
      imageAllowlist: row.imageAllowlist ?? null,
      dockerNetwork: row.dockerNetwork,
      placementStrategy: row.placementStrategy,
      fleetDataDir: row.fleetDataDir,
    };
  }

  private mapBilling(row: typeof productBillingConfig.$inferSelect): ProductBillingConfigType {
    return {
      productId: row.productId,
      stripePublishableKey: row.stripePublishableKey ?? null,
      stripeSecretKey: row.stripeSecretKey ?? null,
      stripeWebhookSecret: row.stripeWebhookSecret ?? null,
      creditPrices: (row.creditPrices ?? {}) as Record<string, number>,
      affiliateBaseUrl: row.affiliateBaseUrl ?? null,
      affiliateMatchRate: Number(row.affiliateMatchRate),
      affiliateMaxCap: row.affiliateMaxCap,
      dividendRate: Number(row.dividendRate),
      marginConfig: row.marginConfig ?? null,
    };
  }
}
