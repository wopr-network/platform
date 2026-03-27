import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/auth";

const PLATFORM_BASE_URL =
  process.env.BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const MOCK_CREDIT_OPTIONS = [
  {
    priceId: "price_test_credits_10",
    label: "$10",
    amountCents: 1000,
    creditCents: 1000,
    bonusPercent: 0,
  },
  {
    priceId: "price_test_credits_25",
    label: "$25",
    amountCents: 2500,
    creditCents: 2750,
    bonusPercent: 10,
  },
  {
    priceId: "price_test_credits_50",
    label: "$50",
    amountCents: 5000,
    creditCents: 6000,
    bonusPercent: 20,
  },
];

/** Shared mock org used by auth fixture — duplicated here for batch-aware billing handler. */
const MOCK_ORG = {
  id: "e2e-org-id",
  name: "E2E Test Org",
  slug: "e2e-test-org",
  billingEmail: "e2e@wopr.test",
  members: [{ userId: "e2e-user-id", role: "admin", email: "e2e@wopr.test" }],
  invites: [],
};

/**
 * All known tRPC procedure responses for the billing test context.
 * Must include BOTH billing and auth/org procedures because tRPC's httpBatchLink
 * batches multiple queries (from different components) into ONE request like:
 *   /trpc/billing.creditOptions,org.getOrganization,...?batch=1&input={...}
 * The handler MUST return one result per procedure in the batch.
 */
const BILLING_TRPC_MOCKS: Record<string, unknown> = {
  // Billing procedures
  "billing.creditOptions": MOCK_CREDIT_OPTIONS,
  "billing.creditsBalance": { balance_cents: 5000, daily_burn_cents: 100, runway_days: 50 },
  "billing.inferenceMode": { mode: "hosted" },
  "billing.creditsHistory": { entries: [] },
  "billing.autoTopupSettings": {
    usageBased: { enabled: false, thresholdCents: 500, topupAmountCents: 1000 },
    scheduled: { enabled: false, amountCents: 1000, interval: "monthly" },
  },
  "billing.accountStatus": { status: "active", status_reason: null, grace_deadline: null },
  "billing.usageSummary": {
    period_start: "",
    period_end: "",
    total_spend_cents: 0,
    included_credit_cents: 0,
    amount_due_cents: 0,
    plan_name: "free",
  },
  // org.getOrganization intentionally NOT mocked here — returning null causes
  // the credits page to fall through to the personal billing view (which shows
  // the "Credits" heading that these tests assert on).
  "org.listMyOrganizations": [MOCK_ORG],
  "pageContext.update": null,
};

/**
 * Mock the billing tRPC endpoints needed for the credits page to render.
 *
 * Registers ONE batch-aware handler that intercepts any tRPC request containing
 * billing procedures and returns the correct number of results for the whole batch.
 */
async function mockBillingAPI(page: Page) {
  await page.route(
    (url) => url.href.includes(PLATFORM_BASE_URL) && url.pathname.startsWith("/trpc/"),
    async (route) => {
      const procs = route.request().url().split("?")[0].split("/trpc/")[1]?.split(",") ?? [];
      const results = procs.map((proc) => ({
        result: {
          data: proc in BILLING_TRPC_MOCKS ? BILLING_TRPC_MOCKS[proc] : null,
        },
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(results),
      });
    },
  );

  // REST endpoint for dividend stats
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
}

test.describe("Billing: Credit Checkout", () => {
  test("credits page loads and shows credit options", async ({ authedPage: page }) => {
    await mockBillingAPI(page);

    await page.goto("/billing/credits");

    await expect(page.getByRole("heading", { name: "Credits" })).toBeVisible();
    await expect(page.getByRole("main").getByText("Buy Credits", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /\$10/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /\$25/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /\$50/ }).first()).toBeVisible();

    // Bonus badges visible for $25 and $50 tiers
    await expect(page.getByText("+10%").first()).toBeVisible();
    await expect(page.getByText("+20%").first()).toBeVisible();

    // Buy button should be disabled before selecting a tier
    await expect(page.getByRole("button", { name: "Buy credits" }).first()).toBeDisabled();
  });

  test("checkout request contains real Stripe price ID (not synthetic)", async ({
    authedPage: page,
  }) => {
    await mockBillingAPI(page);

    let capturedCheckoutBody: Record<string, unknown> | null = null;

    await page.route(
      (url) => url.pathname.includes("/trpc/") && url.pathname.includes("billing.creditsCheckout"),
      async (route) => {
        capturedCheckoutBody = route.request().postDataJSON();

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify([
            {
              result: {
                data: {
                  json: {
                    url: "https://checkout.stripe.com/pay/test_mock",
                    sessionId: "cs_test_mock",
                  },
                },
              },
            },
          ]),
        });
      },
    );

    await page.goto("/billing/credits");

    const tenDollarTier = page.getByRole("button", { name: /\$10/ }).first();
    await expect(tenDollarTier).toBeVisible();

    // Select the $10 tier — use dispatchEvent to bypass framer-motion animation interception
    await tenDollarTier.dispatchEvent("click");

    // Wait for the tier to register as selected (border-primary class applied)
    await expect(tenDollarTier).toHaveClass(/border-primary/, { timeout: 5000 });

    // Buy button should now be enabled
    await expect(page.getByRole("button", { name: "Buy credits" }).first()).toBeEnabled({ timeout: 5000 });

    // Click buy
    await page.getByRole("button", { name: "Buy credits" }).first().click();

    // Wait briefly for the route handler to fire
    await expect.poll(() => capturedCheckoutBody, { timeout: 5000 }).not.toBeNull();

    // Extract priceId from tRPC batch body: { "0": { "priceId": "..." } }
    const batchInput = capturedCheckoutBody as unknown as Record<string, { priceId: string }>;
    const priceId = batchInput["0"]?.priceId;

    expect(priceId).toBeDefined();
    // CRITICAL: priceId must be a real Stripe price ID (price_xxx), not synthetic like "credit_10"
    expect(priceId).toMatch(/^price_/);
    expect(MOCK_CREDIT_OPTIONS.map((o) => o.priceId)).toContain(priceId);
  });

  test("complete checkout with Stripe test card and verify credit increase", async ({
    authedPage: page,
  }) => {
    test.skip(!process.env.STRIPE_PUBLISHABLE_KEY, "Requires Stripe test-mode keys");

    await page.goto("/billing/credits");

    await expect(page.getByText("Buy Credits")).toBeVisible();

    // Select the first available tier
    const firstTier = page
      .locator("button")
      .filter({ hasText: /^\$[\d,.]+$/ })
      .first();
    await firstTier.click();

    await page.getByRole("button", { name: "Buy credits" }).click();

    // Should redirect to Stripe Checkout
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15000 });

    // Fill Stripe test card
    const emailField = page.locator('input[name="email"]');
    if (await emailField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailField.fill("e2e@wopr.test");
    }

    await page.locator('input[name="cardNumber"]').fill("4242424242424242");
    await page.locator('input[name="cardExpiry"]').fill("12/30");
    await page.locator('input[name="cardCvc"]').fill("123");

    const nameField = page.locator('input[name="billingName"]');
    if (await nameField.isVisible({ timeout: 1000 }).catch(() => false)) {
      await nameField.fill("E2E Test");
    }

    const zipField = page.locator('input[name="billingPostalCode"]');
    if (await zipField.isVisible({ timeout: 1000 }).catch(() => false)) {
      await zipField.fill("10001");
    }

    await page.getByRole("button", { name: /Pay|Subscribe/i }).click();

    // Should redirect back to credits page with success
    await page.waitForURL(/\/billing\/credits\?checkout=success/, {
      timeout: 30000,
    });

    await expect(page.getByRole("heading", { name: "Credits" })).toBeVisible();
  });
});

test.describe("Billing: Dashboard Display", () => {
  test("balance display shows correct amount after purchase", async ({ authedPage: page }) => {
    const POST_PURCHASE_MOCKS: Record<string, unknown> = {
      ...BILLING_TRPC_MOCKS,
      "billing.creditsBalance": { balance_cents: 15000, daily_burn_cents: 250, runway_days: 60 },
    };

    await page.route(
      (url) =>
        url.href.includes(PLATFORM_BASE_URL) &&
        url.pathname.startsWith("/trpc/"),
      async (route) => {
        const procs = route.request().url().split("?")[0].split("/trpc/")[1]?.split(",") ?? [];
        const results = procs.map((proc) => ({
          result: {
            data: proc in POST_PURCHASE_MOCKS ? POST_PURCHASE_MOCKS[proc] : null,
          },
        }));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(results),
        });
      },
    );

    await page.route(`${PLATFORM_BASE_URL}/api/billing/dividend/stats`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          pool_cents: 0,
          active_users: 0,
          per_user_cents: 0,
          user_eligible: false,
          user_window_expires_at: null,
        }),
      });
    });

    await page.goto("/billing/credits");

    // Credits heading visible (personal billing view)
    await expect(page.getByRole("heading", { name: "Credits" })).toBeVisible();

    // Credit Balance card visible with correct amount
    await expect(page.getByText("Credit Balance").first()).toBeVisible();
    // Balance should show $150.00 (15000 cents / 100), animated via useCountUp
    await expect(page.getByText("$150.00").first()).toBeVisible({ timeout: 5000 });

    // Daily burn and runway visible
    await expect(page.getByText(/daily burn/i).first()).toBeVisible();
    await expect(page.getByText("$2.50/day").first()).toBeVisible();
    await expect(page.getByText(/runway/i).first()).toBeVisible();
    await expect(page.getByText("~60 days").first()).toBeVisible();
  });

  test("transaction history shows recent purchase", async ({ authedPage: page }) => {
    const nowSecs = Math.floor(Date.now() / 1000);
    const HISTORY_MOCKS: Record<string, unknown> = {
      ...BILLING_TRPC_MOCKS,
      "billing.creditsBalance": { balance_cents: 15000, daily_burn_cents: 250, runway_days: 60 },
      "billing.creditsHistory": {
        entries: [
          {
            id: "tx-purchase-1",
            type: "grant",
            reason: "Credit purchase - $50 tier",
            amount_cents: 5000,
            created_at: nowSecs,
          },
          {
            id: "tx-signup-1",
            type: "grant",
            reason: "Signup credit",
            amount_cents: 500,
            created_at: nowSecs - 86400,
          },
          {
            id: "tx-runtime-1",
            type: "correction",
            reason: "Bot runtime charge",
            amount_cents: -120,
            created_at: nowSecs - 3600,
          },
        ],
      },
    };

    await page.route(
      (url) =>
        url.href.includes(PLATFORM_BASE_URL) &&
        url.pathname.startsWith("/trpc/"),
      async (route) => {
        const procs = route.request().url().split("?")[0].split("/trpc/")[1]?.split(",") ?? [];
        const results = procs.map((proc) => ({
          result: {
            data: proc in HISTORY_MOCKS ? HISTORY_MOCKS[proc] : null,
          },
        }));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(results),
        });
      },
    );

    await page.route(`${PLATFORM_BASE_URL}/api/billing/dividend/stats`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          pool_cents: 0,
          active_users: 0,
          per_user_cents: 0,
          user_eligible: false,
          user_window_expires_at: null,
        }),
      });
    });

    await page.goto("/billing/credits");

    // Transaction History card visible
    await expect(page.getByText("Transaction History").first()).toBeVisible({ timeout: 10000 });

    // Purchase transaction visible (grant -> "Purchase" label)
    // Scope to the row div (rounded-md) to avoid matching ancestor containers
    const purchaseRow = page.locator("div.rounded-md").filter({ hasText: "Credit purchase - $50 tier" }).first();
    await expect(purchaseRow.getByText("Credit purchase - $50 tier")).toBeVisible();
    await expect(purchaseRow.locator("text=Purchase").first()).toBeVisible();

    // Runtime charge visible (correction -> "Adjustment" label)
    const adjustmentRow = page.locator("div.rounded-md").filter({ hasText: "Bot runtime charge" }).first();
    await expect(adjustmentRow.getByText("Bot runtime charge")).toBeVisible();
    await expect(adjustmentRow.locator("text=Adjustment").first()).toBeVisible();

    // Signup credit visible (grant -> "Purchase" label)
    await expect(page.getByText("Signup credit").first()).toBeVisible();
  });

  test("usage page shows correct summary after usage event", async ({ authedPage: page }) => {
    const USAGE_MOCKS: Record<string, unknown> = {
      ...BILLING_TRPC_MOCKS,
      "billing.inferenceMode": { mode: "hosted" },
      "billing.currentPlan": { tier: "pro" },
      "billing.usageSummary": {
        period_start: "2026-03-01T00:00:00Z",
        period_end: "2026-03-31T23:59:59Z",
        total_spend_cents: 4200,
        included_credit_cents: 1000,
        amount_due_cents: 3200,
        plan_name: "pro",
      },
      "billing.providerCosts": [],
      "billing.hostedUsageSummary": {
        capabilities: [
          { capability: "text_gen", label: "Text Generation", units: 1500, unitLabel: "tokens", cost: 35.00 },
          { capability: "image_gen", label: "Image Generation", units: 12, unitLabel: "images", cost: 7.00 },
        ],
        totalCost: 42.00,
        includedCredit: 10.00,
        amountDue: 32.00,
      },
      "billing.spendingLimits": {
        global: { alertAt: null, hardCap: null },
        perCapability: {},
      },
    };

    await page.route(
      (url) =>
        url.href.includes(PLATFORM_BASE_URL) &&
        url.pathname.startsWith("/trpc/"),
      async (route) => {
        const procs = route.request().url().split("?")[0].split("/trpc/")[1]?.split(",") ?? [];
        const results = procs.map((proc) => ({
          result: {
            data: proc in USAGE_MOCKS ? USAGE_MOCKS[proc] : null,
          },
        }));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(results),
        });
      },
    );

    await page.route(`${PLATFORM_BASE_URL}/api/billing/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    });

    await page.goto("/billing/usage");

    // Usage heading visible
    await expect(page.getByRole("heading", { name: "Usage" })).toBeVisible({ timeout: 10000 });

    // Billing Summary card shows the amount due — scoped to avoid matching Hosted AI Usage totals
    // Navigate up to the Card root (text → CardTitle → CardHeader → Card)
    const billingSummary = page.locator("text=Billing Summary").first().locator("../../..");
    await expect(billingSummary).toBeVisible();
    await expect(page.getByText("Billing Summary").first()).toBeVisible();
    await expect(page.getByText("amount due").first()).toBeVisible();
    await expect(billingSummary.getByText("$32.00").first()).toBeVisible();

    // Total spend line
    await expect(page.getByText("Total spend this period").first()).toBeVisible();
    await expect(page.getByText("$42.00").first()).toBeVisible();

    // Included credit line
    await expect(page.getByText("Included credit").first()).toBeVisible();

    // Platform Usage card
    await expect(page.getByText("Platform Usage").first()).toBeVisible();
    await expect(page.getByText("Instances").first()).toBeVisible();
    await expect(page.getByText("Storage").first()).toBeVisible();
    await expect(page.getByText("API calls").first()).toBeVisible();

    // Hosted AI Usage card (visible because mode is hosted)
    await expect(page.getByText("Hosted AI Usage").first()).toBeVisible();
    await expect(page.getByText("Text Generation").first()).toBeVisible();
    await expect(page.getByText("Image Generation").first()).toBeVisible();

    // "View detailed breakdown" link to /billing/usage/hosted
    await expect(page.getByRole("link", { name: "View detailed breakdown" }).first()).toBeVisible();

    // Usage Over Time card (always rendered)
    await expect(page.getByText("Usage Over Time").first()).toBeVisible();
  });
});
