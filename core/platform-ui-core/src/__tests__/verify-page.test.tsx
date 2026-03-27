import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
  usePathname: () => "/auth/verify",
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: () => ({ data: null, isPending: false, error: null }),
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

describe("VerifyPage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPush.mockClear();
    mockSearchParams = new URLSearchParams();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders success state and shows redirect countdown", async () => {
    mockSearchParams = new URLSearchParams("status=success");

    const { default: VerifyPage } = await import("@/app/auth/verify/page");
    render(<VerifyPage />);

    expect(screen.getByText("Email verified")).toBeInTheDocument();
    expect(screen.getByText(/verified successfully/)).toBeInTheDocument();
    expect(screen.getByText(/\$5 signup credit/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Continue to setup/ })).toHaveAttribute(
      "href",
      "/onboarding",
    );
  });

  it("redirects to dashboard after countdown on success", async () => {
    mockSearchParams = new URLSearchParams("status=success");

    const { default: VerifyPage } = await import("@/app/auth/verify/page");
    render(<VerifyPage />);

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockPush).toHaveBeenCalledWith("/onboarding");
  });

  it("renders token-expired error with resend button when email param present", async () => {
    mockSearchParams = new URLSearchParams(
      "status=error&reason=token-expired&email=test@example.com",
    );

    const { default: VerifyPage } = await import("@/app/auth/verify/page");
    render(<VerifyPage />);

    expect(screen.getByText("Link expired")).toBeInTheDocument();
    expect(screen.getByText(/link has expired/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Resend verification email/ })).toBeInTheDocument();
  });

  it("renders token-expired error with fallback login link when no email param", async () => {
    mockSearchParams = new URLSearchParams("status=error&reason=token-expired");

    const { default: VerifyPage } = await import("@/app/auth/verify/page");
    render(<VerifyPage />);

    expect(screen.getByText("Link expired")).toBeInTheDocument();
    expect(screen.getByText(/link has expired/)).toBeInTheDocument();
    const loginLinks = screen.getAllByRole("link", { name: /Back to sign in/ });
    expect(loginLinks.length).toBeGreaterThanOrEqual(1);
    expect(loginLinks[0]).toHaveAttribute("href", "/login");
  });

  it("renders already-verified state with login link", async () => {
    mockSearchParams = new URLSearchParams("status=error&reason=already-verified");

    const { default: VerifyPage } = await import("@/app/auth/verify/page");
    render(<VerifyPage />);

    expect(screen.getByText("Already verified")).toBeInTheDocument();
    expect(screen.getByText(/already been verified/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sign in/ })).toHaveAttribute("href", "/login");
  });

  it("renders invalid-token error", async () => {
    mockSearchParams = new URLSearchParams("status=error&reason=invalid-token");

    const { default: VerifyPage } = await import("@/app/auth/verify/page");
    render(<VerifyPage />);

    expect(screen.getByText("Invalid link")).toBeInTheDocument();
    expect(screen.getByText(/invalid or malformed/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to sign in/ })).toHaveAttribute("href", "/login");
  });

  it("renders fallback error for unknown reason", async () => {
    mockSearchParams = new URLSearchParams("status=error&reason=something-unexpected");

    const { default: VerifyPage } = await import("@/app/auth/verify/page");
    render(<VerifyPage />);

    expect(screen.getByText("Verification failed")).toBeInTheDocument();
    expect(screen.getByText(/went wrong/)).toBeInTheDocument();
  });

  it("renders fallback error when no status param", async () => {
    mockSearchParams = new URLSearchParams("");

    const { default: VerifyPage } = await import("@/app/auth/verify/page");
    render(<VerifyPage />);

    expect(screen.getByText("Verification failed")).toBeInTheDocument();
    expect(screen.getByText(/No verification status provided/)).toBeInTheDocument();
  });
});
