import { render, screen } from "@testing-library/react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useParams: vi.fn(() => ({ provider: "github" })),
}));

// Mock better-auth/react
vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: () => ({ data: null, isPending: false, error: null }),
    signIn: {
      email: vi.fn(),
      social: vi.fn(),
    },
    signUp: {
      email: vi.fn(),
    },
    signOut: vi.fn(),
    forgetPassword: vi.fn(),
    resetPassword: vi.fn(),
    sendVerificationEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
  }),
}));

// Mock tRPC so OAuthButtons can query enabled social providers
vi.mock("@/lib/trpc", () => ({
  trpc: {
    authSocial: {
      enabledSocialProviders: {
        useQuery: () => ({ data: ["github", "discord", "google"], isLoading: false }),
      },
    },
  },
  TRPCProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock framer-motion to prevent animation issues in JSDOM
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

describe("Login page", () => {
  it("renders email and password fields", async () => {
    const { default: LoginPage } = await import("../app/(auth)/login/page");
    render(<LoginPage />);

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
  });

  it("renders sign in button", async () => {
    const { default: LoginPage } = await import("../app/(auth)/login/page");
    render(<LoginPage />);

    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("renders OAuth buttons", async () => {
    const { default: LoginPage } = await import("../app/(auth)/login/page");
    render(<LoginPage />);

    expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Discord" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });

  it("renders forgot password and signup links", async () => {
    const { default: LoginPage } = await import("../app/(auth)/login/page");
    render(<LoginPage />);

    expect(screen.getByText("Forgot password?")).toBeInTheDocument();
    expect(screen.getByText("Sign up")).toBeInTheDocument();
  });
});

describe("Signup page", () => {
  it("renders name, email, password, and confirm password fields", async () => {
    const { default: SignupPage } = await import("../app/(auth)/signup/page");
    render(<SignupPage />);

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
  });

  it("renders create account button", async () => {
    const { default: SignupPage } = await import("../app/(auth)/signup/page");
    render(<SignupPage />);

    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
  });

  it("renders terms checkbox", async () => {
    const { default: SignupPage } = await import("../app/(auth)/signup/page");
    render(<SignupPage />);

    expect(screen.getByText(/Terms of Service/)).toBeInTheDocument();
    expect(screen.getByText(/Privacy Policy/)).toBeInTheDocument();
  });

  it("renders sign in link", async () => {
    const { default: SignupPage } = await import("../app/(auth)/signup/page");
    render(<SignupPage />);

    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });
});

describe("Forgot password page", () => {
  it("renders email field and submit button", async () => {
    const { default: ForgotPasswordPage } = await import("../app/(auth)/forgot-password/page");
    render(<ForgotPasswordPage />);

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument();
  });

  it("renders back to sign in link", async () => {
    const { default: ForgotPasswordPage } = await import("../app/(auth)/forgot-password/page");
    render(<ForgotPasswordPage />);

    expect(screen.getByText("Back to sign in")).toBeInTheDocument();
  });
});

describe("Reset password page", () => {
  it("shows access denied when no token is present", async () => {
    const { default: ResetPasswordPage } = await import("../app/(auth)/reset-password/page");
    render(<ResetPasswordPage />);

    expect(screen.getByText("Access denied")).toBeInTheDocument();
    expect(screen.getByText("Request a new reset link")).toBeInTheDocument();
  });
});

describe("OAuth callback page", () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    mockPush.mockClear();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as unknown as ReturnType<
      typeof useRouter
    >);
    vi.mocked(useParams).mockReturnValue({ provider: "github" });
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams() as ReturnType<typeof useSearchParams>,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders loading state when no error", async () => {
    const { default: OAuthCallbackPage } = await import("../app/auth/callback/[provider]/page");
    render(<OAuthCallbackPage />);

    expect(screen.getByText(/Completing sign in with github/)).toBeInTheDocument();
  });

  it("redirects to / after 1 second when no error and no callbackUrl", async () => {
    const { default: OAuthCallbackPage } = await import("../app/auth/callback/[provider]/page");
    render(<OAuthCallbackPage />);

    await vi.advanceTimersByTimeAsync(1000);

    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("redirects to callbackUrl when provided", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("callbackUrl=/dashboard") as ReturnType<typeof useSearchParams>,
    );
    const { default: OAuthCallbackPage } = await import("../app/auth/callback/[provider]/page");
    render(<OAuthCallbackPage />);

    await vi.advanceTimersByTimeAsync(1000);

    expect(mockPush).toHaveBeenCalledWith("/dashboard");
  });

  it("sanitizes unsafe callbackUrl and redirects to /", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("callbackUrl=//evil.com") as ReturnType<typeof useSearchParams>,
    );
    const { default: OAuthCallbackPage } = await import("../app/auth/callback/[provider]/page");
    render(<OAuthCallbackPage />);

    await vi.advanceTimersByTimeAsync(1000);

    expect(mockPush).toHaveBeenCalledWith("/");
  });

  it("shows access denied error for error=access_denied", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("error=access_denied") as ReturnType<typeof useSearchParams>,
    );
    const { default: OAuthCallbackPage } = await import("../app/auth/callback/[provider]/page");
    render(<OAuthCallbackPage />);

    expect(screen.getByText("Authentication failed")).toBeInTheDocument();
    expect(screen.getByText("Access was denied. Please try again.")).toBeInTheDocument();
    expect(screen.getByText("Could not sign in with github")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows account already linked error", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("error=account_already_linked") as ReturnType<typeof useSearchParams>,
    );
    const { default: OAuthCallbackPage } = await import("../app/auth/callback/[provider]/page");
    render(<OAuthCallbackPage />);

    expect(screen.getByText("Authentication failed")).toBeInTheDocument();
    expect(
      screen.getByText("An account with this email already exists. Sign in to link your account."),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows generic error for unknown error param", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("error=totally_unknown_code") as ReturnType<typeof useSearchParams>,
    );
    const { default: OAuthCallbackPage } = await import("../app/auth/callback/[provider]/page");
    render(<OAuthCallbackPage />);

    expect(screen.getByText("Authentication failed")).toBeInTheDocument();
    expect(screen.getByText("Authentication failed. Please try again.")).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("renders back to sign in link on error", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("error=access_denied") as ReturnType<typeof useSearchParams>,
    );
    const { default: OAuthCallbackPage } = await import("../app/auth/callback/[provider]/page");
    render(<OAuthCallbackPage />);

    const link = screen.getByText("Back to sign in");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/login");
  });

  it("displays correct provider name from route params", async () => {
    vi.mocked(useParams).mockReturnValue({ provider: "discord" });
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("error=access_denied") as ReturnType<typeof useSearchParams>,
    );
    const { default: OAuthCallbackPage } = await import("../app/auth/callback/[provider]/page");
    render(<OAuthCallbackPage />);

    expect(screen.getByText("Could not sign in with discord")).toBeInTheDocument();
  });
});
