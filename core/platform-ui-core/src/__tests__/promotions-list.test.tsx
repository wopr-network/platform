import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Promotion } from "@/lib/promotions-types";

const { mockListQuery, mockActivate, mockPause, mockCancel } = vi.hoisted(() => ({
  mockListQuery: vi.fn(),
  mockActivate: vi.fn(),
  mockPause: vi.fn(),
  mockCancel: vi.fn(),
}));

vi.mock("@/lib/trpc", () => ({
  trpcVanilla: {
    promotions: {
      list: {
        query: (...args: unknown[]) => mockListQuery(...args),
      },
      activate: {
        mutate: (...args: unknown[]) => mockActivate(...args),
      },
      pause: {
        mutate: (...args: unknown[]) => mockPause(...args),
      },
      cancel: {
        mutate: (...args: unknown[]) => mockCancel(...args),
      },
    },
  },
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/admin/promotions",
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: () => ({ data: null, isPending: false, error: null }),
  }),
}));

// Mock Radix Select to use native <select> so jsdom can interact with it
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (v: string) => void;
  }) => (
    <select value={value} onChange={(e) => onValueChange?.(e.target.value)} data-testid="select">
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
}));

const MOCK_PROMOTIONS: Promotion[] = [
  {
    id: "promo-1",
    name: "Summer Launch Bonus",
    type: "bonus_on_purchase",
    status: "active",
    valueType: "flat_credits",
    amount: 500,
    cap: null,
    startsAt: null,
    endsAt: null,
    firstPurchaseOnly: false,
    minPurchaseCents: null,
    userSegment: "all",
    totalUseLimit: 1000,
    perUserLimit: 1,
    budgetCap: null,
    totalUses: 42,
    totalCreditsGranted: 21000,
    couponCode: null,
    notes: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "promo-2",
    name: "Holiday Coupon",
    type: "coupon_fixed",
    status: "paused",
    valueType: "flat_credits",
    amount: 1000,
    cap: null,
    startsAt: null,
    endsAt: null,
    firstPurchaseOnly: false,
    minPurchaseCents: null,
    userSegment: "all",
    totalUseLimit: 500,
    perUserLimit: 1,
    budgetCap: 50000,
    totalUses: 10,
    totalCreditsGranted: 10000,
    couponCode: "HOLIDAY25",
    notes: null,
    createdAt: "2026-01-02T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  },
];

describe("PromotionsListPage", () => {
  it("renders page title — Promotions heading visible", async () => {
    mockListQuery.mockResolvedValueOnce(MOCK_PROMOTIONS);
    const PromotionsListPage = (await import("../app/admin/promotions/page")).default;
    render(<PromotionsListPage />);

    expect(screen.getByRole("heading", { name: "Promotions" })).toBeInTheDocument();
  });

  it("shows loading skeleton while fetching", async () => {
    // Never resolves so loading state persists
    mockListQuery.mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves — keep loading state for test */
        }),
    );
    const PromotionsListPage = (await import("../app/admin/promotions/page")).default;
    render(<PromotionsListPage />);

    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
  });

  it("renders promotions table with data — mock 2 promotions, verify names appear", async () => {
    mockListQuery.mockResolvedValueOnce(MOCK_PROMOTIONS);
    const PromotionsListPage = (await import("../app/admin/promotions/page")).default;
    render(<PromotionsListPage />);

    expect(await screen.findByText("Summer Launch Bonus")).toBeInTheDocument();
    expect(screen.getByText("Holiday Coupon")).toBeInTheDocument();
  });

  it("shows correct status badge colors — active shows green-ish, paused shows yellow-ish", async () => {
    mockListQuery.mockResolvedValueOnce(MOCK_PROMOTIONS);
    const PromotionsListPage = (await import("../app/admin/promotions/page")).default;
    render(<PromotionsListPage />);

    await screen.findByText("Summer Launch Bonus");

    const activeBadge = screen.getByText("active");
    const pausedBadge = screen.getByText("paused");

    expect(activeBadge.className).toMatch(/terminal/);
    expect(pausedBadge.className).toMatch(/yellow/);
  });

  it("filters by status — changing status filter calls query with status filter", async () => {
    mockListQuery.mockResolvedValue(MOCK_PROMOTIONS);
    const user = userEvent.setup();
    const PromotionsListPage = (await import("../app/admin/promotions/page")).default;
    render(<PromotionsListPage />);

    await screen.findByText("Summer Launch Bonus");

    // Select the first native select (status filter) and pick "active"
    const selects = screen.getAllByTestId("select");
    await user.selectOptions(selects[0], "active");

    // After filter changes, query should be called with status: "active"
    expect(mockListQuery).toHaveBeenLastCalledWith(expect.objectContaining({ status: "active" }));
  });

  it("New Promotion link points to /admin/promotions/new", async () => {
    mockListQuery.mockResolvedValueOnce(MOCK_PROMOTIONS);
    const PromotionsListPage = (await import("../app/admin/promotions/page")).default;
    render(<PromotionsListPage />);

    const link = screen.getByRole("link", { name: /new promotion/i });
    expect(link).toHaveAttribute("href", "/admin/promotions/new");
  });
});
