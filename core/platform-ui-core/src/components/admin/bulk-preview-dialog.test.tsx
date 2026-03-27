import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BulkPreviewDialog } from "./bulk-preview-dialog";

const tenants = [
  { tenantId: "t-1", name: "Alice", email: "alice@example.com", status: "active" },
  { tenantId: "t-2", name: null, email: "bob@example.com", status: "suspended" },
];

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  tenants,
  actionLabel: "Suspend 2 accounts",
  actionVariant: "destructive" as const,
  onBack: vi.fn(),
  onConfirm: vi.fn(),
  isLoading: false,
};

describe("BulkPreviewDialog", () => {
  it("renders tenant count in title", () => {
    render(<BulkPreviewDialog {...defaultProps} />);
    expect(screen.getByText(/2 tenants will be affected/)).toBeInTheDocument();
  });

  it("renders tenant rows with data", () => {
    render(<BulkPreviewDialog {...defaultProps} />);
    expect(screen.getByText("t-1")).toBeInTheDocument();
    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
  });

  it("shows empty state when no tenants", () => {
    render(<BulkPreviewDialog {...defaultProps} tenants={[]} />);
    expect(screen.getByText("No matching tenants found.")).toBeInTheDocument();
  });

  it("fires onConfirm when action button clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<BulkPreviewDialog {...defaultProps} onConfirm={onConfirm} />);
    await user.click(screen.getByText("Suspend 2 accounts"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("fires onBack when Back clicked", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(<BulkPreviewDialog {...defaultProps} onBack={onBack} />);
    await user.click(screen.getByText("Back"));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("fires onOpenChange(false) when Cancel clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<BulkPreviewDialog {...defaultProps} onOpenChange={onOpenChange} />);
    await user.click(screen.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables all buttons when isLoading", () => {
    render(<BulkPreviewDialog {...defaultProps} isLoading={true} />);
    expect(screen.getByText("Cancel").closest("button")).toBeDisabled();
    expect(screen.getByText("Back").closest("button")).toBeDisabled();
    expect(screen.getByText("Suspend 2 accounts").closest("button")).toBeDisabled();
  });
});
