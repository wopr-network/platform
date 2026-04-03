/**
 * Admin tRPC router factory — platform-wide settings for the operator.
 *
 * All endpoints require platform_admin role (via adminProcedure).
 * Dependencies are injected via PlatformContainer rather than module-level
 * singletons, enabling clean testing and per-product composition.
 */

import { eq } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, router } from "../../trpc/init.js";
import type { PlatformContainer } from "../container.js";

// ---------------------------------------------------------------------------
// OpenRouter model list cache (module-level — safe for a cache)
// ---------------------------------------------------------------------------

type CachedModel = {
  id: string;
  name: string;
  contextLength: number;
  promptPrice: string;
  completionPrice: string;
};
let modelListCache: CachedModel[] | null = null;
let modelListCacheExpiry = 0;

// ---------------------------------------------------------------------------
// Config shape needed by the OpenRouter model listing
// ---------------------------------------------------------------------------

export interface AdminRouterConfig {
  openRouterApiKey?: string;
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function createAdminRouter(container: PlatformContainer, config?: AdminRouterConfig) {
  return router({
    /** Get model priority lists for all products. */
    getGatewayModel: adminProcedure.query(async () => {
      const allProducts = await container.productConfigService.listAll();
      return allProducts.map((pc) => ({
        slug: pc.product.slug,
        modelPriority: pc.features?.modelPriority ?? [],
      }));
    }),

    /** Set the model priority list for a product. */
    setModelPriority: adminProcedure
      .input(
        z.object({
          slug: z.string().min(1),
          modelPriority: z.array(z.string().min(1).max(256)).min(1).max(10),
        }),
      )
      .mutation(async ({ input }) => {
        const pc = await container.productConfigService.getBySlug(input.slug);
        if (!pc) {
          const { TRPCError } = await import("@trpc/server");
          throw new TRPCError({ code: "NOT_FOUND", message: `Product ${input.slug} not found` });
        }
        const { productFeatures } = await import("../../db/schema/product-config.js");
        await container.db
          .update(productFeatures)
          .set({ modelPriority: input.modelPriority, updatedAt: new Date() })
          .where(eq(productFeatures.productId, pc.product.id));
        return { slug: input.slug, modelPriority: input.modelPriority };
      }),

    /** List available OpenRouter models for the gateway model dropdown. */
    listAvailableModels: adminProcedure.query(async () => {
      const apiKey = config?.openRouterApiKey;
      if (!apiKey) return { models: [] };

      const now = Date.now();
      if (modelListCache && modelListCacheExpiry > now) return { models: modelListCache };

      try {
        const res = await fetch("https://openrouter.ai/api/v1/models", {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return { models: modelListCache ?? [] };
        const json = (await res.json()) as {
          data: Array<{
            id: string;
            name: string;
            context_length?: number;
            pricing?: { prompt?: string; completion?: string };
          }>;
        };
        const models = json.data
          .map((m) => ({
            id: m.id,
            name: m.name,
            contextLength: m.context_length ?? 0,
            promptPrice: m.pricing?.prompt ?? "0",
            completionPrice: m.pricing?.completion ?? "0",
          }))
          .sort((a, b) => a.id.localeCompare(b.id));
        modelListCache = models;
        modelListCacheExpiry = now + 60_000;
        return { models };
      } catch {
        return { models: modelListCache ?? [] };
      }
    }),

    // -----------------------------------------------------------------------
    // Platform-wide instance overview (all tenants)
    // -----------------------------------------------------------------------

    /** List ALL instances across all tenants with health status. */
    listAllInstances: adminProcedure.query(async () => {
      if (!container.fleet) {
        return { instances: [], error: "Fleet not configured" };
      }

      const fleet = container.fleet;
      const profiles = await fleet.profileStore.list();

      const instances = await Promise.all(
        profiles.map(async (profile) => {
          try {
            const status = await fleet.manager.status(profile.id);
            return {
              id: profile.id,
              name: profile.name,
              tenantId: profile.tenantId,
              image: profile.image,
              state: status.state,
              health: status.health,
              uptime: status.uptime,
              containerId: status.containerId ?? null,
              startedAt: status.startedAt ?? null,
            };
          } catch {
            return {
              id: profile.id,
              name: profile.name,
              tenantId: profile.tenantId,
              image: profile.image,
              state: "error" as const,
              health: null,
              uptime: null,
              containerId: null,
              startedAt: null,
            };
          }
        }),
      );

      return { instances };
    }),

    // -----------------------------------------------------------------------
    // Platform-wide tenant/org overview
    // -----------------------------------------------------------------------

    /** List all organizations with member counts and instance counts. */
    listAllOrgs: adminProcedure.query(async () => {
      const orgs = await container.pool.query<{
        id: string;
        name: string;
        slug: string | null;
        createdAt: string;
        memberCount: string;
      }>(`
        SELECT
          o.id,
          o.name,
          o.slug,
          o.created_at as "createdAt",
          (SELECT COUNT(*) FROM org_member om WHERE om.org_id = o.id) as "memberCount"
        FROM organization o
        ORDER BY o.created_at DESC
      `);

      // Count instances per tenant from fleet profiles
      const instanceCountByTenant = new Map<string, number>();
      if (container.fleet) {
        const profiles = await container.fleet.profileStore.list();
        for (const p of profiles) {
          instanceCountByTenant.set(p.tenantId, (instanceCountByTenant.get(p.tenantId) ?? 0) + 1);
        }
      }

      const result = await Promise.all(
        orgs.rows.map(async (org) => {
          let balanceCents = 0;
          try {
            const balance = await container.creditLedger.balance(org.id);
            balanceCents = (balance as { toCentsRounded(): number }).toCentsRounded();
          } catch {
            // Ledger may not have an entry for this org
          }
          return {
            id: org.id,
            name: org.name,
            slug: org.slug,
            createdAt: org.createdAt,
            memberCount: Number(org.memberCount),
            instanceCount: instanceCountByTenant.get(org.id) ?? 0,
            balanceCents,
          };
        }),
      );

      return { orgs: result };
    }),

    // -----------------------------------------------------------------------
    // Platform-wide billing summary
    // -----------------------------------------------------------------------

    /** Get platform billing summary: total credits, active service keys, payment method count. */
    billingOverview: adminProcedure.query(async () => {
      // Total credit balance across all tenants
      let totalBalanceCents = 0;
      try {
        const balanceResult = await container.pool.query<{ totalRaw: string }>(`
          SELECT COALESCE(SUM(amount), 0) as "totalRaw"
          FROM credit_entry
        `);
        const rawTotal = Number(balanceResult.rows[0]?.totalRaw ?? 0);
        // credit_entry.amount is in microdollars (10^-6), convert to cents
        totalBalanceCents = Math.round(rawTotal / 10_000);
      } catch {
        // Table may not exist yet
      }

      // Count active service keys
      let activeKeyCount = 0;
      if (container.gateway) {
        try {
          const keyResult = await container.pool.query<{ count: string }>(
            `SELECT COUNT(*) as "count" FROM service_keys WHERE revoked_at IS NULL`,
          );
          activeKeyCount = Number(keyResult.rows[0]?.count ?? 0);
        } catch {
          // Table may not exist
        }
      }

      // Count payment methods across all tenants
      let paymentMethodCount = 0;
      try {
        const pmResult = await container.pool.query<{ count: string }>(`
          SELECT COUNT(*) as "count" FROM payment_methods WHERE enabled = true
        `);
        paymentMethodCount = Number(pmResult.rows[0]?.count ?? 0);
      } catch {
        // Table may not exist
      }

      // Count total orgs
      let orgCount = 0;
      try {
        const orgCountResult = await container.pool.query<{ count: string }>(
          `SELECT COUNT(*) as "count" FROM organization`,
        );
        orgCount = Number(orgCountResult.rows[0]?.count ?? 0);
      } catch {
        // Table may not exist
      }

      return {
        totalBalanceCents,
        activeKeyCount,
        paymentMethodCount,
        orgCount,
      };
    }),

    // -----------------------------------------------------------------------
    // Hot pool config (DB-driven, admin-only)
    // -----------------------------------------------------------------------

    getPoolConfig: adminProcedure.query(async () => {
      if (!container.hotPool) {
        return { enabled: false, poolSize: 0, warmCount: 0 };
      }
      const poolSize = await container.hotPool.getPoolSize();
      const warmRes = await container.pool.query<{ count: string }>(
        "SELECT COUNT(*)::int AS count FROM pool_instances WHERE status = 'warm'",
      );
      const warmCount = Number(warmRes.rows[0]?.count ?? 0);
      return { enabled: true, poolSize, warmCount };
    }),

    setPoolSize: adminProcedure
      .input(z.object({ size: z.number().int().min(0).max(50) }))
      .mutation(async ({ input }) => {
        if (!container.hotPool) {
          throw new Error("Hot pool not enabled");
        }
        await container.hotPool.setPoolSize(input.size);
        return { poolSize: input.size };
      }),
  });
}
