/**
 * tRPC marketplace router — plugin listings, upgrade, rollback.
 *
 * DI factory — no singletons.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { IMarketplacePluginRepository } from "../../marketplace/marketplace-plugin-repository.js";
import { rollbackPluginOnVolume, upgradePluginOnVolume } from "../../marketplace/volume-installer.js";
import { adminProcedure, router } from "../init.js";

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface MarketplaceRouterDeps {
  getMarketplacePluginRepo: () => IMarketplacePluginRepository;
  getPluginVolumePath: () => string;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMarketplaceRouter(deps: MarketplaceRouterDeps) {
  return router({
    upgrade: adminProcedure
      .input(
        z.object({
          pluginId: z.string().min(1),
          targetVersion: z.string().min(1),
        }),
      )
      .mutation(async ({ input }) => {
        const repo = deps.getMarketplacePluginRepo();
        const volumePath = deps.getPluginVolumePath();

        const plugin = await repo.findById(input.pluginId);
        if (!plugin) {
          throw new TRPCError({ code: "NOT_FOUND", message: `Plugin not found: ${input.pluginId}` });
        }

        await upgradePluginOnVolume({
          pluginId: input.pluginId,
          npmPackage: plugin.npmPackage,
          targetVersion: input.targetVersion,
          volumePath,
          repo,
        });

        const updated = await repo.findById(input.pluginId);
        return updated;
      }),

    rollback: adminProcedure
      .input(
        z.object({
          pluginId: z.string().min(1),
        }),
      )
      .mutation(async ({ input }) => {
        const repo = deps.getMarketplacePluginRepo();
        const volumePath = deps.getPluginVolumePath();

        const plugin = await repo.findById(input.pluginId);
        if (!plugin) {
          throw new TRPCError({ code: "NOT_FOUND", message: `Plugin not found: ${input.pluginId}` });
        }
        if (!plugin.previousVersion) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `No previous version recorded for plugin: ${input.pluginId}`,
          });
        }

        await rollbackPluginOnVolume({
          pluginId: input.pluginId,
          npmPackage: plugin.npmPackage,
          previousVersion: plugin.previousVersion,
          volumePath,
          repo,
        });

        const updated = await repo.findById(input.pluginId);
        return updated;
      }),
  });
}
