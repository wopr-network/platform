/**
 * tRPC inference admin router — cost analytics dashboard.
 *
 * DI factory — no singletons. All procedures use adminProcedure.
 */

import { z } from "zod";
import type { ISessionUsageRepository } from "../../inference/session-usage-repository.js";
import { adminProcedure, router } from "../init.js";

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface InferenceAdminRouterDeps {
  getSessionUsageRepo: () => ISessionUsageRepository;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const sinceSchema = z.object({
  since: z.number().int().min(0).describe("Unix epoch ms — return data newer than this"),
});

export function createInferenceAdminRouter(deps: InferenceAdminRouterDeps) {
  return router({
    dailyCost: adminProcedure.input(sinceSchema).query(async ({ input }) => {
      const repo = deps.getSessionUsageRepo();
      return repo.aggregateByDay(input.since);
    }),

    pageCost: adminProcedure.input(sinceSchema).query(async ({ input }) => {
      const repo = deps.getSessionUsageRepo();
      return repo.aggregateByPage(input.since);
    }),

    cacheHitRate: adminProcedure.input(sinceSchema).query(async ({ input }) => {
      const repo = deps.getSessionUsageRepo();
      return repo.cacheHitRate(input.since);
    }),

    sessionCost: adminProcedure.input(sinceSchema).query(async ({ input }) => {
      const repo = deps.getSessionUsageRepo();
      return repo.aggregateSessionCost(input.since);
    }),
  });
}
