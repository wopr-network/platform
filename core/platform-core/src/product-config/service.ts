import type {
  IProductConfigRepository,
  NavItemInput,
  Product,
  ProductBillingConfig,
  ProductBrandConfig,
  ProductBrandUpdate,
  ProductConfig,
  ProductFeatures,
  ProductFleetConfig,
} from "./repository-types.js";
import { toBrandConfig } from "./repository-types.js";

interface CacheEntry {
  config: ProductConfig;
  expiresAt: number;
}

/**
 * Single point of access for product configuration.
 *
 * Wraps IProductConfigRepository with an in-memory cache.
 * All mutations automatically invalidate the cache — no caller
 * needs to remember to invalidate. This is the ONLY public
 * interface to product config; consumers never touch the repo directly.
 */
export class ProductConfigService {
  private cache = new Map<string, CacheEntry>();
  private ttlMs: number;

  constructor(
    private repo: IProductConfigRepository,
    opts: { ttlMs?: number } = {},
  ) {
    this.ttlMs = opts.ttlMs ?? 60_000;
  }

  // ---------------------------------------------------------------------------
  // Reads (cached)
  // ---------------------------------------------------------------------------

  async getBySlug(slug: string): Promise<ProductConfig | null> {
    const entry = this.cache.get(slug);
    if (entry && Date.now() < entry.expiresAt) {
      return entry.config;
    }
    const config = await this.repo.getBySlug(slug);
    if (config) {
      this.cache.set(slug, { config, expiresAt: Date.now() + this.ttlMs });
    }
    return config;
  }

  async getBrandConfig(slug: string): Promise<ProductBrandConfig | null> {
    const config = await this.getBySlug(slug);
    if (!config) return null;
    return toBrandConfig(config);
  }

  async listAll(): Promise<ProductConfig[]> {
    return this.repo.listAll();
  }

  // ---------------------------------------------------------------------------
  // Writes (auto-invalidate)
  // ---------------------------------------------------------------------------

  async upsertProduct(slug: string, data: ProductBrandUpdate): Promise<Product> {
    const result = await this.repo.upsertProduct(slug, data);
    this.invalidate(slug);
    return result;
  }

  async replaceNavItems(slug: string, productId: string, items: NavItemInput[]): Promise<void> {
    await this.repo.replaceNavItems(productId, items);
    this.invalidate(slug);
  }

  async upsertFeatures(slug: string, productId: string, data: Partial<ProductFeatures>): Promise<void> {
    await this.repo.upsertFeatures(productId, data);
    this.invalidate(slug);
  }

  async upsertFleetConfig(slug: string, productId: string, data: Partial<ProductFleetConfig>): Promise<void> {
    await this.repo.upsertFleetConfig(productId, data);
    this.invalidate(slug);
  }

  async upsertBillingConfig(slug: string, productId: string, data: Partial<ProductBillingConfig>): Promise<void> {
    await this.repo.upsertBillingConfig(productId, data);
    this.invalidate(slug);
  }

  // ---------------------------------------------------------------------------
  // Cache management
  // ---------------------------------------------------------------------------

  invalidate(slug: string): void {
    this.cache.delete(slug);
  }

  invalidateAll(): void {
    this.cache.clear();
  }
}
