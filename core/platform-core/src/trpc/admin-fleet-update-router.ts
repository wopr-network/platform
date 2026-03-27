import { z } from "zod";
import { logger } from "../config/logger.js";
import type { RolloutOrchestrator } from "../fleet/rollout-orchestrator.js";
import type { ITenantUpdateConfigRepository } from "../fleet/tenant-update-config-repository.js";
import { adminProcedure, router } from "./init.js";

export function createAdminFleetUpdateRouter(
  getOrchestrator: () => RolloutOrchestrator,
  getConfigRepo: () => ITenantUpdateConfigRepository,
) {
  return router({
    /** Get current rollout status */
    rolloutStatus: adminProcedure.query(() => {
      const orchestrator = getOrchestrator();
      return {
        isRolling: orchestrator.isRolling,
      };
    }),

    /** Force trigger a rollout for all auto-update tenants */
    forceRollout: adminProcedure.mutation(async () => {
      const orchestrator = getOrchestrator();
      logger.info("Admin: fleet.forceRollout");
      // Fire and forget — don't block the admin request
      orchestrator.rollout().catch((err: unknown) => {
        logger.error("Force rollout failed", {
          error: (err as Error).message,
        });
      });
      return { triggered: true };
    }),

    /** List all tenant update configs */
    listTenantConfigs: adminProcedure.query(async () => {
      const repo = getConfigRepo();
      return repo.listAutoEnabled();
    }),

    /** Override a specific tenant's update config */
    setTenantConfig: adminProcedure
      .input(
        z.object({
          tenantId: z.string().min(1),
          mode: z.enum(["auto", "manual"]),
          preferredHourUtc: z.number().int().min(0).max(23).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        const repo = getConfigRepo();
        const existing = await repo.get(input.tenantId);
        await repo.upsert(input.tenantId, {
          mode: input.mode,
          preferredHourUtc: input.preferredHourUtc ?? existing?.preferredHourUtc ?? 3,
        });
        logger.info("Admin: fleet.setTenantConfig", {
          tenantId: input.tenantId,
          mode: input.mode,
          preferredHourUtc: input.preferredHourUtc ?? existing?.preferredHourUtc ?? 3,
        });
      }),
  });
}
