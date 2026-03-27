import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/billing/credits",
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: () => ({ data: null, isPending: false, error: null }),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  }),
}));

vi.mock("@/lib/org-billing-api", () => ({
  getOrgCreditBalance: vi.fn().mockResolvedValue({ balance: 50, dailyBurn: 1, runway: 50 }),
  getOrgMemberUsage: vi.fn().mockResolvedValue({
    orgId: "org-1",
    periodStart: "2026-02-01T00:00:00.000Z",
    members: [
      {
        memberId: "m1",
        name: "Alice",
        email: "alice@test.com",
        creditsConsumed: 12.5,
        lastActiveAt: "2026-02-24T10:00:00Z",
      },
      {
        memberId: "m2",
        name: "Bob",
        email: "bob@test.com",
        creditsConsumed: 7.3,
        lastActiveAt: null,
      },
    ],
  }),
  getOrgBillingInfo: vi.fn().mockResolvedValue({
    paymentMethods: [
      {
        id: "pm-1",
        brand: "visa",
        last4: "4242",
        expiryMonth: 12,
        expiryYear: 2027,
        isDefault: true,
      },
      {
        id: "pm-2",
        brand: "mastercard",
        last4: "5555",
        expiryMonth: 6,
        expiryYear: 2028,
        isDefault: false,
      },
    ],
    invoices: [],
  }),
  setOrgDefaultPaymentMethod: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getCreditOptions: vi.fn().mockResolvedValue([]),
  };
});

import { OrgBillingPage } from "@/components/billing/org-billing-page";

describe("OrgBillingPage", () => {
  it("renders org credit balance heading", async () => {
    render(<OrgBillingPage orgId="org-1" orgName="Test Org" isAdmin={true} />);
    expect(await screen.findByText("Org Credits")).toBeInTheDocument();
  });

  it("shows org context banner", async () => {
    render(<OrgBillingPage orgId="org-1" orgName="Test Org" isAdmin={true} />);
    expect(await screen.findByText("Test Org")).toBeInTheDocument();
  });

  it("shows per-member usage table for admins", async () => {
    render(<OrgBillingPage orgId="org-1" orgName="Test Org" isAdmin={true} />);
    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(await screen.findByText("Bob")).toBeInTheDocument();
  });

  it("hides per-member usage for non-admins", async () => {
    render(<OrgBillingPage orgId="org-1" orgName="Test Org" isAdmin={false} />);
    expect(await screen.findByText("Org Credits")).toBeInTheDocument();
    const memberTable = screen.queryByText("Per-Member Usage");
    expect(memberTable).not.toBeInTheDocument();
  });

  it("shows org payment methods card", async () => {
    render(<OrgBillingPage orgId="org-1" orgName="Test Org" isAdmin={true} />);
    expect(await screen.findByText("Org Payment Methods")).toBeInTheDocument();
  });

  it("hides buy credits panel for non-admins", async () => {
    render(<OrgBillingPage orgId="org-1" orgName="Test Org" isAdmin={false} />);
    expect(await screen.findByText("Org Credits")).toBeInTheDocument();
    const buyCredits = screen.queryByText("Buy Credits");
    expect(buyCredits).not.toBeInTheDocument();
  });

  it("delete button is disabled with no click handler when backend is not ready", async () => {
    render(<OrgBillingPage orgId="org-1" orgName="Test Org" isAdmin={true} />);
    const card = await screen.findByText("**** 4242");
    expect(card).toBeInTheDocument();
    const buttons = screen.queryAllByRole("button");
    const trashButtons = buttons.filter((b) => b.querySelector("svg.lucide-trash-2"));
    expect(trashButtons).toHaveLength(0);
  });

  it("add payment method button is disabled when backend is not ready", async () => {
    render(<OrgBillingPage orgId="org-1" orgName="Test Org" isAdmin={true} />);
    await screen.findByText("Org Payment Methods");
    const addBtn = screen.queryByRole("button", { name: /add payment method/i });
    expect(addBtn).not.toBeInTheDocument();
  });

  it("non-admin does not see add or delete buttons", async () => {
    render(<OrgBillingPage orgId="org-1" orgName="Test Org" isAdmin={false} />);
    await screen.findByText("Org Payment Methods");
    const addBtn = screen.queryByRole("button", { name: /add payment method/i });
    expect(addBtn).not.toBeInTheDocument();
  });

  it("shows 'Set as default' button for non-default payment methods when admin", async () => {
    render(<OrgBillingPage orgId="org-1" orgName="Test Org" isAdmin={true} />);
    const setDefaultBtn = await screen.findByRole("button", { name: /set as default/i });
    expect(setDefaultBtn).toBeInTheDocument();
  });

  it("does not show 'Set as default' on the default payment method", async () => {
    render(<OrgBillingPage orgId="org-1" orgName="Test Org" isAdmin={true} />);
    await screen.findByText("Org Payment Methods");
    const badges = screen.getAllByText("Default");
    expect(badges.length).toBeGreaterThanOrEqual(1);
    const setDefaultBtns = screen.queryAllByRole("button", { name: /set as default/i });
    expect(setDefaultBtns).toHaveLength(1);
  });

  it("hides 'Set as default' for non-admin users", async () => {
    render(<OrgBillingPage orgId="org-1" orgName="Test Org" isAdmin={false} />);
    await screen.findByText("Org Payment Methods");
    expect(screen.queryByRole("button", { name: /set as default/i })).not.toBeInTheDocument();
  });

  it("calls setOrgDefaultPaymentMethod with correct args on click", async () => {
    const { setOrgDefaultPaymentMethod } = await import("@/lib/org-billing-api");
    render(<OrgBillingPage orgId="org-1" orgName="Test Org" isAdmin={true} />);
    const setDefaultBtn = await screen.findByRole("button", { name: /set as default/i });
    await userEvent.click(setDefaultBtn);
    expect(setOrgDefaultPaymentMethod).toHaveBeenCalledWith("org-1", "pm-2");
  });

  it("disables ALL set-default buttons while any operation is in flight", async () => {
    const { setOrgDefaultPaymentMethod } = await import("@/lib/org-billing-api");
    let resolveApi!: () => void;
    vi.mocked(setOrgDefaultPaymentMethod).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveApi = resolve;
        }),
    );

    render(<OrgBillingPage orgId="org-1" orgName="Test Org" isAdmin={true} />);
    const setDefaultBtn = await screen.findByRole("button", { name: /set as default/i });

    // Click — operation is now in-flight
    await userEvent.click(setDefaultBtn);

    // All set-default buttons must be disabled while in-flight
    const buttons = screen.getAllByRole("button", { name: /set as default|setting/i });
    for (const btn of buttons) {
      expect(btn).toBeDisabled();
    }

    // Resolve and verify button re-enables
    resolveApi();
    await screen.findByRole("button", { name: /set as default/i });
  });
});
