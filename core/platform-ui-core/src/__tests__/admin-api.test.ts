import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- Mock tRPC client ----
// vi.hoisted ensures these are available when vi.mock factory runs (which is hoisted to top of file)

const {
  mockAffiliateSuppressions,
  mockAffiliateVelocity,
  mockAffiliateFingerprintClusters,
  mockAffiliateBlockFingerprint,
  mockDailyCost,
  mockPageCost,
  mockCacheHitRate,
  mockSessionCost,
} = vi.hoisted(() => ({
  mockAffiliateSuppressions: { query: vi.fn() },
  mockAffiliateVelocity: { query: vi.fn() },
  mockAffiliateFingerprintClusters: { query: vi.fn() },
  mockAffiliateBlockFingerprint: { mutate: vi.fn() },
  mockDailyCost: { query: vi.fn() },
  mockPageCost: { query: vi.fn() },
  mockCacheHitRate: { query: vi.fn() },
  mockSessionCost: { query: vi.fn() },
}));

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {
    admin: {
      affiliateSuppressions: mockAffiliateSuppressions,
      affiliateVelocity: mockAffiliateVelocity,
      affiliateFingerprintClusters: mockAffiliateFingerprintClusters,
      affiliateBlockFingerprint: mockAffiliateBlockFingerprint,
      inference: {
        dailyCost: mockDailyCost,
        pageCost: mockPageCost,
        cacheHitRate: mockCacheHitRate,
        sessionCost: mockSessionCost,
      },
    },
  },
  trpc: {},
}));

import {
  blockAffiliateFingerprint,
  getAffiliateFingerprintClusters,
  getAffiliateSuppressions,
  getAffiliateVelocity,
} from "@/lib/admin-affiliate-api";

import {
  getCacheStats,
  getDailyCost,
  getPageCost,
  getSessionCost,
} from "@/lib/admin-inference-api";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---- admin-affiliate-api ----

describe("admin-affiliate-api", () => {
  describe("getAffiliateSuppressions", () => {
    it("passes default limit and offset", async () => {
      const data = { events: [], total: 0 };
      mockAffiliateSuppressions.query.mockResolvedValue(data);

      const result = await getAffiliateSuppressions();

      expect(mockAffiliateSuppressions.query).toHaveBeenCalledWith({ limit: 50, offset: 0 });
      expect(result).toEqual(data);
    });

    it("passes custom limit and offset", async () => {
      const data = { events: [{ id: "s1" }], total: 1 };
      mockAffiliateSuppressions.query.mockResolvedValue(data);

      const result = await getAffiliateSuppressions(10, 5);

      expect(mockAffiliateSuppressions.query).toHaveBeenCalledWith({ limit: 10, offset: 5 });
      expect(result).toEqual(data);
    });

    it("propagates errors from the tRPC client", async () => {
      mockAffiliateSuppressions.query.mockRejectedValue(new Error("Server error"));

      await expect(getAffiliateSuppressions()).rejects.toThrow("Server error");
    });
  });

  describe("getAffiliateVelocity", () => {
    it("passes default caps", async () => {
      const data = [{ referrerTenantId: "t1", payoutCount30d: 5, payoutTotal30dCents: 1000 }];
      mockAffiliateVelocity.query.mockResolvedValue(data);

      const result = await getAffiliateVelocity();

      expect(mockAffiliateVelocity.query).toHaveBeenCalledWith({
        capReferrals: 20,
        capCredits: 20000,
      });
      expect(result).toEqual(data);
    });

    it("passes custom caps", async () => {
      mockAffiliateVelocity.query.mockResolvedValue([]);

      await getAffiliateVelocity(5, 500);

      expect(mockAffiliateVelocity.query).toHaveBeenCalledWith({
        capReferrals: 5,
        capCredits: 500,
      });
    });

    it("propagates errors", async () => {
      mockAffiliateVelocity.query.mockRejectedValue(new Error("fail"));

      await expect(getAffiliateVelocity()).rejects.toThrow("fail");
    });
  });

  describe("getAffiliateFingerprintClusters", () => {
    it("returns clusters", async () => {
      const data = [{ stripeFingerprint: "fp1", tenantIds: ["t1", "t2"] }];
      mockAffiliateFingerprintClusters.query.mockResolvedValue(data);

      const result = await getAffiliateFingerprintClusters();

      expect(mockAffiliateFingerprintClusters.query).toHaveBeenCalled();
      expect(result).toEqual(data);
    });

    it("propagates errors", async () => {
      mockAffiliateFingerprintClusters.query.mockRejectedValue(new Error("fail"));

      await expect(getAffiliateFingerprintClusters()).rejects.toThrow("fail");
    });
  });

  describe("blockAffiliateFingerprint", () => {
    it("sends fingerprint and returns success", async () => {
      mockAffiliateBlockFingerprint.mutate.mockResolvedValue({ success: true });

      const result = await blockAffiliateFingerprint("fp_abc");

      expect(mockAffiliateBlockFingerprint.mutate).toHaveBeenCalledWith({
        fingerprint: "fp_abc",
      });
      expect(result).toEqual({ success: true });
    });

    it("propagates errors", async () => {
      mockAffiliateBlockFingerprint.mutate.mockRejectedValue(new Error("forbidden"));

      await expect(blockAffiliateFingerprint("fp_abc")).rejects.toThrow("forbidden");
    });
  });
});

// ---- admin-inference-api ----

describe("admin-inference-api", () => {
  const since = Date.now() - 7 * 86400000;

  describe("getDailyCost", () => {
    it("passes since parameter and returns data", async () => {
      const data = [{ day: "2026-02-28", totalCostUsd: 1.5, sessionCount: 10 }];
      mockDailyCost.query.mockResolvedValue(data);

      const result = await getDailyCost(since);

      expect(mockDailyCost.query).toHaveBeenCalledWith({ since });
      expect(result).toEqual(data);
    });

    it("propagates errors", async () => {
      mockDailyCost.query.mockRejectedValue(new Error("fail"));

      await expect(getDailyCost(since)).rejects.toThrow("fail");
    });
  });

  describe("getPageCost", () => {
    it("passes since parameter and returns data", async () => {
      const data = [{ page: "/dashboard", totalCostUsd: 0.5, callCount: 20, avgCostUsd: 0.025 }];
      mockPageCost.query.mockResolvedValue(data);

      const result = await getPageCost(since);

      expect(mockPageCost.query).toHaveBeenCalledWith({ since });
      expect(result).toEqual(data);
    });

    it("propagates errors", async () => {
      mockPageCost.query.mockRejectedValue(new Error("fail"));

      await expect(getPageCost(since)).rejects.toThrow("fail");
    });
  });

  describe("getCacheStats", () => {
    it("passes since parameter and returns cache stats", async () => {
      const data = {
        hitRate: 0.85,
        cachedTokens: 1000,
        cacheWriteTokens: 200,
        uncachedTokens: 150,
      };
      mockCacheHitRate.query.mockResolvedValue(data);

      const result = await getCacheStats(since);

      expect(mockCacheHitRate.query).toHaveBeenCalledWith({ since });
      expect(result).toEqual(data);
    });

    it("propagates errors", async () => {
      mockCacheHitRate.query.mockRejectedValue(new Error("fail"));

      await expect(getCacheStats(since)).rejects.toThrow("fail");
    });
  });

  describe("getSessionCost", () => {
    it("passes since parameter and returns session summary", async () => {
      const data = { totalCostUsd: 10.0, totalSessions: 50, avgCostPerSession: 0.2 };
      mockSessionCost.query.mockResolvedValue(data);

      const result = await getSessionCost(since);

      expect(mockSessionCost.query).toHaveBeenCalledWith({ since });
      expect(result).toEqual(data);
    });

    it("propagates errors", async () => {
      mockSessionCost.query.mockRejectedValue(new Error("fail"));

      await expect(getSessionCost(since)).rejects.toThrow("fail");
    });
  });
});
