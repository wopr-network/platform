import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BulkGrantDialog } from "./bulk-grant-dialog";

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  selectedCount: 3,
  onConfirm: vi.fn(),
  isLoading: false,
};

describe("BulkGrantDialog", () => {
  it("renders dialog with tenant count", () => {
    render(<BulkGrantDialog {...defaultProps} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText(/tenants/)).toBeInTheDocument();
  });

  it("confirm button is disabled when amount is 0", () => {
    render(<BulkGrantDialog {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    const confirmBtn = buttons.find(
      (b) => b.textContent?.includes("Grant") && b.textContent?.includes("="),
    );
    expect(confirmBtn).toBeDisabled();
  });

  it("confirm button is disabled when reason is empty but amount is set", async () => {
    const user = userEvent.setup();
    render(<BulkGrantDialog {...defaultProps} />);
    await user.type(screen.getByLabelText("Amount per tenant"), "5");
    const buttons = screen.getAllByRole("button");
    const confirmBtn = buttons.find(
      (b) => b.textContent?.includes("Grant") && b.textContent?.includes("="),
    );
    expect(confirmBtn).toBeDisabled();
  });

  it("calls onConfirm with amountCents, reason, notifyByEmail when valid", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<BulkGrantDialog {...defaultProps} onConfirm={onConfirm} />);
    await user.type(screen.getByLabelText("Amount per tenant"), "5.00");
    await user.type(screen.getByLabelText("Reason"), "Service outage");
    await user.click(screen.getByRole("button", { name: /Grant.*=/ }));
    expect(onConfirm).toHaveBeenCalledWith(500, "Service outage", false);
  });

  it("shows total cost formatted after entering amount", async () => {
    const user = userEvent.setup();
    render(<BulkGrantDialog {...defaultProps} />);
    await user.type(screen.getByLabelText("Amount per tenant"), "10");
    expect(screen.getByText(/Total:/)).toBeInTheDocument();
  });

  it("passes notifyByEmail=true when checkbox checked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<BulkGrantDialog {...defaultProps} onConfirm={onConfirm} />);
    await user.type(screen.getByLabelText("Amount per tenant"), "5");
    await user.type(screen.getByLabelText("Reason"), "test");
    await user.click(screen.getByLabelText("Notify each user by email"));
    await user.click(screen.getByRole("button", { name: /Grant.*=/ }));
    expect(onConfirm).toHaveBeenCalledWith(500, "test", true);
  });

  it("calls onOpenChange(false) when Cancel clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<BulkGrantDialog {...defaultProps} onOpenChange={onOpenChange} />);
    await user.click(screen.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables Cancel when isLoading", () => {
    render(<BulkGrantDialog {...defaultProps} isLoading={true} />);
    expect(screen.getByText("Cancel").closest("button")).toBeDisabled();
  });
});
