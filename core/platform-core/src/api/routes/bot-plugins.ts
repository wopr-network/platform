// core/platform-core/src/api/routes/bot-plugins.ts
//
// Bot plugin CRUD routes: install, uninstall, toggle, channels.
// Products mount these via the factory function.

import type { Context } from "hono";
import { Hono } from "hono";
import { z } from "zod";
import { buildTokenMetadataMap, scopedBearerAuthWithTenant, validateTenantOwnership } from "../../auth/index.js";
import { logger } from "../../config/logger.js";
import { Credit } from "../../credits/credit.js";
import type { IBotInstanceRepository } from "../../fleet/bot-instance-repository.js";
import { detectCapabilityConflicts } from "../../fleet/capability-conflict.js";
import { lookupCapabilityEnv } from "../../fleet/capability-env-map.js";
import { dispatchEnvUpdate } from "../../fleet/dispatch-env-update.js";
import { BotNotFoundError } from "../../fleet/fleet-manager.js";
import { DrizzleBotProfileStore } from "../../fleet/drizzle-profile-store.js";
import type { IProfileStore } from "../../fleet/profile-store.js";
import { getDb } from "../../fleet/services.js";
import type { IMarketplacePluginRepository } from "../../marketplace/marketplace-plugin-repository.js";
import type { MeterEvent } from "../../metering/index.js";
import type { DecryptedCredential } from "../../security/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BotPluginDeps {
  credentialVault?: {
    getActiveForProvider(provider: string): Promise<Array<Pick<DecryptedCredential, "plaintextKey">>>;
  };
  meterEmitter?: { emit(event: MeterEvent): void };
  botInstanceRepo?: IBotInstanceRepository;
  pluginRepoFactory: () => IMarketplacePluginRepository;
  fleetManager: {
    update(botId: string, patch: { env: Record<string, string> }): Promise<void>;
  };
}

const UUID_RE = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

const installPluginSchema = z.object({
  config: z.record(z.string(), z.unknown()).default({}),
  providerChoices: z.record(z.string(), z.enum(["byok", "hosted"])).default({}),
  primaryProviderOverrides: z.record(z.string(), z.string()).optional(),
});

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBotPluginRoutes(deps: BotPluginDeps): Hono {
  const routes = new Hono();
  const store: IProfileStore = new DrizzleBotProfileStore(getDb());

  const tokenMetadataMap = buildTokenMetadataMap();
  const readAuth = scopedBearerAuthWithTenant(tokenMetadataMap, "read");
  const writeAuth = scopedBearerAuthWithTenant(tokenMetadataMap, "write");

  // UUID validation middleware for :botId param
  routes.use("/bots/:botId/*", async (c, next) => {
    const botId = c.req.param("botId") as string;
    if (!UUID_RE.test(botId)) {
      return c.json({ error: "Invalid bot ID" }, 400);
    }
    return next();
  });

  /** Helper: check if a pluginId is a channel-category plugin (DB-backed). */
  async function isChannelPlugin(pluginId: string): Promise<boolean> {
    const pluginRepo = deps.pluginRepoFactory();
    const entry = await pluginRepo.findById(pluginId);
    return entry?.category === "channel";
  }

  // ---------------------------------------------------------------------------
  // Shared install logic (used by both plugin install and channel connect)
  // ---------------------------------------------------------------------------
  async function handlePluginInstall(c: Context, botId: string, pluginId: string): Promise<Response> {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/.test(pluginId)) {
      return c.json({ error: "Invalid plugin ID format" }, 400);
    }

    const profile = await store.get(botId);
    if (!profile) {
      return c.json({ error: `Bot not found: ${botId}` }, 404);
    }

    const ownershipError = validateTenantOwnership(c, profile, profile.tenantId);
    if (ownershipError) {
      return ownershipError;
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = installPluginSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
    }

    // Re-fetch profile immediately before write to avoid clobbering concurrent installs
    const freshProfile = await store.get(botId);
    if (!freshProfile) {
      return c.json({ error: `Bot not found: ${botId}` }, 404);
    }

    const freshOwnershipError = validateTenantOwnership(c, freshProfile, freshProfile.tenantId);
    if (freshOwnershipError) {
      return freshOwnershipError;
    }

    const existingPlugins = (freshProfile.env.WOPR_PLUGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (existingPlugins.includes(pluginId)) {
      return c.json({ error: "Plugin already installed", pluginId }, 409);
    }

    // --- Detect capability conflicts ---
    let allPlugins: { id: string; capabilities: string[] }[] = [];
    try {
      const pluginRepo = deps.pluginRepoFactory();
      const dbPlugins = await pluginRepo.findAll();
      allPlugins = dbPlugins.map((p) => ({ id: p.pluginId, capabilities: p.manifest?.capabilities ?? [] }));
    } catch {
      // If repo unavailable, skip conflict detection (non-fatal)
    }
    const conflicts = detectCapabilityConflicts(pluginId, existingPlugins, allPlugins);
    if (conflicts.length > 0 && !parsed.data.primaryProviderOverrides) {
      return c.json(
        {
          error: "Capability conflict",
          conflicts,
          message:
            "Another installed plugin already provides one or more of the same capabilities. Provide primaryProviderOverrides to choose which plugin is primary for each conflicting capability.",
        },
        409,
      );
    }

    // --- Collect primary provider choices ---
    const existingProviders: Record<string, string> = {};
    const existingProvidersRaw = freshProfile.env.WOPR_CAPABILITY_PROVIDERS;
    if (existingProvidersRaw) {
      try {
        Object.assign(existingProviders, JSON.parse(existingProvidersRaw));
      } catch {
        // Malformed — start fresh
      }
    }
    if (parsed.data.primaryProviderOverrides) {
      for (const [cap, pid] of Object.entries(parsed.data.primaryProviderOverrides)) {
        existingProviders[cap] = pid;
      }
    }

    const updatedPlugins = [...existingPlugins, pluginId].join(",");

    // --- Resolve hosted provider choices BEFORE writing to profile ---
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

    const configEnvKey = `WOPR_PLUGIN_${pluginId.toUpperCase().replace(/-/g, "_")}_CONFIG`;
    const updatedEnv: Record<string, string> = {
      ...freshProfile.env,
      WOPR_PLUGINS: updatedPlugins,
      [configEnvKey]: JSON.stringify({ config: parsed.data.config, providerChoices: parsed.data.providerChoices }),
      ...hostedEnvVars,
    };

    if (allHostedKeys.length > 0) {
      updatedEnv.WOPR_HOSTED_KEYS = allHostedKeys.join(",");
    }

    if (Object.keys(existingProviders).length > 0) {
      updatedEnv.WOPR_CAPABILITY_PROVIDERS = JSON.stringify(existingProviders);
    }

    // Save profile with updated env (DB is source of truth)
    const updated = { ...freshProfile, env: updatedEnv };
    await store.save(updated);

    // Dispatch env update to running container (best-effort, non-fatal)
    let dispatch: { dispatched: boolean; dispatchError?: string } = {
      dispatched: false,
      dispatchError: "bot_instance_repo_not_configured",
    };
    if (deps.botInstanceRepo) {
      dispatch = await dispatchEnvUpdate(botId, freshProfile.tenantId, updatedEnv, deps.botInstanceRepo);
    }

    // Emit activation meter events for billing audit trail
    if (deps.meterEmitter && hostedKeyNames.length > 0) {
      for (const [capability, choice] of Object.entries(parsed.data.providerChoices)) {
        if (choice !== "hosted") continue;
        const capEntry = lookupCapabilityEnv(capability);
        if (!capEntry) continue;
        deps.meterEmitter.emit({
          tenant: profile.tenantId,
          cost: Credit.ZERO,
          charge: Credit.ZERO,
          capability: "hosted-activation",
          provider: capEntry.vaultProvider,
          timestamp: Date.now(),
        });
      }
    }

    logger.info(`Installed plugin ${pluginId} on bot ${botId}`, {
      botId,
      pluginId,
      tenantId: profile.tenantId,
      dispatched: dispatch.dispatched,
    });

    return c.json(
      {
        success: true,
        botId,
        pluginId,
        installedPlugins: [...existingPlugins, pluginId],
        dispatched: dispatch.dispatched,
        ...(dispatch.dispatchError ? { dispatchError: dispatch.dispatchError } : {}),
      },
      200,
    );
  }

  // ---------------------------------------------------------------------------
  // Shared uninstall logic (used by both plugin delete and channel disconnect)
  // ---------------------------------------------------------------------------
  async function handlePluginUninstall(c: Context, botId: string, pluginId: string): Promise<Response> {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/.test(pluginId)) {
      return c.json({ error: "Invalid plugin ID format" }, 400);
    }

    const profile = await store.get(botId);
    if (!profile) {
      return c.json({ error: `Bot not found: ${botId}` }, 404);
    }

    const ownershipError = validateTenantOwnership(c, profile, profile.tenantId);
    if (ownershipError) {
      return ownershipError;
    }

    const installedPlugins = (profile.env.WOPR_PLUGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!installedPlugins.includes(pluginId)) {
      return c.json({ error: "Plugin not installed", pluginId }, 404);
    }

    const remainingPlugins = installedPlugins.filter((id) => id !== pluginId);

    const configEnvKey = `WOPR_PLUGIN_${pluginId.toUpperCase().replace(/-/g, "_")}_CONFIG`;
    const pluginConfigRaw = profile.env[configEnvKey];
    const deletedPluginHostedKeyNames: string[] = [];
    if (pluginConfigRaw) {
      try {
        const pluginConfigData = JSON.parse(pluginConfigRaw) as { providerChoices?: Record<string, string> };
        if (pluginConfigData.providerChoices) {
          for (const [capability, choice] of Object.entries(pluginConfigData.providerChoices)) {
            if (choice === "hosted") {
              const capEntry = lookupCapabilityEnv(capability);
              if (capEntry) {
                deletedPluginHostedKeyNames.push(capEntry.envKey);
              }
            }
          }
        }
      } catch {
        // Malformed config — can't determine which keys to remove; leave them
      }
    }

    const { [configEnvKey]: _removedConfig, ...envWithoutConfig } = profile.env;

    const currentHostedKeys = (envWithoutConfig.WOPR_HOSTED_KEYS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const deletedKeySet = new Set(deletedPluginHostedKeyNames);
    const remainingHostedKeys = currentHostedKeys.filter((k) => !deletedKeySet.has(k));

    const updatedEnv: Record<string, string> = { ...envWithoutConfig };

    for (const key of deletedPluginHostedKeyNames) {
      delete updatedEnv[key];
    }

    if (remainingHostedKeys.length > 0) {
      updatedEnv.WOPR_HOSTED_KEYS = remainingHostedKeys.join(",");
    } else {
      delete updatedEnv.WOPR_HOSTED_KEYS;
    }

    if (remainingPlugins.length === 0) {
      delete updatedEnv.WOPR_PLUGINS;
    } else {
      updatedEnv.WOPR_PLUGINS = remainingPlugins.join(",");
    }

    const disabledPlugins = (updatedEnv.WOPR_PLUGINS_DISABLED || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((id) => id !== pluginId);

    if (disabledPlugins.length > 0) {
      updatedEnv.WOPR_PLUGINS_DISABLED = disabledPlugins.join(",");
    } else {
      delete updatedEnv.WOPR_PLUGINS_DISABLED;
    }

    const providersRaw = updatedEnv.WOPR_CAPABILITY_PROVIDERS;
    if (providersRaw) {
      try {
        const providers = JSON.parse(providersRaw) as Record<string, string>;
        for (const [cap, pid] of Object.entries(providers)) {
          if (pid === pluginId) {
            delete providers[cap];
          }
        }
        if (Object.keys(providers).length > 0) {
          updatedEnv.WOPR_CAPABILITY_PROVIDERS = JSON.stringify(providers);
        } else {
          delete updatedEnv.WOPR_CAPABILITY_PROVIDERS;
        }
      } catch {
        delete updatedEnv.WOPR_CAPABILITY_PROVIDERS;
      }
    }

    let applied = false;
    try {
      await deps.fleetManager.update(botId, { env: updatedEnv });
      applied = true;
    } catch (err) {
      if (err instanceof BotNotFoundError) {
        return c.json({ error: `Bot not found: ${botId}` }, 404);
      }
      logger.error(`Failed to apply plugin uninstall to container for bot ${botId}`, { err });
      return c.json({ error: "Failed to apply plugin change to running container" }, 500);
    }

    logger.info(`Uninstalled plugin ${pluginId} from bot ${botId}`, {
      botId,
      pluginId,
      tenantId: profile.tenantId,
    });

    return c.json({
      success: true,
      botId,
      pluginId,
      installedPlugins: remainingPlugins,
      applied,
    });
  }

  // ---------------------------------------------------------------------------
  // Plugin routes
  // ---------------------------------------------------------------------------

  /** POST /bots/:botId/plugins/:pluginId — Install a plugin on a bot */
  routes.post("/bots/:botId/plugins/:pluginId", writeAuth, async (c) => {
    const botId = c.req.param("botId") as string;
    const pluginId = c.req.param("pluginId") as string;
    return handlePluginInstall(c, botId, pluginId);
  });

  /** GET /bots/:botId/plugins — List installed plugins on a bot */
  routes.get("/bots/:botId/plugins", readAuth, async (c) => {
    const botId = c.req.param("botId") as string;

    const profile = await store.get(botId);
    if (!profile) {
      return c.json({ error: `Bot not found: ${botId}` }, 404);
    }

    const ownershipError = validateTenantOwnership(c, profile, profile.tenantId);
    if (ownershipError) {
      return ownershipError;
    }

    const pluginIds = (profile.env.WOPR_PLUGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const disabledSet = new Set(
      (profile.env.WOPR_PLUGINS_DISABLED || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );

    const plugins = pluginIds.map((id) => ({
      pluginId: id,
      enabled: !disabledSet.has(id),
    }));

    return c.json({ botId, plugins });
  });

  /** Shared toggle handler for PATCH and PUT /bots/:botId/plugins/:pluginId */
  async function togglePluginHandler(c: Context): Promise<Response> {
    const botId = c.req.param("botId") as string;
    const pluginId = c.req.param("pluginId") as string;

    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/.test(pluginId)) {
      return c.json({ error: "Invalid plugin ID format" }, 400);
    }

    const profile = await store.get(botId);
    if (!profile) {
      return c.json({ error: `Bot not found: ${botId}` }, 404);
    }

    const ownershipError = validateTenantOwnership(c, profile, profile.tenantId);
    if (ownershipError) {
      return ownershipError;
    }

    const installedPlugins = (profile.env.WOPR_PLUGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (!installedPlugins.includes(pluginId)) {
      return c.json({ error: "Plugin not installed", pluginId }, 404);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = z.object({ enabled: z.boolean() }).safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
    }

    const disabledPlugins = (profile.env.WOPR_PLUGINS_DISABLED || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    let updatedDisabled: string[];
    if (parsed.data.enabled) {
      updatedDisabled = disabledPlugins.filter((id) => id !== pluginId);
    } else {
      updatedDisabled = disabledPlugins.includes(pluginId) ? disabledPlugins : [...disabledPlugins, pluginId];
    }

    const { WOPR_PLUGINS_DISABLED: _removed, ...envWithoutDisabled } = profile.env;
    const updatedEnv = updatedDisabled.length
      ? { ...envWithoutDisabled, WOPR_PLUGINS_DISABLED: updatedDisabled.join(",") }
      : envWithoutDisabled;

    const updated = { ...profile, env: updatedEnv };
    await store.save(updated);

    // Dispatch env update to the correct node
    if (!deps.botInstanceRepo) {
      return c.json({ error: "Bot instance repository not configured" }, 503);
    }
    const dispatch = await dispatchEnvUpdate(botId, profile.tenantId, updatedEnv, deps.botInstanceRepo);

    logger.info(`Toggled plugin ${pluginId} on bot ${botId}: enabled=${parsed.data.enabled}`, {
      botId,
      pluginId,
      enabled: parsed.data.enabled,
      tenantId: profile.tenantId,
      dispatched: dispatch.dispatched,
    });

    return c.json({
      success: true,
      botId,
      pluginId,
      enabled: parsed.data.enabled,
      dispatched: dispatch.dispatched,
      ...(dispatch.dispatchError ? { dispatchError: dispatch.dispatchError } : {}),
    });
  }

  routes.patch("/bots/:botId/plugins/:pluginId", writeAuth, togglePluginHandler);
  routes.put("/bots/:botId/plugins/:pluginId", writeAuth, togglePluginHandler);

  /** DELETE /bots/:botId/plugins/:pluginId — Uninstall a plugin from a bot */
  routes.delete("/bots/:botId/plugins/:pluginId", writeAuth, async (c) => {
    const botId = c.req.param("botId") as string;
    const pluginId = c.req.param("pluginId") as string;
    return handlePluginUninstall(c, botId, pluginId);
  });

  // ---------------------------------------------------------------------------
  // Channel management routes — filtered view of plugins with category "channel"
  // ---------------------------------------------------------------------------

  /** GET /bots/:botId/channels — List connected channels (channel-category plugins) */
  routes.get("/bots/:botId/channels", readAuth, async (c) => {
    const botId = c.req.param("botId") as string;

    const profile = await store.get(botId);
    if (!profile) {
      return c.json({ error: `Bot not found: ${botId}` }, 404);
    }

    const ownershipError = validateTenantOwnership(c, profile, profile.tenantId);
    if (ownershipError) {
      return ownershipError;
    }

    const pluginIds = (profile.env.WOPR_PLUGINS || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const disabledSet = new Set(
      (profile.env.WOPR_PLUGINS_DISABLED || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );

    const channelChecks = await Promise.all(pluginIds.map((id) => isChannelPlugin(id)));
    const channels = pluginIds
      .filter((_, i) => channelChecks[i])
      .map((id) => ({
        pluginId: id,
        enabled: !disabledSet.has(id),
      }));

    return c.json({ botId, channels });
  });

  /** POST /bots/:botId/channels/:pluginId — Connect a channel (install channel plugin) */
  routes.post("/bots/:botId/channels/:pluginId", writeAuth, async (c) => {
    const pluginId = c.req.param("pluginId") as string;
    const botId = c.req.param("botId") as string;

    if (!(await isChannelPlugin(pluginId))) {
      return c.json({ error: `Plugin "${pluginId}" is not a channel plugin` }, 400);
    }

    return handlePluginInstall(c, botId, pluginId);
  });

  /** DELETE /bots/:botId/channels/:pluginId — Disconnect a channel (uninstall channel plugin) */
  routes.delete("/bots/:botId/channels/:pluginId", writeAuth, async (c) => {
    const botId = c.req.param("botId") as string;
    const pluginId = c.req.param("pluginId") as string;

    if (!(await isChannelPlugin(pluginId))) {
      return c.json({ error: `Plugin "${pluginId}" is not a channel plugin` }, 400);
    }

    return handlePluginUninstall(c, botId, pluginId);
  });

  return routes;
}
