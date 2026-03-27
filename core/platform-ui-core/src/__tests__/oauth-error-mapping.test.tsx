import { render, screen } from "@testing-library/react";
import { useSearchParams } from "next/navigation";
import { describe, expect, it, vi } from "vitest";
import { getOAuthErrorMessage } from "@/lib/oauth-errors";

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
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
    forgetPassword: vi.fn(),
    resetPassword: vi.fn(),
    sendVerificationEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
  }),
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    authSocial: {
      enabledSocialProviders: {
        useQuery: () => ({ data: ["github"], isLoading: false }),
      },
    },
  },
  TRPCProvider: ({ children }: { children: React.ReactNode }) => children,
}));

describe("getOAuthErrorMessage", () => {
  it("returns null for null input", () => {
    expect(getOAuthErrorMessage(null)).toBeNull();
  });

  it("maps access_denied to fixed message", () => {
    expect(getOAuthErrorMessage("access_denied")).toBe("Access was denied. Please try again.");
  });

  it("maps account_already_linked to fixed message", () => {
    expect(getOAuthErrorMessage("account_already_linked")).toBe(
      "An account with this email already exists. Sign in to link your account.",
    );
  });

  it("maps server_error to fixed message", () => {
    expect(getOAuthErrorMessage("server_error")).toBe(
      "The authentication server encountered an error. Please try again later.",
    );
  });

  it("returns generic fallback for unknown code", () => {
    expect(getOAuthErrorMessage("something_random")).toBe(
      "Authentication failed. Please try again.",
    );
  });

  it("returns generic fallback for malicious input — never reflects raw value", () => {
    const malicious = '<script>alert("xss")</script>';
    const result = getOAuthErrorMessage(malicious);
    expect(result).toBe("Authentication failed. Please try again.");
    expect(result).not.toContain(malicious);
    expect(result).not.toContain("<script>");
  });
});

// Import AFTER mocks
const { default: OAuthCallbackPage } = await import("@/app/auth/callback/[provider]/page");

describe("OAuthCallbackPage — error reflection", () => {
  it("never renders raw malicious error param in the DOM", () => {
    const malicious = "<img src=x onerror=alert(1)>";
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams(`error=${encodeURIComponent(malicious)}`) as never,
    );

    render(<OAuthCallbackPage />);

    expect(screen.getByText("Authentication failed. Please try again.")).toBeInTheDocument();

    expect(screen.queryByText(malicious)).not.toBeInTheDocument();
  });

  it("shows fixed message for access_denied", () => {
    vi.mocked(useSearchParams).mockReturnValue(new URLSearchParams("error=access_denied") as never);

    render(<OAuthCallbackPage />);

    expect(screen.getByText("Access was denied. Please try again.")).toBeInTheDocument();
  });
});
