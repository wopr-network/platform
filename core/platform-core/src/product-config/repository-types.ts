// src/product-config/repository-types.ts
//
// Plain TypeScript interfaces for product configuration domain.
// No Drizzle types. These are the contract all consumers work against.

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

/** Plain domain object representing a product — mirrors `products` table. */
export interface Product {
  id: string;
  slug: string;
  brandName: string;
  productName: string;
  tagline: string;
  domain: string;
  appDomain: string;
  cookieDomain: string;
  companyLegal: string;
  priceLabel: string;
  defaultImage: string;
  emailSupport: string;
  emailPrivacy: string;
  emailLegal: string;
  fromEmail: string;
  homePath: string;
  storagePrefix: string;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// ProductNavItem
// ---------------------------------------------------------------------------

export interface ProductNavItem {
  id: string;
  productId: string;
  label: string;
  href: string;
  icon: string | null;
  sortOrder: number;
  requiresRole: string | null;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// ProductDomain
// ---------------------------------------------------------------------------

export interface ProductDomain {
  id: string;
  productId: string;
  host: string;
  role: "canonical" | "redirect";
}

// ---------------------------------------------------------------------------
// ProductFeatures
// ---------------------------------------------------------------------------

export interface ProductFeatures {
  productId: string;
  chatEnabled: boolean;
  onboardingEnabled: boolean;
  onboardingDefaultModel: string | null;
  onboardingSystemPrompt: string | null;
  onboardingMaxCredits: number;
  onboardingWelcomeMsg: string | null;
  sharedModuleBilling: boolean;
  sharedModuleMonitoring: boolean;
  sharedModuleAnalytics: boolean;
}

// ---------------------------------------------------------------------------
// ProductFleetConfig
// ---------------------------------------------------------------------------

export type FleetLifecycle = "managed" | "ephemeral";
export type FleetBillingModel = "monthly" | "per_use" | "none";

export interface ProductFleetConfig {
  productId: string;
  containerImage: string;
  containerPort: number;
  lifecycle: FleetLifecycle;
  billingModel: FleetBillingModel;
  maxInstances: number;
  imageAllowlist: string[] | null;
  dockerNetwork: string;
  placementStrategy: string;
  fleetDataDir: string;
}

// ---------------------------------------------------------------------------
// ProductBillingConfig
// ---------------------------------------------------------------------------

export interface ProductBillingConfig {
  productId: string;
  stripePublishableKey: string | null;
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  creditPrices: Record<string, number>;
  affiliateBaseUrl: string | null;
  affiliateMatchRate: number;
  affiliateMaxCap: number;
  dividendRate: number;
  marginConfig: unknown;
}

// ---------------------------------------------------------------------------
// Aggregates
// ---------------------------------------------------------------------------

/** Full product config resolved from all tables. */
export interface ProductConfig {
  product: Product;
  navItems: ProductNavItem[];
  domains: ProductDomain[];
  features: ProductFeatures | null;
  fleet: ProductFleetConfig | null;
  billing: ProductBillingConfig | null;
}

/** Brand config shape served to UI (matches BrandConfig in platform-ui-core). */
export interface ProductBrandConfig {
  productName: string;
  brandName: string;
  domain: string;
  appDomain: string;
  tagline: string;
  emails: { privacy: string; legal: string; support: string };
  defaultImage: string;
  storagePrefix: string;
  companyLegalName: string;
  price: string;
  homePath: string;
  chatEnabled: boolean;
  navItems: Array<{ label: string; href: string }>;
  domains?: Array<{ host: string; role: string }>;
}

// ---------------------------------------------------------------------------
// Repository Interface
// ---------------------------------------------------------------------------

/** Upsert payload for product brand fields. */
export type ProductBrandUpdate = Partial<Omit<Product, "id" | "slug" | "createdAt" | "updatedAt">>;

/** Upsert payload for a nav item (no id — replaced in bulk). */
export interface NavItemInput {
  label: string;
  href: string;
  icon?: string;
  sortOrder: number;
  requiresRole?: string;
  enabled?: boolean;
}

export interface IProductConfigRepository {
  getBySlug(slug: string): Promise<ProductConfig | null>;
  listAll(): Promise<ProductConfig[]>;
  upsertProduct(slug: string, data: ProductBrandUpdate): Promise<Product>;
  replaceNavItems(productId: string, items: NavItemInput[]): Promise<void>;
  upsertFeatures(productId: string, data: Partial<ProductFeatures>): Promise<void>;
  upsertFleetConfig(productId: string, data: Partial<ProductFleetConfig>): Promise<void>;
  upsertBillingConfig(productId: string, data: Partial<ProductBillingConfig>): Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Derive CORS origins from product config. */
/** Derive CORS origins — excludes redirect-only domains (they 301, never make requests). */
export function deriveCorsOrigins(product: Product, domains: ProductDomain[]): string[] {
  const origins = new Set<string>();
  origins.add(`https://${product.domain}`);
  origins.add(`https://${product.appDomain}`);
  for (const d of domains) {
    if (d.role !== "redirect") {
      origins.add(`https://${d.host}`);
    }
  }
  return [...origins];
}

/**
 * Derive brand config for UI from full product config.
 *
 * @param config - Full product config.
 * @param userRole - Optional role of the requesting user. When omitted (public/unauthenticated),
 *   nav items that require a role are excluded from the result.
 */
export function toBrandConfig(config: ProductConfig, userRole?: string): ProductBrandConfig {
  const { product, navItems, domains, features } = config;
  return {
    productName: product.productName,
    brandName: product.brandName,
    domain: product.domain,
    appDomain: product.appDomain,
    tagline: product.tagline,
    emails: {
      privacy: product.emailPrivacy,
      legal: product.emailLegal,
      support: product.emailSupport,
    },
    defaultImage: product.defaultImage,
    storagePrefix: product.storagePrefix,
    companyLegalName: product.companyLegal,
    price: product.priceLabel,
    homePath: product.homePath,
    chatEnabled: features?.chatEnabled ?? true,
    navItems: navItems
      .filter((n) => n.enabled)
      .filter((n) => !n.requiresRole || n.requiresRole === userRole)
      .map((n) => ({ label: n.label, href: n.href })),
    domains: domains.length > 0 ? domains.map((d) => ({ host: d.host, role: d.role })) : undefined,
  };
}
