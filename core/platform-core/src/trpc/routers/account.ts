/**
 * tRPC account router — account deletion and GDPR requests.
 *
 * DI factory — no singletons. Each product calls createAccountRouter(deps).
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { NotificationService } from "../../email/index.js";
import { router, tenantProcedure } from "../init.js";

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface AccountRouterDeps {
  getDeletionStore: () => {
    getPendingForTenant(tenantId: string): Promise<{
      id: string;
      deleteAfter: Date;
      createdAt: Date;
      tenantId: string;
      status: string;
    } | null>;
    getById(id: string): Promise<{
      id: string;
      deleteAfter: Date;
      createdAt: Date;
      tenantId: string;
      status: string;
    } | null>;
    create(tenantId: string, userId: string): Promise<{ id: string; deleteAfter: Date }>;
    cancel(id: string, reason: string): Promise<void>;
  };
  getNotificationService?: () => NotificationService;
  suspendBots?: (tenantId: string) => void;
  suspendTenant?: (tenantId: string, reason: string, actorId: string) => void;
  reactivateTenant?: (tenantId: string, actorId: string) => void;
  getUserEmail: (userId: string) => string | null;
  verifyPassword: (email: string, password: string) => Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createAccountRouter(deps: AccountRouterDeps) {
  return router({
    requestDeletion: tenantProcedure
      .input(
        z.object({
          confirmPhrase: z.literal("DELETE MY ACCOUNT"),
          currentPassword: z.string().min(1),
        }),
      )
      .mutation(async ({ input, ctx }) => {
        const store = deps.getDeletionStore();
        const tenantId = ctx.tenantId;
        const userId = ctx.user.id;

        const existing = await store.getPendingForTenant(tenantId);
        if (existing) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A deletion request is already pending for this account",
          });
        }

        const email = deps.getUserEmail(userId);
        if (!email) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Could not resolve user email for re-authentication",
          });
        }

        let verified: boolean;
        try {
          verified = await deps.verifyPassword(email, input.currentPassword);
        } catch {
          verified = false;
        }

        if (!verified) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Password verification failed",
          });
        }

        const request = await store.create(tenantId, userId);

        if (deps.suspendBots) {
          deps.suspendBots(tenantId);
        }

        if (deps.suspendTenant) {
          deps.suspendTenant(tenantId, "Account deletion requested", userId);
        }

        if (email && deps.getNotificationService) {
          deps
            .getNotificationService()
            .notifyAccountDeletionRequested(tenantId, email, request.deleteAfter.toISOString());
        }

        return {
          requestId: request.id,
          deleteAfter: request.deleteAfter,
          status: "pending" as const,
        };
      }),

    deletionStatus: tenantProcedure.query(async ({ ctx }) => {
      const store = deps.getDeletionStore();
      const request = await store.getPendingForTenant(ctx.tenantId);

      if (!request) {
        return { hasPendingDeletion: false as const };
      }

      return {
        hasPendingDeletion: true as const,
        requestId: request.id,
        deleteAfter: request.deleteAfter,
        createdAt: request.createdAt,
      };
    }),

    cancelDeletion: tenantProcedure
      .input(z.object({ requestId: z.string().uuid() }))
      .mutation(async ({ input, ctx }) => {
        const store = deps.getDeletionStore();

        const request = await store.getById(input.requestId);
        if (!request || request.tenantId !== ctx.tenantId) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Deletion request not found",
          });
        }
        if (request.status !== "pending") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Deletion request is no longer pending",
          });
        }

        await store.cancel(input.requestId, `Cancelled by user ${ctx.user.id}`);

        if (deps.reactivateTenant) {
          deps.reactivateTenant(ctx.tenantId, ctx.user.id);
        }

        const email = deps.getUserEmail(ctx.user.id);
        if (email && deps.getNotificationService) {
          deps.getNotificationService().notifyAccountDeletionCancelled(ctx.tenantId, email);
        }

        return { cancelled: true as const };
      }),
  });
}
