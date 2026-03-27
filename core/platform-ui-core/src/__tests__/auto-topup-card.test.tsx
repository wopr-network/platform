import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AutoTopupSettings } from "@/lib/api";

const { mockGetAutoTopupSettings, mockUpdateAutoTopupSettings } = vi.hoisted(() => ({
  mockGetAutoTopupSettings: vi.fn(),
  mockUpdateAutoTopupSettings: vi.fn(),
}));

// Mock framer-motion to prevent animation issues in JSDOM
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/billing/credits",
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

/** Return an ISO-8601 UTC date string N days from now, truncated to midnight. */
function daysFromNow(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

const MOCK_SETTINGS: AutoTopupSettings = {
  usageBased: {
    enabled: false,
    thresholdCents: 500,
    topupAmountCents: 2000,
  },
  scheduled: {
    enabled: false,
    amountCents: 2000,
    interval: "weekly",
    nextChargeDate: null,
  },
  paymentMethodLast4: "4242",
  paymentMethodBrand: "Visa",
};

const MOCK_SETTINGS_ENABLED: AutoTopupSettings = {
  usageBased: {
    enabled: true,
    thresholdCents: 500,
    topupAmountCents: 2000,
  },
  scheduled: {
    enabled: true,
    amountCents: 2000,
    interval: "weekly",
    nextChargeDate: daysFromNow(7),
  },
  paymentMethodLast4: "4242",
  paymentMethodBrand: "Visa",
};

const MOCK_SETTINGS_NO_CARD: AutoTopupSettings = {
  usageBased: {
    enabled: false,
    thresholdCents: 500,
    topupAmountCents: 2000,
  },
  scheduled: {
    enabled: false,
    amountCents: 2000,
    interval: "weekly",
    nextChargeDate: null,
  },
  paymentMethodLast4: null,
  paymentMethodBrand: null,
};

const MOCK_SETTINGS_MONTHLY: AutoTopupSettings = {
  ...MOCK_SETTINGS_ENABLED,
  scheduled: {
    enabled: true,
    amountCents: 2000,
    interval: "monthly",
    nextChargeDate: daysFromNow(14),
  },
};

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getAutoTopupSettings: (...args: unknown[]) => mockGetAutoTopupSettings(...args),
    updateAutoTopupSettings: (...args: unknown[]) => mockUpdateAutoTopupSettings(...args),
  };
});

describe("AutoTopupCard", () => {
  beforeEach(() => {
    // Reset defaults before each test so per-test overrides don't leak.
    mockGetAutoTopupSettings.mockResolvedValue(MOCK_SETTINGS);
    mockUpdateAutoTopupSettings.mockResolvedValue(MOCK_SETTINGS_ENABLED);
  });

  it("renders card title", async () => {
    const { AutoTopupCard } = await import("../components/billing/auto-topup-card");
    render(<AutoTopupCard />);

    // Wait for loading to complete by finding something in the final rendered state
    await screen.findByText("Usage-based");
    expect(screen.getAllByText("Auto-topup").length).toBeGreaterThanOrEqual(1);
  });

  it("renders loading skeleton initially", async () => {
    const { AutoTopupCard } = await import("../components/billing/auto-topup-card");
    render(<AutoTopupCard />);

    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it("renders usage-based and scheduled labels", async () => {
    const { AutoTopupCard } = await import("../components/billing/auto-topup-card");
    render(<AutoTopupCard />);

    expect(await screen.findByText("Usage-based")).toBeInTheDocument();
    expect(screen.getByText("Scheduled")).toBeInTheDocument();
  });

  it("renders two toggle switches", async () => {
    const { AutoTopupCard } = await import("../components/billing/auto-topup-card");
    render(<AutoTopupCard />);

    await screen.findByText("Usage-based");
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(2);
  });

  it("renders card on file info", async () => {
    const { AutoTopupCard } = await import("../components/billing/auto-topup-card");
    render(<AutoTopupCard />);

    expect(await screen.findByText(/Visa/)).toBeInTheDocument();
    expect(screen.getByText(/4242/)).toBeInTheDocument();
  });

  it("shows add payment method prompt when no card on file", async () => {
    mockGetAutoTopupSettings.mockResolvedValueOnce(MOCK_SETTINGS_NO_CARD);
    const { AutoTopupCard } = await import("../components/billing/auto-topup-card");
    render(<AutoTopupCard />);

    expect(
      await screen.findByText("Add a payment method to enable auto-topup."),
    ).toBeInTheDocument();
  });

  it("shows error state with retry on fetch failure", async () => {
    mockGetAutoTopupSettings.mockRejectedValueOnce(new Error("fail"));
    const { AutoTopupCard } = await import("../components/billing/auto-topup-card");
    render(<AutoTopupCard />);

    expect(await screen.findByText("Failed to load auto-topup settings.")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("calls updateAutoTopupSettings when usage toggle is clicked", async () => {
    const user = userEvent.setup();
    mockUpdateAutoTopupSettings.mockResolvedValue(MOCK_SETTINGS_ENABLED);
    const { AutoTopupCard } = await import("../components/billing/auto-topup-card");
    render(<AutoTopupCard />);

    await screen.findByText("Usage-based");
    const usageToggle = screen.getAllByRole("switch")[0];
    await user.click(usageToggle);

    expect(mockUpdateAutoTopupSettings).toHaveBeenCalledWith({
      usageBased: {
        enabled: true,
        thresholdCents: 500,
        topupAmountCents: 2000,
      },
    });
  });

  it("calls updateAutoTopupSettings when schedule toggle is clicked", async () => {
    const user = userEvent.setup();
    mockUpdateAutoTopupSettings.mockResolvedValue(MOCK_SETTINGS_ENABLED);
    const { AutoTopupCard } = await import("../components/billing/auto-topup-card");
    render(<AutoTopupCard />);

    await screen.findByText("Scheduled");
    const scheduleToggle = screen.getAllByRole("switch")[1];
    await user.click(scheduleToggle);

    expect(mockUpdateAutoTopupSettings).toHaveBeenCalledWith({
      scheduled: {
        enabled: true,
        amountCents: 2000,
        interval: "weekly",
      },
    });
  });

  it("shows next charge date when schedule is enabled", async () => {
    mockGetAutoTopupSettings.mockResolvedValueOnce(MOCK_SETTINGS_ENABLED);
    const { AutoTopupCard } = await import("../components/billing/auto-topup-card");
    render(<AutoTopupCard />);

    expect(await screen.findByText(/Next charge:/)).toBeInTheDocument();
  });

  it("shows daily/weekly dividend tip when schedule is enabled", async () => {
    mockGetAutoTopupSettings.mockResolvedValueOnce(MOCK_SETTINGS_ENABLED);
    const { AutoTopupCard } = await import("../components/billing/auto-topup-card");
    render(<AutoTopupCard />);

    expect(
      await screen.findByText(
        "Tip: scheduled top-ups keep you in the dividend pool automatically.",
      ),
    ).toBeInTheDocument();
  });

  it("shows monthly dividend tip for monthly interval", async () => {
    mockGetAutoTopupSettings.mockResolvedValueOnce(MOCK_SETTINGS_MONTHLY);
    const { AutoTopupCard } = await import("../components/billing/auto-topup-card");
    render(<AutoTopupCard />);

    expect(
      await screen.findByText(
        "Tip: scheduled top-ups keep you in the dividend pool for 7 days each month.",
      ),
    ).toBeInTheDocument();
  });

  it("renders configuration text for usage-based section", async () => {
    const { AutoTopupCard } = await import("../components/billing/auto-topup-card");
    render(<AutoTopupCard />);

    expect(await screen.findByText("When balance drops below")).toBeInTheDocument();
    expect(screen.getByText("add")).toBeInTheDocument();
  });

  it("renders configuration text for scheduled section", async () => {
    const { AutoTopupCard } = await import("../components/billing/auto-topup-card");
    render(<AutoTopupCard />);

    expect(await screen.findByText("Add")).toBeInTheDocument();
    expect(screen.getByText("every")).toBeInTheDocument();
  });
});
