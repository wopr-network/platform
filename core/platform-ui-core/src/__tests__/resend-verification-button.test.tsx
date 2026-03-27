import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const mockSendVerificationEmail = vi.fn().mockResolvedValue({ data: {}, error: null });

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: () => ({ data: null, isPending: false, error: null }),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
    sendVerificationEmail: mockSendVerificationEmail,
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

describe("ResendVerificationButton", () => {
  it("renders button with correct text", async () => {
    const { ResendVerificationButton } = await import(
      "@/components/auth/resend-verification-button"
    );
    render(<ResendVerificationButton email="test@example.com" />);

    expect(screen.getByRole("button", { name: /Resend verification email/ })).toBeInTheDocument();
  });

  it("calls sendVerificationEmail on click", async () => {
    const user = userEvent.setup();
    const { ResendVerificationButton } = await import(
      "@/components/auth/resend-verification-button"
    );
    render(<ResendVerificationButton email="test@example.com" />);

    await user.click(screen.getByRole("button", { name: /Resend verification email/ }));

    expect(mockSendVerificationEmail).toHaveBeenCalledWith({
      email: "test@example.com",
      callbackURL: "/auth/verify?status=success",
    });
  });

  it("shows success message after sending", async () => {
    const user = userEvent.setup();
    const { ResendVerificationButton } = await import(
      "@/components/auth/resend-verification-button"
    );
    render(<ResendVerificationButton email="test@example.com" />);

    await user.click(screen.getByRole("button", { name: /Resend verification email/ }));

    expect(screen.getByText("Verification email sent!")).toBeInTheDocument();
  });

  it("shows error message when send fails", async () => {
    mockSendVerificationEmail.mockResolvedValueOnce({
      data: null,
      error: { message: "Rate limited" },
    });
    const user = userEvent.setup();
    const { ResendVerificationButton } = await import(
      "@/components/auth/resend-verification-button"
    );
    render(<ResendVerificationButton email="test@example.com" />);

    await user.click(screen.getByRole("button", { name: /Resend verification email/ }));

    expect(screen.getByText("Rate limited")).toBeInTheDocument();
  });

  it("disables button when email is empty", async () => {
    const { ResendVerificationButton } = await import(
      "@/components/auth/resend-verification-button"
    );
    render(<ResendVerificationButton email="" />);

    expect(screen.getByRole("button", { name: /Resend verification email/ })).toBeDisabled();
  });

  it("disables button after successful send", async () => {
    const user = userEvent.setup();
    const { ResendVerificationButton } = await import(
      "@/components/auth/resend-verification-button"
    );
    render(<ResendVerificationButton email="test@example.com" />);

    await user.click(screen.getByRole("button", { name: /Resend verification email/ }));

    // After success, button should be disabled (in cooldown)
    expect(screen.getByRole("button")).toBeDisabled();
    // Button text should show countdown
    expect(screen.getByRole("button")).toHaveTextContent(/Resend in \d+s/);
  });
});
