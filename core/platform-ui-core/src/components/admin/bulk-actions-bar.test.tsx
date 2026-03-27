import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BulkActionsBar } from "./bulk-actions-bar";

const defaultProps = {
  selectedCount: 3,
  allMatchingSelected: false,
  hasSuspendedInSelection: false,
  onGrantCredits: vi.fn(),
  onExport: vi.fn(),
  onSuspend: vi.fn(),
  onReactivate: vi.fn(),
  onClearSelection: vi.fn(),
};

describe("BulkActionsBar", () => {
  it("renders nothing when selectedCount is 0", () => {
    const { container } = render(<BulkActionsBar {...defaultProps} selectedCount={0} />);
    expect(container.textContent).toBe("");
  });

  it("shows selected count and action buttons", () => {
    render(<BulkActionsBar {...defaultProps} />);
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    expect(screen.getByText("Grant Credits")).toBeInTheDocument();
    expect(screen.getByText("Export CSV")).toBeInTheDocument();
    expect(screen.getByText("Suspend")).toBeInTheDocument();
    expect(screen.getByText("Clear")).toBeInTheDocument();
  });

  it("shows '(all matching filters)' when allMatchingSelected is true", () => {
    render(<BulkActionsBar {...defaultProps} allMatchingSelected={true} />);
    expect(screen.getByText("(all matching filters)")).toBeInTheDocument();
  });

  it("hides Reactivate button when no suspended in selection", () => {
    render(<BulkActionsBar {...defaultProps} hasSuspendedInSelection={false} />);
    expect(screen.queryByText("Reactivate")).toBeNull();
  });

  it("shows Reactivate button when suspended accounts in selection", () => {
    render(<BulkActionsBar {...defaultProps} hasSuspendedInSelection={true} />);
    expect(screen.getByText("Reactivate")).toBeInTheDocument();
  });

  it("fires onGrantCredits when Grant Credits clicked", async () => {
    const user = userEvent.setup();
    const onGrantCredits = vi.fn();
    render(<BulkActionsBar {...defaultProps} onGrantCredits={onGrantCredits} />);
    await user.click(screen.getByText("Grant Credits"));
    expect(onGrantCredits).toHaveBeenCalledOnce();
  });

  it("fires onExport when Export CSV clicked", async () => {
    const user = userEvent.setup();
    const onExport = vi.fn();
    render(<BulkActionsBar {...defaultProps} onExport={onExport} />);
    await user.click(screen.getByText("Export CSV"));
    expect(onExport).toHaveBeenCalledOnce();
  });

  it("fires onSuspend when Suspend clicked", async () => {
    const user = userEvent.setup();
    const onSuspend = vi.fn();
    render(<BulkActionsBar {...defaultProps} onSuspend={onSuspend} />);
    await user.click(screen.getByText("Suspend"));
    expect(onSuspend).toHaveBeenCalledOnce();
  });

  it("fires onClearSelection when Clear clicked", async () => {
    const user = userEvent.setup();
    const onClearSelection = vi.fn();
    render(<BulkActionsBar {...defaultProps} onClearSelection={onClearSelection} />);
    await user.click(screen.getByText("Clear"));
    expect(onClearSelection).toHaveBeenCalledOnce();
  });

  it("fires onReactivate when Reactivate clicked", async () => {
    const user = userEvent.setup();
    const onReactivate = vi.fn();
    render(
      <BulkActionsBar
        {...defaultProps}
        hasSuspendedInSelection={true}
        onReactivate={onReactivate}
      />,
    );
    await user.click(screen.getByText("Reactivate"));
    expect(onReactivate).toHaveBeenCalledOnce();
  });
});
