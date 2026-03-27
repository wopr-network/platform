import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {
    billing: {
      creditsBalance: {
        query: vi.fn().mockResolvedValue({
          balance_credits: 5000,
          daily_burn_credits: 100,
          runway_days: 50,
        }),
      },
      billingInfo: {
        query: vi.fn().mockResolvedValue({ paymentMethods: [], invoices: [] }),
      },
    },
    org: {
      orgTopupCheckout: {
        mutate: vi.fn().mockResolvedValue({
          url: "https://checkout.stripe.com/test",
          sessionId: "sess_1",
        }),
      },
      orgSetDefaultPaymentMethod: {
        mutate: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

import {
  createOrgTopupCheckout,
  getOrgBillingInfo,
  getOrgCreditBalance,
  getOrgMemberUsage,
} from "@/lib/org-billing-api";

describe("org-billing-api", () => {
  it("getOrgCreditBalance converts credits to dollars", async () => {
    const result = await getOrgCreditBalance("org-1");
    expect(result.balance).toBe(50);
    expect(result.dailyBurn).toBe(1);
    expect(result.runway).toBe(50);
  });

  it("getOrgMemberUsage returns member array", async () => {
    const result = await getOrgMemberUsage("org-1");
    expect(result.orgId).toBe("org-1");
    expect(Array.isArray(result.members)).toBe(true);
  });

  it("getOrgBillingInfo returns payment methods and invoices", async () => {
    const result = await getOrgBillingInfo("org-1");
    expect(result).toHaveProperty("paymentMethods");
    expect(result).toHaveProperty("invoices");
  });

  it("createOrgTopupCheckout returns checkout URL", async () => {
    const result = await createOrgTopupCheckout(
      "org-1",
      "price_1",
      "https://ok.com",
      "https://cancel.com",
    );
    expect(result.url).toContain("stripe.com");
  });
});
