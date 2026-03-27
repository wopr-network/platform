import { Hono } from "hono";
import { z } from "zod";
import type { AuthEnv } from "../../auth/index.js";
import type { IMarketplacePluginRepository } from "../../marketplace/marketplace-plugin-repository.js";
import type { AdminAuditLogger } from "./admin-audit-helper.js";
import { safeAuditLog } from "./admin-audit-helper.js";

const addPluginSchema = z.object({
  npmPackage: z.string().min(1),
  version: z.string().min(1),
  category: z.string().optional(),
  notes: z.string().optional(),
});

const updatePluginSchema = z.object({
  enabled: z.boolean().optional(),
  featured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  category: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

/** Optional volume installer interface for fire-and-forget plugin installation. */
export interface PluginVolumeInstaller {
  installPluginToVolume(opts: {
    pluginId: string;
    npmPackage: string;
    version: string;
    volumePath: string;
    repo: IMarketplacePluginRepository;
  }): Promise<void>;
}

/** Optional npm discovery interface. */
export interface NpmPluginDiscoverer {
  discoverNpmPlugins(opts: {
    repo: IMarketplacePluginRepository;
    notify: (msg: string) => void;
  }): Promise<{ discovered: number; skipped: number }>;
}

export interface AdminMarketplaceDeps {
  repoFactory: () => IMarketplacePluginRepository;
  auditLogger?: () => AdminAuditLogger;
  volumeInstaller?: () => PluginVolumeInstaller;
  pluginVolumePath?: string;
  discoverer?: () => NpmPluginDiscoverer;
  logger?: { info(msg: string): void; error(msg: string, meta?: Record<string, unknown>): void };
}

export function createAdminMarketplaceRoutes(
  repoFactoryOrDeps: (() => IMarketplacePluginRepository) | AdminMarketplaceDeps,
  auditLogger?: () => AdminAuditLogger,
): Hono<AuthEnv> {
  const deps: AdminMarketplaceDeps =
    typeof repoFactoryOrDeps === "function" ? { repoFactory: repoFactoryOrDeps, auditLogger } : repoFactoryOrDeps;

  const routes = new Hono<AuthEnv>();

  let _repo: IMarketplacePluginRepository | null = null;
  const repo = (): IMarketplacePluginRepository => {
    if (!_repo) _repo = deps.repoFactory();
    return _repo;
  };

  // GET /plugins — list all marketplace plugins
  routes.get("/plugins", async (c) => {
    return c.json(await repo().findAll());
  });

  // GET /queue — list plugins pending review (enabled = false)
  routes.get("/queue", async (c) => {
    return c.json(await repo().findPendingReview());
  });

  // POST /plugins — manually add a plugin by npm package name
  routes.post("/plugins", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const parsed = addPluginSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
    }

    const { npmPackage, version, category, notes } = parsed.data;
    const existing = await repo().findById(npmPackage);
    if (existing) {
      return c.json({ error: "Plugin already exists" }, 409);
    }

    const plugin = await repo().insert({
      pluginId: npmPackage,
      npmPackage,
      version,
      category,
      notes,
    });
    const user = c.get("user") as { id: string } | undefined;
    safeAuditLog(deps.auditLogger, {
      adminUser: user?.id ?? "unknown",
      action: "marketplace.plugin.create",
      category: "config",
      details: { pluginId: npmPackage, version },
      outcome: "success",
    });

    // Fire-and-forget: install into shared volume
    if (deps.volumeInstaller) {
      const volumePath = deps.pluginVolumePath ?? "/data/plugins";
      try {
        const installer = deps.volumeInstaller();
        installer
          .installPluginToVolume({
            pluginId: npmPackage,
            npmPackage,
            version,
            volumePath,
            repo: repo(),
          })
          .catch((err: unknown) => {
            deps.logger?.error("Volume install trigger failed", { pluginId: npmPackage, err });
          });
      } catch {
        /* volume installer unavailable — non-fatal */
      }
    }

    return c.json(plugin, 201);
  });

  // PATCH /plugins/:id — update plugin (enable/disable, feature, sort, notes)
  routes.patch("/plugins/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await repo().findById(id);
    if (!existing) {
      return c.json({ error: "Plugin not found" }, 404);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const parsed = updatePluginSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
    }

    const patch: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.enabled === true) {
      const user = c.get("user") as { id: string } | undefined;
      if (user) patch.enabledBy = user.id;
    }

    const updated = await repo().update(id, patch as Parameters<IMarketplacePluginRepository["update"]>[1]);
    const user = c.get("user") as { id: string } | undefined;
    safeAuditLog(deps.auditLogger, {
      adminUser: user?.id ?? "unknown",
      action: "marketplace.plugin.update",
      category: "config",
      details: { pluginId: id, patch },
      outcome: "success",
    });
    return c.json(updated);
  });

  // DELETE /plugins/:id — remove a plugin from the registry
  routes.delete("/plugins/:id", async (c) => {
    const id = c.req.param("id");
    const existing = await repo().findById(id);
    if (!existing) {
      return c.json({ error: "Plugin not found" }, 404);
    }
    await repo().delete(id);
    const user = c.get("user") as { id: string } | undefined;
    safeAuditLog(deps.auditLogger, {
      adminUser: user?.id ?? "unknown",
      action: "marketplace.plugin.delete",
      category: "config",
      details: { pluginId: id },
      outcome: "success",
    });
    return c.body(null, 204);
  });

  // GET /plugins/:id/install-status — poll install progress
  routes.get("/plugins/:id/install-status", async (c) => {
    const id = c.req.param("id");
    const plugin = await repo().findById(id);
    if (!plugin) {
      return c.json({ error: "Plugin not found" }, 404);
    }

    const status = plugin.installedAt ? "installed" : plugin.installError ? "failed" : "pending";

    return c.json({
      pluginId: plugin.pluginId,
      status,
      installedAt: plugin.installedAt,
      installError: plugin.installError,
    });
  });

  // POST /discover — trigger manual discovery run
  routes.post("/discover", async (c) => {
    if (!deps.discoverer) {
      return c.json({ error: "Discovery not configured" }, 503);
    }
    const discoverer = deps.discoverer();
    const result = await discoverer.discoverNpmPlugins({
      repo: repo(),
      notify: (msg: string) => {
        deps.logger?.info(`[Marketplace] ${msg}`);
      },
    });
    const user = c.get("user") as { id: string } | undefined;
    safeAuditLog(deps.auditLogger, {
      adminUser: user?.id ?? "unknown",
      action: "marketplace.discovery.trigger",
      category: "config",
      details: { discovered: result.discovered, skipped: result.skipped },
      outcome: "success",
    });
    return c.json(result);
  });

  return routes;
}
