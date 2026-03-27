import type { DrizzleDb } from "../db/index.js";
import { DrizzleProductConfigRepository } from "./drizzle-product-config-repository.js";
import { PRODUCT_PRESETS } from "./presets.js";
import type { ProductConfig } from "./repository-types.js";
import { deriveCorsOrigins } from "./repository-types.js";
import { ProductConfigService } from "./service.js";

export interface PlatformBootResult {
  /** The product config service — single point of access for config reads/writes. */
  service: ProductConfigService;
  /** The resolved product config (cached). */
  config: ProductConfig;
  /** CORS origins derived from product domains + optional dev origins. */
  corsOrigins: string[];
  /** Whether the product was auto-seeded from built-in presets. */
  seeded: boolean;
}

export interface PlatformBootOptions {
  /** Product slug (e.g. "paperclip", "wopr", "holyship", "nemoclaw"). */
  slug: string;
  /** Drizzle database instance. */
  db: DrizzleDb;
  /** Additional CORS origins for local dev (from DEV_ORIGINS env var). */
  devOrigins?: string[];
}

/**
 * Bootstrap product configuration from DB.
 *
 * Call once at startup, after DB + migrations, before route registration.
 * If the product doesn't exist in the DB yet, auto-seeds from built-in
 * presets (zero manual steps on first deploy).
 */
export async function platformBoot(opts: PlatformBootOptions): Promise<PlatformBootResult> {
  const { slug, db, devOrigins = [] } = opts;

  const repo = new DrizzleProductConfigRepository(db);
  const service = new ProductConfigService(repo);

  let config = await service.getBySlug(slug);
  let seeded = false;

  if (!config) {
    const preset = PRODUCT_PRESETS[slug];
    if (!preset) {
      throw new Error(
        `Product "${slug}" not found in database and no built-in preset exists. Known presets: ${Object.keys(PRODUCT_PRESETS).join(", ")}`,
      );
    }

    // Auto-seed from preset
    const { navItems, fleet, ...productData } = preset;
    const product = await repo.upsertProduct(slug, productData);
    await repo.replaceNavItems(
      product.id,
      navItems.map((item) => ({
        label: item.label,
        href: item.href,
        sortOrder: item.sortOrder,
        requiresRole: item.requiresRole,
        enabled: true,
      })),
    );
    await repo.upsertFleetConfig(product.id, fleet);
    await repo.upsertFeatures(product.id, {});

    // Re-fetch to get the complete config
    config = await service.getBySlug(slug);
    if (!config) {
      throw new Error(`Failed to seed product "${slug}" — database write succeeded but read returned null`);
    }
    seeded = true;
  }

  const corsOrigins = [...deriveCorsOrigins(config.product, config.domains), ...devOrigins];

  return { service, config, corsOrigins, seeded };
}
