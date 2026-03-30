import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { mockToast, mockUpdateBudget } = vi.hoisted(() => ({
  mockToast: { success: vi.fn(), error: vi.fn() },
  mockUpdateBudget: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: mockToast }));
vi.mock("@/lib/paperclip-api", () => ({
  updateInstanceBudget: (...args: unknown[]) => mockUpdateBudget(...args),
}));
vi.mock("@core/app/instances/[id]/instance-detail-client", () => ({
  InstanceDetailClient: () => <div data-testid="instance-detail" />,
}));
vi.mock("@core/components/ui/card", () => ({
  Card: ({ children, ...props }: React.ComponentProps<"div">) => (
    <div data-testid="card" {...props}>
      {children}
    </div>
  ),
  CardContent: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
  CardHeader: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
  CardTitle: ({ children, ...props }: React.ComponentProps<"div">) => <div {...props}>{children}</div>,
}));
vi.mock("@core/components/ui/input", () => ({
  Input: (props: React.ComponentProps<"input">) => <input {...props} />,
}));
vi.mock("@core/lib/errors", () => ({
  toUserMessage: (_err: unknown, fallback: string) => fallback,
}));

import { PaperclipInstanceDetail } from "@/app/(dashboard)/instances/[id]/paperclip-instance-detail";

describe("BudgetSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateBudget.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders budget and per-agent inputs", () => {
    render(<PaperclipInstanceDetail instanceId="inst-1" />);
    expect(screen.getByLabelText(/monthly budget/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/per-agent limit/i)).toBeInTheDocument();
  });

  it("disables save button when budget is empty", () => {
    render(<PaperclipInstanceDetail instanceId="inst-1" />);
    const btn = screen.getByRole("button", { name: /update budget/i });
    expect(btn).toBeDisabled();
  });

  it("shows error toast for negative budget", async () => {
    render(<PaperclipInstanceDetail instanceId="inst-1" />);
    const input = screen.getByLabelText(/monthly budget/i);
    fireEvent.change(input, { target: { value: "-5" } });
    fireEvent.click(screen.getByRole("button", { name: /update budget/i }));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Enter a valid budget amount");
    });
    expect(mockUpdateBudget).not.toHaveBeenCalled();
  });

  it("shows error toast for negative per-agent input", async () => {
    render(<PaperclipInstanceDetail instanceId="inst-1" />);
    fireEvent.change(screen.getByLabelText(/monthly budget/i), {
      target: { value: "50" },
    });
    fireEvent.change(screen.getByLabelText(/per-agent limit/i), {
      target: { value: "-10" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update budget/i }));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalledWith("Enter a valid per-agent limit");
    });
    expect(mockUpdateBudget).not.toHaveBeenCalled();
  });

  it("calls updateInstanceBudget with cents on valid input", async () => {
    render(<PaperclipInstanceDetail instanceId="inst-1" />);
    fireEvent.change(screen.getByLabelText(/monthly budget/i), {
      target: { value: "50.00" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update budget/i }));
    await waitFor(() => {
      expect(mockUpdateBudget).toHaveBeenCalledWith("inst-1", 5000, undefined);
    });
    expect(mockToast.success).toHaveBeenCalledWith("Budget updated");
  });

  it("passes per-agent cents when provided", async () => {
    render(<PaperclipInstanceDetail instanceId="inst-1" />);
    fireEvent.change(screen.getByLabelText(/monthly budget/i), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText(/per-agent limit/i), {
      target: { value: "10" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update budget/i }));
    await waitFor(() => {
      expect(mockUpdateBudget).toHaveBeenCalledWith("inst-1", 10000, 1000);
    });
  });

  it("shows error toast on API failure", async () => {
    mockUpdateBudget.mockRejectedValueOnce(new Error("Network error"));
    render(<PaperclipInstanceDetail instanceId="inst-1" />);
    fireEvent.change(screen.getByLabelText(/monthly budget/i), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update budget/i }));
    await waitFor(() => {
      expect(mockToast.error).toHaveBeenCalled();
    });
  });

  it("disables button and shows spinner while saving", async () => {
    let resolvePromise: (() => void) | undefined;
    mockUpdateBudget.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolvePromise = resolve;
        }),
    );
    render(<PaperclipInstanceDetail instanceId="inst-1" />);
    fireEvent.change(screen.getByLabelText(/monthly budget/i), {
      target: { value: "50" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update budget/i }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /saving/i })).toBeDisabled();
    });
    resolvePromise?.();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /update budget/i })).not.toBeDisabled();
    });
  });
});
