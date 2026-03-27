import { afterEach, describe, expect, it, vi } from "vitest";

const {
  mockCreditsBalanceQuery,
  mockBillingInfoQuery,
  mockOrgTopupCheckoutMutate,
  mockOrgSetDefaultPaymentMethodMutate,
} = vi.hoisted(() => ({
  mockCreditsBalanceQuery: vi.fn(),
  mockBillingInfoQuery: vi.fn(),
  mockOrgTopupCheckoutMutate: vi.fn(),
  mockOrgSetDefaultPaymentMethodMutate: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {
    billing: {
      creditsBalance: { query: mockCreditsBalanceQuery },
      billingInfo: { query: mockBillingInfoQuery },
    },
    org: {
      orgTopupCheckout: { mutate: mockOrgTopupCheckoutMutate },
      orgSetDefaultPaymentMethod: { mutate: mockOrgSetDefaultPaymentMethodMutate },
    },
  },
  trpc: {},
}));

import {
  createOrgTopupCheckout,
  getOrgBillingInfo,
  getOrgCreditBalance,
  getOrgMemberUsage,
  setOrgDefaultPaymentMethod,
} from "@/lib/org-billing-api";

describe("getOrgCreditBalance", () => {
  afterEach(() => vi.clearAllMocks());

  it("converts credits to dollars and returns balance", async () => {
    mockCreditsBalanceQuery.mockResolvedValue({
      balance_credits: 5000,
      daily_burn_credits: 200,
      runway_days: 25,
    });

    const result = await getOrgCreditBalance("org-1");
    expect(result).toEqual({
      balance: 50,
      dailyBurn: 2,
      runway: 25,
    });
    expect(mockCreditsBalanceQuery).toHaveBeenCalledWith({});
  });

  it("falls back to legacy cents fields", async () => {
    mockCreditsBalanceQuery.mockResolvedValue({
      balance_cents: 3000,
      daily_burn_cents: 100,
      runway_days: 30,
    });

    const result = await getOrgCreditBalance("org-1");
    expect(result).toEqual({
      balance: 30,
      dailyBurn: 1,
      runway: 30,
    });
  });

  it("defaults to zero balance when response fields are null", async () => {
    mockCreditsBalanceQuery.mockResolvedValue({
      balance_credits: null,
      daily_burn_credits: null,
      runway_days: null,
    });

    const result = await getOrgCreditBalance("org-1");
    expect(result).toEqual({
      balance: 0,
      dailyBurn: 0,
      runway: null,
    });
  });

  it("defaults to zero balance when response fields are undefined", async () => {
    mockCreditsBalanceQuery.mockResolvedValue({});

    const result = await getOrgCreditBalance("org-1");
    expect(result).toEqual({
      balance: 0,
      dailyBurn: 0,
      runway: null,
    });
  });

  it("propagates tRPC errors", async () => {
    mockCreditsBalanceQuery.mockRejectedValue(new Error("Forbidden"));
    await expect(getOrgCreditBalance("org-1")).rejects.toThrow("Forbidden");
  });
});

describe("getOrgMemberUsage", () => {
  it("returns stub data with empty members array", async () => {
    const result = await getOrgMemberUsage("org-1");
    expect(result.orgId).toBe("org-1");
    expect(result.members).toEqual([]);
    expect(result.periodStart).toBeTruthy();
  });
});

describe("getOrgBillingInfo", () => {
  afterEach(() => vi.clearAllMocks());

  it("returns payment methods and invoices", async () => {
    const paymentMethods = [{ id: "pm-1", brand: "visa", last4: "4242" }];
    const invoices = [
      {
        id: "inv-1",
        amount: 5000,
        status: "paid",
        date: "2026-03-01",
        downloadUrl: "https://invoice.example.com/inv-1.pdf",
        hostedUrl: "https://invoice.example.com/inv-1",
        hostedLineItems: undefined,
      },
    ];
    mockBillingInfoQuery.mockResolvedValue({ paymentMethods, invoices });

    const result = await getOrgBillingInfo("org-1");
    expect(result).toEqual({
      paymentMethods,
      invoices: [
        {
          id: "inv-1",
          date: "2026-03-01",
          amount: 5000,
          status: "paid",
          downloadUrl: "https://invoice.example.com/inv-1.pdf",
          hostedUrl: "https://invoice.example.com/inv-1",
          hostedLineItems: undefined,
        },
      ],
    });
    expect(mockBillingInfoQuery).toHaveBeenCalledWith({});
  });

  it("defaults to empty arrays when fields are null", async () => {
    mockBillingInfoQuery.mockResolvedValue({
      paymentMethods: null,
      invoices: null,
    });

    const result = await getOrgBillingInfo("org-1");
    expect(result).toEqual({ paymentMethods: [], invoices: [] });
  });

  it("defaults to empty arrays when fields are undefined", async () => {
    mockBillingInfoQuery.mockResolvedValue({});

    const result = await getOrgBillingInfo("org-1");
    expect(result).toEqual({ paymentMethods: [], invoices: [] });
  });

  it("returns defaults on tRPC error instead of throwing", async () => {
    mockBillingInfoQuery.mockRejectedValue(new Error("Not found"));
    const result = await getOrgBillingInfo("org-1");
    expect(result).toEqual({ paymentMethods: [], invoices: [] });
  });
});

describe("createOrgTopupCheckout", () => {
  afterEach(() => vi.clearAllMocks());

  it("passes all parameters to tRPC mutate", async () => {
    const checkoutUrl = "https://checkout.stripe.com/session-123";
    mockOrgTopupCheckoutMutate.mockResolvedValue(checkoutUrl);

    const result = await createOrgTopupCheckout(
      "org-1",
      "price-abc",
      "https://app.example.com/billing?success=true",
      "https://app.example.com/billing?canceled=true",
    );
    expect(result).toBe(checkoutUrl);
    expect(mockOrgTopupCheckoutMutate).toHaveBeenCalledWith({
      orgId: "org-1",
      priceId: "price-abc",
      successUrl: "https://app.example.com/billing?success=true",
      cancelUrl: "https://app.example.com/billing?canceled=true",
    });
  });

  it("propagates tRPC errors", async () => {
    mockOrgTopupCheckoutMutate.mockRejectedValue(new Error("Invalid price"));
    await expect(
      createOrgTopupCheckout("org-1", "bad-price", "http://s", "http://c"),
    ).rejects.toThrow("Invalid price");
  });
});

describe("setOrgDefaultPaymentMethod", () => {
  afterEach(() => vi.clearAllMocks());

  it("calls tRPC mutate with orgId and paymentMethodId", async () => {
    mockOrgSetDefaultPaymentMethodMutate.mockResolvedValue(undefined);

    await setOrgDefaultPaymentMethod("org-1", "pm-2");
    expect(mockOrgSetDefaultPaymentMethodMutate).toHaveBeenCalledWith({
      orgId: "org-1",
      paymentMethodId: "pm-2",
    });
  });

  it("propagates tRPC errors", async () => {
    mockOrgSetDefaultPaymentMethodMutate.mockRejectedValue(new Error("Forbidden"));
    await expect(setOrgDefaultPaymentMethod("org-1", "pm-2")).rejects.toThrow("Forbidden");
  });
});
