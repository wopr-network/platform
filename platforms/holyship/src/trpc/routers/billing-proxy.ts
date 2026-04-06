/**
 * Billing proxy — forwards billing operations to core server via core-client.
 * Holyship doesn't implement billing; it delegates to core.
 */
import { coreClient } from "../../services/core-client.js";
import { publicProcedure, router, tenantProcedure } from "../init.js";

function forTenant(ctx: { tenantId: string; user: { id: string } }) {
  return coreClient({ tenantId: ctx.tenantId, userId: ctx.user.id, product: "holyship" });
}

export const billingProxyRouter = router({
  creditsBalance: tenantProcedure.query(async ({ ctx }) => {
    return forTenant(ctx).billing.creditsBalance.query();
  }),

  creditsHistory: tenantProcedure.query(async ({ ctx }) => {
    return forTenant(ctx).billing.creditsHistory.query({});
  }),

  creditOptions: publicProcedure.query(async () => {
    return coreClient({ tenantId: "public", userId: "anonymous", product: "holyship" }).billing.creditOptions.query();
  }),

  supportedPaymentMethods: publicProcedure.query(async () => {
    return coreClient({
      tenantId: "public",
      userId: "anonymous",
      product: "holyship",
    }).billing.supportedPaymentMethods.query();
  }),

  plans: tenantProcedure.query(async ({ ctx }) => {
    return forTenant(ctx).billing.plans.query();
  }),

  currentPlan: tenantProcedure.query(async ({ ctx }) => {
    return forTenant(ctx).billing.currentPlan.query();
  }),

  spendingLimits: tenantProcedure.query(async ({ ctx }) => {
    return forTenant(ctx).billing.spendingLimits.query();
  }),

  billingInfo: tenantProcedure.query(async ({ ctx }) => {
    return forTenant(ctx).billing.billingInfo.query();
  }),

  autoTopupSettings: tenantProcedure.query(async ({ ctx }) => {
    return forTenant(ctx).billing.autoTopupSettings.query();
  }),
});
