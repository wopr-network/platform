import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type {
  BillingInfo,
  BillingUsage,
  BillingUsageSummary,
  HostedUsageEvent,
  HostedUsageSummary,
  ProviderCost,
  SpendingLimits,
  UsageDataPoint,
} from "@/lib/api";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/billing/plans",
}));

// Mock better-auth/react
vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: () => ({ data: null, isPending: false, error: null }),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  }),
}));

const MOCK_USAGE: BillingUsage = {
  plan: "pro",
  planName: "Pro",
  billingPeriodStart: "2026-02-01T00:00:00Z",
  billingPeriodEnd: "2026-02-28T23:59:59Z",
  instancesRunning: 3,
  instanceCap: 5,
  storageUsedGb: 2.1,
  storageCapGb: 10,
  apiCalls: 12450,
};

const MOCK_PROVIDER_COSTS: ProviderCost[] = [
  {
    provider: "Anthropic",
    estimatedCost: 23.4,
    inputTokens: 580000,
    outputTokens: 410000,
  },
  {
    provider: "OpenAI",
    estimatedCost: 8.12,
    inputTokens: 210000,
    outputTokens: 145000,
  },
];

const MOCK_HOSTED_USAGE: HostedUsageSummary = {
  periodStart: "2026-02-01T00:00:00Z",
  periodEnd: "2026-02-28T23:59:59Z",
  capabilities: [
    {
      capability: "transcription",
      label: "Transcription",
      units: 42,
      unitLabel: "min",
      cost: 0.25,
    },
    {
      capability: "image_gen",
      label: "Image Generation",
      units: 18,
      unitLabel: "images",
      cost: 0.9,
    },
    {
      capability: "text_gen",
      label: "Text Generation",
      units: 125000,
      unitLabel: "tokens",
      cost: 0.25,
    },
    {
      capability: "embeddings",
      label: "Embeddings",
      units: 500000,
      unitLabel: "tokens",
      cost: 0.05,
    },
  ],
  totalCost: 1.45,
  includedCredit: 50,
  amountDue: 0,
};

const MOCK_USAGE_SUMMARY: BillingUsageSummary = {
  periodStart: "2026-02-01T00:00:00Z",
  periodEnd: "2026-02-28T23:59:59Z",
  totalSpend: 45.5,
  includedCredit: 50.0,
  amountDue: 0,
  planName: "Pro",
};

const MOCK_HOSTED_EVENTS: HostedUsageEvent[] = [
  {
    id: "evt-1",
    date: "2026-02-10T12:00:00Z",
    capability: "transcription",
    provider: "Whisper",
    units: 10,
    unitLabel: "min",
    cost: 0.06,
  },
  {
    id: "evt-2",
    date: "2026-02-11T14:00:00Z",
    capability: "image_gen",
    provider: "DALL-E",
    units: 5,
    unitLabel: "images",
    cost: 0.25,
  },
];

const MOCK_SPENDING_LIMITS: SpendingLimits = {
  global: { alertAt: 100, hardCap: 200 },
  perCapability: {
    transcription: { alertAt: null, hardCap: null },
    image_gen: { alertAt: 10, hardCap: 50 },
    text_gen: { alertAt: null, hardCap: null },
    embeddings: { alertAt: null, hardCap: null },
  },
};

function generateUsageHistory(days: number): UsageDataPoint[] {
  const now = new Date();
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (days - 1 - i));
    return {
      date: d.toISOString().split("T")[0],
      apiCalls: Math.floor(Math.random() * 800) + 200,
      instances: Math.floor(Math.random() * 3) + 1,
    };
  });
}

const MOCK_BILLING_INFO: BillingInfo = {
  email: "billing@acme.com",
  paymentMethods: [
    {
      id: "pm-1",
      brand: "Visa",
      last4: "4242",
      expiryMonth: 12,
      expiryYear: 2027,
      isDefault: true,
    },
    {
      id: "pm-2",
      brand: "Mastercard",
      last4: "5555",
      expiryMonth: 6,
      expiryYear: 2028,
      isDefault: false,
    },
  ],
  invoices: [
    {
      id: "inv-003",
      date: "2026-02-01T00:00:00Z",
      amount: 29,
      status: "pending",
      downloadUrl: "https://stripe.com/invoice-003.pdf",
      hostedUrl: "",
    },
    {
      id: "inv-002",
      date: "2026-01-01T00:00:00Z",
      amount: 29,
      status: "paid",
      downloadUrl: "",
      hostedUrl: "https://invoice.stripe.com/i/inv-002",
    },
    {
      id: "inv-001",
      date: "2025-12-01T00:00:00Z",
      amount: 29,
      status: "paid",
      downloadUrl: "",
      hostedUrl: "",
    },
  ],
};

// Mock @/lib/api with BYOK mode by default (for backward compat with existing tests)
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getBillingUsage: vi.fn().mockResolvedValue(MOCK_USAGE),
    getProviderCosts: vi.fn().mockResolvedValue(MOCK_PROVIDER_COSTS),
    getUsageHistory: vi.fn().mockResolvedValue(generateUsageHistory(30)),
    getBillingInfo: vi.fn().mockResolvedValue(MOCK_BILLING_INFO),
    updateBillingEmail: vi.fn().mockResolvedValue(undefined),
    removePaymentMethod: vi.fn().mockResolvedValue(undefined),
    setDefaultPaymentMethod: vi.fn().mockResolvedValue(undefined),
    getInferenceMode: vi.fn().mockResolvedValue("byok"),
    getHostedUsageSummary: vi.fn().mockResolvedValue(MOCK_HOSTED_USAGE),
    getHostedUsageEvents: vi.fn().mockResolvedValue(MOCK_HOSTED_EVENTS),
    getSpendingLimits: vi.fn().mockResolvedValue(MOCK_SPENDING_LIMITS),
    updateSpendingLimits: vi.fn().mockResolvedValue(undefined),
    getBillingUsageSummary: vi.fn().mockResolvedValue(MOCK_USAGE_SUMMARY),
  };
});

describe("Plans page", () => {
  it("renders Your Plan heading", async () => {
    const { default: PlansPage } = await import("../app/(dashboard)/billing/plans/page");
    render(<PlansPage />);

    expect(screen.getByText("Your Plan")).toBeInTheDocument();
    expect(screen.getByText("Simple pricing. No tiers. No gotchas.")).toBeInTheDocument();
  });

  it("renders flat $5/month pricing", async () => {
    const { default: PlansPage } = await import("../app/(dashboard)/billing/plans/page");
    render(<PlansPage />);

    expect(screen.getByText("per bot")).toBeInTheDocument();
    expect(screen.getByText(/\/month/)).toBeInTheDocument();
  });

  it("shows BYOK callout", async () => {
    const { default: PlansPage } = await import("../app/(dashboard)/billing/plans/page");
    render(<PlansPage />);

    expect(await screen.findByText("Bring Your Own Keys")).toBeInTheDocument();
    expect(
      screen.getAllByText(/Platform never touches your inference/).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("links to full pricing page", async () => {
    const { default: PlansPage } = await import("../app/(dashboard)/billing/plans/page");
    render(<PlansPage />);

    const link = screen.getByRole("link", { name: /view full pricing/i });
    expect(link).toHaveAttribute("href", "/pricing");
  });

  it("shows included features", async () => {
    const { default: PlansPage } = await import("../app/(dashboard)/billing/plans/page");
    render(<PlansPage />);

    expect(screen.getByText(/signup credit included/)).toBeInTheDocument();
    expect(screen.getByText("All channels")).toBeInTheDocument();
    expect(screen.getByText("All plugins")).toBeInTheDocument();
    expect(screen.getByText("All providers")).toBeInTheDocument();
  });
});

describe("Usage page", () => {
  it("renders usage heading and billing period", async () => {
    const { default: UsagePage } = await import("../app/(dashboard)/billing/usage/page");
    render(<UsagePage />);

    // Initially shows skeleton loading state
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(await screen.findByText("Usage")).toBeInTheDocument();
    expect(screen.getAllByText(/Pro plan/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders platform usage metrics", async () => {
    const { default: UsagePage } = await import("../app/(dashboard)/billing/usage/page");
    render(<UsagePage />);

    expect(await screen.findByText("Platform Usage")).toBeInTheDocument();
    expect(screen.getAllByText("Instances")[0]).toBeInTheDocument();
    expect(screen.getByText("Storage")).toBeInTheDocument();
    expect(screen.getByText("API calls")).toBeInTheDocument();
  });

  it("renders usage values", async () => {
    const { default: UsagePage } = await import("../app/(dashboard)/billing/usage/page");
    render(<UsagePage />);

    expect(await screen.findByText("3 of 5")).toBeInTheDocument();
    expect(screen.getByText("2.1 of 10.0 GB")).toBeInTheDocument();
    expect(screen.getByText("12,450 this month")).toBeInTheDocument();
  });

  it("renders BYOK cost tracker toggle", async () => {
    const { default: UsagePage } = await import("../app/(dashboard)/billing/usage/page");
    render(<UsagePage />);

    expect(await screen.findByText("BYOK Cost Tracker")).toBeInTheDocument();
    expect(screen.getByLabelText("Off")).toBeInTheDocument();
  });

  it("shows provider costs when cost tracker is enabled", async () => {
    const user = userEvent.setup();
    const { default: UsagePage } = await import("../app/(dashboard)/billing/usage/page");
    render(<UsagePage />);

    const toggle = await screen.findByRole("switch", { name: /off/i });
    await user.click(toggle);

    expect(await screen.findByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(
      screen.getByText((_, element) => element?.textContent === "~$23.40"),
    ).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === "~$8.12")).toBeInTheDocument();
    expect(screen.getByText(/Platform does not charge for inference/)).toBeInTheDocument();
  });

  it("renders billing usage summary card with total spend", async () => {
    const { default: UsagePage } = await import("../app/(dashboard)/billing/usage/page");
    render(<UsagePage />);

    expect(await screen.findByText("Billing Summary")).toBeInTheDocument();
    expect(screen.getByText("$45.50")).toBeInTheDocument();
    expect(screen.getByText("-$50.00")).toBeInTheDocument();
    expect(screen.getAllByText("$0.00").length).toBeGreaterThanOrEqual(1);
  });

  it("renders usage over time chart", async () => {
    const { default: UsagePage } = await import("../app/(dashboard)/billing/usage/page");
    render(<UsagePage />);

    expect(await screen.findByText("Usage Over Time")).toBeInTheDocument();
    expect(screen.getByText("Daily API calls over the last 30 days")).toBeInTheDocument();
  });
});

describe("Payment page", () => {
  it("renders payment heading", async () => {
    const { default: PaymentPage } = await import("../app/(dashboard)/billing/payment/page");
    render(<PaymentPage />);

    // Initially shows skeleton loading state
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(await screen.findByText("Payment")).toBeInTheDocument();
  });

  it("renders payment methods", async () => {
    const { default: PaymentPage } = await import("../app/(dashboard)/billing/payment/page");
    render(<PaymentPage />);

    expect(await screen.findByText("Payment Methods")).toBeInTheDocument();
    expect(screen.getByText(/4242/)).toBeInTheDocument();
    expect(screen.getByText("Visa")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
  });

  it("renders add payment method button", async () => {
    const { default: PaymentPage } = await import("../app/(dashboard)/billing/payment/page");
    render(<PaymentPage />);

    expect(await screen.findByRole("button", { name: "Add payment method" })).toBeInTheDocument();
  });

  it("renders billing email form", async () => {
    const { default: PaymentPage } = await import("../app/(dashboard)/billing/payment/page");
    render(<PaymentPage />);

    expect(await screen.findByText("Billing Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save email" })).toBeInTheDocument();
  });

  it("renders billing history", async () => {
    const { default: PaymentPage } = await import("../app/(dashboard)/billing/payment/page");
    render(<PaymentPage />);

    expect(await screen.findByText("Billing History")).toBeInTheDocument();
    // Multiple invoices with the same amount
    expect(screen.getAllByText("$29.00").length).toBe(3);
    expect(screen.getAllByText("paid").length).toBe(2);
  });

  it("renders Download PDF link when downloadUrl is present", async () => {
    const { default: PaymentPage } = await import("../app/(dashboard)/billing/payment/page");
    render(<PaymentPage />);

    const pdfLink = await screen.findByRole("link", { name: /Download PDF/ });
    expect(pdfLink).toHaveAttribute("href", "https://stripe.com/invoice-003.pdf");
    expect(pdfLink).toHaveAttribute("target", "_blank");
  });

  it("renders View in Stripe link when only hostedUrl is present", async () => {
    const { default: PaymentPage } = await import("../app/(dashboard)/billing/payment/page");
    render(<PaymentPage />);

    const stripeLink = await screen.findByRole("link", { name: /View in Stripe/ });
    expect(stripeLink).toHaveAttribute("href", "https://invoice.stripe.com/i/inv-002");
    expect(stripeLink).toHaveAttribute("target", "_blank");
  });

  it("renders no action when neither downloadUrl nor hostedUrl is present", async () => {
    const { default: PaymentPage } = await import("../app/(dashboard)/billing/payment/page");
    render(<PaymentPage />);

    // Wait for invoices to render (3 rows each showing "$29.00")
    const amountCells = await screen.findAllByText("$29.00");
    // inv-001 has no downloadUrl and no hostedUrl — the row should render no <a> element at all
    // The 3rd amount cell belongs to inv-001 (oldest invoice, no URLs)
    const inv001Row = amountCells[2].closest("tr");
    expect(inv001Row ? within(inv001Row).queryByRole("link") : null).toBeNull();
  });

  it("renders BYOK messaging", async () => {
    const { default: PaymentPage } = await import("../app/(dashboard)/billing/payment/page");
    render(<PaymentPage />);

    expect(await screen.findByText(/Platform never touches your inference/)).toBeInTheDocument();
  });

  it("renders remove button for payment methods", async () => {
    const { default: PaymentPage } = await import("../app/(dashboard)/billing/payment/page");
    render(<PaymentPage />);

    const removeButtons = await screen.findAllByRole("button", {
      name: "Remove",
    });
    expect(removeButtons.length).toBe(2);
  });

  it("shows 'Set as default' button only for non-default payment methods", async () => {
    const { default: PaymentPage } = await import("../app/(dashboard)/billing/payment/page");
    render(<PaymentPage />);

    const setDefaultButtons = await screen.findAllByRole("button", {
      name: "Set as default",
    });
    expect(setDefaultButtons).toHaveLength(1);
  });

  it("calls setDefaultPaymentMethod and updates UI on click", async () => {
    const user = userEvent.setup();
    const api = await import("@/lib/api");
    const { default: PaymentPage } = await import("../app/(dashboard)/billing/payment/page");
    render(<PaymentPage />);

    const setDefaultBtn = await screen.findByRole("button", {
      name: "Set as default",
    });
    await user.click(setDefaultBtn);

    expect(api.setDefaultPaymentMethod).toHaveBeenCalledWith("pm-2");
  });
});

describe("Billing layout", () => {
  it("renders billing navigation links", async () => {
    const { default: BillingLayout } = await import("../app/(dashboard)/billing/layout");
    render(
      <BillingLayout>
        <div>child content</div>
      </BillingLayout>,
    );

    expect(screen.getByText("Your Plan")).toBeInTheDocument();
    expect(screen.getByText("Usage")).toBeInTheDocument();
    expect(screen.getByText("Payment")).toBeInTheDocument();
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("shows Hosted Usage nav for hosted users", async () => {
    const api = await import("@/lib/api");
    vi.mocked(api.getInferenceMode).mockResolvedValue("hosted");

    const { default: BillingLayout } = await import("../app/(dashboard)/billing/layout");
    render(
      <BillingLayout>
        <div>child content</div>
      </BillingLayout>,
    );

    expect(await screen.findByText("Hosted Usage")).toBeInTheDocument();

    // Reset for other tests
    vi.mocked(api.getInferenceMode).mockResolvedValue("byok");
  });
});

describe("Hosted usage detail page", () => {
  it("renders hosted usage heading", async () => {
    const { default: HostedPage } = await import("../app/(dashboard)/billing/usage/hosted/page");
    render(<HostedPage />);

    // Loading state now uses Skeleton components, no text
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(await screen.findByText("Hosted Usage Detail")).toBeInTheDocument();
  });

  it("renders usage events table", async () => {
    const { default: HostedPage } = await import("../app/(dashboard)/billing/usage/hosted/page");
    render(<HostedPage />);

    expect(await screen.findByText("Usage Events")).toBeInTheDocument();
    expect(screen.getByText("Whisper")).toBeInTheDocument();
    expect(screen.getByText("DALL-E")).toBeInTheDocument();
    expect(screen.getByText("$0.06")).toBeInTheDocument();
    expect(screen.getByText("$0.25")).toBeInTheDocument();
  });

  it("renders export CSV button", async () => {
    const { default: HostedPage } = await import("../app/(dashboard)/billing/usage/hosted/page");
    render(<HostedPage />);

    expect(await screen.findByRole("button", { name: "Export CSV" })).toBeInTheDocument();
  });

  it("renders capability filter", async () => {
    const { default: HostedPage } = await import("../app/(dashboard)/billing/usage/hosted/page");
    render(<HostedPage />);

    expect(await screen.findByLabelText("Filter by capability")).toBeInTheDocument();
  });

  it("shows total cost in description", async () => {
    const { default: HostedPage } = await import("../app/(dashboard)/billing/usage/hosted/page");
    render(<HostedPage />);

    expect(await screen.findByText(/2 events/)).toBeInTheDocument();
    expect(screen.getByText(/Total: \$0\.31/)).toBeInTheDocument();
  });
});
