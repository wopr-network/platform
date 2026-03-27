import { z } from "zod";
import { logger } from "../config/logger.js";
import type { ITenantUpdateConfigRepository } from "../fleet/tenant-update-config-repository.js";
import { protectedProcedure, router } from "./init.js";

export function createFleetUpdateConfigRouter(getConfigRepo: () => ITenantUpdateConfigRepository) {
  return router({
    getUpdateConfig: protectedProcedure.input(z.object({ tenantId: z.string().min(1) })).query(async ({ input }) => {
      return getConfigRepo().get(input.tenantId);
    }),

    setUpdateConfig: protectedProcedure
      .input(
        z.object({
          tenantId: z.string().min(1),
          mode: z.enum(["auto", "manual"]),
          preferredHourUtc: z.number().int().min(0).max(23).optional(),
        }),
      )
      .mutation(async ({ input }) => {
        await getConfigRepo().upsert(input.tenantId, {
          mode: input.mode,
          preferredHourUtc: input.preferredHourUtc ?? 3,
        });
        logger.info("Tenant update config changed", {
          tenantId: input.tenantId,
          mode: input.mode,
        });
      }),
  });
}
