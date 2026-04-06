/**
 * Profile proxy — forwards all profile operations to core.
 */
import { coreClient } from "../../services/core-client.js";
import { protectedProcedure, router } from "../init.js";
import { z } from "zod";

function forUser(ctx: { user: { id: string } }) {
  return coreClient({ tenantId: ctx.user.id, userId: ctx.user.id, product: "holyship" });
}

export const profileRouter = router({
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    return forUser(ctx).profile.getProfile.query();
  }),

  updateProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128).optional(),
        image: z.string().url().max(2048).nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return forUser(ctx).profile.updateProfile.mutate(input);
    }),

  changePassword: protectedProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: z.string().min(8, "Password must be at least 8 characters"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return forUser(ctx).profile.changePassword.mutate(input);
    }),
});
