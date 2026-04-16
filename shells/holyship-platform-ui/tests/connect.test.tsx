import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks — these run before imports
const { mockReplace, mockSignInSocial, mockSearchParams } = vi.hoisted(() => {
  const params = { current: new URLSearchParams("installation_id=123&setup_action=install") };
  return {
    mockReplace: vi.fn(),
    mockSignInSocial: vi.fn().mockResolvedValue({}),
    mockSearchParams: params,
  };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams.current,
  useRouter: () => ({ replace: mockReplace }),
  redirect: vi.fn(),
}));

vi.mock("@core/lib/auth-client", () => ({
  signIn: { social: mockSignInSocial },
  useSession: () => ({ data: null, isPending: false }),
}));

vi.mock("@core/lib/brand-config", () => ({
  getBrandConfig: () => ({
    homePath: "/dashboard",
    productName: "Holy Ship",
    brandName: "Holy Ship",
    domain: "holyship.wtf",
  }),
}));

import ConnectCallbackPage from "../src/app/connect/callback/page";
import ConnectCompletePage from "../src/app/connect/complete/page";
import LoginPage from "../src/app/(auth)/login/page";

describe("ConnectCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    mockSearchParams.current = new URLSearchParams("installation_id=123&setup_action=install");
  });

  it("stores installation_id in sessionStorage on install", () => {
    render(<ConnectCallbackPage />);
    expect(sessionStorage.getItem("holyship_installation_id")).toBe("123");
  });

  it("triggers GitHub OAuth via better-auth", () => {
    render(<ConnectCallbackPage />);
    expect(mockSignInSocial).toHaveBeenCalledWith({
      provider: "github",
      callbackURL: "/connect/complete",
    });
  });

  it("redirects to dashboard on setup_action=update", () => {
    mockSearchParams.current = new URLSearchParams("setup_action=update");
    render(<ConnectCallbackPage />);
    expect(mockReplace).toHaveBeenCalledWith("/dashboard");
  });

  it("shows requesting message for setup_action=request", () => {
    mockSearchParams.current = new URLSearchParams("setup_action=request");
    render(<ConnectCallbackPage />);
    expect(screen.getByText(/waiting for approval/i)).toBeDefined();
  });
});

describe("ConnectComplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("redirects to dashboard when no installation_id stored", () => {
    render(<ConnectCompletePage />);
    expect(mockReplace).toHaveBeenCalledWith("/dashboard");
  });
});

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams.current = new URLSearchParams();
  });

  it("renders GitHub login button", () => {
    render(<LoginPage />);
    expect(screen.getByRole("button", { name: /log in with github/i })).toBeDefined();
  });
});

describe("ConnectPage (server redirect)", () => {
  const ORIGINAL_ENV = process.env.NEXT_PUBLIC_GITHUB_APP_URL;
  const DEFAULT_URL = "https://github.com/apps/holy-ship/installations/new";

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const nav = await import("next/navigation");
    (nav.redirect as ReturnType<typeof vi.fn>).mockClear();
  });

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.NEXT_PUBLIC_GITHUB_APP_URL;
    else process.env.NEXT_PUBLIC_GITHUB_APP_URL = ORIGINAL_ENV;
  });

  it("falls back to default GitHub App URL when env is unset", async () => {
    delete process.env.NEXT_PUBLIC_GITHUB_APP_URL;
    const { default: ConnectPage } = await import("../src/app/connect/page");
    const { redirect } = await import("next/navigation");
    ConnectPage();
    expect(redirect).toHaveBeenCalledWith(DEFAULT_URL);
  });

  it("falls back to default GitHub App URL when env is an empty string", async () => {
    process.env.NEXT_PUBLIC_GITHUB_APP_URL = "";
    const { default: ConnectPage } = await import("../src/app/connect/page");
    const { redirect } = await import("next/navigation");
    ConnectPage();
    expect(redirect).toHaveBeenCalledWith(DEFAULT_URL);
  });

  it("uses env value when set", async () => {
    process.env.NEXT_PUBLIC_GITHUB_APP_URL = "https://github.com/apps/custom";
    const { default: ConnectPage } = await import("../src/app/connect/page");
    const { redirect } = await import("next/navigation");
    ConnectPage();
    expect(redirect).toHaveBeenCalledWith("https://github.com/apps/custom/installations/new");
  });
});
