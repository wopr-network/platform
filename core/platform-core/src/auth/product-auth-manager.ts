/**
 * ProductAuthManager — per-product OAuth provider configuration.
 *
 * Client IDs come from DB (product_auth_config table).
 * Client secrets come from Vault (resolved at boot, keyed by provider).
 * Adding a new product row + auth config row = zero downtime.
 */

import { eq } from "drizzle-orm";
import { logger } from "../config/logger.js";
import type { PlatformDb } from "../db/index.js";
import { productAuthConfig } from "../db/schema/product-auth-config.js";
import type { ProductConfigService } from "../product-config/service.js";

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
}

export interface ProductAuthEntry {
  slug: string;
  providers: Record<string, OAuthProviderConfig>;
  enabledProviders: string[];
}

interface CachedEntry {
  entry: ProductAuthEntry;
  cachedAt: number;
}

const CACHE_TTL_MS = 60_000;

export class ProductAuthManager {
  private cache = new Map<string, CachedEntry>();

  constructor(
    private readonly db: PlatformDb,
    private readonly productConfigService: ProductConfigService,
    /** Provider secrets from Vault, keyed by provider name. */
    private readonly providerSecrets: Record<string, string>,
  ) {}

  /**
   * Get OAuth providers configured for a product.
   * Client IDs from DB, secrets from Vault.
   */
  async getProvidersForProduct(slug: string): Promise<ProductAuthEntry> {
    const cached = this.cache.get(slug);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.entry;
    }

    const pc = await this.productConfigService.getBySlug(slug);
    if (!pc?.product?.id) {
      return { slug, providers: {}, enabledProviders: [] };
    }

    const rows = await this.db
      .select()
      .from(productAuthConfig)
      .where(eq(productAuthConfig.productId, String(pc.product.id)));

    const providers: Record<string, OAuthProviderConfig> = {};
    const enabledProviders: string[] = [];

    for (const row of rows) {
      if (!row.enabled) continue;
      const secret = this.providerSecrets[row.provider];
      if (!secret) {
        logger.warn(`OAuth provider ${row.provider} for ${slug}: client_id in DB but no secret in Vault — skipping`);
        continue;
      }
      providers[row.provider] = { clientId: row.clientId, clientSecret: secret };
      enabledProviders.push(row.provider);
    }

    const entry: ProductAuthEntry = { slug, providers, enabledProviders };
    this.cache.set(slug, { entry, cachedAt: Date.now() });
    return entry;
  }

  /** Get enabled provider names for a product (for UI). */
  async getEnabledProviders(slug: string): Promise<string[]> {
    const entry = await this.getProvidersForProduct(slug);
    return entry.enabledProviders;
  }

  /** Get BetterAuth socialProviders config for a product. */
  async getSocialProviders(slug: string): Promise<Record<string, OAuthProviderConfig>> {
    const entry = await this.getProvidersForProduct(slug);
    return entry.providers;
  }

  /** Invalidate cache for a product. */
  invalidate(slug: string): void {
    this.cache.delete(slug);
  }

  /**
   * Seed auth config from Vault secrets.
   * Called during platformBoot — writes client IDs to DB if not already present.
   */
  async seedFromVault(productId: string, slug: string, vaultData: Record<string, string>): Promise<void> {
    const pairs: Array<{ provider: string; clientId: string }> = [];

    if (vaultData.github_client_id) {
      pairs.push({ provider: "github", clientId: vaultData.github_client_id });
    }
    if (vaultData.google_client_id) {
      pairs.push({ provider: "google", clientId: vaultData.google_client_id });
    }

    for (const { provider, clientId } of pairs) {
      await this.db
        .insert(productAuthConfig)
        .values({ productId, provider, clientId, enabled: true })
        .onConflictDoNothing();
    }

    if (pairs.length > 0) {
      logger.info(`Seeded auth config for ${slug}`, {
        providers: pairs.map((p) => p.provider),
      });
      this.invalidate(slug);
    }
  }
}
