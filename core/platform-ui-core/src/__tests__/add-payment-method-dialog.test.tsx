import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock Stripe
const mockConfirmSetup = vi.fn();
const mockUseStripe = vi.fn(() => ({ confirmSetup: mockConfirmSetup }));
const mockUseElements = vi.fn(() => ({}));

vi.mock("@stripe/react-stripe-js", () => ({
  Elements: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="stripe-elements">{children}</div>
  ),
  PaymentElement: () => <div data-testid="payment-element" />,
  useStripe: () => mockUseStripe(),
  useElements: () => mockUseElements(),
}));

vi.mock("@stripe/stripe-js", () => ({
  loadStripe: vi.fn(() => Promise.resolve({})),
}));

vi.mock("@/lib/api", () => ({
  createSetupIntent: vi.fn(),
}));

vi.mock("@/lib/org-billing-api", () => ({
  createOrgSetupIntent: vi.fn(),
}));

import { AddPaymentMethodDialog } from "@/components/billing/add-payment-method-dialog";
import { createSetupIntent } from "@/lib/api";
import { createOrgSetupIntent } from "@/lib/org-billing-api";

describe("AddPaymentMethodDialog", () => {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (createSetupIntent as ReturnType<typeof vi.fn>).mockResolvedValue({
      clientSecret: "seti_test_secret_123",
    });
  });

  it("fetches setup intent and renders PaymentElement when opened", async () => {
    render(
      <AddPaymentMethodDialog open={true} onOpenChange={onOpenChange} onSuccess={onSuccess} />,
    );

    await waitFor(() => {
      expect(createSetupIntent).toHaveBeenCalledOnce();
      expect(screen.getByTestId("stripe-elements")).toBeInTheDocument();
      expect(screen.getByTestId("payment-element")).toBeInTheDocument();
    });
  });

  it("shows error and retry button when setup intent fails", async () => {
    (createSetupIntent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Network error"),
    );

    render(
      <AddPaymentMethodDialog open={true} onOpenChange={onOpenChange} onSuccess={onSuccess} />,
    );

    await waitFor(() => {
      expect(screen.getByText(/failed to initialize/i)).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("calls confirmSetup on form submit and triggers onSuccess", async () => {
    mockConfirmSetup.mockResolvedValueOnce({ setupIntent: { status: "succeeded" } });

    render(
      <AddPaymentMethodDialog open={true} onOpenChange={onOpenChange} onSuccess={onSuccess} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("payment-element")).toBeInTheDocument();
    });

    const saveButton = screen.getByRole("button", { name: /save card/i });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(mockConfirmSetup).toHaveBeenCalled();
      expect(onSuccess).toHaveBeenCalled();
    });
  });

  it("shows Stripe error message on confirmSetup failure", async () => {
    mockConfirmSetup.mockResolvedValueOnce({
      error: { message: "Your card was declined." },
    });

    render(
      <AddPaymentMethodDialog open={true} onOpenChange={onOpenChange} onSuccess={onSuccess} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("payment-element")).toBeInTheDocument();
    });

    const saveButton = screen.getByRole("button", { name: /save card/i });
    await userEvent.click(saveButton);

    await waitFor(() => {
      expect(screen.getByText("Your card was declined.")).toBeInTheDocument();
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("does not fetch setup intent when closed", () => {
    render(
      <AddPaymentMethodDialog open={false} onOpenChange={onOpenChange} onSuccess={onSuccess} />,
    );

    expect(createSetupIntent).not.toHaveBeenCalled();
  });

  it("closes dialog when cancel is clicked", async () => {
    render(
      <AddPaymentMethodDialog open={true} onOpenChange={onOpenChange} onSuccess={onSuccess} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("payment-element")).toBeInTheDocument();
    });

    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    await userEvent.click(cancelButton);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("calls createOrgSetupIntent and shows org dialog title when orgId is provided", async () => {
    (createOrgSetupIntent as ReturnType<typeof vi.fn>).mockResolvedValue({
      clientSecret: "seti_org_test_secret_456",
    });

    render(
      <AddPaymentMethodDialog
        open={true}
        onOpenChange={onOpenChange}
        onSuccess={onSuccess}
        orgId="org-123"
      />,
    );

    await waitFor(() => {
      expect(createOrgSetupIntent).toHaveBeenCalledWith("org-123");
      expect(createSetupIntent).not.toHaveBeenCalled();
      expect(screen.getByText("Add org payment method")).toBeInTheDocument();
    });
  });
});
