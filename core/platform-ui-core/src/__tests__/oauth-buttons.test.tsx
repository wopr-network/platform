import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => ({
  trpc: {
    authSocial: {
      enabledSocialProviders: {
        useQuery: vi.fn(),
      },
    },
  },
}));

vi.mock("@/lib/auth-client", () => ({
  signIn: {
    social: vi.fn(),
  },
}));

import { OAuthButtons } from "@/components/oauth-buttons";
import { trpc } from "@/lib/trpc";

describe("OAuthButtons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing while loading", () => {
    vi.mocked(trpc.authSocial.enabledSocialProviders.useQuery).mockReturnValue({
      data: undefined,
      isLoading: true,
    } as ReturnType<typeof trpc.authSocial.enabledSocialProviders.useQuery>);

    const { container } = render(<OAuthButtons />);
    expect(container.querySelector("button")).toBeNull();
  });

  it("renders nothing when no providers are enabled", () => {
    vi.mocked(trpc.authSocial.enabledSocialProviders.useQuery).mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof trpc.authSocial.enabledSocialProviders.useQuery>);

    const { container } = render(<OAuthButtons />);
    expect(container.querySelector("button")).toBeNull();
  });

  it("renders nothing when data is undefined and not loading", () => {
    vi.mocked(trpc.authSocial.enabledSocialProviders.useQuery).mockReturnValue({
      data: undefined,
      isLoading: false,
    } as ReturnType<typeof trpc.authSocial.enabledSocialProviders.useQuery>);

    const { container } = render(<OAuthButtons />);
    expect(container.querySelector("button")).toBeNull();
  });

  it("renders only enabled providers", () => {
    vi.mocked(trpc.authSocial.enabledSocialProviders.useQuery).mockReturnValue({
      data: ["github", "discord"],
      isLoading: false,
    } as ReturnType<typeof trpc.authSocial.enabledSocialProviders.useQuery>);

    render(<OAuthButtons />);
    expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Discord" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Google/ })).not.toBeInTheDocument();
  });

  it("renders all three providers when all are enabled", () => {
    vi.mocked(trpc.authSocial.enabledSocialProviders.useQuery).mockReturnValue({
      data: ["github", "discord", "google"],
      isLoading: false,
    } as ReturnType<typeof trpc.authSocial.enabledSocialProviders.useQuery>);

    render(<OAuthButtons />);
    expect(screen.getByRole("button", { name: "Continue with GitHub" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Discord" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });

  it("renders the separator when providers are available", () => {
    vi.mocked(trpc.authSocial.enabledSocialProviders.useQuery).mockReturnValue({
      data: ["github"],
      isLoading: false,
    } as ReturnType<typeof trpc.authSocial.enabledSocialProviders.useQuery>);

    render(<OAuthButtons />);
    expect(screen.getByText(/or continue with/i)).toBeInTheDocument();
  });

  it("does not render the separator when no providers", () => {
    vi.mocked(trpc.authSocial.enabledSocialProviders.useQuery).mockReturnValue({
      data: [],
      isLoading: false,
    } as ReturnType<typeof trpc.authSocial.enabledSocialProviders.useQuery>);

    render(<OAuthButtons />);
    expect(screen.queryByText(/or continue with/i)).not.toBeInTheDocument();
  });
});
