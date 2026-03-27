import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPush, mockReplace, mockSignInEmail, mockUseSession } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockSignInEmail: vi.fn(),
  mockUseSession: vi.fn(),
}));

let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/lib/auth-client", () => ({
  signIn: { email: mockSignInEmail },
  useSession: mockUseSession,
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    authSocial: {
      enabledSocialProviders: {
        useQuery: vi.fn(() => ({ data: [], isLoading: false })),
      },
    },
  },
}));

import LoginPage from "@/app/(auth)/login/page";

describe("Login page redirect flow", () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
    mockSignInEmail.mockClear();
    mockSearchParams = new URLSearchParams();
    // Default: not authenticated (so AuthRedirect does not fire)
    mockUseSession.mockReturnValue({ data: null, isPending: false });
  });

  it("redirects to callbackUrl after successful login", async () => {
    mockSearchParams = new URLSearchParams("callbackUrl=/settings");
    mockSignInEmail.mockResolvedValue({ error: undefined });

    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await userEvent.type(emailInput, "user@test.com");
    await userEvent.type(passwordInput, "password123");
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/settings");
    });
  });

  it("redirects to / when callbackUrl is missing", async () => {
    mockSearchParams = new URLSearchParams();
    mockSignInEmail.mockResolvedValue({ error: undefined });

    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await userEvent.type(emailInput, "user@test.com");
    await userEvent.type(passwordInput, "password123");
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("sanitizes external callbackUrl to / (open redirect prevention)", async () => {
    mockSearchParams = new URLSearchParams("callbackUrl=https://evil.com/phishing");
    mockSignInEmail.mockResolvedValue({ error: undefined });

    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await userEvent.type(emailInput, "user@test.com");
    await userEvent.type(passwordInput, "password123");
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("sanitizes protocol-relative callbackUrl to / (open redirect prevention)", async () => {
    mockSearchParams = new URLSearchParams("callbackUrl=//evil.com");
    mockSignInEmail.mockResolvedValue({ error: undefined });

    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await userEvent.type(emailInput, "user@test.com");
    await userEvent.type(passwordInput, "password123");
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  it("does not redirect on login failure", async () => {
    mockSignInEmail.mockResolvedValue({
      error: { status: 401, message: "Invalid credentials" },
    });

    render(<LoginPage />);

    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const submitButton = screen.getByRole("button", { name: /sign in/i });

    await userEvent.type(emailInput, "user@test.com");
    await userEvent.type(passwordInput, "wrong");
    await userEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });
});
