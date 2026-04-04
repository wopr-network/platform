/**
 * tRPC profile router — get/update user profile, change password, delete account.
 *
 * Pure platform-core — no product-specific imports.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router, type TRPCContext } from "../init.js";

// Narrowed context after protectedProcedure middleware (user is non-optional)
type ProtectedCtx = TRPCContext & { user: NonNullable<TRPCContext["user"]> };

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface ProfileRouterDeps {
  getUser: (
    userId: string,
  ) => Promise<{ id: string; name: string; email: string; image: string | null; twoFactorEnabled: boolean } | null>;
  updateUser: (
    userId: string,
    data: { name?: string; image?: string | null },
  ) => Promise<{ id: string; name: string; email: string; image: string | null; twoFactorEnabled: boolean }>;
  changePassword: (userId: string, currentPassword: string, newPassword: string) => Promise<boolean>;
  /** Delete a user and all their data (sessions, instances, org memberships). */
  deleteUser: (userId: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createProfileRouter(d: ProfileRouterDeps) {
  return router({
    getProfile: protectedProcedure.query(async ({ ctx }: { ctx: ProtectedCtx }) => {
      const user = await d.getUser(ctx.user.id);
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        twoFactorEnabled: user.twoFactorEnabled,
      };
    }),

    updateProfile: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(128).optional(),
          image: z.string().max(3_000_000).nullable().optional(),
        }),
      )
      .mutation(async ({ input, ctx }: { input: { name?: string; image?: string | null }; ctx: ProtectedCtx }) => {
        const updated = await d.updateUser(ctx.user.id, {
          ...(input.name !== undefined && { name: input.name }),
          ...(input.image !== undefined && { image: input.image }),
        });
        return {
          id: updated.id,
          name: updated.name,
          email: updated.email,
          image: updated.image,
          twoFactorEnabled: updated.twoFactorEnabled,
        };
      }),

    changePassword: protectedProcedure
      .input(
        z.object({
          currentPassword: z.string().min(1),
          newPassword: z.string().min(8, "Password must be at least 8 characters"),
        }),
      )
      .mutation(
        async ({ input, ctx }: { input: { currentPassword: string; newPassword: string }; ctx: ProtectedCtx }) => {
          const ok = await d.changePassword(ctx.user.id, input.currentPassword, input.newPassword);
          if (!ok) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Current password is incorrect" });
          }
          return { ok: true as const };
        },
      ),

    deleteAccount: protectedProcedure.mutation(async ({ ctx }: { ctx: ProtectedCtx }) => {
      await d.deleteUser(ctx.user.id);
      return { ok: true as const };
    }),
  });
}
