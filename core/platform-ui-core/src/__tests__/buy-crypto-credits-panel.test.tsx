import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mockCreateCheckout, mockGetSupportedPaymentMethods, mockGetChargeStatus } = vi.hoisted(
  () => ({
    mockCreateCheckout: vi.fn(),
    mockGetSupportedPaymentMethods: vi.fn(),
    mockGetChargeStatus: vi.fn(),
  }),
);

vi.mock("@/lib/api", () => ({
  createCheckout: (...args: unknown[]) => mockCreateCheckout(...args),
  getSupportedPaymentMethods: (...args: unknown[]) => mockGetSupportedPaymentMethods(...args),
  getChargeStatus: (...args: unknown[]) => mockGetChargeStatus(...args),
}));

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
}));

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

vi.mock("lucide-react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("lucide-react")>();
  return {
    ...actual,
    Bitcoin: () => <span data-testid="bitcoin-icon" />,
  };
});

const MOCK_USDC_METHOD = {
  id: "usdc:base",
  type: "erc20",
  label: "USDC on Base",
  token: "USDC",
  chain: "base",
  iconUrl: "https://example.com/usdc.svg",
};
const MOCK_ETH_METHOD = {
  id: "eth:base",
  type: "native",
  label: "ETH on Base",
  token: "ETH",
  chain: "base",
  iconUrl: "https://example.com/eth.svg",
};

afterEach(() => {
  vi.restoreAllMocks();
  mockCreateCheckout.mockReset();
  mockGetSupportedPaymentMethods.mockReset();
  mockGetChargeStatus.mockReset();
});

describe("BuyCryptoCreditPanel", () => {
  it("renders crypto amount buttons ($10, $25, $50, $100)", async () => {
    mockGetSupportedPaymentMethods.mockResolvedValue([MOCK_USDC_METHOD, MOCK_ETH_METHOD]);
    const { BuyCryptoCreditPanel } = await import("../components/billing/buy-crypto-credits-panel");
    render(<BuyCryptoCreditPanel />);

    await waitFor(() => {
      expect(screen.getByText("Pay with Crypto")).toBeInTheDocument();
    });
    expect(screen.getByText("$10")).toBeInTheDocument();
    expect(screen.getByText("$25")).toBeInTheDocument();
    expect(screen.getByText("$50")).toBeInTheDocument();
    expect(screen.getByText("$100")).toBeInTheDocument();
  });

  it("Pay button is disabled when no amount selected", async () => {
    mockGetSupportedPaymentMethods.mockResolvedValue([MOCK_USDC_METHOD, MOCK_ETH_METHOD]);
    const { BuyCryptoCreditPanel } = await import("../components/billing/buy-crypto-credits-panel");
    render(<BuyCryptoCreditPanel />);

    await waitFor(() => {
      expect(screen.getByText("USDC")).toBeInTheDocument();
    });

    const payBtn = screen.getByRole("button", { name: "Pay with USDC" });
    expect(payBtn).toBeDisabled();
  });

  it("Pay button is enabled after selecting an amount", async () => {
    mockGetSupportedPaymentMethods.mockResolvedValue([MOCK_USDC_METHOD, MOCK_ETH_METHOD]);
    const user = userEvent.setup();
    const { BuyCryptoCreditPanel } = await import("../components/billing/buy-crypto-credits-panel");
    render(<BuyCryptoCreditPanel />);

    await waitFor(() => {
      expect(screen.getByText("USDC")).toBeInTheDocument();
    });

    await user.click(screen.getByText("$25"));
    expect(screen.getByRole("button", { name: "Pay with USDC" })).toBeEnabled();
  });

  it("calls createCheckout and shows deposit address", async () => {
    mockGetSupportedPaymentMethods.mockResolvedValue([MOCK_USDC_METHOD, MOCK_ETH_METHOD]);
    mockCreateCheckout.mockResolvedValue({
      depositAddress: "0xabc123def456",
      displayAmount: "50.000000 USDC",
      token: "USDC",
      chain: "base",
    });

    const user = userEvent.setup();
    const { BuyCryptoCreditPanel } = await import("../components/billing/buy-crypto-credits-panel");
    render(<BuyCryptoCreditPanel />);

    await waitFor(() => {
      expect(screen.getByText("USDC")).toBeInTheDocument();
    });

    await user.click(screen.getByText("$50"));
    await user.click(screen.getByRole("button", { name: "Pay with USDC" }));

    expect(mockCreateCheckout).toHaveBeenCalledWith("usdc:base", 50);
    expect(await screen.findByText("0xabc123def456")).toBeInTheDocument();
    expect(screen.getByText("50.000000 USDC")).toBeInTheDocument();
  });

  it("shows Creating checkout... while checkout is in progress", async () => {
    mockGetSupportedPaymentMethods.mockResolvedValue([MOCK_USDC_METHOD, MOCK_ETH_METHOD]);
    mockCreateCheckout.mockReturnValue(
      new Promise(() => {
        /* intentionally pending */
      }),
    );

    const user = userEvent.setup();
    const { BuyCryptoCreditPanel } = await import("../components/billing/buy-crypto-credits-panel");
    render(<BuyCryptoCreditPanel />);

    await waitFor(() => {
      expect(screen.getByText("USDC")).toBeInTheDocument();
    });

    await user.click(screen.getByText("$50"));
    await user.click(screen.getByRole("button", { name: "Pay with USDC" }));

    expect(await screen.findByText("Creating checkout...")).toBeInTheDocument();
  });

  it("shows error when checkout API call fails", async () => {
    mockGetSupportedPaymentMethods.mockResolvedValue([MOCK_USDC_METHOD, MOCK_ETH_METHOD]);
    mockCreateCheckout.mockRejectedValue(new Error("API down"));

    const user = userEvent.setup();
    const { BuyCryptoCreditPanel } = await import("../components/billing/buy-crypto-credits-panel");
    render(<BuyCryptoCreditPanel />);

    await waitFor(() => {
      expect(screen.getByText("USDC")).toBeInTheDocument();
    });

    await user.click(screen.getByText("$25"));
    await user.click(screen.getByRole("button", { name: "Pay with USDC" }));

    expect(await screen.findByText("Checkout failed. Please try again.")).toBeInTheDocument();
  });

  it("hides panel when no payment methods available", async () => {
    mockGetSupportedPaymentMethods.mockResolvedValue([]);
    const { BuyCryptoCreditPanel } = await import("../components/billing/buy-crypto-credits-panel");
    const { container } = render(<BuyCryptoCreditPanel />);

    // Component returns null when no methods
    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("switches between payment methods", async () => {
    mockGetSupportedPaymentMethods.mockResolvedValue([MOCK_USDC_METHOD, MOCK_ETH_METHOD]);
    const user = userEvent.setup();
    const { BuyCryptoCreditPanel } = await import("../components/billing/buy-crypto-credits-panel");
    render(<BuyCryptoCreditPanel />);

    await waitFor(() => {
      expect(screen.getByText("USDC")).toBeInTheDocument();
    });

    // Default is first method (USDC)
    expect(screen.getByRole("button", { name: "Pay with USDC" })).toBeInTheDocument();

    // Switch to ETH
    await user.click(screen.getByText("ETH"));
    expect(screen.getByRole("button", { name: "Pay with ETH" })).toBeInTheDocument();
  });

  it("renders icon for each payment method", async () => {
    mockGetSupportedPaymentMethods.mockResolvedValue([MOCK_USDC_METHOD, MOCK_ETH_METHOD]);
    const { BuyCryptoCreditPanel } = await import("../components/billing/buy-crypto-credits-panel");
    render(<BuyCryptoCreditPanel />);

    await waitFor(() => {
      expect(screen.getByText("USDC")).toBeInTheDocument();
    });

    const icons = screen.getAllByRole("img");
    expect(icons).toHaveLength(2);
    expect(icons[0]).toHaveAttribute("src", "https://example.com/usdc.svg");
    expect(icons[1]).toHaveAttribute("src", "https://example.com/eth.svg");
  });

  it("shows partial payment display", async () => {
    mockGetSupportedPaymentMethods.mockResolvedValue([MOCK_USDC_METHOD]);
    mockCreateCheckout.mockResolvedValue({
      depositAddress: "0xabc123",
      displayAmount: "50.000000 USDC",
      token: "USDC",
      chain: "base",
      referenceId: "ref-123",
    });
    mockGetChargeStatus.mockResolvedValue({
      chargeId: "ch-1",
      status: "partial",
      amountExpectedCents: 5000,
      amountReceivedCents: 2500,
      confirmations: 0,
      confirmationsRequired: 6,
      credited: false,
      amountUsdCents: 5000,
    });

    const user = userEvent.setup();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { BuyCryptoCreditPanel } = await import("../components/billing/buy-crypto-credits-panel");
    render(<BuyCryptoCreditPanel />);

    await waitFor(() => {
      expect(screen.getByText("USDC")).toBeInTheDocument();
    });

    await user.click(screen.getByText("$50"));
    await user.click(screen.getByRole("button", { name: "Pay with USDC" }));

    await waitFor(() => {
      expect(screen.getByText("0xabc123")).toBeInTheDocument();
    });

    vi.advanceTimersByTime(5000);

    await waitFor(() => {
      expect(screen.getByText(/Received \$25\.00 of \$50\.00/)).toBeInTheDocument();
    });

    vi.useRealTimers();
  });

  it("shows confirmation progress", async () => {
    mockGetSupportedPaymentMethods.mockResolvedValue([MOCK_USDC_METHOD]);
    mockCreateCheckout.mockResolvedValue({
      depositAddress: "0xabc123",
      displayAmount: "50.000000 USDC",
      token: "USDC",
      chain: "base",
      referenceId: "ref-456",
    });
    mockGetChargeStatus.mockResolvedValue({
      chargeId: "ch-2",
      status: "confirmed",
      amountExpectedCents: 5000,
      amountReceivedCents: 5000,
      confirmations: 3,
      confirmationsRequired: 6,
      credited: false,
      amountUsdCents: 5000,
    });

    const user = userEvent.setup();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { BuyCryptoCreditPanel } = await import("../components/billing/buy-crypto-credits-panel");
    render(<BuyCryptoCreditPanel />);

    await waitFor(() => {
      expect(screen.getByText("USDC")).toBeInTheDocument();
    });

    await user.click(screen.getByText("$50"));
    await user.click(screen.getByRole("button", { name: "Pay with USDC" }));

    await waitFor(() => {
      expect(screen.getByText("0xabc123")).toBeInTheDocument();
    });

    vi.advanceTimersByTime(5000);

    await waitFor(() => {
      expect(screen.getByText(/Confirming \(3 of 6\)/)).toBeInTheDocument();
    });

    vi.useRealTimers();
  });

  it("shows expiry and Try Again button", async () => {
    mockGetSupportedPaymentMethods.mockResolvedValue([MOCK_USDC_METHOD]);
    mockCreateCheckout.mockResolvedValue({
      depositAddress: "0xabc123",
      displayAmount: "50.000000 USDC",
      token: "USDC",
      chain: "base",
      referenceId: "ref-789",
    });
    mockGetChargeStatus.mockResolvedValue({
      chargeId: "ch-3",
      status: "expired",
      amountExpectedCents: 5000,
      amountReceivedCents: 0,
      confirmations: 0,
      confirmationsRequired: 6,
      credited: false,
      amountUsdCents: 5000,
    });

    const user = userEvent.setup();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { BuyCryptoCreditPanel } = await import("../components/billing/buy-crypto-credits-panel");
    render(<BuyCryptoCreditPanel />);

    await waitFor(() => {
      expect(screen.getByText("USDC")).toBeInTheDocument();
    });

    await user.click(screen.getByText("$50"));
    await user.click(screen.getByRole("button", { name: "Pay with USDC" }));

    await waitFor(() => {
      expect(screen.getByText("0xabc123")).toBeInTheDocument();
    });

    vi.advanceTimersByTime(5000);

    await waitFor(() => {
      expect(screen.getByText("Payment expired.")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Try Again" })).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("calls createCheckout with methodId", async () => {
    mockGetSupportedPaymentMethods.mockResolvedValue([MOCK_ETH_METHOD]);
    mockCreateCheckout.mockResolvedValue({
      depositAddress: "0xdef456",
      displayAmount: "0.05 ETH",
      token: "ETH",
      chain: "base",
      referenceId: "ref-eth",
    });

    const user = userEvent.setup();
    const { BuyCryptoCreditPanel } = await import("../components/billing/buy-crypto-credits-panel");
    render(<BuyCryptoCreditPanel />);

    await waitFor(() => {
      expect(screen.getByText("ETH")).toBeInTheDocument();
    });

    await user.click(screen.getByText("$100"));
    await user.click(screen.getByRole("button", { name: "Pay with ETH" }));

    expect(mockCreateCheckout).toHaveBeenCalledWith("eth:base", 100);
  });
});
