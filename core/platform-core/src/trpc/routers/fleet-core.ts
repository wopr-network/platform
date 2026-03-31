/**
 * tRPC fleet-core router — shared instance lifecycle procedures.
 *
 * Contains the 11 procedures shared across Paperclip, NemoClaw, and (potentially) WOPR.
 * Product-specific fleet procedures (WOPR's 14 DHT/GPU/node procedures) stay in wopr-platform.
 *
 * Pure platform-core — all infrastructure injected via deps.
 */

import { TRPCError } from "@trpc/server";
import { logger } from "../../config/logger.js";
import type { ILedger } from "../../credits/ledger.js";
import type { IProfileStore } from "../../fleet/profile-store.js";
import type { IServiceKeyRepository } from "../../gateway/service-key-repository.js";
import type { ProductConfig } from "../../product-config/repository-types.js";
import type { IPoolRepository } from "../../server/services/pool-repository.js";
import { protectedProcedure, router, type TRPCContext } from "../init.js";

// Narrowed context after protectedProcedure middleware (user is non-optional)
type ProtectedCtx = TRPCContext & { user: NonNullable<TRPCContext["user"]> };

import { z } from "zod";

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

/** Fleet manager interface (subset used by the router). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FleetManagerLike = {
  status: (id: string) => Promise<{
    id: string;
    name: string;
    description: string;
    image: string;
    containerId: string | null;
    state: string;
    health: unknown;
    uptime: unknown;
    startedAt: string | null;
    createdAt: string;
    updatedAt: string;
    stats: unknown;
    applicationMetrics: unknown;
  }>;
  logs: (id: string, tail: number) => Promise<string>;
  remove: (id: string) => Promise<void>;
  getInstance: (
    id: string,
  ) => Promise<{ start: () => Promise<void>; stop: () => Promise<void>; startBilling: () => Promise<void> }>;
  create: (
    params: Record<string, unknown>,
    resourceLimits?: unknown,
  ) => Promise<{ id: string; profile: { name: string; tenantId: string } }>;
};

export interface FleetCoreRouterDeps {
  creditLedger: ILedger;
  profileStore: IProfileStore;
  productConfig: ProductConfig;
  serviceKeyRepo: IServiceKeyRepository | null;
  /** Assert caller is admin/owner of the tenant. Skips check for personal tenants (tenantId === userId). */
  assertOrgAdminOrOwner: (tenantId: string, userId: string) => Promise<void>;
  /** Get the FleetManager for a given instance. Product-specific resolution. */
  getFleetForInstance: (instanceId: string) => FleetManagerLike;
  /** Unassign container from node tracking. */
  unassignContainer?: (instanceId: string) => void;
  /** Remove route for an instance. */
  removeRoute?: (instanceId: string) => Promise<void>;
  /** Provision secret for calling container /internal/provision. */
  provisionSecret?: string;
  /** Resolve product config by slug. */
  resolveProductConfig?: (slug: string) => Promise<ProductConfig | null>;
  /** Hot pool repository — try claiming a pre-warmed container before cold create. */
  poolRepo?: IPoolRepository;
}

/** Derive tenantId from context — personal org uses userId as tenantId. */
function tenantFromCtx(ctx: { user: { id: string }; tenantId: string | undefined }): string {
  return ctx.tenantId ?? ctx.user.id;
}

// ---------------------------------------------------------------------------
// Factory — DI-based
// ---------------------------------------------------------------------------

export function createFleetCoreRouter(d: FleetCoreRouterDeps) {
  return router({
    /** List all instances for the authenticated user's tenant. */
    listInstances: protectedProcedure.query(async ({ ctx }: { ctx: ProtectedCtx }) => {
      const tenant = tenantFromCtx(ctx);
      const profiles = await d.profileStore.list();
      const tenantProfiles = profiles.filter((p) => p.tenantId === tenant);
      const bots = await Promise.all(
        tenantProfiles.map(async (profile) => {
          try {
            const fleet = d.getFleetForInstance(profile.id);
            return await fleet.status(profile.id);
          } catch {
            return {
              id: profile.id,
              name: profile.name,
              description: profile.description,
              image: profile.image,
              containerId: null,
              state: "error" as const,
              health: null,
              uptime: null,
              startedAt: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
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
        const tenant = tenantFromCtx(ctx);
        const profile = await d.profileStore.get(input.id);
        if (!profile) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found" });
        }
        if (profile.tenantId !== tenant) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const fleet = d.getFleetForInstance(input.id);
        return await fleet.status(input.id);
      }),

    /** Control an instance: start, stop, restart, destroy. */
    controlInstance: protectedProcedure
      .input(
        z.object({
          id: z.string().min(1),
          action: z.enum(["start", "stop", "restart", "destroy"]),
          orgId: z.string().min(1).optional(),
        }),
      )
      .mutation(
        async ({
          input,
          ctx,
        }: {
          input: { id: string; action: "start" | "stop" | "restart" | "destroy"; orgId?: string };
          ctx: ProtectedCtx;
        }) => {
          const tenant = input.orgId ?? tenantFromCtx(ctx);
          await d.assertOrgAdminOrOwner(tenant, ctx.user.id);
          const profile = await d.profileStore.get(input.id);
          if (!profile) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found" });
          }
          if (profile.tenantId !== tenant) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
          }
          const fleet = d.getFleetForInstance(input.id);
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
            case "destroy": {
              if (d.serviceKeyRepo) await d.serviceKeyRepo.revokeByInstance(input.id);
              try {
                await fleet.remove(input.id);
              } catch (err) {
                logger.warn(`Fleet remove failed for ${input.id}`, { err });
              }
              d.unassignContainer?.(input.id);
              await d.removeRoute?.(input.id);
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
        const tenant = tenantFromCtx(ctx);
        const profile = await d.profileStore.get(input.id);
        if (!profile) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found" });
        }
        if (profile.tenantId !== tenant) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const fleet = d.getFleetForInstance(input.id);
        const status = await fleet.status(input.id);
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
        const tenant = tenantFromCtx(ctx);
        const profile = await d.profileStore.get(input.id);
        if (!profile) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found" });
        }
        if (profile.tenantId !== tenant) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const fleet = d.getFleetForInstance(input.id);
        const rawLogs = await fleet.logs(input.id, input.tail ?? 100);
        const logs = rawLogs.split("\n").filter((line) => line.trim().length > 0);
        return { logs };
      }),

    /** Get resource metrics for an instance. */
    getInstanceMetrics: protectedProcedure
      .input(z.object({ id: z.string().min(1) }))
      .query(async ({ input, ctx }: { input: { id: string }; ctx: ProtectedCtx }) => {
        const tenant = tenantFromCtx(ctx);
        const profile = await d.profileStore.get(input.id);
        if (!profile) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Instance not found" });
        }
        if (profile.tenantId !== tenant) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
        }
        const fleet = d.getFleetForInstance(input.id);
        const status = await fleet.status(input.id);
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
          name: z.string().min(1).max(63),
          description: z.string().optional().default(""),
          productSlug: z.string().min(1).optional(),
          orgId: z.string().min(1).optional(),
          env: z.record(z.string(), z.string()).optional(),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const tenant = input.orgId ?? tenantFromCtx(ctx as ProtectedCtx);
        const userId = (ctx as ProtectedCtx).user.id;
        await d.assertOrgAdminOrOwner(tenant, userId);

        // Resolve product config for the image + gateway URL
        const slug = input.productSlug ?? "wopr";
        let pc = d.productConfig;
        if (d.resolveProductConfig && slug !== d.productConfig.product?.slug) {
          const resolved = await d.resolveProductConfig(slug);
          if (resolved) pc = resolved;
        }

        const fleetConfig = pc.fleet;
        const image = fleetConfig?.containerImage ?? "registry.wopr.bot/wopr:managed";

        // Credit check — minimum 17 cents (1 day of runtime).
        // Ephemeral instances skip this — they bill per-token at the gateway.
        const isEphemeral = fleetConfig?.lifecycle === "ephemeral";
        const { Credit } = await import("../../credits/index.js");
        const balance = await d.creditLedger.balance(tenant);
        if (!isEphemeral && balance.lessThan(Credit.fromCents(17))) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Insufficient credits: ${balance.toCentsRounded()}¢ (need 17¢ minimum)`,
          });
        }

        // 1. Create — try claiming a pre-warmed container first, cold create as fallback
        const fleet = d.getFleetForInstance("__new__");
        let instance: { id: string; profile: { name: string; tenantId: string } } | null = null;

        // Try claiming a pre-warmed container from the hot pool
        if (d.poolRepo) {
          const claimed = await d.poolRepo.claimWarm(tenant, input.name, slug);
          if (claimed) {
            instance = { id: claimed.id, profile: { name: input.name, tenantId: tenant } };
            logger.info(`Fleet: claimed warm container from pool`, { instanceId: claimed.id, productSlug: slug });
          }
        }

        // Cold create as fallback
        if (!instance) {
          instance = await fleet.create({
            tenantId: tenant,
            name: input.name,
            description: input.description ?? "",
            image,
            env: (input.env ?? {}) as Record<string, string>,
            restartPolicy: "unless-stopped",
            releaseChannel: "stable",
            updatePolicy: "manual",
          });
          logger.info(`Fleet: cold-created container`, { instanceId: instance.id, productSlug: slug });
        }

        // Generate gateway service key for metered inference
        let gatewayKey: string | undefined;
        if (d.serviceKeyRepo) {
          try {
            gatewayKey = await d.serviceKeyRepo.generate(tenant, instance.id, slug);
          } catch (err) {
            logger.warn("Gateway key generation failed (non-fatal)", { instanceId: instance.id, err });
          }
        }

        // 2. Provision — give the container its identity
        const containerPort = fleetConfig?.containerPort ?? 3000;
        const gatewayUrl = pc.product?.domain ? `https://api.${pc.product.domain}` : "https://api.wopr.bot";
        if (d.provisionSecret && gatewayKey) {
          try {
            const { provisionContainer } = await import("@wopr-network/provision-client");
            const containerUrl = `http://localhost:${containerPort}`;
            await provisionContainer(containerUrl, d.provisionSecret, {
              tenantId: tenant,
              tenantName: input.name,
              gatewayUrl,
              apiKey: gatewayKey,
              budgetCents: balance.toCentsRounded(),
              adminUser: {
                id: userId,
                email: "",
                name: input.name,
              },
            });
          } catch (err) {
            logger.warn("Provisioning failed (non-fatal, container still created)", {
              instanceId: instance.id,
              err,
            });
          }
        }

        // 3. Start billing — activate the $0.17/day clock.
        // Ephemeral instances (e.g., holyship) skip this — they bill per-token at the gateway.
        if (!isEphemeral) {
          try {
            const inst = await fleet.getInstance(instance.id);
            await inst.startBilling();
          } catch (err) {
            logger.warn("startBilling failed (non-fatal)", { instanceId: instance.id, err });
          }
        }

        return {
          id: instance.id,
          name: instance.profile.name,
          tenantId: instance.profile.tenantId,
          gatewayKey,
        };
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
