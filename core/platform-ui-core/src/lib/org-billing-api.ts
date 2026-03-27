import type { Invoice } from "./api";
import { trpcVanilla } from "./trpc";

// ---- Exported types ----

export interface OrgCreditBalance {
  balance: number;
  dailyBurn: number;
  runway: number | null;
}

export interface OrgMemberUsageRow {
  memberId: string;
  name: string;
  email: string;
  creditsConsumed: number;
  lastActiveAt: string | null;
}

// ---- API calls ----

export async function getOrgCreditBalance(_orgId: string): Promise<OrgCreditBalance> {
  const res = await trpcVanilla.billing.creditsBalance.query({});
  return {
    balance:
      (res?.balance_credits ?? (res as { balance_cents?: number })?.balance_cents ?? 0) / 100,
    dailyBurn:
      (res?.daily_burn_credits ?? (res as { daily_burn_cents?: number })?.daily_burn_cents ?? 0) /
      100,
    runway: (res as { runway_days?: number | null })?.runway_days ?? null,
  };
}

export async function getOrgMemberUsage(orgId: string): Promise<{
  orgId: string;
  periodStart: string;
  members: OrgMemberUsageRow[];
}> {
  // org.orgMemberUsage not yet implemented — return empty
  return {
    orgId,
    periodStart: new Date().toISOString(),
    members: [],
  };
}

export async function getOrgBillingInfo(_orgId: string) {
  try {
    const res = await trpcVanilla.billing.billingInfo.query({});
    return {
      paymentMethods: Array.isArray(res?.paymentMethods) ? res.paymentMethods : [],
      invoices: Array.isArray(res?.invoices)
        ? (res.invoices as Invoice[]).map((inv) => ({
            id: inv.id ?? "",
            date: inv.date ?? "",
            amount: inv.amount ?? 0,
            status: inv.status ?? ("paid" as const),
            downloadUrl: inv.downloadUrl ?? "",
            hostedUrl: inv.hostedUrl ?? "",
            hostedLineItems: inv.hostedLineItems,
          }))
        : ([] as Invoice[]),
    };
  } catch {
    return { paymentMethods: [], invoices: [] as Invoice[] };
  }
}

export async function createOrgTopupCheckout(
  orgId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string,
) {
  return trpcVanilla.org.orgTopupCheckout.mutate({ orgId, priceId, successUrl, cancelUrl });
}

export async function removeOrgPaymentMethod(
  orgId: string,
  paymentMethodId: string,
): Promise<{ removed: boolean }> {
  return trpcVanilla.org.orgRemovePaymentMethod.mutate({ orgId, paymentMethodId });
}

export async function setOrgDefaultPaymentMethod(
  orgId: string,
  paymentMethodId: string,
): Promise<void> {
  await trpcVanilla.org.orgSetDefaultPaymentMethod.mutate({ orgId, paymentMethodId });
}

export async function createOrgSetupIntent(orgId: string): Promise<{ clientSecret: string }> {
  const result = await trpcVanilla.org.orgSetupIntent.mutate({ orgId });
  if (!result?.clientSecret || typeof result.clientSecret !== "string") {
    throw new Error("orgSetupIntent: missing clientSecret in response");
  }
  return result as { clientSecret: string };
}
