import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: () => ({ data: null, isPending: false, error: null }),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getAccountStatus: vi.fn().mockResolvedValue(null),
  };
});

describe("DegradedStateBanner", () => {
  it("renders nothing when account status is active", async () => {
    const { getAccountStatus } = await import("@/lib/api");
    vi.mocked(getAccountStatus).mockResolvedValueOnce({
      status: "active",
      statusReason: null,
      graceDeadline: null,
    });

    const { DegradedStateBanner } = await import("@/components/billing/degraded-state-banner");
    const { container } = render(<DegradedStateBanner />);

    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("renders nothing when API returns null (endpoint missing)", async () => {
    const { getAccountStatus } = await import("@/lib/api");
    vi.mocked(getAccountStatus).mockResolvedValueOnce(null);

    const { DegradedStateBanner } = await import("@/components/billing/degraded-state-banner");
    const { container } = render(<DegradedStateBanner />);

    await waitFor(() => {
      expect(container.innerHTML).toBe("");
    });
  });

  it("shows grace period warning with deadline", async () => {
    const { getAccountStatus } = await import("@/lib/api");
    const deadline = new Date(Date.now() + 2 * 86400000).toISOString();
    vi.mocked(getAccountStatus).mockResolvedValueOnce({
      status: "grace_period",
      statusReason: null,
      graceDeadline: deadline,
    });

    const { DegradedStateBanner } = await import("@/components/billing/degraded-state-banner");
    render(<DegradedStateBanner />);

    await waitFor(() => {
      expect(screen.getByText(/ACTION REQUIRED/)).toBeInTheDocument();
      expect(screen.getByText(/Update payment method/i)).toBeInTheDocument();
    });
  });

  it("shows suspended banner with CTA", async () => {
    const { getAccountStatus } = await import("@/lib/api");
    vi.mocked(getAccountStatus).mockResolvedValueOnce({
      status: "suspended",
      statusReason: "Grace period expired",
      graceDeadline: null,
    });

    const { DegradedStateBanner } = await import("@/components/billing/degraded-state-banner");
    render(<DegradedStateBanner />);

    await waitFor(() => {
      expect(screen.getByText(/ACCOUNT SUSPENDED/)).toBeInTheDocument();
      expect(screen.getByText(/Contact support/i)).toBeInTheDocument();
    });
  });

  it("shows banned banner with no dismiss button", async () => {
    const { getAccountStatus } = await import("@/lib/api");
    vi.mocked(getAccountStatus).mockResolvedValueOnce({
      status: "banned",
      statusReason: "TOS violation",
      graceDeadline: null,
    });

    const { DegradedStateBanner } = await import("@/components/billing/degraded-state-banner");
    render(<DegradedStateBanner />);

    await waitFor(() => {
      expect(screen.getByText(/ACCOUNT TERMINATED/)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /dismiss/i })).not.toBeInTheDocument();
    });
  });

  it("can be dismissed", async () => {
    const user = userEvent.setup();
    const { getAccountStatus } = await import("@/lib/api");
    vi.mocked(getAccountStatus).mockResolvedValueOnce({
      status: "grace_period",
      statusReason: null,
      graceDeadline: new Date(Date.now() + 86400000).toISOString(),
    });

    const { DegradedStateBanner } = await import("@/components/billing/degraded-state-banner");
    render(<DegradedStateBanner />);

    await waitFor(() => {
      expect(screen.getByText(/ACTION REQUIRED/)).toBeInTheDocument();
    });

    const dismissBtn = screen.getByRole("button", { name: /dismiss/i });
    await user.click(dismissBtn);

    expect(screen.queryByText(/ACTION REQUIRED/)).not.toBeInTheDocument();
  });
});
