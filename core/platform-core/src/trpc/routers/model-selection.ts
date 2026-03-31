/**
 * tRPC model selection router — per-tenant default model selection.
 *
 * DI factory — no singletons.
 */

import { z } from "zod";
import { router, tenantProcedure } from "../init.js";

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface ITenantModelSelectionRepository {
  getDefaultModel(tenantId: string): Promise<string>;
  setDefaultModel(tenantId: string, defaultModel: string): Promise<void>;
}

export interface ModelSelectionRouterDeps {
  getRepository: () => ITenantModelSelectionRepository;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createModelSelectionRouter(deps: ModelSelectionRouterDeps) {
  return router({
    getDefaultModel: tenantProcedure.query(async ({ ctx }) => {
      const repo = deps.getRepository();
      return {
        tenantId: ctx.tenantId,
        defaultModel: await repo.getDefaultModel(ctx.tenantId),
      };
    }),

    setDefaultModel: tenantProcedure
      .input(z.object({ defaultModel: z.string().min(1).max(256) }))
      .mutation(async ({ input, ctx }) => {
        const repo = deps.getRepository();
        await repo.setDefaultModel(ctx.tenantId, input.defaultModel);
        return { tenantId: ctx.tenantId, defaultModel: input.defaultModel };
      }),
  });
}
