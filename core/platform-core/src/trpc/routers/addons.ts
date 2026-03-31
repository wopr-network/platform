/**
 * tRPC addons router — infrastructure add-ons (GPU, storage upgrades).
 *
 * DI factory — no singletons.
 */

import { z } from "zod";
import { ADDON_CATALOG, ADDON_KEYS, type AddonKey } from "../../monetization/addons/addon-catalog.js";
import type { ITenantAddonRepository } from "../../monetization/addons/addon-repository.js";
import { protectedProcedure, router, tenantProcedure } from "../init.js";

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface AddonRouterDeps {
  addonRepo: ITenantAddonRepository;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAddonRouter(deps: AddonRouterDeps) {
  return router({
    catalog: protectedProcedure.query(() => {
      return ADDON_KEYS.map((key) => ({
        key,
        label: ADDON_CATALOG[key].label,
        dailyCostCents: ADDON_CATALOG[key].dailyCost.toCents(),
        description: ADDON_CATALOG[key].description,
      }));
    }),

    list: tenantProcedure.query(async ({ ctx }) => {
      const tenantId = ctx.tenantId;
      const addons = await deps.addonRepo.list(tenantId);
      return addons.map((a) => ({
        key: a.addonKey,
        label: ADDON_CATALOG[a.addonKey as AddonKey]?.label ?? a.addonKey,
        dailyCostCents: ADDON_CATALOG[a.addonKey as AddonKey]?.dailyCost.toCents() ?? 0,
        enabledAt: a.enabledAt,
      }));
    }),

    enable: tenantProcedure
      .input(z.object({ key: z.enum([...ADDON_KEYS] as [AddonKey, ...AddonKey[]]) }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        await deps.addonRepo.enable(tenantId, input.key as AddonKey);
        return { enabled: true, key: input.key };
      }),

    disable: tenantProcedure
      .input(z.object({ key: z.enum([...ADDON_KEYS] as [AddonKey, ...AddonKey[]]) }))
      .mutation(async ({ input, ctx }) => {
        const tenantId = ctx.tenantId;
        await deps.addonRepo.disable(tenantId, input.key as AddonKey);
        return { disabled: true, key: input.key };
      }),
  });
}
