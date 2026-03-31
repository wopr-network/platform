/**
 * tRPC two-factor router — tenant 2FA mandate management.
 *
 * DI factory — no singletons.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { ITwoFactorRepository } from "../../security/two-factor-repository.js";
import { router, tenantProcedure } from "../init.js";

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface TwoFactorRouterDeps {
  twoFactorRepo: ITwoFactorRepository;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function assertAdmin(user: { id: string; roles?: string[] }): void {
  const roles = user.roles ?? [];
  if (!roles.includes("admin") && !roles.includes("platform_admin") && !roles.includes("tenant_admin")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
}

export function createTwoFactorRouter(deps: TwoFactorRouterDeps) {
  return router({
    getMandateStatus: tenantProcedure.query(async ({ ctx }) => {
      return deps.twoFactorRepo.getMandateStatus(ctx.tenantId);
    }),

    setMandateStatus: tenantProcedure
      .input(z.object({ requireTwoFactor: z.boolean() }))
      .mutation(async ({ input, ctx }) => {
        assertAdmin(ctx.user);
        return deps.twoFactorRepo.setMandateStatus(ctx.tenantId, input.requireTwoFactor);
      }),
  });
}
