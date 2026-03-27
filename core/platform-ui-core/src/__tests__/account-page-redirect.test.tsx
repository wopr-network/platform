import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/validate-redirect-url", () => ({
  isAllowedRedirectUrl: vi.fn(),
  ALLOWED_REDIRECT_ORIGINS: new Set(["https://billing.stripe.com"]),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/components/settings/create-org-wizard", () => ({
  default: () => <div data-testid="create-org-wizard" />,
}));

vi.mock("@/lib/api", () => ({
  getBillingUsage: vi.fn().mockResolvedValue({
    planName: "pro",
    instancesRunning: 1,
    instanceCap: 5,
  }),
  createBillingPortalSession: vi.fn(),
}));

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import AccountPage from "@/app/(dashboard)/settings/account/page";
import { createBillingPortalSession } from "@/lib/api";
import { isAllowedRedirectUrl } from "@/lib/validate-redirect-url";

describe("AccountPage billing redirect", () => {
  const mockIsAllowed = isAllowedRedirectUrl as ReturnType<typeof vi.fn>;
  const mockCreateSession = createBillingPortalSession as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, "location", {
      value: { href: "http://localhost/settings/account", origin: "http://localhost" },
      writable: true,
      configurable: true,
    });
  });

  it("navigates when URL passes validation", async () => {
    mockCreateSession.mockResolvedValue({ url: "https://billing.stripe.com/p/session/test_abc" });
    mockIsAllowed.mockReturnValue(true);

    render(<AccountPage />);
    const btn = await screen.findByRole("button", { name: /manage billing/i });
    await userEvent.click(btn);

    await waitFor(() => {
      expect(mockIsAllowed).toHaveBeenCalledWith("https://billing.stripe.com/p/session/test_abc");
      expect(window.location.href).toBe("https://billing.stripe.com/p/session/test_abc");
    });
  });

  it("blocks navigation and shows toast when URL fails validation", async () => {
    mockCreateSession.mockResolvedValue({ url: "https://evil.com/steal" });
    mockIsAllowed.mockReturnValue(false);

    render(<AccountPage />);
    const btn = await screen.findByRole("button", { name: /manage billing/i });
    await userEvent.click(btn);

    await waitFor(() => {
      expect(mockIsAllowed).toHaveBeenCalledWith("https://evil.com/steal");
      expect(toast.error).toHaveBeenCalledWith("Unexpected billing portal URL.");
      expect(window.location.href).toBe("http://localhost/settings/account");
    });
  });
});
