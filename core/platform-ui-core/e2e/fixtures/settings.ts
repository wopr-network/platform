import type { Page } from "@playwright/test";

// NEXT_PUBLIC_API_URL (app config) > BASE_URL (Playwright webServer) > localhost fallback
const PLATFORM_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? process.env.BASE_URL ?? "http://localhost:3001";
const API_BASE_URL = `${PLATFORM_BASE_URL}/api`;

// --- Mock data ---

export interface SettingsMockState {
  profile: {
    id: string;
    name: string;
    email: string;
    avatarUrl: string | null;
    oauthConnections: Array<{ provider: string; connected: boolean }>;
  };
  apiKeys: Array<{
    id: string;
    name: string;
    prefix: string;
    scope: string;
    createdAt: string;
    lastUsedAt: string | null;
    expiresAt: string | null;
  }>;
  providerKeys: Array<{
    id: string;
    provider: string;
    maskedKey: string | null;
    status: "valid" | "invalid" | "unchecked";
    lastChecked: string | null;
    defaultModel: string | null;
    models: string[];
  }>;
  notificationPrefs: Record<string, boolean>;
  org: {
    id: string;
    name: string;
    slug: string;
    billingEmail: string;
    members: Array<{
      id: string;
      userId: string;
      name: string;
      email: string;
      role: "owner" | "admin" | "member";
      joinedAt: string;
    }>;
    invites: Array<{
      id: string;
      email: string;
      role: "admin" | "member";
      invitedBy: string;
      expiresAt: string;
      createdAt: string;
    }>;
  };
  auditEvents: Array<{
    id: string;
    action: string;
    resourceType: string;
    resourceId: string;
    resourceName: string | null;
    details: string | null;
    createdAt: string;
  }>;
  modelSelection: {
    modelId: string;
    providerId: string;
    mode: "hosted" | "byok";
  };
  _apiKeyCounter: number;
  _inviteCounter: number;
}

export function createSettingsMockState(): SettingsMockState {
  return {
    profile: {
      id: "e2e-user-id",
      name: "E2E Test User",
      email: "e2e@wopr.test",
      avatarUrl: null,
      oauthConnections: [
        { provider: "github", connected: false },
        { provider: "discord", connected: false },
        { provider: "google", connected: false },
      ],
    },
    apiKeys: [],
    providerKeys: [
      {
        id: "prov-openai",
        provider: "OpenAI",
        maskedKey: null,
        status: "unchecked",
        lastChecked: null,
        defaultModel: null,
        models: ["gpt-4o", "gpt-4o-mini", "gpt-3.5-turbo"],
      },
      {
        id: "prov-anthropic",
        provider: "Anthropic",
        maskedKey: null,
        status: "unchecked",
        lastChecked: null,
        defaultModel: null,
        models: ["claude-sonnet-4-20250514", "claude-haiku-4-20250414"],
      },
    ],
    notificationPrefs: {
      billing_low_balance: true,
      billing_receipts: true,
      billing_auto_topup: false,
      agent_channel_disconnect: true,
      agent_status_changes: true,
      account_role_changes: true,
      account_team_invites: true,
    },
    org: {
      id: "e2e-org-id",
      name: "E2E Test Org",
      slug: "e2e-test-org",
      billingEmail: "billing@wopr.test",
      members: [
        {
          id: "member-1",
          userId: "e2e-user-id",
          name: "E2E Test User",
          email: "e2e@wopr.test",
          role: "owner",
          joinedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
        },
        {
          id: "member-2",
          userId: "user-2",
          name: "Team Member",
          email: "member@wopr.test",
          role: "member",
          joinedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
        },
      ],
      invites: [],
    },
    auditEvents: [
      {
        id: "evt-1",
        action: "profile.update",
        resourceType: "user",
        resourceId: "e2e-user-id",
        resourceName: "E2E Test User",
        details: "Updated display name",
        createdAt: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: "evt-2",
        action: "api_key.create",
        resourceType: "api_key",
        resourceId: "key-1",
        resourceName: "CI Pipeline",
        details: "Created API key",
        createdAt: new Date(Date.now() - 7200000).toISOString(),
      },
      {
        id: "evt-3",
        action: "security.password_change",
        resourceType: "user",
        resourceId: "e2e-user-id",
        resourceName: "E2E Test User",
        details: "Changed password",
        createdAt: new Date(Date.now() - 10800000).toISOString(),
      },
    ],
    modelSelection: {
      modelId: "anthropic/claude-sonnet-4-20250514",
      providerId: "anthropic",
      mode: "hosted",
    },
    _apiKeyCounter: 0,
    _inviteCounter: 0,
  };
}

export async function mockSettingsAPI(
  page: Page,
  state: SettingsMockState,
  overrides?: { twoFactorEnabled?: boolean },
) {
  // --- REST endpoints ---

  // Profile: avatar upload
  await page.route(`${API_BASE_URL}/settings/profile/avatar`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fulfill({ status: 405, body: "Method not allowed" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(state.profile),
    });
  });

  // Profile: password change
  await page.route(`${API_BASE_URL}/settings/profile/password`, async (route) => {
    if (route.request().method() !== "POST") {
      await route.fulfill({ status: 405, body: "Method not allowed" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  // Profile: GET, PATCH, DELETE
  await page.route(`${API_BASE_URL}/settings/profile`, async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.profile),
      });
    } else if (method === "PATCH") {
      const body = route.request().postDataJSON();
      if (body?.name) state.profile.name = body.name;
      if (body?.email) state.profile.email = body.email;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.profile),
      });
    } else if (method === "DELETE") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    } else {
      await route.fulfill({ status: 405, body: "Method not allowed" });
    }
  });

  // better-auth: get-session (ensures TwoFactorSection resolves loading state)
  await page.route(`${PLATFORM_BASE_URL}/api/auth/get-session`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        user: {
          id: "e2e-user-id",
          name: "E2E Test User",
          email: "e2e@wopr.test",
          emailVerified: true,
          twoFactorEnabled: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        session: {
          id: "e2e-session-id",
          userId: "e2e-user-id",
          token: "e2e-token",
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      }),
    });
  });

  // better-auth: list-accounts
  await page.route(`${PLATFORM_BASE_URL}/api/auth/list-accounts`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: state.profile.oauthConnections
          .filter((c) => c.connected)
          .map((c) => ({ providerId: c.provider })),
      }),
    });
  });

  // better-auth: list-sessions
  // The server returns the sessions array directly (not wrapped in { data: [...] }).
  // The better-auth client wraps it as res.data = responseBody, so res.data is the array.
  await page.route(`${PLATFORM_BASE_URL}/api/auth/list-sessions`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "sess-1",
          token: "e2e-token-current",
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
          userAgent: "Mozilla/5.0 (Macintosh) Chrome/120.0",
          ipAddress: "127.0.0.1",
          current: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
    });
  });

  // better-auth: revoke-session
  await page.route(`${PLATFORM_BASE_URL}/api/auth/revoke-session`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  // better-auth: revoke-other-sessions
  await page.route(`${PLATFORM_BASE_URL}/api/auth/revoke-other-sessions`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  // better-auth: two-factor status (via get-session, already mocked by auth fixture)
  // 2FA enable/disable/verify endpoints
  await page.route(`${PLATFORM_BASE_URL}/api/auth/two-factor/*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: null }),
    });
  });

  // API Keys: DELETE specific key
  await page.route(`${API_BASE_URL}/settings/api-keys/*`, async (route) => {
    const method = route.request().method();
    if (method === "DELETE") {
      const url = route.request().url();
      const id = url.split("/settings/api-keys/")[1]?.split("?")[0];
      if (id) {
        state.apiKeys = state.apiKeys.filter((k) => k.id !== id);
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    } else {
      await route.fulfill({ status: 405, body: "Method not allowed" });
    }
  });

  // API Keys: GET list, POST create
  await page.route(`${API_BASE_URL}/settings/api-keys`, async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.apiKeys),
      });
    } else if (method === "POST") {
      const body = route.request().postDataJSON();
      const newKey = {
        id: `key-${++state._apiKeyCounter}`,
        name: body?.name ?? "Untitled",
        prefix: "platform_",
        scope: body?.scope ?? "full",
        createdAt: new Date().toISOString(),
        lastUsedAt: null,
        expiresAt:
          body?.expiration === "never"
            ? null
            : new Date(Date.now() + Number(body?.expiration ?? 90) * 86400000).toISOString(),
      };
      state.apiKeys.push(newKey);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          key: newKey,
          secret: `platform_test_${newKey.id}_secretkey123456789`,
        }),
      });
    } else {
      await route.fulfill({ status: 405, body: "Method not allowed" });
    }
  });

  // Provider keys: test
  await page.route(`${API_BASE_URL}/settings/providers/*/test`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ valid: true }),
    });
  });

  // Provider keys: model change
  await page.route(`${API_BASE_URL}/settings/providers/*/model`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });

  // Provider keys: DELETE specific
  await page.route(`${API_BASE_URL}/settings/providers/*`, async (route) => {
    const method = route.request().method();
    if (method === "DELETE") {
      const url = route.request().url();
      const id = url.split("/settings/providers/")[1]?.split("/")[0]?.split("?")[0];
      if (id) {
        state.providerKeys = state.providerKeys.filter((p) => p.id !== id);
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    } else {
      await route.fulfill({ status: 405, body: "Method not allowed" });
    }
  });

  // Provider keys: GET list, POST create
  await page.route(`${API_BASE_URL}/settings/providers`, async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.providerKeys),
      });
    } else if (method === "POST") {
      const body = route.request().postDataJSON();
      const existing = state.providerKeys.find(
        (p) => p.provider.toLowerCase() === (body?.provider ?? "").toLowerCase(),
      );
      if (existing) {
        existing.maskedKey = "sk-...xxxx";
        existing.status = "valid";
        existing.lastChecked = new Date().toISOString();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(existing),
        });
      } else {
        const newProv = {
          id: `prov-${body?.provider ?? "unknown"}`,
          provider: body?.provider ?? "Unknown",
          maskedKey: "sk-...xxxx",
          status: "valid" as const,
          lastChecked: new Date().toISOString(),
          defaultModel: null,
          models: [],
        };
        state.providerKeys.push(newProv);
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(newProv),
        });
      }
    } else {
      await route.fulfill({ status: 405, body: "Method not allowed" });
    }
  });

  // Model selection: GET, PUT
  await page.route(`${API_BASE_URL}/settings/model`, async (route) => {
    const method = route.request().method();
    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.modelSelection),
      });
    } else if (method === "PUT") {
      const body = route.request().postDataJSON();
      if (body?.modelId) state.modelSelection.modelId = body.modelId;
      if (body?.providerId) state.modelSelection.providerId = body.providerId;
      if (body?.mode) state.modelSelection.mode = body.mode;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(state.modelSelection),
      });
    } else {
      await route.fulfill({ status: 405, body: "Method not allowed" });
    }
  });

  // Login history
  await page.route(`${API_BASE_URL}/settings/login-history*`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        attempts: [
          {
            id: "login-1",
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            ip: "127.0.0.1",
            userAgent: "Mozilla/5.0 Chrome/120.0",
            location: "Local",
            success: true,
          },
        ],
        total: 1,
        hasMore: false,
      }),
    });
  });

  // Audit log
  await page.route(`${API_BASE_URL}/audit*`, async (route) => {
    const url = new URL(route.request().url());
    const search = url.searchParams.get("search")?.toLowerCase().trim() ?? "";
    const filtered = search
      ? state.auditEvents.filter(
          (evt) =>
            evt.action.toLowerCase().includes(search) ||
            (evt.resourceName ?? "").toLowerCase().includes(search) ||
            (evt.details ?? "").toLowerCase().includes(search),
        )
      : state.auditEvents;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        events: filtered,
        total: filtered.length,
        hasMore: false,
      }),
    });
  });

  // Fleet: bots list (needed by API keys create dialog)
  await page.route(`${PLATFORM_BASE_URL}/fleet/bots`, async (route) => {
    if (route.request().method() !== "GET") {
      await route.fulfill({ status: 405, body: "Method not allowed" });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ bots: [] }),
    });
  });

  // Tenant key store endpoints
  await page.route(`${API_BASE_URL}/tenant-keys/*`, async (route) => {
    const method = route.request().method();
    if (method === "PUT" || method === "POST") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    } else if (method === "DELETE") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      });
    } else if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          provider: "openai",
          hasKey: false,
          maskedKey: null,
          createdAt: null,
          updatedAt: null,
        }),
      });
    } else {
      await route.fulfill({ status: 405, body: "Method not allowed" });
    }
  });

  // Billing: setup-intent (needed by providers BillingGateDialog)
  await page.route(`${API_BASE_URL}/billing/setup-intent`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ clientSecret: "seti_test_secret" }),
    });
  });

  // Billing: dividend stats
  await page.route(`${PLATFORM_BASE_URL}/api/billing/dividend/stats`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        poolCents: 0,
        activeUsers: 0,
        perUserCents: 0,
        userEligible: false,
        userWindowExpiresAt: null,
      }),
    });
  });

  // --- tRPC batch handler ---
  // Handles settings-specific tRPC procedures.
  // Registered AFTER auth fixture's tRPC handler (LIFO = higher priority).

  const SETTINGS_TRPC_MOCKS: Record<string, unknown> = {
    // Billing (for Account page)
    "billing.currentPlan": { tier: "free" },
    "billing.portalSession": {
      url: "https://billing.stripe.com/test",
    },
    "billing.billingInfo": {
      paymentMethods: [],
      defaultPaymentMethodId: null,
      billingEmail: "e2e@wopr.test",
    },
    "billing.creditsBalance": {
      balance_cents: 5000,
      daily_burn_cents: 0,
      runway_days: 999,
    },

    // Notifications
    "settings.notificationPreferences": state.notificationPrefs,
    "settings.updateNotificationPreferences": state.notificationPrefs,

    // Capabilities (for Providers page)
    "capabilities.listCapabilitySettings": [
      {
        capability: "text-gen",
        mode: "hosted",
        provider: null,
        maskedKey: null,
        keyStatus: null,
      },
      {
        capability: "transcription",
        mode: "hosted",
        provider: null,
        maskedKey: null,
        keyStatus: null,
      },
    ],
    "capabilities.listCapabilityMeta": [
      {
        capability: "text-gen",
        label: "Text Generation",
        description: "AI text generation for chat and completions",
        pricing: "$0.002/msg",
      },
      {
        capability: "transcription",
        label: "Transcription",
        description: "Speech-to-text transcription",
        pricing: "$0.006/min",
      },
    ],
    "capabilities.updateCapabilitySettings": {
      capability: "text-gen",
      mode: "byok",
      provider: "openai",
      maskedKey: "sk-...xxxx",
      keyStatus: "valid",
    },
    "capabilities.storeKey": {
      ok: true,
      id: "key-1",
      provider: "openai",
    },
    "capabilities.testKey": { valid: true },

    // Org
    "org.getOrganization": state.org,
    "org.listMyOrganizations": [state.org],
    "org.updateOrganization": state.org,
    "org.inviteMember": null,
    "org.revokeInvite": null,
    "org.changeRole": null,
    "org.removeMember": null,
    "org.transferOwnership": null,

    // Fleet (for listInstances used by API keys scope=instances)
    "fleet.listInstances": { bots: [] },

    // Account status (for DegradedStateBanner in dashboard layout)
    "billing.accountStatus": { status: "active", status_reason: null, grace_deadline: null },

    // Usage summary (for SuspensionBanner in dashboard layout)
    "billing.usageSummary": {
      period_start: "",
      period_end: "",
      total_spend_cents: 0,
      included_credit_cents: 0,
      amount_due_cents: 0,
      plan_name: "Free",
    },

    // Profile (for TwoFactorSection — replaces useSession)
    "profile.getProfile": {
      id: state.profile.id,
      name: state.profile.name,
      email: state.profile.email,
      image: null,
      twoFactorEnabled: overrides?.twoFactorEnabled ?? false,
    },

    // Page context
    "pageContext.update": null,
  };

  await page.route(
    (url) =>
      url.href.includes(PLATFORM_BASE_URL) &&
      url.pathname.startsWith("/trpc/") &&
      Object.keys(SETTINGS_TRPC_MOCKS).some((proc) => {
        const trpcPath = url.pathname.split("/trpc/")[1] ?? "";
        return trpcPath.split(",").some((p) => p === proc);
      }),
    async (route) => {
      const method = route.request().method();
      const urlStr = route.request().url();
      const procs = urlStr.split("?")[0].split("/trpc/")[1]?.split(",") ?? [];

      // Handle mutations (POST)
      if (method === "POST") {
        const body = route.request().postDataJSON();
        const isBatchedPost = urlStr.includes("batch=1") || procs.length > 1;

        // Extract input for a given procedure index
        // Non-batched: body = { json: { ... } }
        // Batched (tRPC v11): body = { "0": { json: { ... } }, "1": { json: { ... } } }
        // Batched (legacy): body = [{ json: { ... } }]
        const getInput = (idx: number) => {
          if (!isBatchedPost) return body?.json ?? body;
          if (Array.isArray(body)) return body[idx]?.json ?? body[idx];
          return body?.[String(idx)]?.json ?? body?.[String(idx)];
        };

        for (let i = 0; i < procs.length; i++) {
          const proc = procs[i];
          if (proc === "settings.updateNotificationPreferences") {
            const input = getInput(i);
            if (input) {
              Object.assign(state.notificationPrefs, input);
              SETTINGS_TRPC_MOCKS["settings.notificationPreferences"] = state.notificationPrefs;
              SETTINGS_TRPC_MOCKS["settings.updateNotificationPreferences"] =
                state.notificationPrefs;
            }
          }
          if (proc === "org.updateOrganization") {
            const input = getInput(i);
            if (input?.name) state.org.name = input.name;
            if (input?.slug) state.org.slug = input.slug;
            if (input?.billingEmail) state.org.billingEmail = input.billingEmail;
            SETTINGS_TRPC_MOCKS["org.updateOrganization"] = state.org;
            SETTINGS_TRPC_MOCKS["org.getOrganization"] = state.org;
          }
          if (proc === "org.revokeInvite") {
            const input = getInput(i);
            if (input?.inviteId) {
              state.org.invites = state.org.invites.filter((inv) => inv.id !== input.inviteId);
            }
          }
          if (proc === "org.removeMember") {
            const input = getInput(i);
            if (input?.memberId) {
              state.org.members = state.org.members.filter((m) => m.id !== input.memberId);
            }
          }
          if (proc === "org.changeRole") {
            const input = getInput(i);
            if (input?.memberId && input?.role) {
              const member = state.org.members.find((m) => m.id === input.memberId);
              if (member) member.role = input.role;
            }
          }
          if (proc === "org.transferOwnership") {
            const input = getInput(i);
            if (input?.memberId) {
              for (const m of state.org.members) {
                if (m.id === input.memberId) m.role = "owner";
                else if (m.role === "owner") m.role = "admin";
              }
            }
          }
          if (proc === "org.inviteMember") {
            const input = getInput(i);
            const invite = {
              id: `invite-${++state._inviteCounter}`,
              orgId: state.org.id,
              email: input?.email ?? "new@wopr.test",
              role: input?.role ?? "member",
              invitedBy: "e2e-user-id",
              token: `tok-${state._inviteCounter}`,
              expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
              createdAt: new Date().toISOString(),
            };
            state.org.invites.push({
              id: invite.id,
              email: invite.email,
              role: invite.role as "admin" | "member",
              invitedBy: invite.invitedBy,
              expiresAt: invite.expiresAt,
              createdAt: invite.createdAt,
            });
            SETTINGS_TRPC_MOCKS["org.inviteMember"] = invite;
          }
        }
      }

      const results = procs.map((proc) => ({
        result: {
          data: proc in SETTINGS_TRPC_MOCKS ? SETTINGS_TRPC_MOCKS[proc] : null,
        },
      }));

      // tRPC batch detection: batch=1 query param or multiple procedures
      const isBatched = urlStr.includes("batch=1") || procs.length > 1;
      const payload = isBatched ? results : results[0];
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    },
  );
}
