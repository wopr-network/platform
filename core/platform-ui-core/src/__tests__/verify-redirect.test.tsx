import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams("status=success"),
}));

vi.mock("@/components/auth/auth-shell", () => ({
  AuthShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/auth/resend-verification-button", () => ({
  ResendVerificationButton: () => null,
}));
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <div {...props}>{children}</div>
    ),
    p: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) => (
      <p {...props}>{children}</p>
    ),
  },
}));

import VerifyPage from "@/app/auth/verify/page";

describe("VerifyPage success redirect", () => {
  it("redirects to /onboarding on success", async () => {
    vi.useFakeTimers();
    render(<VerifyPage />);

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockPush).toHaveBeenCalledWith("/onboarding");
    vi.useRealTimers();
  });
});
