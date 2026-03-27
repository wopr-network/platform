import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRouter, useSearchParams } from "next/navigation";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

let mockFetch: Mock<(...args: unknown[]) => Promise<unknown>>;

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    $fetch: (...args: unknown[]) => mockFetch(...args),
    useSession: () => ({ data: null, isPending: false, error: null }),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
    forgetPassword: vi.fn(),
    resetPassword: vi.fn(),
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

describe("Forgot password page", () => {
  beforeEach(() => {
    mockFetch = vi.fn();
  });

  it("renders email input and submit button", async () => {
    const { default: ForgotPasswordPage } = await import("../app/(auth)/forgot-password/page");
    render(<ForgotPasswordPage />);

    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send reset link" })).toBeInTheDocument();
  });

  it("renders back to sign in link", async () => {
    const { default: ForgotPasswordPage } = await import("../app/(auth)/forgot-password/page");
    render(<ForgotPasswordPage />);

    const link = screen.getByText("Back to sign in");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/login");
  });

  it("shows success message after successful submission", async () => {
    mockFetch.mockResolvedValueOnce({ error: undefined });
    const user = userEvent.setup();
    const { default: ForgotPasswordPage } = await import("../app/(auth)/forgot-password/page");
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByText("Transmission sent")).toBeInTheDocument();
    });
    expect(screen.getByText(/test@example\.com/)).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith("/request-password-reset", {
      method: "POST",
      body: { email: "test@example.com", redirectTo: "/reset-password" },
    });
  });

  it("shows error message on API error", async () => {
    mockFetch.mockResolvedValueOnce({ error: { message: "User not found" } });
    const user = userEvent.setup();
    const { default: ForgotPasswordPage } = await import("../app/(auth)/forgot-password/page");
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText("Email"), "bad@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByText("User not found")).toBeInTheDocument();
    });
  });

  it("shows fallback error when API error has no message", async () => {
    mockFetch.mockResolvedValueOnce({ error: {} });
    const user = userEvent.setup();
    const { default: ForgotPasswordPage } = await import("../app/(auth)/forgot-password/page");
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText("Email"), "bad@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to send reset email")).toBeInTheDocument();
    });
  });

  it("shows network error on fetch rejection", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));
    const user = userEvent.setup();
    const { default: ForgotPasswordPage } = await import("../app/(auth)/forgot-password/page");
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByText("A network error occurred. Please try again.")).toBeInTheDocument();
    });
  });

  it("disables button during submission", async () => {
    let resolveFetch!: (value: unknown) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((r) => {
        resolveFetch = r;
      }),
    );
    const user = userEvent.setup();
    const { default: ForgotPasswordPage } = await import("../app/(auth)/forgot-password/page");
    render(<ForgotPasswordPage />);

    await user.type(screen.getByLabelText("Email"), "test@example.com");
    await user.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() => {
      expect(screen.getByText("TRANSMITTING")).toBeInTheDocument();
    });
    expect(screen.getByRole("button")).toBeDisabled();

    resolveFetch({ error: undefined });
    await waitFor(() => {
      expect(screen.getByText("Transmission sent")).toBeInTheDocument();
    });
  });
});

describe("Reset password page", () => {
  const mockPush = vi.fn();

  beforeEach(() => {
    mockFetch = vi.fn();
    mockPush.mockClear();
    vi.mocked(useRouter).mockReturnValue({ push: mockPush } as unknown as ReturnType<
      typeof useRouter
    >);
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams() as ReturnType<typeof useSearchParams>,
    );
  });

  it("shows access denied when no token is present", async () => {
    const { default: ResetPasswordPage } = await import("../app/(auth)/reset-password/page");
    render(<ResetPasswordPage />);

    expect(screen.getByText("Access denied")).toBeInTheDocument();
    expect(screen.getByText(/invalid or has expired/)).toBeInTheDocument();
    const link = screen.getByText("Request a new reset link");
    expect(link.closest("a")).toHaveAttribute("href", "/forgot-password");
  });

  it("renders password and confirm inputs when token is present", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("token=valid-token") as ReturnType<typeof useSearchParams>,
    );
    const { default: ResetPasswordPage } = await import("../app/(auth)/reset-password/page");
    render(<ResetPasswordPage />);

    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset password" })).toBeInTheDocument();
  });

  it("shows error when passwords do not match", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("token=valid-token") as ReturnType<typeof useSearchParams>,
    );
    const user = userEvent.setup();
    const { default: ResetPasswordPage } = await import("../app/(auth)/reset-password/page");
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New password"), "Password123!");
    await user.type(screen.getByLabelText("Confirm password"), "DifferentPassword!");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => {
      expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("calls API and redirects to /login on success", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("token=valid-token") as ReturnType<typeof useSearchParams>,
    );
    mockFetch.mockResolvedValueOnce({ error: undefined });
    const user = userEvent.setup();
    const { default: ResetPasswordPage } = await import("../app/(auth)/reset-password/page");
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New password"), "NewSecurePass1!");
    await user.type(screen.getByLabelText("Confirm password"), "NewSecurePass1!");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
    expect(mockFetch).toHaveBeenCalledWith("/reset-password", {
      method: "POST",
      body: { newPassword: "NewSecurePass1!", token: "valid-token" },
    });
  });

  it("shows error on API failure (e.g. invalid/expired token)", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("token=expired-token") as ReturnType<typeof useSearchParams>,
    );
    mockFetch.mockResolvedValueOnce({ error: { message: "Token expired" } });
    const user = userEvent.setup();
    const { default: ResetPasswordPage } = await import("../app/(auth)/reset-password/page");
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New password"), "NewSecurePass1!");
    await user.type(screen.getByLabelText("Confirm password"), "NewSecurePass1!");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => {
      expect(screen.getByText("Token expired")).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("shows fallback error when API error has no message", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("token=valid-token") as ReturnType<typeof useSearchParams>,
    );
    mockFetch.mockResolvedValueOnce({ error: {} });
    const user = userEvent.setup();
    const { default: ResetPasswordPage } = await import("../app/(auth)/reset-password/page");
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New password"), "NewSecurePass1!");
    await user.type(screen.getByLabelText("Confirm password"), "NewSecurePass1!");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => {
      expect(screen.getByText("Failed to reset password")).toBeInTheDocument();
    });
  });

  it("shows network error on fetch rejection", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("token=valid-token") as ReturnType<typeof useSearchParams>,
    );
    mockFetch.mockRejectedValueOnce(new Error("Network failure"));
    const user = userEvent.setup();
    const { default: ResetPasswordPage } = await import("../app/(auth)/reset-password/page");
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New password"), "NewSecurePass1!");
    await user.type(screen.getByLabelText("Confirm password"), "NewSecurePass1!");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => {
      expect(screen.getByText("A network error occurred. Please try again.")).toBeInTheDocument();
    });
  });

  it("disables button during submission", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("token=valid-token") as ReturnType<typeof useSearchParams>,
    );
    let resolveFetch!: (value: unknown) => void;
    mockFetch.mockReturnValueOnce(
      new Promise((r) => {
        resolveFetch = r;
      }),
    );
    const user = userEvent.setup();
    const { default: ResetPasswordPage } = await import("../app/(auth)/reset-password/page");
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New password"), "NewSecurePass1!");
    await user.type(screen.getByLabelText("Confirm password"), "NewSecurePass1!");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => {
      expect(screen.getByText("UPDATING")).toBeInTheDocument();
    });
    expect(screen.getByRole("button")).toBeDisabled();

    resolveFetch({ error: undefined });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
  });

  it("renders back to sign in link when token is present", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("token=valid-token") as ReturnType<typeof useSearchParams>,
    );
    const { default: ResetPasswordPage } = await import("../app/(auth)/reset-password/page");
    render(<ResetPasswordPage />);

    const link = screen.getByText("Back to sign in");
    expect(link.closest("a")).toHaveAttribute("href", "/login");
  });

  it("shows error when password is shorter than 12 characters", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("token=valid-token") as ReturnType<typeof useSearchParams>,
    );
    const user = userEvent.setup();
    const { default: ResetPasswordPage } = await import("../app/(auth)/reset-password/page");
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New password"), "Short1!");
    await user.type(screen.getByLabelText("Confirm password"), "Short1!");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => {
      expect(screen.getByText("Password must be at least 12 characters")).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows error when password has no uppercase letter", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("token=valid-token") as ReturnType<typeof useSearchParams>,
    );
    const user = userEvent.setup();
    const { default: ResetPasswordPage } = await import("../app/(auth)/reset-password/page");
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New password"), "alllowercase123!");
    await user.type(screen.getByLabelText("Confirm password"), "alllowercase123!");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => {
      expect(
        screen.getByText("Password must contain at least one uppercase letter"),
      ).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows error when password has no lowercase letter", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("token=valid-token") as ReturnType<typeof useSearchParams>,
    );
    const user = userEvent.setup();
    const { default: ResetPasswordPage } = await import("../app/(auth)/reset-password/page");
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New password"), "ALLUPPERCASE123!");
    await user.type(screen.getByLabelText("Confirm password"), "ALLUPPERCASE123!");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => {
      expect(
        screen.getByText("Password must contain at least one lowercase letter"),
      ).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows error when password has no digit", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("token=valid-token") as ReturnType<typeof useSearchParams>,
    );
    const user = userEvent.setup();
    const { default: ResetPasswordPage } = await import("../app/(auth)/reset-password/page");
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New password"), "NoDigitsHere!!");
    await user.type(screen.getByLabelText("Confirm password"), "NoDigitsHere!!");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => {
      expect(screen.getByText("Password must contain at least one digit")).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows error when password has no special character", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("token=valid-token") as ReturnType<typeof useSearchParams>,
    );
    const user = userEvent.setup();
    const { default: ResetPasswordPage } = await import("../app/(auth)/reset-password/page");
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New password"), "NoSpecialChar12");
    await user.type(screen.getByLabelText("Confirm password"), "NoSpecialChar12");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => {
      expect(
        screen.getByText("Password must contain at least one special character"),
      ).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("allows submission when password meets all complexity requirements", async () => {
    vi.mocked(useSearchParams).mockReturnValue(
      new URLSearchParams("token=valid-token") as ReturnType<typeof useSearchParams>,
    );
    mockFetch.mockResolvedValueOnce({ error: undefined });
    const user = userEvent.setup();
    const { default: ResetPasswordPage } = await import("../app/(auth)/reset-password/page");
    render(<ResetPasswordPage />);

    await user.type(screen.getByLabelText("New password"), "ValidPass12!@");
    await user.type(screen.getByLabelText("Confirm password"), "ValidPass12!@");
    await user.click(screen.getByRole("button", { name: "Reset password" }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/login");
    });
    expect(mockFetch).toHaveBeenCalledWith("/reset-password", {
      method: "POST",
      body: { newPassword: "ValidPass12!@", token: "valid-token" },
    });
  });
});
