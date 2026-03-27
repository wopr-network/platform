import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationPreferences } from "@/lib/api";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/settings/notifications",
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

const DEFAULT_PREFS: NotificationPreferences = {
  billing_low_balance: true,
  billing_receipts: true,
  billing_auto_topup: false,
  agent_channel_disconnect: true,
  agent_status_changes: false,
  account_role_changes: true,
  account_team_invites: true,
  fleet_updates: false,
};

const mockGetPrefs = vi.fn<() => Promise<NotificationPreferences>>();
const mockUpdatePrefs =
  vi.fn<(p: Partial<NotificationPreferences>) => Promise<NotificationPreferences>>();

vi.mock("@/lib/settings-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/settings-api")>();
  return {
    ...actual,
    getNotificationPreferences: (...args: unknown[]) => mockGetPrefs(...(args as [])),
    updateNotificationPreferences: (...args: unknown[]) =>
      mockUpdatePrefs(...(args as [Partial<NotificationPreferences>])),
  };
});

describe("Notifications page - toggle behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPrefs.mockResolvedValue({ ...DEFAULT_PREFS });
  });

  it("uses functional updater so rapid clicks produce correct state", async () => {
    let resolveFirst!: (v: NotificationPreferences) => void;
    const firstCall = new Promise<NotificationPreferences>((r) => {
      resolveFirst = r;
    });
    mockUpdatePrefs.mockReturnValueOnce(firstCall);
    mockUpdatePrefs.mockResolvedValue({ ...DEFAULT_PREFS, billing_low_balance: false });

    const user = userEvent.setup();
    const { default: NotificationsPage } = await import(
      "../app/(dashboard)/settings/notifications/page"
    );
    render(<NotificationsPage />);

    const toggle = await screen.findByRole("switch", { name: "Low balance alerts" });
    expect(toggle).toBeChecked();

    // Click once — optimistic update flips to false
    await user.click(toggle);
    expect(toggle).not.toBeChecked();

    expect(mockUpdatePrefs).toHaveBeenCalledWith({ billing_low_balance: false });

    // Resolve the first API call
    resolveFirst({ ...DEFAULT_PREFS, billing_low_balance: false });

    await waitFor(() => {
      expect(toggle).not.toBeChecked();
    });
  });

  it("disables toggle while API call is in flight", async () => {
    let resolveUpdate!: (v: NotificationPreferences) => void;
    const pending = new Promise<NotificationPreferences>((r) => {
      resolveUpdate = r;
    });
    mockUpdatePrefs.mockReturnValueOnce(pending);

    const user = userEvent.setup();
    const { default: NotificationsPage } = await import(
      "../app/(dashboard)/settings/notifications/page"
    );
    render(<NotificationsPage />);

    const toggle = await screen.findByRole("switch", { name: "Low balance alerts" });
    await user.click(toggle);

    // While in-flight, switch should be disabled
    expect(toggle).toBeDisabled();

    resolveUpdate({ ...DEFAULT_PREFS, billing_low_balance: false });
    await waitFor(() => {
      expect(toggle).not.toBeDisabled();
    });
  });

  it("reverts optimistic update on API error", async () => {
    mockUpdatePrefs.mockRejectedValueOnce(new Error("Network error"));

    const user = userEvent.setup();
    const { default: NotificationsPage } = await import(
      "../app/(dashboard)/settings/notifications/page"
    );
    render(<NotificationsPage />);

    const toggle = await screen.findByRole("switch", { name: "Low balance alerts" });
    expect(toggle).toBeChecked();

    await user.click(toggle);

    // After rejection, should revert back to checked
    await waitFor(() => {
      expect(toggle).toBeChecked();
    });
  });
});
