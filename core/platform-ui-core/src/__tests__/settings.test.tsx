import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  BillingInfo,
  BillingUsage,
  CapabilitySetting,
  CreditBalance,
  Organization,
  PlatformApiKey,
  ProviderKey,
  UserProfile,
} from "@/lib/api";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/settings/profile",
}));

// Mock better-auth/react — session with user-001 (Alice) so role-gated org UI renders admin view
vi.mock("better-auth/react", () => ({
  createAuthClient: () => ({
    useSession: () => ({
      data: {
        user: { id: "user-001", name: "Alice Johnson", email: "alice@example.com" },
        session: { id: "sess-1", userId: "user-001", expiresAt: new Date(Date.now() + 86400000) },
      },
      isPending: false,
      error: null,
    }),
    signIn: { email: vi.fn(), social: vi.fn() },
    signUp: { email: vi.fn() },
    signOut: vi.fn(),
  }),
}));

const MOCK_PROFILE: UserProfile = {
  id: "user-001",
  name: "Alice Johnson",
  email: "alice@example.com",
  avatarUrl: null,
  oauthConnections: [
    { provider: "github", connected: true },
    { provider: "discord", connected: false },
    { provider: "google", connected: true },
  ],
};

const MOCK_PROVIDERS: ProviderKey[] = [
  {
    id: "pk-1",
    provider: "Anthropic",
    maskedKey: "sk-ant-...a1b2",
    status: "valid",
    lastChecked: "2026-02-13T14:00:00Z",
    defaultModel: "claude-sonnet-4-5-20250514",
    models: ["claude-sonnet-4-5-20250514", "claude-opus-4-5-20250514", "claude-haiku-4-5-20250514"],
  },
  {
    id: "pk-2",
    provider: "OpenAI",
    maskedKey: "sk-...x9y8",
    status: "valid",
    lastChecked: "2026-02-13T13:55:00Z",
    defaultModel: "gpt-4o",
    models: ["gpt-4o", "gpt-4o-mini", "o1"],
  },
  {
    id: "pk-3",
    provider: "xAI",
    maskedKey: "",
    status: "unchecked",
    lastChecked: null,
    defaultModel: null,
    models: ["grok-2", "grok-3"],
  },
];

const MOCK_API_KEYS: PlatformApiKey[] = [
  {
    id: "ak-1",
    name: "CI Pipeline",
    prefix: "platform_ci_",
    scope: "full",
    createdAt: "2026-01-20T10:00:00Z",
    lastUsedAt: "2026-02-13T08:00:00Z",
    expiresAt: "2026-04-20T10:00:00Z",
  },
  {
    id: "ak-2",
    name: "Monitoring Dashboard",
    prefix: "platform_mon_",
    scope: "read-only",
    createdAt: "2026-02-01T12:00:00Z",
    lastUsedAt: "2026-02-12T22:00:00Z",
    expiresAt: null,
  },
  {
    id: "ak-3",
    name: "Mobile App",
    prefix: "platform_mob_",
    scope: "instances",
    createdAt: "2026-02-10T09:00:00Z",
    lastUsedAt: null,
    expiresAt: "2026-05-10T09:00:00Z",
  },
];

const MOCK_ORG: Organization = {
  id: "org-001",
  name: "Acme Corp",
  slug: "acme-corp",
  billingEmail: "billing@acme.com",
  members: [
    {
      id: "user-001",
      userId: "user-001",
      name: "Alice Johnson",
      email: "alice@example.com",
      role: "owner",
      joinedAt: "2025-12-01T00:00:00Z",
    },
    {
      id: "user-002",
      userId: "user-002",
      name: "Bob Smith",
      email: "bob@example.com",
      role: "admin",
      joinedAt: "2026-01-15T00:00:00Z",
    },
    {
      id: "user-003",
      userId: "user-003",
      name: "Carol Davis",
      email: "carol@example.com",
      role: "member",
      joinedAt: "2026-02-01T00:00:00Z",
    },
  ],
  invites: [],
};

const MOCK_CAPABILITIES: CapabilitySetting[] = [
  {
    capability: "transcription",
    mode: "hosted",
    maskedKey: null,
    keyStatus: null,
    provider: null,
  },
  {
    capability: "image-gen",
    mode: "hosted",
    maskedKey: null,
    keyStatus: null,
    provider: null,
  },
  {
    capability: "text-gen",
    mode: "byok",
    maskedKey: "sk-ant-...a1b2",
    keyStatus: "valid",
    provider: "Anthropic",
  },
  {
    capability: "embeddings",
    mode: "hosted",
    maskedKey: null,
    keyStatus: null,
    provider: null,
  },
];

const MOCK_BILLING_USAGE: BillingUsage = {
  plan: "pro",
  planName: "Pro",
  billingPeriodStart: "2026-02-01T00:00:00Z",
  billingPeriodEnd: "2026-03-01T00:00:00Z",
  instancesRunning: 2,
  instanceCap: 5,
  storageUsedGb: 3.2,
  storageCapGb: 10,
  apiCalls: 12500,
};

// Mock @/lib/api with test fixtures
vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getProfile: vi.fn().mockResolvedValue(MOCK_PROFILE),
    updateProfile: vi.fn().mockResolvedValue(MOCK_PROFILE),
    changePassword: vi.fn().mockResolvedValue(undefined),
    deleteAccount: vi.fn().mockResolvedValue(undefined),
    listProviderKeys: vi.fn().mockResolvedValue(MOCK_PROVIDERS),
    testProviderKey: vi.fn().mockResolvedValue({ valid: true }),
    removeProviderKey: vi.fn().mockResolvedValue(undefined),
    saveProviderKey: vi.fn().mockResolvedValue({ ok: true, id: "test-id", provider: "openai" }),
    updateProviderModel: vi.fn().mockResolvedValue(undefined),
    listApiKeys: vi.fn().mockResolvedValue(MOCK_API_KEYS),
    createApiKey: vi
      .fn()
      .mockResolvedValue({ key: MOCK_API_KEYS[0], secret: "platform_test_secret" }),
    revokeApiKey: vi.fn().mockResolvedValue(undefined),
    getBillingUsage: vi.fn().mockResolvedValue(MOCK_BILLING_USAGE),
    createBillingPortalSession: vi
      .fn()
      .mockResolvedValue({ url: "https://billing.stripe.com/session/test" }),
    storeTenantKey: vi.fn().mockResolvedValue({
      provider: "anthropic",
      hasKey: true,
      maskedKey: "sk-ant-...xy",
      createdAt: null,
      updatedAt: null,
    }),
    deleteTenantKey: vi.fn().mockResolvedValue(undefined),
    getBillingInfo: vi.fn().mockResolvedValue({
      email: "billing@acme.com",
      paymentMethods: [
        {
          id: "pm-1",
          brand: "Visa",
          last4: "4242",
          expiryMonth: 12,
          expiryYear: 2027,
          isDefault: true,
        },
      ],
      invoices: [],
    } satisfies BillingInfo),
    getCreditBalance: vi.fn().mockResolvedValue({
      balance: 5.0,
      dailyBurn: 0.33,
      runway: 15,
    } satisfies CreditBalance),
    uploadAvatar: vi.fn().mockResolvedValue(MOCK_PROFILE),
  };
});

// Mock @/lib/settings-api for capability tRPC wrappers
vi.mock("@/lib/settings-api", () => ({
  getNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
  saveProviderKey: vi.fn(),
  testProviderKey: vi.fn().mockResolvedValue({ valid: true }),
  listCapabilities: vi.fn().mockResolvedValue(MOCK_CAPABILITIES),
  updateCapability: vi.fn().mockResolvedValue(MOCK_CAPABILITIES[0]),
}));

// Mock @/hooks/use-has-org — default to hasOrg=true so existing org tests pass
vi.mock("@/hooks/use-has-org", () => ({
  useHasOrg: vi.fn().mockReturnValue({ hasOrg: true, loading: false }),
}));

// Mock @/lib/org-api with test fixtures
vi.mock("@/lib/org-api", () => ({
  getOrganization: vi.fn().mockResolvedValue(MOCK_ORG),
  updateOrganization: vi.fn().mockResolvedValue(MOCK_ORG),
  inviteMember: vi.fn().mockResolvedValue({
    id: "inv-001",
    email: "carol@example.com",
    role: "member",
    invitedBy: "user-001",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  }),
  changeRole: vi.fn().mockResolvedValue(undefined),
  revokeInvite: vi.fn().mockResolvedValue(undefined),
  removeMember: vi.fn().mockResolvedValue(undefined),
  transferOwnership: vi.fn().mockResolvedValue(undefined),
  createOrganization: vi
    .fn()
    .mockResolvedValue({ id: "org-new", name: "Test Org", slug: "test-org" }),
}));

// Mock @/lib/auth-client for OAuth account linking
vi.mock("@/lib/auth-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-client")>();
  return {
    ...actual,
    linkSocial: vi.fn(),
    unlinkAccount: vi.fn().mockResolvedValue({}),
    listAccounts: vi.fn().mockResolvedValue({
      data: [
        { providerId: "github", accountId: "gh-123" },
        { providerId: "google", accountId: "goog-456" },
      ],
    }),
  };
});

describe("Profile page", () => {
  it("renders profile heading and form fields", async () => {
    const { default: ProfilePage } = await import("../app/(dashboard)/settings/profile/page");
    render(<ProfilePage />);

    // Initially shows skeleton loading state
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();

    // Wait for mock data to load
    expect(await screen.findByText("Profile")).toBeInTheDocument();
    expect(screen.getByLabelText("Display name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  it("renders change password section", async () => {
    const { default: ProfilePage } = await import("../app/(dashboard)/settings/profile/page");
    render(<ProfilePage />);

    expect(await screen.findByText("Change Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Current password")).toBeInTheDocument();
    expect(screen.getByLabelText("New password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm new password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Change password" })).toBeInTheDocument();
  });

  it("renders connected accounts section", async () => {
    const { default: ProfilePage } = await import("../app/(dashboard)/settings/profile/page");
    render(<ProfilePage />);

    expect(await screen.findByText("Connected Accounts")).toBeInTheDocument();
    expect(screen.getByText("github")).toBeInTheDocument();
    expect(screen.getByText("discord")).toBeInTheDocument();
    expect(screen.getByText("google")).toBeInTheDocument();
  });

  it("renders delete account section", async () => {
    const { default: ProfilePage } = await import("../app/(dashboard)/settings/profile/page");
    render(<ProfilePage />);

    expect(await screen.findByText("Delete Account")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete account" })).toBeInTheDocument();
  });

  it("renders save button", async () => {
    const { default: ProfilePage } = await import("../app/(dashboard)/settings/profile/page");
    render(<ProfilePage />);

    expect(await screen.findByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });
});

describe("Providers page", () => {
  it("renders provider settings heading", async () => {
    const { default: ProvidersPage } = await import("../app/(dashboard)/settings/providers/page");
    render(<ProvidersPage />);

    // Initially shows skeleton loading state
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(await screen.findByText("Provider Settings")).toBeInTheDocument();
  });

  it("renders capability toggle cards", async () => {
    const { default: ProvidersPage } = await import("../app/(dashboard)/settings/providers/page");
    render(<ProvidersPage />);

    expect(await screen.findByText("Transcription")).toBeInTheDocument();
    expect(screen.getByText("Image Generation")).toBeInTheDocument();
    expect(screen.getByText("Text Generation")).toBeInTheDocument();
    expect(screen.getByText("Embeddings")).toBeInTheDocument();
  });

  it("renders hosted pricing for each capability", async () => {
    const { default: ProvidersPage } = await import("../app/(dashboard)/settings/providers/page");
    render(<ProvidersPage />);

    expect(await screen.findByText("$0.006/min")).toBeInTheDocument();
    expect(screen.getByText("$0.05/image")).toBeInTheDocument();
    expect(screen.getByText("$0.002/1K tokens")).toBeInTheDocument();
    expect(screen.getByText("$0.0001/1K tokens")).toBeInTheDocument();
  });

  it("renders Platform Hosted and Bring Your Own Key options", async () => {
    const { default: ProvidersPage } = await import("../app/(dashboard)/settings/providers/page");
    render(<ProvidersPage />);

    const hostedLabels = await screen.findAllByText("Platform Hosted");
    expect(hostedLabels.length).toBe(4);

    const byokLabels = screen.getAllByText("Bring Your Own Key");
    expect(byokLabels.length).toBe(4);
  });

  it("shows BYOK key input for capability in byok mode", async () => {
    const { default: ProvidersPage } = await import("../app/(dashboard)/settings/providers/page");
    render(<ProvidersPage />);

    // text-gen is in BYOK mode with a masked key -- appears in both capability and provider sections
    const maskedKeys = await screen.findAllByText("sk-ant-...a1b2");
    expect(maskedKeys.length).toBeGreaterThanOrEqual(1);
    // "valid" badge appears in both sections too
    const validBadges = screen.getAllByText("valid");
    expect(validBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("renders Test Key button for BYOK capability with key", async () => {
    const { default: ProvidersPage } = await import("../app/(dashboard)/settings/providers/page");
    render(<ProvidersPage />);

    expect(await screen.findByRole("button", { name: "Test Key" })).toBeInTheDocument();
  });

  it("renders provider keys section", async () => {
    const { default: ProvidersPage } = await import("../app/(dashboard)/settings/providers/page");
    render(<ProvidersPage />);

    expect(await screen.findByText("Provider Keys")).toBeInTheDocument();
  });

  it("renders configured providers with status", async () => {
    const { default: ProvidersPage } = await import("../app/(dashboard)/settings/providers/page");
    render(<ProvidersPage />);

    // Provider names from MOCK_PROVIDERS rendered in provider keys section
    const anthropicElements = await screen.findAllByText("Anthropic");
    expect(anthropicElements.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("xAI")).toBeInTheDocument();
  });

  it("renders test connection and rotate buttons for configured providers", async () => {
    const { default: ProvidersPage } = await import("../app/(dashboard)/settings/providers/page");
    render(<ProvidersPage />);

    const testButtons = await screen.findAllByRole("button", { name: "Test connection" });
    expect(testButtons.length).toBeGreaterThanOrEqual(1);

    const rotateButtons = screen.getAllByRole("button", { name: "Rotate key" });
    expect(rotateButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("renders add key button for unconfigured providers", async () => {
    const { default: ProvidersPage } = await import("../app/(dashboard)/settings/providers/page");
    render(<ProvidersPage />);

    expect(await screen.findByRole("button", { name: "Add key" })).toBeInTheDocument();
  });
});

describe("Providers page - billing gate", () => {
  it("shows Enable Hosted button when user has payment method", async () => {
    const user = userEvent.setup();
    const { default: ProvidersPage } = await import("../app/(dashboard)/settings/providers/page");
    render(<ProvidersPage />);

    // Wait for capabilities to load
    await screen.findByText("Transcription");

    // text-gen is in byok mode, click hosted radio to trigger billing gate
    const textGenCard = screen.getByTestId("capability-text-gen");
    const hostedRadio = within(textGenCard).getByRole("radio", { name: /platform hosted/i });
    await user.click(hostedRadio);

    // Dialog opens — wait for billing check to complete
    expect(
      await screen.findByText(/Enable Platform Hosted for Text Generation/),
    ).toBeInTheDocument();
    // With a payment method on file, the Enable Hosted button should appear
    expect(await screen.findByRole("button", { name: "Enable Hosted" })).toBeInTheDocument();
  });

  it("blocks activation and shows add payment prompt when no payment method or credits", async () => {
    const api = await import("@/lib/api");
    vi.mocked(api.getBillingInfo).mockResolvedValueOnce({
      email: "billing@acme.com",
      paymentMethods: [],
      invoices: [],
    });
    vi.mocked(api.getCreditBalance).mockResolvedValueOnce({
      balance: 0,
      dailyBurn: 0,
      runway: null,
    });

    const user = userEvent.setup();
    const { default: ProvidersPage } = await import("../app/(dashboard)/settings/providers/page");
    render(<ProvidersPage />);

    await screen.findByText("Transcription");

    const textGenCard = screen.getByTestId("capability-text-gen");
    const hostedRadio = within(textGenCard).getByRole("radio", { name: /platform hosted/i });
    await user.click(hostedRadio);

    // Dialog opens — should show payment required message instead of Enable Hosted button
    expect(await screen.findByText(/payment method required/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enable Hosted" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add payment method" })).toBeInTheDocument();
  });

  it("allows activation when user has credit balance but no payment method", async () => {
    const api = await import("@/lib/api");
    vi.mocked(api.getBillingInfo).mockResolvedValueOnce({
      email: "billing@acme.com",
      paymentMethods: [],
      invoices: [],
    });
    vi.mocked(api.getCreditBalance).mockResolvedValueOnce({
      balance: 5.0,
      dailyBurn: 0.33,
      runway: 15,
    });

    const user = userEvent.setup();
    const { default: ProvidersPage } = await import("../app/(dashboard)/settings/providers/page");
    render(<ProvidersPage />);

    await screen.findByText("Transcription");

    const textGenCard = screen.getByTestId("capability-text-gen");
    const hostedRadio = within(textGenCard).getByRole("radio", { name: /platform hosted/i });
    await user.click(hostedRadio);

    // Has credit balance, so Enable Hosted should be available
    expect(await screen.findByRole("button", { name: "Enable Hosted" })).toBeInTheDocument();
  });
});

describe("API Keys page", () => {
  it("renders API keys heading and generate button", async () => {
    const { default: ApiKeysPage } = await import("../app/(dashboard)/settings/api-keys/page");
    render(<ApiKeysPage />);

    // Initially shows skeleton loading state (table with skeleton rows)
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(await screen.findByText("API Keys")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate new key" })).toBeInTheDocument();
  });

  it("renders existing API keys in table", async () => {
    const { default: ApiKeysPage } = await import("../app/(dashboard)/settings/api-keys/page");
    render(<ApiKeysPage />);

    expect(await screen.findByText("CI Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Monitoring Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Mobile App")).toBeInTheDocument();
  });

  it("renders revoke buttons for each key", async () => {
    const { default: ApiKeysPage } = await import("../app/(dashboard)/settings/api-keys/page");
    render(<ApiKeysPage />);

    const revokeButtons = await screen.findAllByRole("button", { name: "Revoke" });
    expect(revokeButtons).toHaveLength(3);
  });

  it("renders scope badges", async () => {
    const { default: ApiKeysPage } = await import("../app/(dashboard)/settings/api-keys/page");
    render(<ApiKeysPage />);

    expect(await screen.findByText("full")).toBeInTheDocument();
    expect(screen.getByText("read-only")).toBeInTheDocument();
    expect(screen.getByText("instances")).toBeInTheDocument();
  });

  it("re-fetches keys from server on revoke failure instead of restoring stale snapshot", async () => {
    const api = await import("@/lib/api");
    const user = userEvent.setup();

    const key1: PlatformApiKey = {
      id: "k1",
      name: "Key One",
      prefix: "platform_k1",
      scope: "full",
      createdAt: "2026-01-01T00:00:00Z",
      lastUsedAt: null,
      expiresAt: null,
    };
    const key2: PlatformApiKey = {
      id: "k2",
      name: "Key Two",
      prefix: "platform_k2",
      scope: "full",
      createdAt: "2026-01-01T00:00:00Z",
      lastUsedAt: null,
      expiresAt: null,
    };

    // First load returns both keys; after failed revoke, server returns only key2
    vi.mocked(api.listApiKeys).mockResolvedValueOnce([key1, key2]).mockResolvedValueOnce([key2]);

    // Revoke fails
    vi.mocked(api.revokeApiKey).mockRejectedValueOnce(new Error("Server error"));

    const { default: ApiKeysPage } = await import("../app/(dashboard)/settings/api-keys/page");
    render(<ApiKeysPage />);

    // Wait for initial render with both keys
    await waitFor(() => {
      expect(screen.getByText("Key One")).toBeInTheDocument();
      expect(screen.getByText("Key Two")).toBeInTheDocument();
    });

    // Click revoke for Key Two (second button)
    const revokeButtons = screen.getAllByText("Revoke");
    await user.click(revokeButtons[1]);
    const confirmButton = screen.getByRole("button", { name: "Revoke key" });
    await user.click(confirmButton);

    // After failure, load() re-fetches — server returns only key2
    // Old behavior: would restore [key1, key2] (stale snapshot)
    // New behavior: calls load() which returns [key2]
    await waitFor(() => {
      expect(screen.queryByText("Key One")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Key Two")).toBeInTheDocument();
  });
});

describe("Organization page", () => {
  it("renders organization heading and form", async () => {
    const { default: OrgPage } = await import("../app/(dashboard)/settings/org/page");
    render(<OrgPage />);

    // Initially shows skeleton loading state
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(await screen.findByText("Organization")).toBeInTheDocument();
    expect(screen.getByLabelText("Organization name")).toBeInTheDocument();
    expect(screen.getByLabelText("Billing email")).toBeInTheDocument();
  });

  it("renders members table", async () => {
    const { default: OrgPage } = await import("../app/(dashboard)/settings/org/page");
    render(<OrgPage />);

    expect(await screen.findByText("Alice Johnson")).toBeInTheDocument();
    expect(screen.getByText("Bob Smith")).toBeInTheDocument();
    expect(screen.getByText("Carol Davis")).toBeInTheDocument();
  });

  it("renders member roles", async () => {
    const { default: OrgPage } = await import("../app/(dashboard)/settings/org/page");
    render(<OrgPage />);

    expect(await screen.findByText("owner")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByText("member")).toBeInTheDocument();
  });

  it("renders invite member button", async () => {
    const { default: OrgPage } = await import("../app/(dashboard)/settings/org/page");
    render(<OrgPage />);

    expect(await screen.findByRole("button", { name: "Invite member" })).toBeInTheDocument();
  });

  it("renders remove buttons for non-owner members", async () => {
    const { default: OrgPage } = await import("../app/(dashboard)/settings/org/page");
    render(<OrgPage />);

    const removeButtons = await screen.findAllByRole("button", { name: "Remove" });
    expect(removeButtons).toHaveLength(2); // Bob and Carol, not Alice (owner)
  });

  it("renders transfer buttons for non-owner members", async () => {
    const { default: OrgPage } = await import("../app/(dashboard)/settings/org/page");
    render(<OrgPage />);

    const transferButtons = await screen.findAllByRole("button", { name: "Transfer" });
    expect(transferButtons).toHaveLength(2);
  });

  it("renders save button for org details", async () => {
    const { default: OrgPage } = await import("../app/(dashboard)/settings/org/page");
    render(<OrgPage />);

    expect(await screen.findByRole("button", { name: "Save changes" })).toBeInTheDocument();
  });
});

describe("Account page", () => {
  it("renders account heading", async () => {
    const { default: AccountPage } = await import("../app/(dashboard)/settings/account/page");
    render(<AccountPage />);

    // Initially shows skeleton loading state
    expect(document.querySelector('[data-slot="skeleton"]')).toBeInTheDocument();
    expect(await screen.findByText("Account")).toBeInTheDocument();
    expect(screen.getByText("Manage your billing settings and team")).toBeInTheDocument();
  });

  it("renders current plan tier", async () => {
    const { default: AccountPage } = await import("../app/(dashboard)/settings/account/page");
    render(<AccountPage />);

    expect(await screen.findByText("Current Plan")).toBeInTheDocument();
    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("2 of 5 instances used")).toBeInTheDocument();
  });

  it("renders manage billing button", async () => {
    const { default: AccountPage } = await import("../app/(dashboard)/settings/account/page");
    render(<AccountPage />);

    expect(await screen.findByRole("button", { name: "Manage Billing" })).toBeInTheDocument();
  });

  it("does not render password change form (consolidated to profile)", async () => {
    const { default: AccountPage } = await import("../app/(dashboard)/settings/account/page");
    render(<AccountPage />);

    await screen.findByText("Account");
    expect(screen.queryByText("Change Password")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Current password")).not.toBeInTheDocument();
  });
});

describe("Settings layout", () => {
  it("renders settings navigation links", async () => {
    const { default: SettingsLayout } = await import("../app/(dashboard)/settings/layout");
    render(
      <SettingsLayout>
        <div>child content</div>
      </SettingsLayout>,
    );

    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("Provider Keys")).toBeInTheDocument();
    expect(screen.getByText("API Keys")).toBeInTheDocument();
    expect(screen.getByText("Organization")).toBeInTheDocument();
    expect(screen.getByText("child content")).toBeInTheDocument();
  });
});

describe("Settings layout - org nav visibility", () => {
  it("hides Organization nav when user has no org", async () => {
    const { useHasOrg } = await import("@/hooks/use-has-org");
    vi.mocked(useHasOrg).mockReturnValue({ hasOrg: false, loading: false });

    const { default: SettingsLayout } = await import("../app/(dashboard)/settings/layout");
    render(
      <SettingsLayout>
        <div>child</div>
      </SettingsLayout>,
    );

    expect(screen.getByText("Profile")).toBeInTheDocument();
    expect(screen.queryByText("Organization")).not.toBeInTheDocument();
  });

  it("shows Organization nav when user has an org", async () => {
    const { useHasOrg } = await import("@/hooks/use-has-org");
    vi.mocked(useHasOrg).mockReturnValue({ hasOrg: true, loading: false });

    const { default: SettingsLayout } = await import("../app/(dashboard)/settings/layout");
    render(
      <SettingsLayout>
        <div>child</div>
      </SettingsLayout>,
    );

    expect(screen.getByText("Organization")).toBeInTheDocument();
  });
});

describe("Organization page - no org redirect", () => {
  it("redirects to /settings/profile when user has no org", async () => {
    const orgApi = await import("@/lib/org-api");
    vi.mocked(orgApi.getOrganization).mockRejectedValueOnce(new Error("Not found"));

    // Capture the push mock from the existing useRouter mock
    const nav = await import("next/navigation");
    const mockPush = vi.fn();
    const originalUseRouter = nav.useRouter;
    vi.spyOn(nav, "useRouter").mockReturnValue({
      ...originalUseRouter(),
      push: mockPush,
    } as ReturnType<typeof nav.useRouter>);

    const { default: OrgPage } = await import("../app/(dashboard)/settings/org/page");
    render(<OrgPage />);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/settings/profile");
    });

    vi.spyOn(nav, "useRouter").mockRestore();
  });
});

describe("Account page — Teams & Organizations section", () => {
  it("renders Teams & Organizations heading", async () => {
    const { default: AccountPage } = await import("../app/(dashboard)/settings/account/page");
    render(<AccountPage />);
    expect(await screen.findByText("Teams & Organizations")).toBeInTheDocument();
  });

  it("renders Create organization button", async () => {
    const { default: AccountPage } = await import("../app/(dashboard)/settings/account/page");
    render(<AccountPage />);
    expect(await screen.findByRole("button", { name: /create organization/i })).toBeInTheDocument();
  });
});

describe("CreateOrgWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens dialog and shows name input on click", async () => {
    const { default: CreateOrgWizard } = await import("../components/settings/create-org-wizard");
    const user = userEvent.setup();
    render(<CreateOrgWizard />);
    await user.click(screen.getByRole("button", { name: /create organization/i }));
    expect(screen.getByLabelText(/organization name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/slug/i)).toBeInTheDocument();
  });

  it("auto-generates slug from name", async () => {
    const { default: CreateOrgWizard } = await import("../components/settings/create-org-wizard");
    const user = userEvent.setup();
    render(<CreateOrgWizard />);
    await user.click(screen.getByRole("button", { name: /create organization/i }));
    await user.type(screen.getByLabelText(/organization name/i), "My Cool Team");
    expect(screen.getByLabelText(/slug/i)).toHaveValue("my-cool-team");
  });

  it("proceeds to confirm step and shows summary", async () => {
    const { default: CreateOrgWizard } = await import("../components/settings/create-org-wizard");
    const user = userEvent.setup();
    render(<CreateOrgWizard />);
    await user.click(screen.getByRole("button", { name: /create organization/i }));
    await user.type(screen.getByLabelText(/organization name/i), "Acme Corp");
    await user.click(screen.getByRole("button", { name: /next/i }));
    expect(await screen.findByText(/you.?ll be the admin/i)).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("calls createOrganization on confirm and shows success", async () => {
    const { createOrganization } = await import("@/lib/org-api");
    vi.mocked(createOrganization).mockResolvedValueOnce({
      id: "org-1",
      name: "Acme Corp",
      slug: "acme-corp",
    });
    const { default: CreateOrgWizard } = await import("../components/settings/create-org-wizard");
    const user = userEvent.setup();
    render(<CreateOrgWizard />);
    await user.click(screen.getByRole("button", { name: /create organization/i }));
    await user.type(screen.getByLabelText(/organization name/i), "Acme Corp");
    await user.click(screen.getByRole("button", { name: /next/i }));
    const createBtn = await screen.findByRole("button", { name: /^create$/i });
    await user.click(createBtn);
    expect(await screen.findByText(/organization created/i)).toBeInTheDocument();
    expect(createOrganization).toHaveBeenCalledWith({ name: "Acme Corp", slug: "acme-corp" });
  });

  it("shows inline error on API failure", async () => {
    const { createOrganization } = await import("@/lib/org-api");
    vi.mocked(createOrganization).mockRejectedValueOnce(new Error("API error: 409 Conflict"));
    const { default: CreateOrgWizard } = await import("../components/settings/create-org-wizard");
    const user = userEvent.setup();
    render(<CreateOrgWizard />);
    await user.click(screen.getByRole("button", { name: /create organization/i }));
    await user.type(screen.getByLabelText(/organization name/i), "Acme Corp");
    await user.click(screen.getByRole("button", { name: /next/i }));
    const createBtn = await screen.findByRole("button", { name: /^create$/i });
    await user.click(createBtn);
    expect(await screen.findByText(/already taken/i)).toBeInTheDocument();
  });
});

describe("Notifications page - no team language", () => {
  it("does not show 'Team invitations' label in notification preferences", async () => {
    const settingsApi = await import("@/lib/settings-api");
    vi.mocked(settingsApi.getNotificationPreferences).mockResolvedValueOnce({
      billing_low_balance: true,
      billing_receipts: true,
      billing_auto_topup: true,
      agent_channel_disconnect: true,
      agent_status_changes: true,
      account_role_changes: true,
      account_team_invites: true,
      fleet_updates: true,
    });

    const { default: NotificationsPage } = await import(
      "../app/(dashboard)/settings/notifications/page"
    );
    render(<NotificationsPage />);

    await screen.findByText("Notifications");

    expect(screen.queryByText("Team invitations")).not.toBeInTheDocument();
    expect(screen.getByText("Invitations")).toBeInTheDocument();
  });
});

describe("Avatar upload", () => {
  it("renders avatar upload area on profile page", async () => {
    const { default: ProfilePage } = await import("../app/(dashboard)/settings/profile/page");
    render(<ProfilePage />);

    expect(await screen.findByText("Profile")).toBeInTheDocument();
    expect(screen.getByLabelText("Change avatar")).toBeInTheDocument();
  });

  it("shows initials when no avatar URL", async () => {
    const { default: ProfilePage } = await import("../app/(dashboard)/settings/profile/page");
    render(<ProfilePage />);

    await screen.findByText("Profile");
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("calls uploadAvatar and updates profile on file select", async () => {
    const api = await import("@/lib/api");
    const updatedProfile = { ...MOCK_PROFILE, avatarUrl: "https://cdn.example.com/avatar.png" };
    vi.mocked(api.uploadAvatar).mockResolvedValueOnce(updatedProfile);

    const user = userEvent.setup();
    const { default: ProfilePage } = await import("../app/(dashboard)/settings/profile/page");
    render(<ProfilePage />);

    await screen.findByText("Profile");

    const file = new File(["fake-image"], "avatar.png", { type: "image/png" });
    const input = screen.getByLabelText("Change avatar") as HTMLInputElement;
    await user.upload(input, file);

    await waitFor(() => {
      expect(api.uploadAvatar).toHaveBeenCalledWith(file);
    });
  });

  it("shows error when file exceeds 2MB", async () => {
    const user = userEvent.setup();
    const { default: ProfilePage } = await import("../app/(dashboard)/settings/profile/page");
    render(<ProfilePage />);

    await screen.findByText("Profile");

    const largeFile = new File([new ArrayBuffer(3 * 1024 * 1024)], "big.png", {
      type: "image/png",
    });
    const input = screen.getByLabelText("Change avatar") as HTMLInputElement;
    await user.upload(input, largeFile);

    expect(await screen.findByText(/file size must be under 2MB/i)).toBeInTheDocument();
  });
});
