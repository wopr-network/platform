import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api-config", () => ({
  API_BASE_URL: "https://api.test/api",
}));

vi.mock("@/lib/auth-client", () => ({
  signIn: {
    social: vi.fn(),
  },
}));

import { OAuthButtons } from "@/components/oauth-buttons";

describe("OAuthButtons", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders nothing while loading", () => {
    // fetch never resolves — component stays in loading state
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { container } = render(<OAuthButtons />);
    expect(container.querySelector("button")).toBeNull();
  });

  it("renders nothing when no providers are enabled", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }));
    const { container } = render(<OAuthButtons />);
    // Wait for useEffect to settle
    await vi.waitFor(() => {
      expect(container.querySelector("button")).toBeNull();
    });
  });

  it("renders nothing when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));
    const { container } = render(<OAuthButtons />);
    await vi.waitFor(() => {
      expect(container.querySelector("button")).toBeNull();
    });
  });

  it("renders only enabled providers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(["github", "discord"]) }));
    render(<OAuthButtons />);
    expect(await screen.findByRole("button", { name: "Continue with GitHub" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Discord" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Google/ })).not.toBeInTheDocument();
  });

  it("renders all three providers when all are enabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(["github", "discord", "google"]) }),
    );
    render(<OAuthButtons />);
    expect(await screen.findByRole("button", { name: "Continue with GitHub" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Discord" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });

  it("renders the separator when providers are available", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(["github"]) }));
    render(<OAuthButtons />);
    expect(await screen.findByText(/or continue with/i)).toBeInTheDocument();
  });

  it("does not render the separator when no providers", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }));
    render(<OAuthButtons />);
    // Wait for the fetch to resolve and state to settle
    await vi.waitFor(() => {
      expect(screen.queryByText(/or continue with/i)).not.toBeInTheDocument();
    });
  });
});
