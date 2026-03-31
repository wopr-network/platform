/**
 * Drizzle logic for seeding the marketplace_plugins table.
 * Called by product seed scripts.
 */

import type { Pool } from "pg";
import { logger } from "../config/logger.js";
import { createDb, eq } from "../db/index.js";
import { marketplacePlugins } from "../db/schema/marketplace-plugins.js";
import { FIRST_PARTY_PLUGINS } from "./first-party-plugins.js";

export async function seedMarketplacePlugins(pool: Pool): Promise<void> {
  const db = createDb(pool);
  const now = Date.now();

  logger.info(`Seeding ${FIRST_PARTY_PLUGINS.length} first-party plugins...`);

  for (const plugin of FIRST_PARTY_PLUGINS) {
    const {
      id,
      version,
      category,
      name,
      description,
      author,
      icon,
      color,
      tags,
      capabilities,
      requires,
      install,
      configSchema,
      setup,
      installCount,
      changelog,
    } = plugin;

    const manifest = {
      name,
      description,
      author,
      icon,
      color,
      tags,
      capabilities,
      requires,
      install,
      configSchema,
      setup,
      installCount,
      changelog,
    };

    const existing = await db.select().from(marketplacePlugins).where(eq(marketplacePlugins.pluginId, id));

    if (existing.length === 0) {
      await db.insert(marketplacePlugins).values({
        pluginId: id,
        npmPackage: install[0] ?? `@wopr-network/wopr-plugin-${id}`,
        version,
        category,
        notes: description,
        manifest,
        enabled: true,
        enabledAt: now,
        enabledBy: "seed",
        discoveredAt: now,
        sortOrder: FIRST_PARTY_PLUGINS.indexOf(plugin),
      });
      logger.info(`  inserted: ${id}`);
    } else {
      const npmPackage = install[0] ?? `@wopr-network/wopr-plugin-${id}`;
      await db
        .update(marketplacePlugins)
        .set({ manifest, version, category, npmPackage })
        .where(eq(marketplacePlugins.pluginId, id));
      logger.info(`  updated: ${id}`);
    }
  }

  logger.info("Done.");
}
