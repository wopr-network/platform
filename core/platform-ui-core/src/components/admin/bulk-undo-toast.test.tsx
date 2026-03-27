import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BulkUndoToast } from "./bulk-undo-toast";

const defaultProps = {
  visible: true,
  operationId: "op-123",
  description: "Suspended 5 accounts",
  detail: "Operation completed successfully",
  undoDeadline: Date.now() + 300_000,
  onUndo: vi.fn(),
  onDismiss: vi.fn(),
  isUndoing: false,
  windowMs: 300_000,
};

describe("BulkUndoToast", () => {
  it("renders description and detail", () => {
    render(<BulkUndoToast {...defaultProps} />);
    expect(screen.getByText("Suspended 5 accounts")).toBeInTheDocument();
    expect(screen.getByText("Operation completed successfully")).toBeInTheDocument();
  });

  it("renders nothing when not visible", () => {
    const { container } = render(<BulkUndoToast {...defaultProps} visible={false} />);
    expect(container.textContent).toBe("");
  });

  it("shows undo button with countdown", () => {
    render(<BulkUndoToast {...defaultProps} />);
    expect(screen.getByText(/Undo/)).toBeInTheDocument();
    expect(screen.getByText(/remaining/)).toBeInTheDocument();
  });

  it("calls onUndo with operationId when undo clicked", async () => {
    const user = userEvent.setup();
    const onUndo = vi.fn();
    render(<BulkUndoToast {...defaultProps} onUndo={onUndo} />);
    await user.click(screen.getByText(/Undo/));
    expect(onUndo).toHaveBeenCalledWith("op-123");
  });

  it("calls onDismiss when dismiss button clicked", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(<BulkUndoToast {...defaultProps} onDismiss={onDismiss} />);
    await user.click(screen.getByLabelText("Dismiss"));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("disables undo button when isUndoing", () => {
    render(<BulkUndoToast {...defaultProps} isUndoing={true} />);
    expect(screen.getByText(/Undo/).closest("button")).toBeDisabled();
  });

  it("calls onDismiss when countdown reaches zero", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const deadline = Date.now() + 3000;
    render(<BulkUndoToast {...defaultProps} undoDeadline={deadline} onDismiss={onDismiss} />);
    vi.advanceTimersByTime(4000);
    vi.useRealTimers();
    expect(onDismiss).toHaveBeenCalled();
  });
});
