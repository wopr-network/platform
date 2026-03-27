import type { DrizzleDb } from "../db/index.js";
import type { PlatformBootOptions, PlatformBootResult } from "./boot.js";
import { platformBoot as rawPlatformBoot } from "./boot.js";
import { DrizzleProductConfigRepository } from "./drizzle-product-config-repository.js";
import type { IProductConfigRepository } from "./repository-types.js";
import { ProductConfigService } from "./service.js";

export type { PlatformBootOptions, PlatformBootResult } from "./boot.js";
export type { ProductPreset } from "./presets.js";
export { PRODUCT_PRESETS } from "./presets.js";

/**
 * Bootstrap product config from DB and register the service globally.
 * Wraps the raw boot to ensure getProductConfigService() works after calling this.
 */
export async function platformBoot(opts: PlatformBootOptions): Promise<PlatformBootResult> {
  const result = await rawPlatformBoot(opts);
  _service = result.service;
  return result;
}
export { DrizzleProductConfigRepository } from "./drizzle-product-config-repository.js";
// Re-exports for consumers
export type {
  FleetBillingModel,
  FleetLifecycle,
  IProductConfigRepository,
  NavItemInput,
  Product,
  ProductBillingConfig,
  ProductBrandConfig,
  ProductBrandUpdate,
  ProductConfig,
  ProductDomain,
  ProductFeatures,
  ProductFleetConfig,
  ProductNavItem,
} from "./repository-types.js";
export { deriveCorsOrigins, toBrandConfig } from "./repository-types.js";
export { ProductConfigService } from "./service.js";

let _service: ProductConfigService | null = null;

/** Initialize the product config system. Call once at startup. */
export function initProductConfig(db: DrizzleDb): ProductConfigService {
  const repo = new DrizzleProductConfigRepository(db);
  _service = new ProductConfigService(repo);
  return _service;
}

/** Initialize with a custom repository (for testing). */
export function initProductConfigWithRepo(repo: IProductConfigRepository): ProductConfigService {
  _service = new ProductConfigService(repo);
  return _service;
}

/**
 * Get the product config service.
 * This is the ONLY way to access product config — reads are cached,
 * writes auto-invalidate the cache.
 */
export function getProductConfigService(): ProductConfigService {
  if (!_service) throw new Error("Product config not initialized. Call initProductConfig() first.");
  return _service;
}
