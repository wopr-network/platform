import type { Mock } from "vitest";
import { describe, expect, it, vi } from "vitest";

interface MockQuery {
  query: Mock;
}
interface MockMutate {
  mutate: Mock;
}

interface MockTrpcVanilla {
  billing: {
    creditsBalance: MockQuery;
    billingInfo: MockQuery;
  };
  org: {
    orgTopupCheckout: MockMutate;
    orgRemovePaymentMethod: MockMutate;
  };
}

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {
    billing: {
      creditsBalance: { query: vi.fn() },
      billingInfo: { query: vi.fn() },
    },
    org: {
      orgTopupCheckout: { mutate: vi.fn() },
      orgRemovePaymentMethod: { mutate: vi.fn() },
    },
  },
}));

describe("org-billing-api null guards", () => {
  it("getOrgCreditBalance handles empty response", async () => {
    const { trpcVanilla } = await import("@/lib/trpc");
    const { billing } = trpcVanilla as unknown as MockTrpcVanilla;
    billing.creditsBalance.query.mockResolvedValue({});

    const { getOrgCreditBalance } = await import("@/lib/org-billing-api");
    const result = await getOrgCreditBalance("org-1");
    expect(result.balance).toBe(0);
    expect(result.dailyBurn).toBe(0);
    expect(result.runway).toBeNull();
  });

  it("getOrgMemberUsage returns stub with empty members", async () => {
    const { getOrgMemberUsage } = await import("@/lib/org-billing-api");
    const result = await getOrgMemberUsage("org-1");
    expect(result.members).toEqual([]);
  });

  it("getOrgBillingInfo handles empty response", async () => {
    const { trpcVanilla } = await import("@/lib/trpc");
    const { billing } = trpcVanilla as unknown as MockTrpcVanilla;
    billing.billingInfo.query.mockResolvedValue({});

    const { getOrgBillingInfo } = await import("@/lib/org-billing-api");
    const result = await getOrgBillingInfo("org-1");
    expect(result.paymentMethods).toEqual([]);
    expect(result.invoices).toEqual([]);
  });

  it("removeOrgPaymentMethod calls mutate with correct args", async () => {
    const { trpcVanilla } = await import("@/lib/trpc");
    const { org } = trpcVanilla as unknown as MockTrpcVanilla;
    org.orgRemovePaymentMethod.mutate.mockResolvedValue({ removed: true });

    const { removeOrgPaymentMethod } = await import("@/lib/org-billing-api");
    const result = await removeOrgPaymentMethod("org-1", "pm_123");
    expect(result).toEqual({ removed: true });
    expect(org.orgRemovePaymentMethod.mutate).toHaveBeenCalledWith({
      orgId: "org-1",
      paymentMethodId: "pm_123",
    });
  });
});
