import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// --- Mocks ---

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/dashboard",
}));

vi.mock("next/font/google", () => ({
  JetBrains_Mono: () => ({ variable: "--font-jetbrains-mono" }),
}));

vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: () => ({ data: null, isPending: false, error: null }),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  }),
}));

vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({ data: null, isPending: false, error: null }),
  signOut: vi.fn(),
}));

vi.mock("@/components/sidebar", () => ({
  Sidebar: () => <div data-testid="sidebar">Sidebar</div>,
  SidebarContent: ({ onNavigate: _o }: { onNavigate?: () => void }) => (
    <div data-testid="sidebar-content">SidebarContent</div>
  ),
}));

vi.mock("@/components/chat", () => ({
  ChatWidget: () => <div data-testid="chat-widget">ChatWidget</div>,
}));

vi.mock("@/lib/chat/chat-context", () => ({
  ChatProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/hooks/use-webmcp", () => ({
  useWebMCP: () => undefined,
}));

vi.mock("@/hooks/use-page-context", () => ({
  usePageContext: () => undefined,
}));

vi.mock("@/hooks/use-has-org", () => ({
  useHasOrg: () => ({ hasOrg: false, isLoading: false }),
}));

vi.mock("@/lib/api", () => ({
  getInferenceMode: () => Promise.resolve("hosted"),
  getCreditBalance: () => Promise.resolve({ balance: 0, currency: "USD" }),
}));

vi.mock("@/lib/api-config", () => ({
  SITE_URL: "https://localhost",
  PLATFORM_BASE_URL: "https://localhost",
}));

vi.mock("@/components/auth/email-verification-banner", () => ({
  EmailVerificationBanner: () => null,
}));

vi.mock("@/components/auth/email-verification-result-banner", () => ({
  EmailVerificationResultBanner: () => null,
}));

vi.mock("@/components/billing/suspension-banner", () => ({
  SuspensionBanner: () => null,
}));

vi.mock("@/components/admin/admin-guard", () => ({
  AdminGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/admin/admin-nav", () => ({
  AdminNav: () => <nav data-testid="admin-nav">AdminNav</nav>,
}));

vi.mock("@/components/account-switcher", () => ({
  AccountSwitcher: () => <div data-testid="account-switcher">AccountSwitcher</div>,
}));

vi.mock("@/lib/format-credit", () => ({
  formatCreditStandard: (n: number) => `${n} credits`,
}));

// --- Tests ---

describe("Layout snapshots", () => {
  it("AuthLayout renders centered card structure", async () => {
    const { default: AuthLayout } = await import("@/app/(auth)/layout");
    const { container } = render(
      <AuthLayout>
        <div>auth child</div>
      </AuthLayout>,
    );
    expect(container).toMatchSnapshot();
  });

  it("DashboardLayout renders sidebar + main with mobile sheet", async () => {
    const { default: DashboardLayout } = await import("@/app/(dashboard)/layout");
    const { container } = render(
      <DashboardLayout>
        <div>dashboard child</div>
      </DashboardLayout>,
    );
    expect(container).toMatchSnapshot();
  });

  it("FleetLayout renders sidebar + main", async () => {
    const { default: FleetLayout } = await import("@/app/fleet/layout");
    const { container } = render(
      <FleetLayout>
        <div>fleet child</div>
      </FleetLayout>,
    );
    expect(container).toMatchSnapshot();
  });

  it("PluginsLayout renders sidebar + main", async () => {
    const { default: PluginsLayout } = await import("@/app/plugins/layout");
    const { container } = render(
      <PluginsLayout>
        <div>plugins child</div>
      </PluginsLayout>,
    );
    expect(container).toMatchSnapshot();
  });

  it("AdminLayout renders desktop sidebar + admin nav + mobile fallback", async () => {
    const { default: AdminLayout } = await import("@/app/admin/layout");
    const { container } = render(
      <AdminLayout>
        <div>admin child</div>
      </AdminLayout>,
    );
    expect(container).toMatchSnapshot();
  });

  it("SettingsLayout renders desktop nav + mobile sheet", async () => {
    const { default: SettingsLayout } = await import("@/app/(dashboard)/settings/layout");
    const { container } = render(
      <SettingsLayout>
        <div>settings child</div>
      </SettingsLayout>,
    );
    expect(container).toMatchSnapshot();
  });

  it("BillingLayout renders billing nav sidebar + content area", async () => {
    const { default: BillingLayout } = await import("@/app/(dashboard)/billing/layout");
    const { container } = render(
      <BillingLayout>
        <div>billing child</div>
      </BillingLayout>,
    );
    expect(container).toMatchSnapshot();
  });
});
