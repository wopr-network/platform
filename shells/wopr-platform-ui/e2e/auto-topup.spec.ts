import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/auth";

const PLATFORM_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Default auto-topup settings — usage-based and scheduled both off, payment method present. */
function defaultSettings() {
  return {
    usageBased: { enabled: false, thresholdCents: 500, topupAmountCents: 1000 },
    scheduled: {
      enabled: false,
      amountCents: 1000,
      interval: "monthly" as const,
      nextChargeDate: null,
    },
    paymentMethodLast4: "4242",
    paymentMethodBrand: "visa",
  };
}

/** All tRPC procedure mocks needed for the credits page to render in personal billing mode. */
function baseTrpcMocks(autoTopupOverride?: Record<string, unknown>): Record<string, unknown> {
  return {
    "billing.creditOptions": [],
    "billing.creditsBalance": { balance_cents: 5000, daily_burn_cents: 100, runway_days: 50 },
    "billing.inferenceMode": { mode: "hosted" },
    "billing.creditsHistory": { entries: [] },
    "billing.autoTopupSettings": autoTopupOverride ?? defaultSettings(),
    "billing.accountStatus": { status: "active", status_reason: null, grace_deadline: null },
    "billing.usageSummary": {
      period_start: "",
      period_end: "",
      total_spend_cents: 0,
      included_credit_cents: 0,
      amount_due_cents: 0,
      plan_name: "free",
    },
    "org.listMyOrganizations": [
      {
        id: "e2e-org-id",
        name: "E2E Test Org",
        slug: "e2e-test-org",
        billingEmail: "e2e@wopr.test",
        members: [{ userId: "e2e-user-id", role: "admin", email: "e2e@wopr.test" }],
        invites: [],
      },
    ],
    "pageContext.update": null,
  };
}

/**
 * Set up all billing mocks. Returns a mutable `state` object — mutate
 * `state.autoTopup` to change what the query returns on next page load.
 * Also captures mutation payloads in `state.mutations`.
 */
async function mockAutoTopupAPI(
  page: Page,
  initialSettings?: Record<string, unknown>,
): Promise<{ autoTopup: Record<string, unknown>; mutations: unknown[] }> {
  const state: { autoTopup: Record<string, unknown>; mutations: unknown[] } = {
    autoTopup: (initialSettings ?? defaultSettings()) as Record<string, unknown>,
    mutations: [],
  };

  // Batch-aware tRPC query handler (excludes mutation path)
  await page.route(
    (url) =>
      url.href.includes(PLATFORM_BASE_URL) &&
      url.pathname.startsWith("/trpc/") &&
      !url.pathname.includes("updateAutoTopupSettings"),
    async (route) => {
      const mocks = baseTrpcMocks(state.autoTopup);
      const procs = route.request().url().split("?")[0].split("/trpc/")[1]?.split(",") ?? [];
      const results = procs.map((proc) => ({
        result: { data: proc in mocks ? mocks[proc] : null },
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(results),
      });
    },
  );

  // Mutation handler for updateAutoTopupSettings
  await page.route(
    (url) =>
      url.href.includes(PLATFORM_BASE_URL) && url.pathname.includes("updateAutoTopupSettings"),
    async (route) => {
      const body = route.request().postDataJSON() as Record<string, Record<string, unknown>>;
      state.mutations.push(body);

      // Apply mutation to state so subsequent query reads reflect it
      const update = body?.["0"];
      if (update?.usageBased) {
        state.autoTopup = {
          ...state.autoTopup,
          usageBased: update.usageBased,
        };
      }
      if (update?.scheduled) {
        state.autoTopup = {
          ...state.autoTopup,
          scheduled: {
            ...(update.scheduled as Record<string, unknown>),
            nextChargeDate: null,
          },
        };
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ result: { data: state.autoTopup } }]),
      });
    },
  );

  // Dividend stats REST endpoint
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

  return state;
}

test.describe("Auto-topup Settings", () => {
  test("configure auto-topup — enable, set threshold and amount, verify persists after reload", async ({
    authedPage: page,
  }) => {
    const state = await mockAutoTopupAPI(page);

    await page.goto("/billing/credits");

    // Wait for Auto-topup card to render
    await expect(page.getByRole("heading", { name: "Auto-topup" })).toBeVisible({
      timeout: 10000,
    });

    // Initially usage-based is off
    // Use .first() because the responsive layout renders children in both desktop
    // and mobile containers simultaneously; the desktop (visible) one is first in DOM.
    const usageToggle = page.locator("#usage-toggle").first();
    await expect(usageToggle).not.toBeChecked();

    // Enable usage-based auto-topup
    await usageToggle.click();

    // Wait for mutation to fire
    await expect.poll(() => state.mutations.length, { timeout: 5000 }).toBeGreaterThanOrEqual(1);

    // Set threshold to $2 (200 cents)
    await page.getByLabel("Threshold amount").first().click();
    await page.getByRole("option", { name: "$2" }).click();

    await expect.poll(() => state.mutations.length, { timeout: 5000 }).toBeGreaterThanOrEqual(2);

    // Set top-up amount to $20 (2000 cents)
    await page.getByLabel("Top-up amount").first().click();
    await page.getByRole("option", { name: "$20" }).click();

    await expect.poll(() => state.mutations.length, { timeout: 5000 }).toBeGreaterThanOrEqual(3);

    // Reload page — verify settings persisted (mock state updated by mutation handler)
    await page.reload();

    await expect(page.getByRole("heading", { name: "Auto-topup" })).toBeVisible({
      timeout: 10000,
    });

    // Usage toggle should be on
    await expect(page.locator("#usage-toggle").first()).toBeChecked();

    // Threshold should show $2
    await expect(page.getByLabel("Threshold amount").first()).toContainText("$2");

    // Top-up amount should show $20
    await expect(page.getByLabel("Top-up amount").first()).toContainText("$20");
  });

  test("display saved auto-topup settings on page load", async ({ authedPage: page }) => {
    // Start with pre-configured settings
    const preConfigured = {
      usageBased: { enabled: true, thresholdCents: 1000, topupAmountCents: 5000 },
      scheduled: {
        enabled: true,
        amountCents: 2000,
        interval: "weekly" as const,
        nextChargeDate: "2026-04-01T00:00:00Z",
      },
      paymentMethodLast4: "4242",
      paymentMethodBrand: "visa",
    };
    await mockAutoTopupAPI(page, preConfigured as unknown as Record<string, unknown>);

    await page.goto("/billing/credits");

    await expect(page.getByRole("heading", { name: "Auto-topup" })).toBeVisible({
      timeout: 10000,
    });

    // Usage-based should be enabled with correct values
    await expect(page.locator("#usage-toggle").first()).toBeChecked();
    await expect(page.getByLabel("Threshold amount").first()).toContainText("$10");
    await expect(page.getByLabel("Top-up amount").first()).toContainText("$50");

    // Scheduled should be enabled with correct values
    await expect(page.locator("#schedule-toggle").first()).toBeChecked();
    await expect(page.getByLabel("Scheduled amount").first()).toContainText("$20");
    await expect(page.getByLabel("Schedule interval").first()).toContainText("Weekly");

    // Next charge date should be visible
    // Use .first() — responsive layout renders both desktop and mobile containers simultaneously.
    await expect(page.getByText(/Next charge:/).first()).toBeVisible();

    // Payment method footer
    await expect(page.getByText(/visa .... 4242/i).first()).toBeVisible();

    // Dividend tip visible when scheduled is on
    await expect(page.getByText(/Tip:.*dividend pool/).first()).toBeVisible();
  });

  test("toggle auto-topup off — disabled state persists after reload", async ({
    authedPage: page,
  }) => {
    // Start with both enabled
    const enabledSettings = {
      usageBased: { enabled: true, thresholdCents: 500, topupAmountCents: 1000 },
      scheduled: {
        enabled: true,
        amountCents: 1000,
        interval: "monthly" as const,
        nextChargeDate: "2026-04-01T00:00:00Z",
      },
      paymentMethodLast4: "4242",
      paymentMethodBrand: "visa",
    };
    const state = await mockAutoTopupAPI(
      page,
      enabledSettings as unknown as Record<string, unknown>,
    );

    await page.goto("/billing/credits");

    await expect(page.getByRole("heading", { name: "Auto-topup" })).toBeVisible({
      timeout: 10000,
    });

    // Both toggles should be on
    await expect(page.locator("#usage-toggle").first()).toBeChecked();
    await expect(page.locator("#schedule-toggle").first()).toBeChecked();

    // Turn off usage-based
    await page.locator("#usage-toggle").first().click();
    await expect.poll(() => state.mutations.length, { timeout: 5000 }).toBeGreaterThanOrEqual(1);

    // Turn off scheduled
    await page.locator("#schedule-toggle").first().click();
    await expect.poll(() => state.mutations.length, { timeout: 5000 }).toBeGreaterThanOrEqual(2);

    // Reload
    await page.reload();

    await expect(page.getByRole("heading", { name: "Auto-topup" })).toBeVisible({
      timeout: 10000,
    });

    // Both toggles should be off
    await expect(page.locator("#usage-toggle").first()).not.toBeChecked();
    await expect(page.locator("#schedule-toggle").first()).not.toBeChecked();

    // Selects should be disabled when toggles are off
    await expect(page.getByLabel("Threshold amount").first()).toBeDisabled();
    await expect(page.getByLabel("Scheduled amount").first()).toBeDisabled();
  });

  test("mutation failure rolls back optimistic update and shows error", async ({
    authedPage: page,
  }) => {
    const initialSettings = defaultSettings();

    // Query handler
    await page.route(
      (url) =>
        url.href.includes(PLATFORM_BASE_URL) &&
        url.pathname.startsWith("/trpc/") &&
        !url.pathname.includes("updateAutoTopupSettings"),
      async (route) => {
        const mocks = baseTrpcMocks(initialSettings as unknown as Record<string, unknown>);
        const procs = route.request().url().split("?")[0].split("/trpc/")[1]?.split(",") ?? [];
        const results = procs.map((proc) => ({
          result: { data: proc in mocks ? mocks[proc] : null },
        }));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(results),
        });
      },
    );

    // Mutation handler returns error
    await page.route(
      (url) =>
        url.href.includes(PLATFORM_BASE_URL) && url.pathname.includes("updateAutoTopupSettings"),
      async (route) => {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify([{ error: { message: "Internal server error" } }]),
        });
      },
    );

    // Dividend stats
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

    await page.goto("/billing/credits");

    await expect(page.getByRole("heading", { name: "Auto-topup" })).toBeVisible({
      timeout: 10000,
    });

    // Toggle usage-based on (optimistic update)
    await page.locator("#usage-toggle").first().click();

    // Error message should appear after mutation fails
    await expect(page.getByText("Failed to save settings. Please try again.")).toBeVisible({
      timeout: 5000,
    });

    // Toggle should have reverted to off (rollback)
    await expect(page.locator("#usage-toggle").first()).not.toBeChecked();
  });

  test("no payment method shows add-payment-method prompt", async ({ authedPage: page }) => {
    const noCardSettings = {
      usageBased: { enabled: false, thresholdCents: 500, topupAmountCents: 1000 },
      scheduled: {
        enabled: false,
        amountCents: 1000,
        interval: "monthly" as const,
        nextChargeDate: null,
      },
      paymentMethodLast4: null,
      paymentMethodBrand: null,
    };
    await mockAutoTopupAPI(page, noCardSettings as unknown as Record<string, unknown>);

    await page.goto("/billing/credits");

    await expect(page.getByRole("heading", { name: "Auto-topup" })).toBeVisible({
      timeout: 10000,
    });

    // Should show the "add payment method" message, not the toggles
    await expect(
      page.getByText("Add a payment method to enable auto-topup.").first(),
    ).toBeVisible();

    // Toggles should NOT be present
    await expect(page.locator("#usage-toggle")).toHaveCount(0);
    await expect(page.locator("#schedule-toggle")).toHaveCount(0);
  });
});
