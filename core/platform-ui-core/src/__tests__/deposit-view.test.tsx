import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DepositView } from "@/components/billing/deposit-view";

vi.mock("qrcode.react", () => ({
  QRCodeSVG: ({ value }: { value: string }) => <div data-testid="qr" data-value={value} />,
}));

const CHECKOUT = {
  depositAddress: "THwbQb1sPiRUpUYunVQxQKc6i4LCmpP1mj",
  displayAmount: "32.24 TRX",
  amountUsd: 10,
  token: "TRX",
  chain: "tron",
  referenceId: "trx:test123",
};

describe("DepositView", () => {
  it("shows deposit address and amount", () => {
    render(<DepositView checkout={CHECKOUT} status="waiting" onBack={vi.fn()} />);
    expect(screen.getByText(/32\.24 TRX/)).toBeInTheDocument();
    expect(screen.getByText(/THwbQb1s/)).toBeInTheDocument();
  });

  it("shows waiting status", () => {
    render(<DepositView checkout={CHECKOUT} status="waiting" onBack={vi.fn()} />);
    expect(screen.getByText(/waiting for payment/i)).toBeInTheDocument();
  });

  it("renders QR code", () => {
    render(<DepositView checkout={CHECKOUT} status="waiting" onBack={vi.fn()} />);
    expect(screen.getByTestId("qr")).toBeInTheDocument();
  });

  it("copies address to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<DepositView checkout={CHECKOUT} status="waiting" onBack={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /copy/i }));
    expect(writeText).toHaveBeenCalledWith(CHECKOUT.depositAddress);
  });
});
