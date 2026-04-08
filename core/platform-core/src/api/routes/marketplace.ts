// core/platform-core/src/api/routes/marketplace.ts
//
// Public marketplace REST routes (plugin listings, search, content, install).
// Products mount these via the factory function.

import { Hono } from "hono";
import { z } from "zod";
import type { AuditEnv } from "../../audit/types.js";
import { logger } from "../../config/logger.js";
import { Credit } from "../../credits/credit.js";
import { lookupCapabilityEnv } from "../../fleet/capability-env-map.js";
import { DrizzleBotProfileStore } from "../../fleet/drizzle-profile-store.js";
import { BotNotFoundError } from "../../fleet/errors.js";
import type { IProfileStore } from "../../fleet/profile-store.js";
import { getDb } from "../../fleet/services.js";
import type { IMarketplacePluginRepository } from "../../marketplace/marketplace-plugin-repository.js";
import type { MarketplacePluginManifest } from "../../marketplace/marketplace-repository-types.js";
import type { MeterEvent } from "../../metering/index.js";
import type { DecryptedCredential } from "../../security/index.js";
import type { PluginCategory, PluginManifest } from "./marketplace-registry.js";

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

export interface MarketplaceContentRepo {
  getByPluginId(pluginId: string): Promise<{ markdown: string; source: string; version: string } | null>;
}

export interface MarketplaceDeps {
  /** Factory for the marketplace plugin repository. */
  pluginRepoFactory: () => IMarketplacePluginRepository;
  /** Factory for the marketplace content repo (SUPERPOWER.md cache). */
  contentRepoFactory?: () => MarketplaceContentRepo;
  /** Credential vault for hosted provider resolution. */
  credentialVault?: {
    getActiveForProvider(provider: string): Promise<Array<Pick<DecryptedCredential, "plaintextKey">>>;
  };
  /** Meter emitter for billing audit trail. */
  meterEmitter?: { emit(event: MeterEvent): void };
  /** Fleet manager for applying env updates to containers. */
  fleetManager?: {
    update(botId: string, patch: { env: Record<string, string> }): Promise<void>;
  };
}

const PAGINATION_DEFAULT_LIMIT = 50;
const PAGINATION_MAX_LIMIT = 250;

function dbPluginToManifest(
  pluginId: string,
  npmPackage: string,
  version: string,
  category: string | null,
  manifest: MarketplacePluginManifest | null,
): PluginManifest {
  if (manifest) {
    return {
      ...manifest,
      tags: manifest.tags ?? [],
      id: pluginId,
      version,
      category: (category ?? manifest.tags?.[0] ?? "integration") as PluginCategory,
    };
  }
  return {
    id: pluginId,
    name: npmPackage.replace(/^@wopr-network\/wopr-plugin-/, ""),
    description: "",
    version,
    author: "Community",
    icon: "Package",
    color: "#6B7280",
    category: (category ?? "integration") as PluginCategory,
    tags: category ? [category] : [],
    capabilities: [],
    requires: [],
    install: [],
    configSchema: [],
    setup: [],
    installCount: 0,
    changelog: [],
  } satisfies PluginManifest;
}

const installSchema = z.object({
  botId: z.string().uuid("botId must be a valid UUID"),
  config: z.record(z.string(), z.unknown()).default({}),
  providerChoices: z.record(z.string(), z.enum(["byok", "hosted"])).default({}),
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMarketplaceRoutes(deps: MarketplaceDeps): Hono<AuditEnv> {
  const routes = new Hono<AuditEnv>();
  const store: IProfileStore = new DrizzleBotProfileStore(getDb());

  const repo = (): IMarketplacePluginRepository => deps.pluginRepoFactory();

  /**
   * GET /plugins
   *
   * List available plugins with cursor-based pagination.
   */
  routes.get("/plugins", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const rawLimit = c.req.query("limit");
    const parsedLimit = rawLimit !== undefined ? Number.parseInt(rawLimit, 10) : PAGINATION_DEFAULT_LIMIT;
    const limit =
      Number.isNaN(parsedLimit) || parsedLimit < 1
        ? PAGINATION_DEFAULT_LIMIT
        : Math.min(parsedLimit, PAGINATION_MAX_LIMIT);

    const cursor = c.req.query("cursor");

    let plugins: PluginManifest[];
    try {
      const dbPlugins = await repo().findEnabled();
      plugins = dbPlugins.map((dbp) =>
        dbPluginToManifest(dbp.pluginId, dbp.npmPackage, dbp.version, dbp.category, dbp.manifest),
      );
    } catch (err) {
      logger.error("Marketplace plugin repo unavailable", { err });
      return c.json({ error: "Service unavailable" }, 503);
    }

    const category = c.req.query("category");
    if (category) {
      plugins = plugins.filter((p) => p.category === category);
    }

    const search = c.req.query("search")?.toLowerCase();
    if (search) {
      plugins = plugins.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.description.toLowerCase().includes(search) ||
          p.tags.some((t) => t.includes(search)),
      );
    }

    let startIndex = 0;
    if (cursor) {
      const cursorIndex = plugins.findIndex((p) => p.id === cursor);
      if (cursorIndex === -1) {
        return c.json({ error: "Invalid or expired cursor" }, 400);
      }
      startIndex = cursorIndex + 1;
    }

    const page = plugins.slice(startIndex, startIndex + limit);
    const hasNextPage = startIndex + limit < plugins.length;
    const nextCursor = hasNextPage ? (page[page.length - 1]?.id ?? null) : null;

    return c.json({ plugins: page, nextCursor, hasNextPage });
  });

  /**
   * GET /plugins/:id
   */
  routes.get("/plugins/:id", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const id = c.req.param("id");

    try {
      const dbPlugin = await repo().findById(id);
      if (dbPlugin) {
        return c.json(
          dbPluginToManifest(
            dbPlugin.pluginId,
            dbPlugin.npmPackage,
            dbPlugin.version,
            dbPlugin.category,
            dbPlugin.manifest,
          ),
        );
      }
    } catch (err) {
      logger.error("Marketplace plugin repo unavailable", { err });
      return c.json({ error: "Service unavailable" }, 503);
    }

    return c.json({ error: "Plugin not found" }, 404);
  });

  /**
   * GET /plugins/:id/content
   */
  routes.get("/plugins/:id/content", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const id = c.req.param("id");

    let plugin: PluginManifest | undefined;
    try {
      const dbPlugin = await repo().findById(id);
      if (dbPlugin) {
        plugin = dbPluginToManifest(
          dbPlugin.pluginId,
          dbPlugin.npmPackage,
          dbPlugin.version,
          dbPlugin.category,
          dbPlugin.manifest,
        );
      }
    } catch (err) {
      logger.error("Marketplace plugin repo unavailable", { err });
      return c.json({ error: "Service unavailable" }, 503);
    }

    if (!plugin) return c.json({ error: "Plugin not found" }, 404);

    if (deps.contentRepoFactory) {
      try {
        const contentRepo = deps.contentRepoFactory();
        const cached = await contentRepo.getByPluginId(id);
        if (cached) {
          return c.json({ markdown: cached.markdown, source: cached.source, version: cached.version });
        }
      } catch (err) {
        logger.error("Marketplace content repo unavailable", { err });
        return c.json({ error: "Service unavailable" }, 503);
      }
    }

    return c.json({
      markdown: plugin.description,
      source: "manifest_description" as const,
      version: plugin.version,
    });
  });

  /**
   * POST /plugins/:id/install
   */
  routes.post("/plugins/:id/install", async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Unauthorized" }, 401);

    const id = c.req.param("id");

    let installedVersion = "unknown";
    try {
      const dbPlugin = await repo().findById(id);
      if (!dbPlugin) return c.json({ error: "Plugin not found" }, 404);
      installedVersion = dbPlugin.version;
    } catch (err) {
      logger.error("Marketplace plugin repo unavailable during install", { err });
      return c.json({ error: "Service unavailable" }, 503);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body or botId is required" }, 400);
    }

    const parsed = installSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation failed: botId must be a valid UUID", details: parsed.error.flatten() }, 400);
    }

    const { botId } = parsed.data;

    const profile = await store.get(botId);
    if (!profile) {
      return c.json({ error: `Bot not found: ${botId}` }, 404);
    }

    if (profile.tenantId !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const freshProfile = await store.get(botId);
    if (!freshProfile) {
      return c.json({ error: `Bot not found: ${botId}` }, 404);
    }

    if (freshProfile.tenantId !== user.id) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const existingPlugins = (freshProfile.env.WOPR_PLUGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (existingPlugins.includes(id)) {
      return c.json({ error: "Plugin already installed", pluginId: id }, 409);
    }

    const updatedPlugins = [...existingPlugins, id].join(",");

    const hostedEnvVars: Record<string, string> = {};
    const hostedKeyNames: string[] = [];

    for (const [capability, choice] of Object.entries(parsed.data.providerChoices)) {
      if (choice !== "hosted") continue;

      const capEntry = lookupCapabilityEnv(capability);
      if (!capEntry) {
        return c.json({ error: `Unknown capability: ${capability}` }, 400);
      }

      if (!deps.credentialVault) {
        return c.json({ error: "Credential vault not configured" }, 503);
      }

      const creds = await deps.credentialVault.getActiveForProvider(capEntry.vaultProvider);
      if (creds.length === 0) {
        return c.json({ error: `No platform credential available for hosted capability: ${capability}` }, 503);
      }

      hostedEnvVars[capEntry.envKey] = creds[0].plaintextKey;
      hostedKeyNames.push(capEntry.envKey);
    }

    const existingHostedKeys = (freshProfile.env.WOPR_HOSTED_KEYS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const allHostedKeys = [...new Set([...existingHostedKeys, ...hostedKeyNames])];

    const configEnvKey = `WOPR_PLUGIN_${id.toUpperCase().replace(/-/g, "_")}_CONFIG`;
    const updatedEnv: Record<string, string> = {
      ...freshProfile.env,
      WOPR_PLUGINS: updatedPlugins,
      [configEnvKey]: JSON.stringify({ config: parsed.data.config, providerChoices: parsed.data.providerChoices }),
      ...hostedEnvVars,
    };

    if (allHostedKeys.length > 0) {
      updatedEnv.WOPR_HOSTED_KEYS = allHostedKeys.join(",");
    }

    if (deps.fleetManager) {
      try {
        await deps.fleetManager.update(botId, { env: updatedEnv });
      } catch (err) {
        if (err instanceof BotNotFoundError) {
          return c.json({ error: `Bot not found: ${botId}` }, 404);
        }
        logger.error(`Failed to apply plugin install to container for bot ${botId}`, { err });
        return c.json({ error: "Failed to apply plugin change to running container" }, 500);
      }
    }

    if (deps.meterEmitter && hostedKeyNames.length > 0) {
      for (const [capability, choice] of Object.entries(parsed.data.providerChoices)) {
        if (choice !== "hosted") continue;
        const capEntry = lookupCapabilityEnv(capability);
        if (!capEntry) continue;
        deps.meterEmitter.emit({
          tenant: freshProfile.tenantId,
          cost: Credit.ZERO,
          charge: Credit.ZERO,
          capability: "hosted-activation",
          provider: capEntry.vaultProvider,
          timestamp: Date.now(),
        });
      }
    }

    logger.info(`Installed plugin ${id} on bot ${botId} via marketplace`, {
      botId,
      pluginId: id,
      tenantId: freshProfile.tenantId,
    });

    return c.json({
      success: true,
      botId,
      pluginId: id,
      installedPlugins: [...existingPlugins, id],
      installedVersion,
    });
  });

  return routes;
}
