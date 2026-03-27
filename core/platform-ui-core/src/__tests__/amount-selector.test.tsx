import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AmountSelector } from "@/components/billing/amount-selector";

describe("AmountSelector", () => {
  it("renders preset amounts", () => {
    render(<AmountSelector onSelect={vi.fn()} />);
    expect(screen.getByText("$10")).toBeInTheDocument();
    expect(screen.getByText("$25")).toBeInTheDocument();
    expect(screen.getByText("$50")).toBeInTheDocument();
    expect(screen.getByText("$100")).toBeInTheDocument();
  });

  it("calls onSelect with chosen amount", async () => {
    const onSelect = vi.fn();
    render(<AmountSelector onSelect={onSelect} />);
    await userEvent.click(screen.getByText("$25"));
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onSelect).toHaveBeenCalledWith(25);
  });

  it("supports custom amount input", async () => {
    const onSelect = vi.fn();
    render(<AmountSelector onSelect={onSelect} />);
    const input = screen.getByPlaceholderText(/custom/i);
    await userEvent.type(input, "75");
    await userEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onSelect).toHaveBeenCalledWith(75);
  });

  it("disables continue when no amount selected", () => {
    render(<AmountSelector onSelect={vi.fn()} />);
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });
});
