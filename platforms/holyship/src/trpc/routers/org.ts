/**
 * Org proxy — forwards organization operations to core server via core-client.
 * Holyship doesn't manage orgs or org billing; it delegates to core.
 */

import { z } from "zod";
import { coreClient } from "../../services/core-client.js";
import { orgMemberProcedure, protectedProcedure, router } from "../init.js";

function forUser(ctx: { user: { id: string } }, tenantId?: string) {
  return coreClient({ tenantId: tenantId ?? ctx.user.id, userId: ctx.user.id, product: "holyship" });
}

function forTenant(ctx: { tenantId: string; user: { id: string } }) {
  return coreClient({ tenantId: ctx.tenantId, userId: ctx.user.id, product: "holyship" });
}

export const orgRouter = router({
  // ─── Org CRUD ──────────────────────────────────────────────────────────
  getOrganization: protectedProcedure.query(async ({ ctx }) => {
    return forUser(ctx).org.getOrganization.query();
  }),

  listMyOrganizations: protectedProcedure.query(async ({ ctx }) => {
    return forUser(ctx).org.listMyOrganizations.query();
  }),

  acceptInvite: protectedProcedure.input(z.object({ token: z.string().min(1) })).mutation(async ({ ctx, input }) => {
    return forUser(ctx).org.acceptInvite.mutate(input);
  }),

  createOrganization: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(128),
        slug: z.string().min(3).max(48).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return forUser(ctx).org.createOrganization.mutate(input);
    }),

  updateOrganization: orgMemberProcedure
    .input(
      z.object({
        orgId: z.string().min(1),
        name: z.string().min(1).max(128).optional(),
        slug: z.string().min(3).max(48).optional(),
        billingEmail: z.string().email().max(255).optional().nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return forTenant(ctx).org.updateOrganization.mutate(input);
    }),

  deleteOrganization: orgMemberProcedure
    .input(z.object({ orgId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      return forTenant(ctx).org.deleteOrganization.mutate(input);
    }),

  inviteMember: orgMemberProcedure
    .input(
      z.object({
        orgId: z.string().min(1),
        email: z.string().email(),
        role: z.enum(["admin", "member"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return forTenant(ctx).org.inviteMember.mutate(input);
    }),

  revokeInvite: orgMemberProcedure
    .input(z.object({ orgId: z.string().min(1), inviteId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      return forTenant(ctx).org.revokeInvite.mutate(input);
    }),

  changeRole: orgMemberProcedure
    .input(
      z.object({
        orgId: z.string().min(1),
        userId: z.string().min(1),
        role: z.enum(["admin", "member"]),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return forTenant(ctx).org.changeRole.mutate(input);
    }),

  removeMember: orgMemberProcedure
    .input(z.object({ orgId: z.string().min(1), userId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      return forTenant(ctx).org.removeMember.mutate(input);
    }),

  transferOwnership: orgMemberProcedure
    .input(z.object({ orgId: z.string().min(1), userId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      return forTenant(ctx).org.transferOwnership.mutate(input);
    }),

  // ─── Org billing — all delegated to core ────────────────────────────────
  orgBillingBalance: orgMemberProcedure.input(z.object({ orgId: z.string().min(1) })).query(async ({ input, ctx }) => {
    return coreClient({
      tenantId: input.orgId,
      userId: ctx.user.id,
      product: "holyship",
    }).billing.creditsBalance.query();
  }),

  orgBillingInfo: orgMemberProcedure.input(z.object({ orgId: z.string().min(1) })).query(async ({ input, ctx }) => {
    return coreClient({ tenantId: input.orgId, userId: ctx.user.id, product: "holyship" }).billing.billingInfo.query();
  }),

  orgMemberUsage: orgMemberProcedure.input(z.object({ orgId: z.string().min(1) })).query(async ({ input, ctx }) => {
    return coreClient({ tenantId: input.orgId, userId: ctx.user.id, product: "holyship" }).billing.creditsHistory.query(
      {},
    );
  }),

  orgTopupCheckout: orgMemberProcedure
    .input(
      z.object({
        orgId: z.string().min(1),
        priceId: z.string().min(1).max(256),
        successUrl: z.string().url().max(2048),
        cancelUrl: z.string().url().max(2048),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      return coreClient({
        tenantId: input.orgId,
        userId: ctx.user.id,
        product: "holyship",
      }).billing.creditsCheckout.mutate({
        priceId: input.priceId,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
      });
    }),

  orgSetupIntent: orgMemberProcedure
    .input(z.object({ orgId: z.string().min(1), returnUrl: z.string().url() }))
    .mutation(async ({ input, ctx }) => {
      return coreClient({
        tenantId: input.orgId,
        userId: ctx.user.id,
        product: "holyship",
      }).billing.portalSession.mutate({ returnUrl: input.returnUrl });
    }),
});
