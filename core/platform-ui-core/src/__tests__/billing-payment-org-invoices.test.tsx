import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: { user: { email: "test@example.com" } },
  }),
}));

vi.mock("@/lib/api", () => ({
  getBillingInfo: vi.fn().mockResolvedValue({
    email: "test@example.com",
    paymentMethods: [],
    invoices: [],
  }),
  removePaymentMethod: vi.fn(),
  setDefaultPaymentMethod: vi.fn(),
  updateBillingEmail: vi.fn(),
  apiFetch: vi.fn(),
}));

vi.mock("@/lib/org-api", () => ({
  getOrganization: vi.fn().mockResolvedValue({
    id: "org-1",
    name: "Test Org",
    members: [{ email: "test@example.com", role: "admin" }],
  }),
}));

vi.mock("@/lib/org-billing-api", () => ({
  getOrgBillingInfo: vi.fn().mockResolvedValue({
    paymentMethods: [],
    invoices: [
      {
        id: "inv-org-1",
        date: "2026-01-15T00:00:00Z",
        amount: 4999,
        status: "paid",
        downloadUrl: "https://example.com/invoice/inv-org-1",
      },
      {
        id: "inv-org-2",
        date: "2026-02-15T00:00:00Z",
        amount: 2500,
        status: "pending",
        downloadUrl: "https://example.com/invoice/inv-org-2",
      },
    ],
  }),
}));

vi.mock("@/lib/format-credit", () => ({
  formatCreditStandard: (v: number) => `$${(v / 100).toFixed(2)}`,
}));

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: {
    div: ({ children, ...props }: Record<string, unknown>) => {
      const {
        initial: _i,
        animate: _a,
        exit: _e,
        variants: _v,
        custom: _c,
        transition: _t,
        ...rest
      } = props;
      return <div {...(rest as Record<string, unknown>)}>{children as React.ReactNode}</div>;
    },
    tr: ({ children, ...props }: Record<string, unknown>) => {
      const {
        initial: _i,
        animate: _a,
        exit: _e,
        variants: _v,
        custom: _c,
        transition: _t,
        ...rest
      } = props;
      return <tr {...(rest as Record<string, unknown>)}>{children as React.ReactNode}</tr>;
    },
  },
}));

vi.mock("@/components/billing/add-payment-method-dialog", () => ({
  AddPaymentMethodDialog: () => null,
}));

vi.mock("@/components/billing/byok-callout", () => ({
  ByokCallout: () => null,
}));

import PaymentPage from "@/app/(dashboard)/billing/payment/page";

describe("PaymentPage org invoices", () => {
  it("renders org invoice rows when org context is available", async () => {
    render(<PaymentPage />);

    expect(await screen.findByText("Org Billing History")).toBeInTheDocument();
    expect(await screen.findByText("$49.99")).toBeInTheDocument();
    expect(await screen.findByText("$25.00")).toBeInTheDocument();
    expect(screen.getByText("paid")).toBeInTheDocument();
    expect(screen.getByText("pending")).toBeInTheDocument();

    const downloadLinks = screen.getAllByRole("link", { name: /Download PDF/ });
    expect(downloadLinks.length).toBeGreaterThanOrEqual(2);
  });

  it("shows empty message when org has no invoices", async () => {
    const { getOrgBillingInfo } = await import("@/lib/org-billing-api");
    vi.mocked(getOrgBillingInfo).mockResolvedValueOnce({
      paymentMethods: [],
      invoices: [],
    });

    render(<PaymentPage />);

    expect(await screen.findByText("Org Billing History")).toBeInTheDocument();
    expect(screen.getByText("No org invoices yet.")).toBeInTheDocument();
  });
});
