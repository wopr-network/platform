import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/auth";

const PLATFORM_BASE_URL =
  process.env.BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const HAS_STRIPE_KEYS = !!(
  process.env.STRIPE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
);

// --- Shared mock data ---

const MOCK_ORG = {
  id: "e2e-org-id",
  name: "E2E Test Org",
  slug: "e2e-test-org",
  billingEmail: "e2e@wopr.test",
  members: [{ userId: "e2e-user-id", role: "admin", email: "e2e@wopr.test" }],
  invites: [],
};

const CREDIT_OPTIONS = [
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
];

const BILLING_TRPC_MOCKS: Record<string, unknown> = {
  "billing.creditOptions": CREDIT_OPTIONS,
  "billing.creditsBalance": {
    balance_cents: 5000,
    daily_burn_cents: 100,
    runway_days: 50,
  },
  "billing.inferenceMode": { mode: "hosted" },
  "billing.creditsHistory": { entries: [] },
  "billing.autoTopupSettings": {
    usageBased: {
      enabled: false,
      thresholdCents: 500,
      topupAmountCents: 1000,
    },
    scheduled: { enabled: false, amountCents: 1000, interval: "monthly" },
  },
  "billing.accountStatus": {
    status: "active",
    status_reason: null,
    grace_deadline: null,
  },
  "billing.usageSummary": {
    period_start: "",
    period_end: "",
    total_spend_cents: 0,
    included_credit_cents: 0,
    amount_due_cents: 0,
    plan_name: "free",
  },
  "org.listMyOrganizations": [MOCK_ORG],
  "pageContext.update": null,
};

/**
 * Mock billing tRPC endpoints. Allows overriding specific procedures.
 * creditsCheckout is passed through to real backend by default.
 */
async function mockBillingAPI(page: Page, overrides: Record<string, unknown> = {}) {
  const mocks = { ...BILLING_TRPC_MOCKS, ...overrides };

  await page.route(
    (url) => {
      if (!url.href.includes(PLATFORM_BASE_URL) || !url.pathname.startsWith("/trpc/")) return false;
      const procPart = url.pathname.split("/trpc/")[1] ?? "";
      const procs = procPart.split(",");
      // Let creditsCheckout through to real backend (unless overridden)
      if (!("billing.creditsCheckout" in overrides)) {
        return procs.every((p) => p !== "billing.creditsCheckout");
      }
      return true;
    },
    async (route) => {
      const procs = route.request().url().split("?")[0].split("/trpc/")[1]?.split(",") ?? [];
      const results = procs.map((proc) => ({
        result: {
          data: proc in mocks ? mocks[proc] : null,
        },
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(results),
      });
    },
  );

  // Let creditsCheckout through if not overridden
  if (!("billing.creditsCheckout" in overrides)) {
    await page.route(
      (url) => {
        if (!url.href.includes(PLATFORM_BASE_URL) || !url.pathname.startsWith("/trpc/"))
          return false;
        const procPart = url.pathname.split("/trpc/")[1] ?? "";
        return procPart.split(",").some((p) => p === "billing.creditsCheckout");
      },
      async (route) => route.continue(),
    );
  }

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

/** Navigate to credits page, select a tier, click Buy, arrive at Stripe Checkout. */
async function startCheckout(page: Page): Promise<void> {
  await mockBillingAPI(page);
  await page.goto("/billing/credits");
  await expect(page.getByText("Buy Credits").first()).toBeVisible({
    timeout: 15000,
  });

  const firstTier = page
    .locator("button")
    .filter({ hasText: /^\$[\d,.]+$/ })
    .first();
  await firstTier.click();
  await page.getByRole("button", { name: "Buy credits" }).first().click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 20000 });
}

/** Fill Stripe Checkout form fields. Handles cross-origin Stripe iframes. */
async function fillStripeCard(page: Page, cardNumber: string): Promise<void> {
  const emailField = page.locator('input[name="email"]');
  if (await emailField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await emailField.fill("e2e@wopr.test");
  }

  // Stripe renders card fields inside cross-origin iframes — use frameLocator to reach them
  const stripeFrame = page.frameLocator(
    'iframe[name^="__privateStripeFrame"], iframe[src*="js.stripe.com"]',
  );

  await stripeFrame.locator('[name="cardNumber"], input[placeholder*="card number" i]').first().fill(cardNumber);
  await stripeFrame.locator('[name="cardExpiry"], input[placeholder*="expir" i]').first().fill("12/30");
  await stripeFrame.locator('[name="cardCvc"], input[placeholder*="cvc" i], input[placeholder*="cvv" i]').first().fill("123");

  const nameField = page.locator('input[name="billingName"]');
  if (await nameField.isVisible({ timeout: 1000 }).catch(() => false)) {
    await nameField.fill("E2E Test");
  }

  const zipField = page.locator('input[name="billingPostalCode"]');
  if (await zipField.isVisible({ timeout: 1000 }).catch(() => false)) {
    await zipField.fill("10001");
  }
}

// ============================================================
// TEST SUITE 1: Stripe Checkout Decline Errors (real Stripe keys)
// ============================================================

test.describe("Payment Failure UX: Stripe Checkout Declines", () => {
  test.skip(!HAS_STRIPE_KEYS, "Requires Stripe test-mode keys");
  test.setTimeout(120_000);

  test("checkout decline — Stripe shows error on checkout page (card 4000000000000002)", async ({
    authedPage: page,
  }) => {
    await startCheckout(page);
    await fillStripeCard(page, "4000000000000002");
    await page.getByRole("button", { name: /Pay|Subscribe/i }).click();

    // Stripe shows decline error on their hosted checkout page
    await expect(
      page
        .locator('[data-testid="error-message"], .ErrorMessage, .PaymentElement-error')
        .or(page.getByText(/your card was declined|card was declined/i))
        .first(),
    ).toBeVisible({ timeout: 15000 });

    // Still on Stripe checkout — NOT redirected back
    expect(page.url()).toContain("checkout.stripe.com");
  });

  test("insufficient funds — specific decline messaging (card 4000000000009995)", async ({
    authedPage: page,
  }) => {
    await startCheckout(page);
    await fillStripeCard(page, "4000000000009995");
    await page.getByRole("button", { name: /Pay|Subscribe/i }).click();

    // Stripe shows insufficient funds error on their hosted page
    await expect(
      page
        .locator('[data-testid="error-message"], .ErrorMessage, .PaymentElement-error')
        .or(page.getByText(/insufficient funds|card was declined/i))
        .first(),
    ).toBeVisible({ timeout: 15000 });

    // Still on Stripe checkout
    expect(page.url()).toContain("checkout.stripe.com");
  });
});

// ============================================================
// TEST SUITE 2: Inline Stripe Elements Error (payment method add)
// ============================================================

test.describe("Payment Failure UX: Add Payment Method Error", () => {
  test.skip(
    !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    "Requires NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to load Stripe.js",
  );
  test.setTimeout(60_000);

  test("payment method add — inline Stripe Elements error on empty submit", async ({
    authedPage: page,
  }) => {
    const PAYMENT_TRPC_MOCKS: Record<string, unknown> = {
      "billing.billingInfo": {
        email: "e2e@wopr.test",
        paymentMethods: [],
        invoices: [],
      },
      "billing.autoTopupSettings": {
        usageBased: {
          enabled: false,
          thresholdCents: 500,
          topupAmountCents: 1000,
        },
        scheduled: {
          enabled: false,
          amountCents: 1000,
          interval: "monthly",
        },
      },
      "billing.accountStatus": {
        status: "active",
        status_reason: null,
        grace_deadline: null,
      },
      "org.listMyOrganizations": [MOCK_ORG],
      "org.getOrganization": MOCK_ORG,
      "org.orgBillingInfo": {
        paymentMethods: [],
        invoices: [],
        email: "e2e@wopr.test",
      },
      "pageContext.update": null,
      "billing.updateBillingEmail": null,
    };

    await page.route(
      (url) => url.href.includes(PLATFORM_BASE_URL) && url.pathname.startsWith("/trpc/"),
      async (route) => {
        const procs = route.request().url().split("?")[0].split("/trpc/")[1]?.split(",") ?? [];
        const results = procs.map((proc) => ({
          result: {
            data: proc in PAYMENT_TRPC_MOCKS ? PAYMENT_TRPC_MOCKS[proc] : null,
          },
        }));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(results),
        });
      },
    );

    // Let setup-intent through to real backend for Stripe Elements
    await page.route(`${PLATFORM_BASE_URL}/api/billing/setup-intent`, async (route) =>
      route.continue(),
    );

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

    await page.route(
      (url) =>
        url.href.includes(PLATFORM_BASE_URL) &&
        url.pathname.includes("/api/billing/") &&
        !url.pathname.includes("setup-intent") &&
        !url.pathname.includes("dividend"),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({}),
        });
      },
    );

    await page.goto("/billing/payment");
    await expect(page.getByRole("heading", { name: "Payment" }).first()).toBeVisible();
    await page.getByRole("button", { name: "Add payment method" }).first().click();

    // Dialog opens
    await expect(page.getByRole("heading", { name: "Add payment method" }).first()).toBeVisible({
      timeout: 10000,
    });

    // Wait for Stripe Elements iframe to load
    const stripeFrame = page.frameLocator(
      'iframe[src*="js.stripe.com"], iframe[name*="__privateStripeFrame"]',
    );
    await expect(
      stripeFrame.first().locator('[name="number"], [name="cardNumber"], input').first(),
    ).toBeVisible({ timeout: 15000 });

    // Click "Save card" without filling anything — triggers validation error
    await page.getByRole("button", { name: "Save card" }).first().click();

    // SetupForm catches result.error and displays it as text-destructive
    await expect(page.locator(".text-destructive").first()).toBeVisible({ timeout: 10000 });
  });
});

// ============================================================
// TEST SUITE 3: Network Error Recovery (fully mocked)
// ============================================================

test.describe("Payment Failure UX: Network Error Recovery", () => {
  test("network error — checkout fails, inline error shown, retry available", async ({
    authedPage: page,
  }) => {
    let callCount = 0;

    // Mock billing API but intercept creditsCheckout to fail
    await mockBillingAPI(page, {
      "billing.creditsCheckout": null, // placeholder — overridden below
    });

    // Override creditsCheckout: first call fails, second succeeds
    await page.route(
      (url) =>
        url.href.includes(PLATFORM_BASE_URL) &&
        url.pathname.startsWith("/trpc/") &&
        (url.pathname.split("/trpc/")[1] ?? "")
          .split(",")
          .some((p) => p === "billing.creditsCheckout"),
      async (route) => {
        callCount++;
        const procs = route.request().url().split("?")[0].split("/trpc/")[1]?.split(",") ?? [];
        const count = Math.max(procs.length, 1);
        if (callCount === 1) {
          const errorResult = {
            error: {
              message: "Internal server error",
              code: -32603,
              data: { code: "INTERNAL_SERVER_ERROR" },
            },
          };
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(Array.from({ length: count }, () => errorResult)),
          });
        } else {
          const successResult = {
            result: {
              data: {
                url: "https://checkout.stripe.com/pay/test_mock_recovery",
                sessionId: "cs_test_mock_recovery",
              },
            },
          };
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify(Array.from({ length: count }, () => successResult)),
          });
        }
      },
    );

    await page.goto("/billing/credits");
    await expect(page.getByText("Buy Credits").first()).toBeVisible({
      timeout: 15000,
    });

    // Select a tier
    const firstTier = page
      .locator("button")
      .filter({ hasText: /^\$[\d,.]+$/ })
      .first();
    await firstTier.click();

    // Click buy — first attempt fails
    await page.getByRole("button", { name: "Buy credits" }).first().click();

    // BuyCreditsPanel shows inline error
    await expect(page.getByText("Checkout failed. Please try again.").first()).toBeVisible({
      timeout: 10000,
    });

    // Error is rendered as text-destructive
    await expect(page.locator(".text-destructive").first()).toBeVisible();

    // Buy button should still be enabled for retry
    await expect(page.getByRole("button", { name: "Buy credits" }).first()).toBeEnabled({
      timeout: 5000,
    });

    // Click retry — second call succeeds and redirects to Stripe Checkout
    await page.getByRole("button", { name: "Buy credits" }).first().click();
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 20000 });
  });
});

// ============================================================
// TEST SUITE 4: Suspended Account — Billing CTA
// ============================================================

test.describe("Payment Failure UX: Suspended Account", () => {
  test("suspended account — destructive banner with billing CTA visible", async ({
    authedPage: page,
  }) => {
    await mockBillingAPI(page, {
      "billing.accountStatus": {
        status: "suspended",
        status_reason: "payment_failed",
        grace_deadline: null,
      },
    });

    // Mock REST endpoints for DegradedStateBanner
    await page.route(
      (url) =>
        url.href.includes(PLATFORM_BASE_URL) &&
        url.pathname.includes("/api/billing/account-status"),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            status: "suspended",
            statusReason: "payment_failed",
            graceDeadline: null,
          }),
        });
      },
    );

    await page.route(
      (url) =>
        url.href.includes(PLATFORM_BASE_URL) &&
        url.pathname.includes("/api/billing/credits/balance"),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ balance: 0, runway: 0 }),
        });
      },
    );

    await page.route(
      (url) =>
        url.href.includes(PLATFORM_BASE_URL) && url.pathname.includes("/api/billing/usage-summary"),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ amountDue: 0 }),
        });
      },
    );

    await page.goto("/billing/credits");

    // DegradedStateBanner should show suspended banner
    await expect(page.getByText("ACCOUNT SUSPENDED").first()).toBeVisible({ timeout: 15000 });

    // Banner should contain "bots are offline" text
    await expect(page.getByText("bots are offline").first()).toBeVisible();

    // Banner should show the reason in parens
    await expect(page.getByText(/payment.?failed/i).first()).toBeVisible();

    // "Contact support" link pointing to /billing should be visible
    const supportLink = page.getByRole("link", { name: "Contact support" }).first();
    await expect(supportLink).toBeVisible();
    await expect(supportLink).toHaveAttribute("href", "/billing");
  });
});
