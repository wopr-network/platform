import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BulkReactivateDialog } from "./bulk-reactivate-dialog";

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  selectedCount: 2,
  onConfirm: vi.fn(),
  isLoading: false,
};

describe("BulkReactivateDialog", () => {
  it("renders dialog title with count", () => {
    render(<BulkReactivateDialog {...defaultProps} />);
    expect(screen.getByText("Reactivate 2 accounts")).toBeInTheDocument();
  });

  it("shows description about restoring access", () => {
    render(<BulkReactivateDialog {...defaultProps} />);
    expect(screen.getByText(/restored to active status/)).toBeInTheDocument();
  });

  it("calls onConfirm when Reactivate button clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<BulkReactivateDialog {...defaultProps} onConfirm={onConfirm} />);
    await user.click(screen.getByText("Reactivate 2 accounts"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onOpenChange(false) when Cancel clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<BulkReactivateDialog {...defaultProps} onOpenChange={onOpenChange} />);
    await user.click(screen.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables buttons when isLoading", () => {
    render(<BulkReactivateDialog {...defaultProps} isLoading={true} />);
    expect(screen.getByText("Cancel").closest("button")).toBeDisabled();
    expect(screen.getByText("Reactivate 2 accounts").closest("button")).toBeDisabled();
  });

  it("renders nothing when open is false", () => {
    render(<BulkReactivateDialog {...defaultProps} open={false} />);
    expect(screen.queryByText("Reactivate 2 accounts")).toBeNull();
  });
});
