import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VpsUpgradeCard } from "@/components/bot-settings/vps-upgrade-card";

vi.mock("@/lib/api", () => ({
  upgradeToVps: vi.fn(),
}));

vi.mock("@/lib/validate-redirect-url", () => ({
  isAllowedRedirectUrl: vi.fn().mockReturnValue(true),
}));

describe("VpsUpgradeCard", () => {
  it("renders the upgrade card title", () => {
    render(<VpsUpgradeCard botId="bot-1" />);
    expect(screen.getByText("Upgrade to VPS")).toBeInTheDocument();
  });

  it("shows the $15/mo price badge", () => {
    render(<VpsUpgradeCard botId="bot-1" />);
    expect(screen.getByText("$15/mo")).toBeInTheDocument();
  });

  it("displays the description", () => {
    render(<VpsUpgradeCard botId="bot-1" />);
    expect(
      screen.getByText(/dedicated persistent container with fixed monthly pricing/),
    ).toBeInTheDocument();
  });

  it("lists all VPS features", () => {
    render(<VpsUpgradeCard botId="bot-1" />);
    expect(screen.getByText("2 GB RAM / 2 vCPU")).toBeInTheDocument();
    expect(screen.getByText("20 GB SSD")).toBeInTheDocument();
    expect(screen.getByText("Persistent container")).toBeInTheDocument();
    expect(screen.getByText("Dedicated hostname")).toBeInTheDocument();
    expect(screen.getByText("SSH access")).toBeInTheDocument();
    expect(screen.getByText("Flat monthly price")).toBeInTheDocument();
  });

  it("renders the upgrade CTA button", () => {
    render(<VpsUpgradeCard botId="bot-1" />);
    const button = screen.getByRole("button", { name: /Upgrade to VPS/ });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it("shows Stripe checkout redirect notice", () => {
    render(<VpsUpgradeCard botId="bot-1" />);
    expect(screen.getByText(/redirected to Stripe Checkout/)).toBeInTheDocument();
  });
});
