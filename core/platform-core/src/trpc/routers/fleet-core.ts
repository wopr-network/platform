/**
 * tRPC fleet-core router — shared instance lifecycle procedures.
 *
 * Contains the instance lifecycle procedures shared across Paperclip,
 * NemoClaw, and (potentially) WOPR. Product-specific fleet procedures
 * stay in their product platform packages.
 *
 * Pure platform-core — all infrastructure injected via deps. Reads
 * come from `bot_instances` directly (no profile store).
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { logger } from "../../config/logger.js";
import type { ILedger } from "../../credits/ledger.js";
import type { IBotInstanceRepository } from "../../fleet/bot-instance-repository.js";
import type { IServiceKeyRepository } from "../../gateway/service-key-repository.js";
import type { ProductConfig } from "../../product-config/repository-types.js";
import { protectedProcedure, router, type TRPCContext } from "../init.js";

// Narrowed context after protectedProcedure middleware (user is non-optional)
type ProtectedCtx = TRPCContext & { user: NonNullable<TRPCContext["user"]> };

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface FleetCoreRouterDeps {
  creditLedger: ILedger;
  botInstanceRepo: IBotInstanceRepository;
  productConfig: ProductConfig;
  serviceKeyRepo: IServiceKeyRepository | null;
  /** Assert caller is admin/owner of the tenant. Skips check for personal tenants (tenantId === userId). */
  assertOrgAdminOrOwner: (tenantId: string, userId: string, roles?: string[]) => Promise<void>;
  /**
   * The Fleet composite. Same interface as a leaf — single-target ops resolve
   * the owning node from bot_instances.node_id and dispatch automatically.
   */
  fleet: import("../../fleet/i-fleet.js").IFleet;
  /** Remove route for an instance. */
  removeRoute?: (instanceId: string) => Promise<void>;
  /** Provision secret for calling container /internal/provision. */
  provisionSecret?: string;
  /** Resolve product config by slug. */
  resolveProductConfig?: (slug: string) => Promise<ProductConfig | null>;
  /** Instance service — orchestrates create, provision, billing. */
  instanceService: import("../../fleet/instance-service.js").InstanceService;
}

/** Derive tenantId from context — personal org uses userId as tenantId. */
function tenantFromCtx(ctx: { user: { id: string }; tenantId: string | undefined }): string {
  return ctx.tenantId ?? ctx.user.id;
}

// ---------------------------------------------------------------------------
// Factory — DI-based
// ---------------------------------------------------------------------------

export function createFleetCoreRouter(d: FleetCoreRouterDeps) {
  /**
   * Load an instance and check that it belongs to the caller's tenant.
   * Replaces the pre-refactor `profileStore.get` + tenantId comparison that
   * was repeated across every per-id procedure.
   */
  async function loadOwnedInstance(id: string, tenant: string) {
    const instance = await d.botInstanceRepo.getById(id);
    if (!instance) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found" });
    }
    if (instance.tenantId !== tenant) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
    }
    return instance;
  }

  return router({
    /** List all instances for the authenticated user's tenant. */
    listInstances: protectedProcedure.query(async ({ ctx }: { ctx: ProtectedCtx }) => {
      const tenant = tenantFromCtx(ctx);
      const rows = await d.botInstanceRepo.listByTenant(tenant);
      const bots = await Promise.all(
        rows.map(async (row) => {
          try {
            return await d.fleet.status(row.id);
          } catch {
            return {
              id: row.id,
              name: row.name,
              description: "",
              image: "",
              containerId: null,
              state: "error" as const,
              health: null,
              uptime: null,
              startedAt: null,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
              stats: null,
              applicationMetrics: null,
            };
          }
        }),
      );
      return { bots };
    }),

    /** Get a single instance by ID. */
    getInstance: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ input, ctx }: { input: { id: string }; ctx: ProtectedCtx }) => {
        await loadOwnedInstance(input.id, tenantFromCtx(ctx));
        return await d.fleet.status(input.id);
      }),

    /** Control an instance: start, stop, restart, destroy. */
    controlInstance: protectedProcedure
      .input(
        z.object({
          id: z.string().min(1),
          action: z.enum(["start", "stop", "restart", "destroy", "roll"]),
          orgId: z.string().min(1).optional(),
        }),
      )
      .mutation(
        async ({
          input,
          ctx,
        }: {
          input: { id: string; action: "start" | "stop" | "restart" | "destroy" | "roll"; orgId?: string };
          ctx: ProtectedCtx;
        }) => {
          const tenant = input.orgId ?? tenantFromCtx(ctx);
          await d.assertOrgAdminOrOwner(tenant, ctx.user.id, ctx.user.roles);
          await loadOwnedInstance(input.id, tenant);
          const fleet = d.fleet;
          switch (input.action) {
            case "start": {
              const instance = await fleet.getInstance(input.id);
              await instance.start();
              break;
            }
            case "stop": {
              const instance = await fleet.getInstance(input.id);
              await instance.stop();
              break;
            }
            case "restart": {
              const instance = await fleet.getInstance(input.id);
              await instance.stop();
              await instance.start();
              break;
            }
            case "roll": {
              // Roll the container to pick up the latest image digest for its
              // current tag. Needed after a rebuild of e.g. paperclip:managed
              // so running user containers actually run the new code instead
              // of staying pinned to their original image id.
              await fleet.roll(input.id);
              break;
            }
            case "destroy": {
              if (d.serviceKeyRepo) await d.serviceKeyRepo.revokeByInstance(input.id);
              try {
                await fleet.remove(input.id);
              } catch (err) {
                logger.warn(`Fleet remove failed for ${input.id}`, { err });
              }
              await d.removeRoute?.(input.id);
              // Mark the DB row as destroyed so listByTenant filters it out.
              // Without this, the shell's hasInstance check stays true and
              // the user never lands on the CEO onboarding after Reset.
              try {
                await d.botInstanceRepo.markDestroyed(input.id);
              } catch (err) {
                logger.warn(`markDestroyed failed for ${input.id}`, { err });
              }
              break;
            }
          }
          return { ok: true };
        },
      ),

    /** Get health status for an instance. */
    getInstanceHealth: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ input, ctx }: { input: { id: string }; ctx: ProtectedCtx }) => {
        await loadOwnedInstance(input.id, tenantFromCtx(ctx));
        const status = await d.fleet.status(input.id);
        return {
          id: status.id,
          state: status.state,
          health: status.health,
          uptime: status.uptime,
          stats: status.stats,
        };
      }),

    /** Get container logs for an instance. */
    getInstanceLogs: protectedProcedure
      .input(z.object({ id: z.string().min(1), tail: z.number().int().positive().max(1000).optional() }))
      .query(async ({ input, ctx }: { input: { id: string; tail?: number }; ctx: ProtectedCtx }) => {
        await loadOwnedInstance(input.id, tenantFromCtx(ctx));
        const rawLogs = await d.fleet.logs(input.id, { tail: input.tail ?? 100 });
        const logs = rawLogs.split("\n").filter((line) => line.trim().length > 0);
        return { logs };
      }),

    /** Get resource metrics for an instance. */
    getInstanceMetrics: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ input, ctx }: { input: { id: string }; ctx: ProtectedCtx }) => {
        await loadOwnedInstance(input.id, tenantFromCtx(ctx));
        const status = await d.fleet.status(input.id);
        return { id: status.id, stats: status.stats };
      }),

    /**
     * Create a new instance: create container → provision identity → start billing.
     *
     * This is the primary entry point for UIs to spin up product sidecars.
     * The product slug (from X-Product header) determines which container image,
     * gateway URL, and product config to use.
     */
    createInstance: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          description: z.string().optional().default(""),
          orgId: z.string().min(1).optional(),
          env: z.record(z.string(), z.string()).optional(),
          /** Product-specific data passed through to provisioning. */
          extra: z.record(z.string(), z.unknown()).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const tenant = input.orgId ?? tenantFromCtx(ctx as ProtectedCtx);
        const userId = (ctx as ProtectedCtx).user.id;
        const roles = (ctx as ProtectedCtx).user.roles;
        logger.info("createInstance: start", {
          tenant,
          userId,
          roles,
          inputOrgId: input.orgId,
          ctxTenantId: (ctx as ProtectedCtx).tenantId,
          productSlug: ctx.productSlug,
          name: input.name,
        });
        await d.assertOrgAdminOrOwner(tenant, userId, (ctx as ProtectedCtx).user.roles);
        logger.info("createInstance: auth passed", { tenant, userId });

        if (!ctx.productSlug) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Product could not be determined from request" });
        }
        let pc = d.productConfig;
        if (d.resolveProductConfig && ctx.productSlug !== d.productConfig.product?.slug) {
          const resolved = await d.resolveProductConfig(ctx.productSlug);
          if (resolved) pc = resolved;
        }
        logger.info("createInstance: product resolved", { productSlug: ctx.productSlug, hasFleet: !!pc.fleet });

        try {
          const result = await d.instanceService.create({
            tenantId: tenant,
            userId,
            userEmail: ctx.userEmail ?? "",
            name: input.name,
            description: input.description,
            productSlug: ctx.productSlug,
            productConfig: pc,
            env: input.env,
            extra: input.extra,
          });
          logger.info("createInstance: success", { instanceId: result.id, tenant });
          return result;
        } catch (err) {
          logger.error("createInstance: failed", {
            error: err instanceof Error ? err.message : String(err),
            tenant,
            userId,
          });
          if (err instanceof Error && err.message.startsWith("Insufficient credits")) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: err.message });
          }
          throw err;
        }
      }),

    /**
     * Create a bare container — no billing, no provisioning, no credit check.
     *
     * For products that manage their own lifecycle (e.g., holyship workers).
     * Returns container ID + URL. The caller handles setup from there.
     */
    createContainer: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(255),
          image: z.string().min(1),
          productSlug: z.string().min(1),
          orgId: z.string().min(1).optional(),
          env: z.record(z.string(), z.string()).optional(),
          network: z.string().min(1).optional(),
          restartPolicy: z.enum(["no", "always", "on-failure", "unless-stopped"]).optional(),
          readonlyRootfs: z.boolean().optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const tenant = input.orgId ?? tenantFromCtx(ctx as ProtectedCtx);
        const userId = (ctx as ProtectedCtx).user.id;
        await d.assertOrgAdminOrOwner(tenant, userId, (ctx as ProtectedCtx).user.roles);

        // Validate image against product config allowlist
        if (d.resolveProductConfig) {
          const pc = await d.resolveProductConfig(input.productSlug);
          if (pc?.fleet) {
            const allowlist = pc.fleet.imageAllowlist;
            const configImage = pc.fleet.containerImage;
            if (allowlist && allowlist.length > 0) {
              if (!allowlist.some((pattern) => input.image.startsWith(pattern))) {
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message: `Image not in allowlist for ${input.productSlug}`,
                });
              }
            } else if (configImage && !input.image.startsWith(configImage.split(":")[0])) {
              throw new TRPCError({ code: "BAD_REQUEST", message: `Image not allowed for ${input.productSlug}` });
            }
          }
        }

        return d.instanceService.createContainer({
          tenantId: tenant,
          name: input.name,
          image: input.image,
          productSlug: input.productSlug,
          env: input.env,
          network: input.network,
          restartPolicy: input.restartPolicy,
          readonlyRootfs: input.readonlyRootfs,
        });
      }),

    /** List available templates for instance creation. */
    listTemplates: protectedProcedure.query(() => {
      return [
        { id: "discord-bot", name: "Discord AI Bot", description: "AI assistant for Discord servers" },
        { id: "slack-assistant", name: "Slack Assistant", description: "AI assistant for Slack workspaces" },
        { id: "multi-channel", name: "Multi-channel", description: "Bot connected to multiple channels" },
        { id: "api-only", name: "API Only", description: "Headless bot with API access only" },
      ];
    }),
  });
}
