import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/utils", () => ({
  sanitizeRedirectUrl: (url: string) => url,
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

const mockUseSession = vi.fn();
vi.mock("@/lib/auth-client", () => ({
  get useSession() {
    return mockUseSession;
  },
}));

import { AuthRedirect } from "@/components/auth/auth-redirect";

describe("AuthRedirect", () => {
  beforeEach(() => {
    mockReplace.mockClear();
  });

  it("redirects authenticated user to homePath", async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: "1", email: "test@test.com" } },
      isPending: false,
    });
    render(<AuthRedirect />);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/");
    });
  });

  it("does not redirect while session is loading", () => {
    mockUseSession.mockReturnValue({
      data: null,
      isPending: true,
    });
    render(<AuthRedirect />);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("does not redirect unauthenticated user", () => {
    mockUseSession.mockReturnValue({
      data: null,
      isPending: false,
    });
    render(<AuthRedirect />);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("renders nothing (returns null)", () => {
    mockUseSession.mockReturnValue({
      data: null,
      isPending: false,
    });
    const { container } = render(<AuthRedirect />);
    expect(container.innerHTML).toBe("");
  });
});
