import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ConfirmationTracker } from "@/components/billing/confirmation-tracker";

describe("ConfirmationTracker", () => {
  it("shows confirmation progress", () => {
    render(
      <ConfirmationTracker
        confirmations={8}
        confirmationsRequired={20}
        displayAmount="25.00 USDT"
        credited={false}
      />,
    );
    expect(screen.getByText(/8/)).toBeInTheDocument();
    expect(screen.getByText(/20/)).toBeInTheDocument();
    expect(screen.getByText(/25\.00 USDT/)).toBeInTheDocument();
  });

  it("shows credited state", () => {
    render(
      <ConfirmationTracker
        confirmations={20}
        confirmationsRequired={20}
        displayAmount="25.00 USDT"
        credited={true}
      />,
    );
    expect(screen.getByText(/credits applied/i)).toBeInTheDocument();
  });

  it("renders progress bar", () => {
    render(
      <ConfirmationTracker
        confirmations={10}
        confirmationsRequired={20}
        displayAmount="25.00 USDT"
        credited={false}
      />,
    );
    const bar = screen.getByRole("progressbar");
    expect(bar).toBeInTheDocument();
  });

  it("shows tx hash when provided", () => {
    render(
      <ConfirmationTracker
        confirmations={5}
        confirmationsRequired={20}
        displayAmount="25.00 USDT"
        credited={false}
        txHash="0xabc123"
      />,
    );
    expect(screen.getByText(/0xabc123/)).toBeInTheDocument();
  });
});
