import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode; [key: string]: unknown }) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => <div data-testid="qr">{value}</div>,
}));

vi.mock("@/lib/api", () => ({
  getSupportedPaymentMethods: vi.fn().mockResolvedValue([
    {
      id: "BTC:mainnet",
      type: "native",
      token: "BTC",
      chain: "bitcoin",
      displayName: "Bitcoin",
      decimals: 8,
      displayOrder: 0,
      iconUrl: "",
    },
    {
      id: "USDT:tron",
      type: "erc20",
      token: "USDT",
      chain: "tron",
      displayName: "USDT on Tron",
      decimals: 6,
      displayOrder: 1,
      iconUrl: "",
    },
  ]),
  createCheckout: vi.fn().mockResolvedValue({
    depositAddress: "THwbQb1sPiRUpUYunVQxQKc6i4LCmpP1mj",
    displayAmount: "32.24 TRX",
    amountUsd: 10,
    token: "TRX",
    chain: "tron",
    referenceId: "trx:test",
  }),
  getChargeStatus: vi.fn().mockResolvedValue({
    status: "waiting",
    amountExpectedCents: 1000,
    amountReceivedCents: 0,
    confirmations: 0,
    confirmationsRequired: 20,
    credited: false,
  }),
  apiFetch: vi.fn(),
}));

import { CryptoCheckout } from "@/components/billing/crypto-checkout";

describe("CryptoCheckout", () => {
  it("renders amount selector on mount", async () => {
    render(<CryptoCheckout />);
    await waitFor(() => {
      expect(screen.getByText("$25")).toBeInTheDocument();
    });
  });

  it("advances to payment picker after selecting amount", async () => {
    render(<CryptoCheckout />);
    await waitFor(() => screen.getByText("$25"));
    await userEvent.click(screen.getByText("$25"));
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/search/i)).toBeInTheDocument();
    });
  });
});
