import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CreditBalance, CreditHistoryResponse } from "@/lib/api";

// Mock framer-motion to prevent animation/rAF issues in JSDOM.
vi.mock("framer-motion", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require("react");
  return {
    motion: new Proxy(
      {},
      {
        get:
          (_target, tag: string) =>
          ({ children, ...props }: { children?: unknown; [key: string]: unknown }) =>
            React.createElement(tag, props, children),
      },
    ),
    AnimatePresence: ({ children }: { children?: unknown }) => children,
    useMotionValue: (v: number) => ({
      get: () => v,
      on: () => () => {
        /* no-op */
      },
      set: () => {
        /* no-op */
      },
    }),
    useTransform: (_mv: unknown, _fn: unknown) => ({
      on: () => () => {
        /* no-op */
      },
      get: () => 0,
    }),
    animate: () => ({
      stop: () => {
        /* no-op */
      },
    }),
  };
});

// Mock @/lib/org-api so getOrganization rejects immediately (no org context),
// bypassing the orgChecked skeleton and letting the balance content render.
vi.mock("@/lib/org-api", () => ({
  getOrganization: vi.fn().mockRejectedValue(new Error("no org")),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/billing/credits",
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

const MOCK_BALANCE: CreditBalance = {
  balance: 12.5,
  dailyBurn: 0.33,
  runway: 37,
};

const MOCK_HISTORY: CreditHistoryResponse = {
  transactions: [
    {
      id: "tx-1",
      type: "signup_credit",
      description: "Signup credit",
      amount: 5.0,
      createdAt: "2026-02-14T00:00:00Z",
    },
    {
      id: "tx-2",
      type: "bot_runtime",
      description: "Bot runtime (platform-1)",
      amount: -0.17,
      createdAt: "2026-02-14T12:00:00Z",
    },
    {
      id: "tx-3",
      type: "purchase",
      description: "Credit purchase",
      amount: 25.5,
      createdAt: "2026-02-15T00:00:00Z",
    },
  ],
  nextCursor: "cursor-abc",
};

const MOCK_HISTORY_PAGE2: CreditHistoryResponse = {
  transactions: [
    {
      id: "tx-4",
      type: "bot_runtime",
      description: "Bot runtime (platform-2)",
      amount: -0.17,
      createdAt: "2026-02-15T12:00:00Z",
    },
  ],
  nextCursor: null,
};

vi.mock("@/lib/trpc", () => ({
  trpc: {
    billing: {
      creditsBalance: {
        useQuery: vi.fn().mockReturnValue({
          data: { balance_cents: 1250, daily_burn_cents: 33, runway_days: 37 },
          isLoading: false,
          error: null,
          refetch: vi.fn(),
        }),
      },
    },
  },
  TRPCProvider: ({ children }: { children?: unknown }) => children,
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getCreditBalance: vi.fn().mockResolvedValue(MOCK_BALANCE),
    getCreditHistory: vi.fn().mockImplementation((cursor?: string) => {
      if (cursor) return Promise.resolve(MOCK_HISTORY_PAGE2);
      return Promise.resolve(MOCK_HISTORY);
    }),
    getCreditOptions: vi.fn().mockResolvedValue([
      { priceId: "price_5", label: "$5", amountCents: 500, creditCents: 500, bonusPercent: 0 },
      { priceId: "price_10", label: "$10", amountCents: 1000, creditCents: 1000, bonusPercent: 0 },
      { priceId: "price_25", label: "$25", amountCents: 2500, creditCents: 2550, bonusPercent: 2 },
      { priceId: "price_50", label: "$50", amountCents: 5000, creditCents: 5250, bonusPercent: 5 },
      {
        priceId: "price_100",
        label: "$100",
        amountCents: 10000,
        creditCents: 11000,
        bonusPercent: 10,
      },
    ]),
    createCreditCheckout: vi
      .fn()
      .mockResolvedValue({ checkoutUrl: "https://checkout.stripe.com/test" }),
    getAutoTopupSettings: vi.fn().mockResolvedValue({
      usageBased: { enabled: false, thresholdCents: 500, topupAmountCents: 2000 },
      scheduled: { enabled: false, amountCents: 2000, interval: "weekly", nextChargeDate: null },
      paymentMethodLast4: "4242",
      paymentMethodBrand: "Visa",
    }),
    updateAutoTopupSettings: vi.fn().mockResolvedValue({
      usageBased: { enabled: false, thresholdCents: 500, topupAmountCents: 2000 },
      scheduled: { enabled: false, amountCents: 2000, interval: "weekly", nextChargeDate: null },
      paymentMethodLast4: "4242",
      paymentMethodBrand: "Visa",
    }),
  };
});

describe("Credits page", () => {
  it("renders credits heading", async () => {
    const { default: CreditsPage } = await import("../app/(dashboard)/billing/credits/page");
    render(<CreditsPage />);

    // Initially shows skeleton loading state
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Credits" })).toBeInTheDocument();
  });

  it("renders balance display", async () => {
    const { default: CreditsPage } = await import("../app/(dashboard)/billing/credits/page");
    render(<CreditsPage />);

    expect(await screen.findByText("Credit Balance")).toBeInTheDocument();
    expect(screen.getAllByText("$0.33/day").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("~37 days")).toBeInTheDocument();
  });

  it("renders buy credits panel with tiers", async () => {
    const { default: CreditsPage } = await import("../app/(dashboard)/billing/credits/page");
    render(<CreditsPage />);

    const buyCreditsHeading = await screen.findByText("Buy Credits");
    const buyCreditsPanel = buyCreditsHeading.closest('[data-slot="card"]') as HTMLElement;
    // Note: $5, $10, $50 appear in both BuyCreditsPanel and AutoTopupCard dropdowns
    expect((await screen.findAllByText("$5")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$10").length).toBeGreaterThanOrEqual(1);
    expect(within(buyCreditsPanel).getByText("$25")).toBeInTheDocument();
    expect(screen.getAllByText("$50").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("$100").length).toBeGreaterThanOrEqual(1);
  });

  it("renders bonus badges on higher tiers", async () => {
    const { default: CreditsPage } = await import("../app/(dashboard)/billing/credits/page");
    render(<CreditsPage />);

    expect(await screen.findByText("+2%")).toBeInTheDocument();
    expect(screen.getByText("+5%")).toBeInTheDocument();
    expect(screen.getByText("+10%")).toBeInTheDocument();
  });

  it("renders transaction history", async () => {
    const { default: CreditsPage } = await import("../app/(dashboard)/billing/credits/page");
    render(<CreditsPage />);

    expect(await screen.findByText("Transaction History")).toBeInTheDocument();
    // "Signup credit" appears in both the description and the type badge
    expect((await screen.findAllByText("Signup credit")).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Bot runtime (platform-1)")).toBeInTheDocument();
    expect(screen.getByText("Credit purchase")).toBeInTheDocument();
  });

  it("renders positive and negative amounts with correct coloring", async () => {
    const { default: CreditsPage } = await import("../app/(dashboard)/billing/credits/page");
    render(<CreditsPage />);

    const positiveAmount = await screen.findByText("+$5.00");
    expect(positiveAmount).toHaveClass("text-emerald-500");

    const negativeAmount = screen.getByText("-$0.17");
    expect(negativeAmount).toHaveClass("text-red-500");
  });

  it("renders load more button when there is a next cursor", async () => {
    const { default: CreditsPage } = await import("../app/(dashboard)/billing/credits/page");
    render(<CreditsPage />);

    expect(
      await screen.findByRole("button", { name: "Load more" }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it("loads next page of transactions on load more click", async () => {
    const user = userEvent.setup();
    const { default: CreditsPage } = await import("../app/(dashboard)/billing/credits/page");
    render(<CreditsPage />);

    const loadMoreBtn = await screen.findByRole("button", { name: "Load more" });
    await user.click(loadMoreBtn);

    expect(await screen.findByText("Bot runtime (platform-2)")).toBeInTheDocument();
  });

  it("buy credits button is disabled without selection", async () => {
    const { default: CreditsPage } = await import("../app/(dashboard)/billing/credits/page");
    render(<CreditsPage />);

    const buyBtn = await screen.findByRole("button", { name: "Buy credits" });
    expect(buyBtn).toBeDisabled();
  });

  it("enables buy button after selecting a tier", async () => {
    const user = userEvent.setup();
    const { default: CreditsPage } = await import("../app/(dashboard)/billing/credits/page");
    render(<CreditsPage />);

    // Wait for tiers to load, then scope to the Buy Credits card to avoid
    // matching the same dollar amounts in the BuyCryptoCreditPanel
    const buyCreditsHeading = await screen.findByText("Buy Credits");
    const buyCreditsPanel = buyCreditsHeading.closest('[data-slot="card"]') as HTMLElement;
    const tier10 = await within(buyCreditsPanel).findByText("$10");
    await user.click(tier10);

    const buyBtn = screen.getByRole("button", { name: "Buy credits" });
    expect(buyBtn).not.toBeDisabled();
  });
});

describe("CreditBalance component", () => {
  it("renders suspended when runway is 0", async () => {
    const { CreditBalance } = await import("../components/billing/credit-balance");
    render(<CreditBalance data={{ balance: 0, dailyBurn: 0.33, runway: 0 }} />);

    expect(screen.getByText("Suspended")).toBeInTheDocument();
    expect(screen.getByText("$0.00")).toBeInTheDocument();
  });

  it("renders N/A when runway is null", async () => {
    const { CreditBalance } = await import("../components/billing/credit-balance");
    render(<CreditBalance data={{ balance: 5, dailyBurn: 0, runway: null }} />);

    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("renders singular day text", async () => {
    const { CreditBalance } = await import("../components/billing/credit-balance");
    render(<CreditBalance data={{ balance: 0.33, dailyBurn: 0.33, runway: 1 }} />);

    expect(screen.getByText("~1 day")).toBeInTheDocument();
  });
});

describe("LowBalanceBanner", () => {
  it("shows no banner when balance > $2", async () => {
    const { LowBalanceBanner } = await import("../components/billing/low-balance-banner");
    const { container } = render(<LowBalanceBanner balance={5} runway={15} />);

    expect(container.innerHTML).toBe("");
  });

  it("shows warning banner when balance is between $1 and $2", async () => {
    const { LowBalanceBanner } = await import("../components/billing/low-balance-banner");
    render(<LowBalanceBanner balance={1.5} runway={4} />);

    expect(screen.getByText(/Credits running low/)).toBeInTheDocument();
    expect(screen.getByText(/~4 days left/)).toBeInTheDocument();
  });

  it("shows critical banner when balance < $1", async () => {
    const { LowBalanceBanner } = await import("../components/billing/low-balance-banner");
    render(<LowBalanceBanner balance={0.5} runway={1} />);

    expect(screen.getByText(/Credits critically low/)).toBeInTheDocument();
  });

  it("shows suspension banner when balance is $0", async () => {
    const { LowBalanceBanner } = await import("../components/billing/low-balance-banner");
    render(<LowBalanceBanner balance={0} runway={0} />);

    expect(screen.getByText(/Bots suspended/)).toBeInTheDocument();
  });

  it("hides warning banner in global mode", async () => {
    const { LowBalanceBanner } = await import("../components/billing/low-balance-banner");
    const { container } = render(<LowBalanceBanner balance={1.5} runway={4} global />);

    expect(container.innerHTML).toBe("");
  });

  it("shows critical banner in global mode", async () => {
    const { LowBalanceBanner } = await import("../components/billing/low-balance-banner");
    render(<LowBalanceBanner balance={0.5} runway={1} global />);

    expect(screen.getByText(/Credits critically low/)).toBeInTheDocument();
  });

  it("shows suspension banner in global mode", async () => {
    const { LowBalanceBanner } = await import("../components/billing/low-balance-banner");
    render(<LowBalanceBanner balance={0} runway={0} global />);

    expect(screen.getByText(/Bots suspended/)).toBeInTheDocument();
  });

  it("renders buy credits link", async () => {
    const { LowBalanceBanner } = await import("../components/billing/low-balance-banner");
    render(<LowBalanceBanner balance={0} runway={0} />);

    const link = screen.getByRole("link", { name: "Buy credits" });
    expect(link).toHaveAttribute("href", "/billing/credits");
  });
});

describe("Billing layout with Credits nav", () => {
  it("renders Credits navigation link", async () => {
    const { default: BillingLayout } = await import("../app/(dashboard)/billing/layout");
    render(
      <BillingLayout>
        <div>child content</div>
      </BillingLayout>,
    );

    expect(screen.getByText("Credits")).toBeInTheDocument();
    expect(screen.getByText("Your Plan")).toBeInTheDocument();
    expect(screen.getByText("Usage")).toBeInTheDocument();
    expect(screen.getByText("Payment")).toBeInTheDocument();
  });
});
