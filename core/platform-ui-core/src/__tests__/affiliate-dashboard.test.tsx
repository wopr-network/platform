import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { AffiliateReferralsResponse, AffiliateStats } from "@/lib/api";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/billing/referrals",
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

const MOCK_STATS: AffiliateStats = {
  referralCode: "t7k9x",
  referralUrl: "https://localhost/join?ref=t7k9x",
  totalReferred: 12,
  totalConverted: 8,
  totalEarnedCents: 16000,
};

const MOCK_REFERRALS: AffiliateReferralsResponse = {
  referrals: [
    {
      id: "ref-1",
      maskedEmail: "use***@example.com",
      joinedAt: "2026-02-18T00:00:00Z",
      status: "matched",
      matchAmountCents: 2000,
    },
    {
      id: "ref-2",
      maskedEmail: "use***@test.com",
      joinedAt: "2026-02-20T00:00:00Z",
      status: "pending",
      matchAmountCents: null,
    },
    {
      id: "ref-3",
      maskedEmail: "ano***@test.com",
      joinedAt: "2026-02-21T00:00:00Z",
      status: "pending",
      matchAmountCents: null,
    },
  ],
  total: 3,
};

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getAffiliateStats: vi.fn().mockResolvedValue(MOCK_STATS),
    getAffiliateReferrals: vi.fn().mockResolvedValue(MOCK_REFERRALS),
    getInferenceMode: vi.fn().mockResolvedValue("byok"),
  };
});

describe("Affiliate Dashboard", () => {
  it("renders Refer & Earn heading", async () => {
    const { default: ReferralsPage } = await import("../app/(dashboard)/billing/referrals/page");
    render(<ReferralsPage />);

    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(await screen.findByText("Refer & Earn")).toBeInTheDocument();
  });

  it("displays the referral link", async () => {
    const { default: ReferralsPage } = await import("../app/(dashboard)/billing/referrals/page");
    render(<ReferralsPage />);

    expect(await screen.findByText("https://localhost/join?ref=t7k9x")).toBeInTheDocument();
  });

  it("renders copy button", async () => {
    const { default: ReferralsPage } = await import("../app/(dashboard)/billing/referrals/page");
    render(<ReferralsPage />);

    expect(await screen.findByRole("button", { name: /copy/i })).toBeInTheDocument();
  });

  it("renders share button", async () => {
    const { default: ReferralsPage } = await import("../app/(dashboard)/billing/referrals/page");
    render(<ReferralsPage />);

    expect(await screen.findByRole("button", { name: /share/i })).toBeInTheDocument();
  });

  it("displays the value proposition", async () => {
    const { default: ReferralsPage } = await import("../app/(dashboard)/billing/referrals/page");
    render(<ReferralsPage />);

    expect(await screen.findByText(/20% extra credits/)).toBeInTheDocument();
    expect(screen.getByText(/matching credits/)).toBeInTheDocument();
  });

  it("renders aggregate stats", async () => {
    const { default: ReferralsPage } = await import("../app/(dashboard)/billing/referrals/page");
    render(<ReferralsPage />);

    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("$160.00")).toBeInTheDocument();
    expect(screen.getByText(/friends referred/i)).toBeInTheDocument();
    expect(screen.getByText(/converted/i)).toBeInTheDocument();
    expect(screen.getByText(/earned/i)).toBeInTheDocument();
  });

  it("renders recent referrals with matched status", async () => {
    const { default: ReferralsPage } = await import("../app/(dashboard)/billing/referrals/page");
    render(<ReferralsPage />);

    expect(await screen.findByText("use***@example.com")).toBeInTheDocument();
    expect(screen.getByText("$20.00")).toBeInTheDocument();
  });

  it("renders recent referrals with pending status", async () => {
    const { default: ReferralsPage } = await import("../app/(dashboard)/billing/referrals/page");
    render(<ReferralsPage />);

    expect(await screen.findByText("use***@test.com")).toBeInTheDocument();
    const pendingBadges = screen.getAllByText("pending");
    expect(pendingBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("copies referral link to clipboard on copy button click", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
      writable: true,
    });

    const { default: ReferralsPage } = await import("../app/(dashboard)/billing/referrals/page");
    render(<ReferralsPage />);

    const copyBtn = await screen.findByRole("button", { name: /copy/i });
    await user.click(copyBtn);

    expect(writeText).toHaveBeenCalledWith("https://localhost/join?ref=t7k9x");
  });
});

describe("Affiliate Dashboard error state", () => {
  it("shows error message and retry button when API fails", async () => {
    const api = await import("@/lib/api");
    vi.mocked(api.getAffiliateStats).mockRejectedValueOnce(new Error("Network error"));

    const { AffiliateDashboard } = await import("../components/billing/affiliate-dashboard");
    render(<AffiliateDashboard />);

    expect(await screen.findByText("Failed to load referral data.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});

describe("Billing layout with Referrals nav", () => {
  it("renders Refer & Earn navigation link", async () => {
    const { default: BillingLayout } = await import("../app/(dashboard)/billing/layout");
    render(
      <BillingLayout>
        <div>child content</div>
      </BillingLayout>,
    );

    expect(screen.getByText("Refer & Earn")).toBeInTheDocument();
  });
});
