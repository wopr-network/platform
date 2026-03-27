import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

let mockSession: {
  data: { user: { email: string; emailVerified: boolean } } | null;
  isPending: boolean;
};

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: () => mockSession,
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
    sendVerificationEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
  }),
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

describe("EmailVerificationBanner", () => {
  it("renders banner for unverified user", async () => {
    mockSession = {
      data: { user: { email: "a@b.com", emailVerified: false } },
      isPending: false,
    };
    const { EmailVerificationBanner } = await import("@/components/auth/email-verification-banner");
    render(<EmailVerificationBanner />);

    expect(screen.getByText("Verify your email to unlock bot creation")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resend verification email/ })).toBeInTheDocument();
  });

  it("does not render banner for verified user", async () => {
    mockSession = {
      data: { user: { email: "a@b.com", emailVerified: true } },
      isPending: false,
    };
    const { EmailVerificationBanner } = await import("@/components/auth/email-verification-banner");
    const { container } = render(<EmailVerificationBanner />);

    expect(container.innerHTML).toBe("");
  });

  it("does not render banner while loading", async () => {
    mockSession = {
      data: null,
      isPending: true,
    };
    const { EmailVerificationBanner } = await import("@/components/auth/email-verification-banner");
    const { container } = render(<EmailVerificationBanner />);

    expect(container.innerHTML).toBe("");
  });
});
