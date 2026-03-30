/**
 * tRPC org router — organization settings, member management, invites,
 * org-level billing queries.
 *
 * Pure platform-core — product-specific fleet sync is injected via callbacks.
 */

import { TRPCError } from "@trpc/server";
import type { IPaymentProcessor } from "../../billing/index.js";
import { logger } from "../../config/logger.js";
import { Credit } from "../../credits/index.js";
import type { ILedger } from "../../credits/ledger.js";
import type { IAuthUserRepository } from "../../db/auth-user-repository.js";
import type { IMeterAggregator } from "../../metering/index.js";
import type { CreditPriceMap } from "../../monetization/index.js";
import { assertSafeRedirectUrl } from "../../security/index.js";
import type { OrgService } from "../../tenancy/org-service.js";
import { orgMemberProcedure, protectedProcedure, router, type TRPCContext } from "../init.js";

// Narrowed context after protectedProcedure middleware (user is non-optional)
type ProtectedCtx = TRPCContext & { user: NonNullable<TRPCContext["user"]> };
// Narrowed context after orgMemberProcedure middleware (user + orgRole)
type OrgMemberCtx = ProtectedCtx & { orgRole: "owner" | "admin" | "member" };

import { z } from "zod";

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface OrgRouterDeps {
  orgService: OrgService;
  authUserRepo: IAuthUserRepository;
  creditLedger?: ILedger;
  meterAggregator?: IMeterAggregator;
  processor?: IPaymentProcessor;
  priceMap?: CreditPriceMap;
  /** Called after an invite is created — sends the invite email (best-effort). */
  onInviteCreated?: (orgId: string, inviteId: string, email: string) => void;
  /** Called after a member is added/removed/role-changed — syncs to running instances (best-effort). */
  onMemberChanged?: (
    type: "added" | "removed" | "role-changed",
    orgId: string,
    userId: string,
    ctx: { name?: string; email?: string; role?: string },
  ) => void;
}

// ---------------------------------------------------------------------------
// Factory — DI-based
// ---------------------------------------------------------------------------

export function createOrgRouter(d: OrgRouterDeps) {
  return router({
    getOrganization: protectedProcedure.query(async ({ ctx }: { ctx: ProtectedCtx }) => {
      const name = ("name" in ctx.user ? (ctx.user.name as string | undefined) : undefined) ?? "User";
      const email = ("email" in ctx.user ? (ctx.user.email as string | undefined) : undefined) ?? "";
      const org = await d.orgService.getOrCreatePersonalOrg(ctx.user.id, name);
      const members = org.members.map((m) => {
        if (m.userId === ctx.user.id) {
          return { ...m, name, email };
        }
        return m;
      });
      return { ...org, members };
    }),

    listMyOrganizations: protectedProcedure.query(async ({ ctx }: { ctx: ProtectedCtx }) => {
      return d.orgService.listOrgsForUser(ctx.user.id) as Promise<Array<{ orgId: string; role: string }>>;
    }),

    acceptInvite: protectedProcedure
      .input(z.object({ token: z.string().min(1) }))
      .mutation(async ({ ctx, input }: { ctx: ProtectedCtx; input: { token: string } }) => {
        const result = (await d.orgService.acceptInvite(input.token, ctx.user.id)) as { orgId: string; role: string };
        const { orgId, role } = result;
        if (d.onMemberChanged) {
          const name = ("name" in ctx.user ? (ctx.user.name as string | undefined) : undefined) ?? "";
          const email = ("email" in ctx.user ? (ctx.user.email as string | undefined) : undefined) ?? "";
          try {
            d.onMemberChanged("added", orgId, ctx.user.id, { name, email, role });
          } catch (err) {
            logger.error("onMemberChanged callback failed", { orgId, err });
          }
        }
        return { orgId, role };
      }),

    createOrganization: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1, "Organization name is required").max(128),
          slug: z.string().min(3).max(48).optional(),
        }),
      )
      .mutation(async ({ input, ctx }: { input: { name: string; slug?: string }; ctx: ProtectedCtx }) => {
        return d.orgService.createOrg(ctx.user.id, input.name, input.slug);
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
      .mutation(
        ({
          input,
          ctx,
        }: {
          input: { orgId: string; name?: string; slug?: string; billingEmail?: string | null };
          ctx: OrgMemberCtx;
        }) => {
          return d.orgService.updateOrg(input.orgId, ctx.user.id, {
            name: input.name,
            slug: input.slug,
            billingEmail: input.billingEmail,
          });
        },
      ),

    deleteOrganization: orgMemberProcedure
      .input(z.object({ orgId: z.string().min(1) }))
      .mutation(async ({ input, ctx }: { input: { orgId: string }; ctx: OrgMemberCtx }) => {
        await d.orgService.deleteOrg(input.orgId, ctx.user.id);
        return { deleted: true };
      }),

    inviteMember: orgMemberProcedure
      .input(
        z.object({
          orgId: z.string().min(1),
          email: z.string().email(),
          role: z.enum(["admin", "member"]),
        }),
      )
      .mutation(
        async ({
          input,
          ctx,
        }: {
          input: { orgId: string; email: string; role: "admin" | "member" };
          ctx: OrgMemberCtx;
        }) => {
          const invite = await d.orgService.inviteMember(input.orgId, ctx.user.id, input.email, input.role);
          if (d.onInviteCreated) {
            try {
              d.onInviteCreated(input.orgId, invite.id, invite.email);
            } catch (err) {
              logger.error("Failed to send invite email", { err });
            }
          }
          return {
            id: invite.id,
            email: invite.email,
            role: invite.role,
            invitedBy: invite.invitedBy,
            expiresAt: new Date(invite.expiresAt).toISOString(),
            createdAt: new Date(invite.createdAt).toISOString(),
          };
        },
      ),

    revokeInvite: orgMemberProcedure
      .input(z.object({ orgId: z.string().min(1), inviteId: z.string().min(1) }))
      .mutation(async ({ input, ctx }: { input: { orgId: string; inviteId: string }; ctx: OrgMemberCtx }) => {
        await d.orgService.revokeInvite(input.orgId, ctx.user.id, input.inviteId);
        return { revoked: true };
      }),

    changeRole: orgMemberProcedure
      .input(
        z.object({
          orgId: z.string().min(1),
          userId: z.string().min(1),
          role: z.enum(["admin", "member"]),
        }),
      )
      .mutation(
        async ({
          input,
          ctx,
        }: {
          input: { orgId: string; userId: string; role: "admin" | "member" };
          ctx: OrgMemberCtx;
        }) => {
          await d.orgService.changeRole(input.orgId, ctx.user.id, input.userId, input.role);
          if (d.onMemberChanged) {
            try {
              d.onMemberChanged("role-changed", input.orgId, input.userId, { role: input.role });
            } catch (err) {
              logger.error("onMemberChanged callback failed", { orgId: input.orgId, err });
            }
          }
          return { updated: true };
        },
      ),

    removeMember: orgMemberProcedure
      .input(z.object({ orgId: z.string().min(1), userId: z.string().min(1) }))
      .mutation(async ({ input, ctx }: { input: { orgId: string; userId: string }; ctx: OrgMemberCtx }) => {
        await d.orgService.removeMember(input.orgId, ctx.user.id, input.userId);
        if (d.onMemberChanged) {
          try {
            d.onMemberChanged("removed", input.orgId, input.userId, {});
          } catch (err) {
            logger.error("onMemberChanged callback failed", { orgId: input.orgId, err });
          }
        }
        return { removed: true };
      }),

    transferOwnership: orgMemberProcedure
      .input(z.object({ orgId: z.string().min(1), userId: z.string().min(1) }))
      .mutation(async ({ input, ctx }: { input: { orgId: string; userId: string }; ctx: OrgMemberCtx }) => {
        await d.orgService.transferOwnership(input.orgId, ctx.user.id, input.userId);
        return { transferred: true };
      }),

    // -------------------------------------------------------------------------
    // Org billing — delegates to billing infrastructure using orgId as tenant
    // -------------------------------------------------------------------------

    orgBillingBalance: orgMemberProcedure
      .input(z.object({ orgId: z.string().min(1) }))
      .query(async ({ input }: { input: { orgId: string } }) => {
        if (!d.creditLedger || !d.meterAggregator) {
          return { balanceCents: 0, dailyBurnCents: 0, runwayDays: null };
        }
        const tenant = input.orgId;
        const balance = await d.creditLedger.balance(tenant);
        const balanceCents = balance.toCentsRounded();
        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const { totalCharge } = await d.meterAggregator.getTenantTotal(tenant, sevenDaysAgo);
        const dailyBurnCents = Credit.fromRaw(Math.round(totalCharge / 7)).toCentsRounded();
        const runwayDays = dailyBurnCents > 0 ? Math.floor(balanceCents / dailyBurnCents) : null;
        return { balanceCents, dailyBurnCents, runwayDays };
      }),

    orgBillingInfo: orgMemberProcedure
      .input(z.object({ orgId: z.string().min(1) }))
      .query(async ({ input }: { input: { orgId: string } }) => {
        if (!d.processor) {
          return { paymentMethods: [], invoices: [] };
        }
        try {
          const savedMethods = await d.processor.listPaymentMethods(input.orgId);
          const paymentMethods = savedMethods.map((pm) => ({
            id: pm.id,
            brand: "",
            last4: pm.label.match(/\d{4}$/)?.[0] ?? "",
            expiryMonth: 0,
            expiryYear: 0,
            isDefault: pm.isDefault,
          }));
          const invoiceList = await d.processor.listInvoices(input.orgId);
          return {
            paymentMethods,
            invoices: invoiceList.map((inv) => ({
              id: inv.id,
              date: inv.date,
              amountCents: inv.amountCents,
              status: inv.status,
              downloadUrl: inv.downloadUrl,
            })),
          };
        } catch {
          return { paymentMethods: [], invoices: [] };
        }
      }),

    orgMemberUsage: orgMemberProcedure
      .input(z.object({ orgId: z.string().min(1) }))
      .query(async ({ input }: { input: { orgId: string } }) => {
        const periodStart = new Date();
        periodStart.setDate(1);
        periodStart.setHours(0, 0, 0, 0);
        if (!d.creditLedger) {
          return { orgId: input.orgId, periodStart: periodStart.toISOString(), members: [] };
        }
        const members = await d.creditLedger.memberUsage(input.orgId);
        return {
          orgId: input.orgId,
          periodStart: periodStart.toISOString(),
          members: members.map((m) => ({
            memberId: m.userId,
            name: "",
            email: "",
            creditsConsumedCents: m.totalDebit.toCents(),
            lastActiveAt: null,
          })),
        };
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
      .mutation(
        async ({ input }: { input: { orgId: string; priceId: string; successUrl: string; cancelUrl: string } }) => {
          if (!d.processor) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Billing not configured" });
          }
          try {
            assertSafeRedirectUrl(input.successUrl);
            assertSafeRedirectUrl(input.cancelUrl);
          } catch {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid redirect URL" });
          }
          const session = await d.processor.createCheckoutSession({
            tenant: input.orgId,
            priceId: input.priceId,
            successUrl: input.successUrl,
            cancelUrl: input.cancelUrl,
          });
          return { url: session.url, sessionId: session.id };
        },
      ),

    orgSetupIntent: orgMemberProcedure
      .input(z.object({ orgId: z.string().min(1) }))
      .mutation(async ({ input }: { input: { orgId: string } }) => {
        if (!d.processor) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Billing not configured" });
        }
        const intent = await d.processor.setupPaymentMethod(input.orgId);
        return { clientSecret: intent.clientSecret };
      }),
  });
}
