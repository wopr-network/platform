import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PaymentMethodPicker } from "@/components/billing/payment-method-picker";
import type { SupportedPaymentMethod } from "@/lib/api";

const METHODS: SupportedPaymentMethod[] = [
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
  {
    id: "ETH:base",
    type: "native",
    token: "ETH",
    chain: "base",
    displayName: "ETH on Base",
    decimals: 18,
    displayOrder: 2,
    iconUrl: "",
  },
  {
    id: "USDC:polygon",
    type: "erc20",
    token: "USDC",
    chain: "polygon",
    displayName: "USDC on Polygon",
    decimals: 6,
    displayOrder: 3,
    iconUrl: "",
  },
  {
    id: "DOGE:dogecoin",
    type: "native",
    token: "DOGE",
    chain: "dogecoin",
    displayName: "Dogecoin",
    decimals: 8,
    displayOrder: 4,
    iconUrl: "",
  },
];

describe("PaymentMethodPicker", () => {
  it("renders all methods", () => {
    render(<PaymentMethodPicker methods={METHODS} onSelect={vi.fn()} />);
    expect(screen.getByText("Bitcoin")).toBeInTheDocument();
    expect(screen.getByText("USDT on Tron")).toBeInTheDocument();
  });

  it("filters by search text", async () => {
    render(<PaymentMethodPicker methods={METHODS} onSelect={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText(/search/i), "tron");
    expect(screen.getByText("USDT on Tron")).toBeInTheDocument();
    expect(screen.queryByText("Bitcoin")).not.toBeInTheDocument();
  });

  it("filters by Stablecoins pill", async () => {
    render(<PaymentMethodPicker methods={METHODS} onSelect={vi.fn()} />);
    await userEvent.click(screen.getByText("Stablecoins"));
    expect(screen.getByText("USDT on Tron")).toBeInTheDocument();
    expect(screen.getByText("USDC on Polygon")).toBeInTheDocument();
    expect(screen.queryByText("Bitcoin")).not.toBeInTheDocument();
  });

  it("calls onSelect when a method is clicked", async () => {
    const onSelect = vi.fn();
    render(<PaymentMethodPicker methods={METHODS} onSelect={onSelect} />);
    await userEvent.click(screen.getByText("Bitcoin"));
    expect(onSelect).toHaveBeenCalledWith(METHODS[0]);
  });
});
