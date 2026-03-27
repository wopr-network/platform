import type { Mock } from "vitest";
import { describe, expect, it, vi } from "vitest";

interface MockQuery {
  query: Mock;
}
interface MockMutate {
  mutate: Mock;
}

interface MockTrpcVanilla {
  fleet: {
    listInstances: MockQuery;
    getInstance: MockQuery;
    createInstance: MockMutate;
    controlInstance: MockMutate;
    getInstanceHealth: MockQuery;
    getInstanceLogs: MockQuery;
    getInstanceMetrics: MockQuery;
    listTemplates: MockQuery;
  };
  billing: {
    creditsBalance: MockQuery;
    creditsHistory: MockQuery;
    creditOptions: MockQuery;
    affiliateStats: MockQuery;
    affiliateReferrals: MockQuery;
    usageSummary: MockQuery;
    currentPlan: MockQuery;
    providerCosts: MockQuery;
    billingInfo: MockQuery;
    creditsCheckout: MockMutate;
    inferenceMode: MockQuery;
    hostedUsageSummary: MockQuery;
    hostedUsageEvents: MockQuery;
    updateBillingEmail: MockMutate;
    removePaymentMethod: MockMutate;
    setDefaultPaymentMethod: MockMutate;
    portalSession: MockMutate;
    spendingLimits: MockQuery;
    updateSpendingLimits: MockMutate;
    cryptoCheckout: MockMutate;
    autoTopupSettings: MockQuery;
    updateAutoTopupSettings: MockMutate;
  };
}

// Mock trpcVanilla before importing api module
vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {
    fleet: {
      listInstances: { query: vi.fn() },
      getInstance: { query: vi.fn() },
      createInstance: { mutate: vi.fn() },
      controlInstance: { mutate: vi.fn() },
      getInstanceHealth: { query: vi.fn() },
      getInstanceLogs: { query: vi.fn() },
      getInstanceMetrics: { query: vi.fn() },
      listTemplates: { query: vi.fn() },
    },
    billing: {
      creditsBalance: { query: vi.fn() },
      creditsHistory: { query: vi.fn() },
      creditOptions: { query: vi.fn() },
      affiliateStats: { query: vi.fn() },
      affiliateReferrals: { query: vi.fn() },
      usageSummary: { query: vi.fn() },
      currentPlan: { query: vi.fn() },
      providerCosts: { query: vi.fn() },
      billingInfo: { query: vi.fn() },
      creditsCheckout: { mutate: vi.fn() },
      inferenceMode: { query: vi.fn() },
      hostedUsageSummary: { query: vi.fn() },
      hostedUsageEvents: { query: vi.fn() },
      updateBillingEmail: { mutate: vi.fn() },
      removePaymentMethod: { mutate: vi.fn() },
      setDefaultPaymentMethod: { mutate: vi.fn() },
      portalSession: { mutate: vi.fn() },
      spendingLimits: { query: vi.fn() },
      updateSpendingLimits: { mutate: vi.fn() },
      cryptoCheckout: { mutate: vi.fn() },
      autoTopupSettings: { query: vi.fn() },
      updateAutoTopupSettings: { mutate: vi.fn() },
    },
  },
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: vi.fn(() => ({ data: null, isPending: false })),
}));

vi.mock("@/lib/fetch-utils", () => ({
  handleUnauthorized: vi.fn(),
  UnauthorizedError: class extends Error {},
}));

vi.mock("@/lib/tenant-context", () => ({
  getActiveTenantId: vi.fn(() => ""),
}));

describe("API null guards", () => {
  it("listInstances handles missing bots array", async () => {
    const { trpcVanilla } = await import("@/lib/trpc");
    const { fleet } = trpcVanilla as unknown as MockTrpcVanilla;
    fleet.listInstances.query.mockResolvedValue({});

    const { listInstances } = await import("@/lib/api");
    const result = await listInstances();
    expect(result).toEqual([]);
  });

  it("listInstances handles null bots", async () => {
    const { trpcVanilla } = await import("@/lib/trpc");
    const { fleet } = trpcVanilla as unknown as MockTrpcVanilla;
    fleet.listInstances.query.mockResolvedValue({ bots: null });

    const { listInstances } = await import("@/lib/api");
    const result = await listInstances();
    expect(result).toEqual([]);
  });

  it("getFleetHealth handles missing bots array", async () => {
    const { trpcVanilla } = await import("@/lib/trpc");
    const { fleet } = trpcVanilla as unknown as MockTrpcVanilla;
    fleet.listInstances.query.mockResolvedValue({});

    const { getFleetHealth } = await import("@/lib/api");
    const result = await getFleetHealth();
    expect(result).toEqual([]);
  });

  it("getInstanceMetrics handles null stats", async () => {
    const { trpcVanilla } = await import("@/lib/trpc");
    const { fleet } = trpcVanilla as unknown as MockTrpcVanilla;
    fleet.getInstanceMetrics.query.mockResolvedValue({ id: "x", stats: null });

    const { getInstanceMetrics } = await import("@/lib/api");
    const result = await getInstanceMetrics("x");
    expect(result.timeseries[0].memoryMb).toBe(0);
  });

  it("getCreditBalance handles empty response", async () => {
    const { trpcVanilla } = await import("@/lib/trpc");
    const { billing } = trpcVanilla as unknown as MockTrpcVanilla;
    billing.creditsBalance.query.mockResolvedValue({});

    const { getCreditBalance } = await import("@/lib/api");
    const result = await getCreditBalance();
    expect(result.balance).toBe(0);
    expect(result.dailyBurn).toBe(0);
    expect(result.runway).toBeNull();
  });

  it("getCreditHistory handles empty response", async () => {
    const { trpcVanilla } = await import("@/lib/trpc");
    const { billing } = trpcVanilla as unknown as MockTrpcVanilla;
    billing.creditsHistory.query.mockResolvedValue({});

    const { getCreditHistory } = await import("@/lib/api");
    const result = await getCreditHistory();
    expect(result.transactions).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  it("getAffiliateStats handles empty response", async () => {
    const { trpcVanilla } = await import("@/lib/trpc");
    const { billing } = trpcVanilla as unknown as MockTrpcVanilla;
    billing.affiliateStats.query.mockResolvedValue({});

    const { getAffiliateStats } = await import("@/lib/api");
    const result = await getAffiliateStats();
    expect(result.referralCode).toBe("");
    expect(result.referralUrl).toBe("");
    expect(result.totalReferred).toBe(0);
    expect(result.totalConverted).toBe(0);
    expect(result.totalEarnedCents).toBe(0);
  });

  it("getAffiliateReferrals handles empty response", async () => {
    const { trpcVanilla } = await import("@/lib/trpc");
    const { billing } = trpcVanilla as unknown as MockTrpcVanilla;
    billing.affiliateReferrals.query.mockResolvedValue({});

    const { getAffiliateReferrals } = await import("@/lib/api");
    const result = await getAffiliateReferrals();
    expect(result.referrals).toEqual([]);
    expect(result.total).toBe(0);
  });

  it("getDividendStats handles partial response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      }),
    );

    const { getDividendStats } = await import("@/lib/api");
    const result = await getDividendStats();
    expect(result.poolCents).toBe(0);
    expect(result.activeUsers).toBe(0);
    expect(result.perUserCents).toBe(0);
    expect(result.userEligible).toBe(false);
  });

  it("getBillingUsageSummary handles empty response", async () => {
    const { trpcVanilla } = await import("@/lib/trpc");
    const { billing } = trpcVanilla as unknown as MockTrpcVanilla;
    billing.usageSummary.query.mockResolvedValue({});

    const { getBillingUsageSummary } = await import("@/lib/api");
    const result = await getBillingUsageSummary();
    expect(result.periodStart).toBe("");
    expect(result.totalSpend).toBe(0);
    expect(result.planName).toBe("");
  });

  it("getDividendHistory handles empty response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      }),
    );

    const { getDividendHistory } = await import("@/lib/api");
    const result = await getDividendHistory();
    expect(result.dividends).toEqual([]);
  });

  it("getInstanceLogs handles empty logs array", async () => {
    const { trpcVanilla } = await import("@/lib/trpc");
    const { fleet } = trpcVanilla as unknown as MockTrpcVanilla;
    fleet.getInstanceLogs.query.mockResolvedValue({});

    const { getInstanceLogs } = await import("@/lib/api");
    const result = await getInstanceLogs("x");
    expect(result).toEqual([]);
  });
});
