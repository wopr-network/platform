import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BulkSuspendDialog } from "./bulk-suspend-dialog";

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  selectedCount: 4,
  onConfirm: vi.fn(),
  onPreview: vi.fn(),
  isLoading: false,
};

describe("BulkSuspendDialog", () => {
  it("renders dialog title with count", () => {
    render(<BulkSuspendDialog {...defaultProps} />);
    expect(screen.getByText("Suspend")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("accounts")).toBeInTheDocument();
  });

  it("shows warning banner about immediate lockout", () => {
    render(<BulkSuspendDialog {...defaultProps} />);
    expect(screen.getByText(/immediately prevent these accounts/)).toBeInTheDocument();
  });

  it("confirm button is disabled when reason is empty", () => {
    render(<BulkSuspendDialog {...defaultProps} />);
    expect(screen.getByText("Suspend 4 accounts").closest("button")).toBeDisabled();
  });

  it("calls onConfirm with reason and notifyByEmail when submitted", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<BulkSuspendDialog {...defaultProps} onConfirm={onConfirm} />);
    await user.type(screen.getByLabelText("Reason"), "TOS violation");
    await user.click(screen.getByText("Suspend 4 accounts"));
    expect(onConfirm).toHaveBeenCalledWith("TOS violation", false);
  });

  it("calls onConfirm with notifyByEmail=true when checkbox checked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<BulkSuspendDialog {...defaultProps} onConfirm={onConfirm} />);
    await user.type(screen.getByLabelText("Reason"), "cleanup");
    await user.click(screen.getByLabelText("Notify each user by email"));
    await user.click(screen.getByText("Suspend 4 accounts"));
    expect(onConfirm).toHaveBeenCalledWith("cleanup", true);
  });

  it("calls onPreview instead of onConfirm when preview checkbox checked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onPreview = vi.fn();
    render(<BulkSuspendDialog {...defaultProps} onConfirm={onConfirm} onPreview={onPreview} />);
    await user.type(screen.getByLabelText("Reason"), "cleanup");
    await user.click(screen.getByLabelText("Preview list before executing"));
    await user.click(screen.getByText("Suspend 4 accounts"));
    expect(onPreview).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onOpenChange(false) when Cancel clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<BulkSuspendDialog {...defaultProps} onOpenChange={onOpenChange} />);
    await user.click(screen.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables buttons when isLoading", () => {
    render(<BulkSuspendDialog {...defaultProps} isLoading={true} />);
    expect(screen.getByText("Cancel").closest("button")).toBeDisabled();
    expect(screen.getByText("Suspend 4 accounts").closest("button")).toBeDisabled();
  });
});
