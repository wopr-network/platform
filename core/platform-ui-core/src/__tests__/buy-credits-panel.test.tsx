import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock framer-motion to avoid animation issues
vi.mock("framer-motion", () => ({
  motion: {
    button: ({
      children,
      className,
      onClick,
      type,
    }: React.PropsWithChildren<{
      className?: string;
      onClick?: () => void;
      type?: string;
    }>) => (
      <button type={(type as "button") ?? "button"} className={className} onClick={onClick}>
        {children}
      </button>
    ),
    div: ({ children }: React.PropsWithChildren<Record<string, unknown>>) => <div>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

const mockGetCreditOptions = vi.fn();
const mockCreateCreditCheckout = vi.fn();
const mockIsAllowedRedirectUrl = vi.fn();

vi.mock("@/lib/api", () => ({
  getCreditOptions: (...args: unknown[]) => mockGetCreditOptions(...args),
  createCreditCheckout: (...args: unknown[]) => mockCreateCreditCheckout(...args),
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/validate-redirect-url", () => ({
  isAllowedRedirectUrl: (...args: unknown[]) => mockIsAllowedRedirectUrl(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/billing/credits",
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: () => ({ data: null, isPending: false, error: null }),
  }),
}));

import { BuyCreditsPanel } from "@/components/billing/buy-credits-panel";

const MOCK_TIERS = [
  { priceId: "price_5", label: "$5", amountCents: 500, creditCents: 500, bonusPercent: 0 },
  { priceId: "price_20", label: "$20", amountCents: 2000, creditCents: 2200, bonusPercent: 10 },
  { priceId: "price_50", label: "$50", amountCents: 5000, creditCents: 6000, bonusPercent: 20 },
];

describe("BuyCreditsPanel", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows loading skeletons while fetching credit options", async () => {
    // Never resolve so we stay in loading state
    mockGetCreditOptions.mockReturnValue(
      new Promise(() => {
        /* intentionally pending */
      }),
    );
    render(<BuyCreditsPanel />);

    expect(screen.getByText("Buy Credits")).toBeInTheDocument();
    expect(document.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThanOrEqual(1);
  });

  it("renders credit tiers with correct labels after loading", async () => {
    mockGetCreditOptions.mockResolvedValue(MOCK_TIERS);
    render(<BuyCreditsPanel />);

    expect(await screen.findByText("$5")).toBeInTheDocument();
    expect(screen.getByText("$20")).toBeInTheDocument();
    expect(screen.getByText("$50")).toBeInTheDocument();
  });

  it("renders bonus badge for tiers with bonusPercent > 0", async () => {
    mockGetCreditOptions.mockResolvedValue(MOCK_TIERS);
    render(<BuyCreditsPanel />);

    expect(await screen.findByText("+10%")).toBeInTheDocument();
    expect(screen.getByText("+20%")).toBeInTheDocument();
    // $5 tier has 0% bonus — no badge
    expect(screen.queryByText("+0%")).not.toBeInTheDocument();
  });

  it("shows unavailable message when no credit options returned", async () => {
    mockGetCreditOptions.mockResolvedValue([]);
    render(<BuyCreditsPanel />);

    expect(
      await screen.findByText("Credit purchases are not available at this time."),
    ).toBeInTheDocument();
    // Should NOT show retry button for intentionally empty tiers
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
  });

  it("shows error message with retry button when API fails", async () => {
    mockGetCreditOptions.mockRejectedValueOnce(new Error("Network error"));

    render(<BuyCreditsPanel />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load credit packages.")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("retries loading when retry button is clicked", async () => {
    const user = userEvent.setup();
    mockGetCreditOptions
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce([{ priceId: "price_1", label: "$10", bonusPercent: 0 }]);

    render(<BuyCreditsPanel />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load credit packages.")).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(screen.getByText("$10")).toBeInTheDocument();
    });
    expect(mockGetCreditOptions).toHaveBeenCalledTimes(2);
  });

  it("Buy button is disabled when no tier is selected", async () => {
    mockGetCreditOptions.mockResolvedValue(MOCK_TIERS);
    render(<BuyCreditsPanel />);

    const buyBtn = await screen.findByRole("button", { name: "Buy credits" });
    expect(buyBtn).toBeDisabled();
  });

  it("Buy button is enabled after selecting a tier", async () => {
    mockGetCreditOptions.mockResolvedValue(MOCK_TIERS);
    const user = userEvent.setup();
    render(<BuyCreditsPanel />);

    const tierBtn = await screen.findByText("$20");
    await user.click(tierBtn);

    const buyBtn = screen.getByRole("button", { name: "Buy credits" });
    expect(buyBtn).toBeEnabled();
  });

  it("calls createCreditCheckout with selected priceId on Buy click", async () => {
    mockGetCreditOptions.mockResolvedValue(MOCK_TIERS);
    // Mock location.href setter
    const hrefSetter = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, href: "" },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.location, "href", {
      set: hrefSetter,
      configurable: true,
    });

    mockCreateCreditCheckout.mockResolvedValue({
      checkoutUrl: "https://checkout.stripe.com/session123",
    });
    mockIsAllowedRedirectUrl.mockReturnValue(true);

    const user = userEvent.setup();
    render(<BuyCreditsPanel />);

    const tierBtn = await screen.findByText("$20");
    await user.click(tierBtn);

    const buyBtn = screen.getByRole("button", { name: "Buy credits" });
    await user.click(buyBtn);

    expect(mockCreateCreditCheckout).toHaveBeenCalledWith("price_20");
    expect(mockIsAllowedRedirectUrl).toHaveBeenCalledWith("https://checkout.stripe.com/session123");
    expect(hrefSetter).toHaveBeenCalledWith("https://checkout.stripe.com/session123");
  });

  it("shows error when checkout URL is not allowed", async () => {
    mockGetCreditOptions.mockResolvedValue(MOCK_TIERS);
    mockCreateCreditCheckout.mockResolvedValue({
      checkoutUrl: "https://evil.com/steal",
    });
    mockIsAllowedRedirectUrl.mockReturnValue(false);

    const user = userEvent.setup();
    render(<BuyCreditsPanel />);

    const tierBtn = await screen.findByText("$5");
    await user.click(tierBtn);

    const buyBtn = screen.getByRole("button", { name: "Buy credits" });
    await user.click(buyBtn);

    expect(await screen.findByText("Unexpected checkout URL.")).toBeInTheDocument();
  });

  it("shows Redirecting... while checkout is in progress", async () => {
    mockGetCreditOptions.mockResolvedValue(MOCK_TIERS);
    // Never resolve so we stay in loading state
    mockCreateCreditCheckout.mockReturnValue(
      new Promise(() => {
        /* intentionally pending */
      }),
    );

    const user = userEvent.setup();
    render(<BuyCreditsPanel />);

    const tierBtn = await screen.findByText("$5");
    await user.click(tierBtn);

    const buyBtn = screen.getByRole("button", { name: "Buy credits" });
    await user.click(buyBtn);

    expect(await screen.findByText("Redirecting...")).toBeInTheDocument();
  });

  it("shows error when checkout fails", async () => {
    mockGetCreditOptions.mockResolvedValue(MOCK_TIERS);
    mockCreateCreditCheckout.mockRejectedValue(new Error("Stripe error"));

    const user = userEvent.setup();
    render(<BuyCreditsPanel />);

    const tierBtn = await screen.findByText("$5");
    await user.click(tierBtn);

    const buyBtn = screen.getByRole("button", { name: "Buy credits" });
    await user.click(buyBtn);

    expect(await screen.findByText("Checkout failed. Please try again.")).toBeInTheDocument();
  });
});
