import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CreditBalance } from "@/lib/api";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

// Mock better-auth/react
vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: () => ({ data: null, isPending: false, error: null }),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  }),
}));

/** Return an ISO-8601 UTC date string N days from now, truncated to midnight. */
function daysFromNow(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Return an ISO-8601 UTC date string N days from now, at end-of-day. */
function endOfDayFromNow(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  d.setUTCHours(23, 59, 59, 0);
  return d.toISOString();
}

const MOCK_BALANCE: CreditBalance = {
  balance: 0.5,
  dailyBurn: 0.33,
  runway: 1,
};

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getCreditBalance: vi.fn().mockResolvedValue(MOCK_BALANCE),
    getAccountStatus: vi.fn().mockResolvedValue(null),
    getBillingUsageSummary: vi.fn().mockResolvedValue({
      periodStart: daysFromNow(-30),
      periodEnd: endOfDayFromNow(0),
      totalSpend: 30,
      includedCredit: 50,
      amountDue: 0,
      planName: "Pro",
    }),
  };
});

describe("SuspensionBanner", () => {
  it("renders nothing when API returns null balance", async () => {
    const { getCreditBalance } = await import("@/lib/api");
    vi.mocked(getCreditBalance).mockResolvedValueOnce({
      balance: 0,
      dailyBurn: 0,
      runway: null,
    });

    const { SuspensionBanner } = await import("@/components/billing/suspension-banner");
    const { container } = render(<SuspensionBanner />);

    // Should start with null and not render anything initially
    expect(container.innerHTML).toBe("");
  });

  it("renders LowBalanceBanner with global prop after loading", async () => {
    const { SuspensionBanner } = await import("@/components/billing/suspension-banner");
    render(<SuspensionBanner />);

    // Wait for async load
    await waitFor(() => {
      expect(screen.getByText(/Credits critically low/)).toBeInTheDocument();
    });
  });

  it("renders nothing on API error (non-critical error path)", async () => {
    const { getCreditBalance } = await import("@/lib/api");
    vi.mocked(getCreditBalance).mockRejectedValueOnce(new Error("Network error"));

    const { SuspensionBanner } = await import("@/components/billing/suspension-banner");
    const { container } = render(<SuspensionBanner />);

    // Should catch error silently and render nothing
    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("shows critical banner when balance < $1", async () => {
    const { getCreditBalance } = await import("@/lib/api");
    vi.mocked(getCreditBalance).mockResolvedValueOnce({
      balance: 0.75,
      dailyBurn: 0.5,
      runway: 1,
    });

    const { SuspensionBanner } = await import("@/components/billing/suspension-banner");
    render(<SuspensionBanner />);

    await waitFor(() => {
      expect(screen.getByText(/Credits critically low/)).toBeInTheDocument();
    });
  });

  it("shows high-spend warning when amountDue exceeds zero", async () => {
    const api = await import("@/lib/api");
    vi.mocked(api.getCreditBalance).mockResolvedValueOnce({
      balance: 10,
      dailyBurn: 2,
      runway: 5,
    });
    vi.mocked(api.getBillingUsageSummary).mockResolvedValueOnce({
      periodStart: daysFromNow(-30),
      periodEnd: endOfDayFromNow(0),
      totalSpend: 120,
      includedCredit: 50,
      amountDue: 70,
      planName: "Pro",
    });

    const { SuspensionBanner } = await import("@/components/billing/suspension-banner");
    render(<SuspensionBanner />);

    await waitFor(() => {
      expect(screen.getByText(/\$70\.00 due/)).toBeInTheDocument();
    });
  });

  it("does not show critical banner when balance === $1.00 (boundary)", async () => {
    const { getCreditBalance } = await import("@/lib/api");
    vi.mocked(getCreditBalance).mockResolvedValueOnce({
      balance: 1.0,
      dailyBurn: 0.5,
      runway: 2,
    });

    const { SuspensionBanner } = await import("@/components/billing/suspension-banner");
    const { container } = render(<SuspensionBanner />);

    await waitFor(() => {
      // At $1.00 with global=true, no banner is shown (only critical < $1, or warning $1-$2 non-global)
      expect(container.innerHTML).toBe("");
    });
  });
});
