import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BulkExportDialog } from "./bulk-export-dialog";

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  selectedCount: 5,
  onConfirm: vi.fn(),
  isLoading: false,
};

describe("BulkExportDialog", () => {
  it("renders dialog title with tenant count", () => {
    render(<BulkExportDialog {...defaultProps} />);
    expect(screen.getByText(/Export data for 5 tenants/)).toBeInTheDocument();
  });

  it("renders all standard export field checkboxes", () => {
    render(<BulkExportDialog {...defaultProps} />);
    expect(screen.getByText("Account info")).toBeInTheDocument();
    expect(screen.getByText("Credit balance")).toBeInTheDocument();
    expect(screen.getByText("Monthly products")).toBeInTheDocument();
    expect(screen.getByText("Lifetime spend")).toBeInTheDocument();
    expect(screen.getByText("Last seen")).toBeInTheDocument();
  });

  it("renders large field (transaction history) with large badge", () => {
    render(<BulkExportDialog {...defaultProps} />);
    expect(screen.getByText("Full transaction history")).toBeInTheDocument();
    expect(screen.getByText("large")).toBeInTheDocument();
  });

  it("calls onConfirm with field config when Generate export clicked", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<BulkExportDialog {...defaultProps} onConfirm={onConfirm} />);
    await user.click(screen.getByText("Generate export"));
    expect(onConfirm).toHaveBeenCalledOnce();
    const fields = onConfirm.mock.calls[0][0] as Array<{ key: string; enabled: boolean }>;
    expect(fields).toHaveLength(6);
    expect(fields.find((f) => f.key === "account_info")?.enabled).toBe(true);
    expect(fields.find((f) => f.key === "transaction_history")?.enabled).toBe(false);
  });

  it("disables Generate export when all fields unchecked", async () => {
    const user = userEvent.setup();
    render(<BulkExportDialog {...defaultProps} />);
    for (const label of [
      "Account info",
      "Credit balance",
      "Monthly products",
      "Lifetime spend",
      "Last seen",
    ]) {
      await user.click(screen.getByLabelText(label));
    }
    expect(screen.getByText("Generate export").closest("button")).toBeDisabled();
  });

  it("calls onOpenChange(false) when Cancel clicked", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(<BulkExportDialog {...defaultProps} onOpenChange={onOpenChange} />);
    await user.click(screen.getByText("Cancel"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables buttons when isLoading", () => {
    render(<BulkExportDialog {...defaultProps} isLoading={true} />);
    expect(screen.getByText("Cancel").closest("button")).toBeDisabled();
    expect(screen.getByText("Generate export").closest("button")).toBeDisabled();
  });
});
