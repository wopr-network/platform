import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BillingHealthDashboard } from "./billing-health-dashboard";

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {
    admin: {
      billingHealth: {
        query: vi.fn().mockResolvedValue({
          timestamp: Date.now(),
          overall: "healthy",
          severity: null,
          reasons: [],
          gateway: {
            last5m: { totalRequests: 100, totalErrors: 2, errorRate: 0.02, byCapability: {} },
            last60m: { totalRequests: 500, totalErrors: 10, errorRate: 0.02 },
          },
          paymentChecks: null,
          alerts: [],
          system: null,
          fleet: { activeBots: 5 },
          business: {
            creditsConsumed24h: 5000,
            activeTenantCount: 10,
            revenueToday: 5000,
            capabilityBreakdown: [],
          },
        }),
      },
    },
  },
}));

describe("BillingHealthDashboard", () => {
  it("renders loading skeleton initially", () => {
    render(<BillingHealthDashboard />);
    // Loading state shows skeletons (no status badge yet)
    expect(screen.queryByText("HEALTHY")).toBeNull();
  });
});
