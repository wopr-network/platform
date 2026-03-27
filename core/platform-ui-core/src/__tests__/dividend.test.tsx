import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/billing/credits",
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: () => ({ data: null, isPending: false, error: null }),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  }),
}));

// --- Dividend API types ---

describe("Dividend API types", () => {
  it("exports getDividendStats function", async () => {
    const api = await import("@/lib/api");
    expect(typeof api.getDividendStats).toBe("function");
  });

  it("exports getDividendHistory function", async () => {
    const api = await import("@/lib/api");
    expect(typeof api.getDividendHistory).toBe("function");
  });

  it("exports getDividendLifetime function", async () => {
    const api = await import("@/lib/api");
    expect(typeof api.getDividendLifetime).toBe("function");
  });

  it("includes community_dividend in CreditTransactionType", async () => {
    // The type union includes community_dividend - verify a community_dividend typed object is assignable
    const tx: import("@/lib/api").CreditTransactionType = "community_dividend";
    expect(tx).toBe("community_dividend");
  });
});

// --- DividendBanner ---

const MOCK_STATS = {
  poolCents: 6885,
  activeUsers: 847,
  perUserCents: 8,
  nextDistributionAt: "2026-02-22T00:00:00Z",
  userEligible: true,
  userLastPurchaseAt: "2026-02-20T14:23:00Z",
  userWindowExpiresAt: "2026-02-27T14:23:00Z",
};

describe("DividendBanner", () => {
  it("renders the dividend amount when user received a dividend today", async () => {
    const { DividendBanner } = await import("@/components/billing/dividend-banner");
    render(<DividendBanner todayAmountCents={8} stats={MOCK_STATS} />);

    expect(screen.getByText(/Platform paid you/)).toBeInTheDocument();
  });

  it("renders projected message when no dividend yet today", async () => {
    const { DividendBanner } = await import("@/components/billing/dividend-banner");
    render(<DividendBanner todayAmountCents={0} stats={MOCK_STATS} />);

    expect(screen.getByText(/projected share/i)).toBeInTheDocument();
  });

  it("renders not eligible message when user is not in the pool", async () => {
    const { DividendBanner } = await import("@/components/billing/dividend-banner");
    const ineligibleStats = { ...MOCK_STATS, userEligible: false, userWindowExpiresAt: null };
    render(<DividendBanner todayAmountCents={0} stats={ineligibleStats} />);

    expect(screen.getByText(/purchase credits to join/i)).toBeInTheDocument();
  });
});

// --- DividendEligibility ---

describe("DividendEligibility", () => {
  it("renders days remaining in pool", async () => {
    const { DividendEligibility } = await import("@/components/billing/dividend-eligibility");
    const expiresAt = new Date(Date.now() + 5 * 86400000).toISOString();
    render(<DividendEligibility windowExpiresAt={expiresAt} eligible={true} />);

    expect(screen.getByText(/in the pool for/i)).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders not eligible state", async () => {
    const { DividendEligibility } = await import("@/components/billing/dividend-eligibility");
    render(<DividendEligibility windowExpiresAt={null} eligible={false} />);

    expect(screen.getByText(/not in the pool/i)).toBeInTheDocument();
  });

  it("renders expiring soon warning when <= 2 days remain", async () => {
    const { DividendEligibility } = await import("@/components/billing/dividend-eligibility");
    const expiresAt = new Date(Date.now() + 1 * 86400000).toISOString();
    render(<DividendEligibility windowExpiresAt={expiresAt} eligible={true} />);

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText(/reset your 7-day window/i)).toBeInTheDocument();
  });
});

// --- DividendPoolStats ---

describe("DividendPoolStats", () => {
  it("renders pool size and user count", async () => {
    const { DividendPoolStats } = await import("@/components/billing/dividend-pool-stats");
    render(<DividendPoolStats poolCents={6885} activeUsers={847} perUserCents={8} />);

    expect(screen.getByText("$68.85")).toBeInTheDocument();
    expect(screen.getByText("847")).toBeInTheDocument();
    expect(screen.getByText("$0.08/day")).toBeInTheDocument();
  });

  it("renders zero state when pool is empty", async () => {
    const { DividendPoolStats } = await import("@/components/billing/dividend-pool-stats");
    render(<DividendPoolStats poolCents={0} activeUsers={0} perUserCents={0} />);

    expect(screen.getByText(/pool building/i)).toBeInTheDocument();
  });
});

// --- FirstDividendDialog ---

describe("FirstDividendDialog", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders celebration when dividend > 0 and not seen before", async () => {
    const { FirstDividendDialog } = await import("@/components/billing/first-dividend-dialog");
    render(<FirstDividendDialog todayAmountCents={8} />);

    expect(screen.getByText(/Platform just paid you/i)).toBeInTheDocument();
  });

  it("does not render dialog when already seen", async () => {
    localStorage.setItem("platform-first_dividend_seen", "true");
    const { FirstDividendDialog } = await import("@/components/billing/first-dividend-dialog");
    render(<FirstDividendDialog todayAmountCents={8} />);

    expect(screen.queryByText(/Platform just paid you/i)).not.toBeInTheDocument();
  });

  it("does not render when amount is 0", async () => {
    const { FirstDividendDialog } = await import("@/components/billing/first-dividend-dialog");
    render(<FirstDividendDialog todayAmountCents={0} />);

    expect(screen.queryByText(/Platform just paid you/i)).not.toBeInTheDocument();
  });

  it("sets localStorage flag when dismissed", async () => {
    const { FirstDividendDialog } = await import("@/components/billing/first-dividend-dialog");
    render(<FirstDividendDialog todayAmountCents={8} />);

    const button = screen.getByRole("button", { name: /nice/i });
    await userEvent.click(button);

    expect(localStorage.getItem("platform-first_dividend_seen")).toBe("true");
  });
});
