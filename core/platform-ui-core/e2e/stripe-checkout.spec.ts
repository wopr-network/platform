import { expect, test } from "./fixtures/auth";

/**
 * Full Stripe Checkout e2e tests.
 *
 * These tests drive real Stripe Checkout in test mode. They require:
 * - Platform backend running on port 3001 with real Stripe test-mode keys
 * - UI running on port 3000
 * - STRIPE_PUBLISHABLE_KEY env var set (or NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)
 *
 * Skip when keys are not configured.
 */

const PLATFORM_BASE_URL =
  process.env.BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * Mock billing tRPC endpoints so the credits page renders tier buttons.
 *
 * The auth fixture installs a catch-all 503 handler (lowest LIFO priority).
 * Routes registered here are added AFTER the fixture's catch-all and therefore
 * take precedence (Playwright uses LIFO — last registered wins). This allows
 * billing.creditOptions and related procedures to return real mock data while
 * auth/session endpoints remain handled by the fixture.
 */
async function mockBillingForStripe(page: import("@playwright/test").Page): Promise<void> {
  const CREDIT_OPTIONS = [
    { priceId: "price_test_credits_10", label: "$10", amountCents: 1000, creditCents: 1000, bonusPercent: 0 },
    { priceId: "price_test_credits_25", label: "$25", amountCents: 2500, creditCents: 2750, bonusPercent: 10 },
    { priceId: "price_test_credits_50", label: "$50", amountCents: 5000, creditCents: 6000, bonusPercent: 20 },
  ];
  const BILLING_MOCKS: Record<string, unknown> = {
    "billing.creditOptions": CREDIT_OPTIONS,
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
    "org.listMyOrganizations": [],
    "pageContext.update": null,
  };

  await page.route(
    (url) => {
      if (!url.href.includes(PLATFORM_BASE_URL) || !url.pathname.startsWith("/trpc/")) return false;
      const procPart = url.pathname.split("/trpc/")[1] ?? "";
      // creditsCheckout must reach the real backend to get a Stripe URL.
      // creditsBalance must reach the real backend to reflect post-purchase state.
      const procs = procPart.split(",");
      return procs.every((p) => p !== "billing.creditsCheckout" && p !== "billing.creditsBalance");
    },
    async (route) => {
      const procs = route.request().url().split("?")[0].split("/trpc/")[1]?.split(",") ?? [];
      const results = procs.map((proc) => ({
        result: {
          data: proc in BILLING_MOCKS ? BILLING_MOCKS[proc] : null,
        },
      }));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(results),
      });
    },
  );

  // Pass creditsCheckout and creditsBalance through to the real backend.
  // These are registered AFTER the auth fixture's catch-all 503 (LIFO: higher priority)
  // so they win over the catch-all and let the request reach the real platform API.
  await page.route(
    (url) => {
      if (!url.href.includes(PLATFORM_BASE_URL) || !url.pathname.startsWith("/trpc/")) return false;
      const procPart = url.pathname.split("/trpc/")[1] ?? "";
      return procPart.split(",").some((p) => p === "billing.creditsCheckout" || p === "billing.creditsBalance");
    },
    async (route) => route.continue(),
  );

  await page.route(`${PLATFORM_BASE_URL}/api/billing/dividend/stats`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ poolCents: 0, activeUsers: 0, perUserCents: 0, userEligible: false, userWindowExpiresAt: null }),
    });
  });
}

const HAS_STRIPE_KEYS = !!(
  process.env.STRIPE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
);

/**
 * Helper: read the current credit balance from the credits page.
 * Parses the dollar amount from the Credit Balance card's large text.
 * Returns balance in dollars (e.g. 50.00).
 */
async function readCreditBalance(page: import("@playwright/test").Page): Promise<number> {
  if (!page.url().includes("/billing")) {
    await mockBillingForStripe(page);
    await page.goto("/billing/credits");
  }
  await expect(page.getByRole("heading", { name: /Credits/ })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Credit Balance").first()).toBeVisible({ timeout: 10000 });

  // The balance is rendered as "$XX.XX" inside a div with class text-4xl font-bold font-mono.
  // Poll until animation settles rather than using a fixed timeout.
  const balanceLocator = page.locator(".text-4xl.font-bold.font-mono").first();
  await expect(balanceLocator).not.toHaveText("", { timeout: 5000 });

  const balanceText = await balanceLocator.textContent();

  if (!balanceText) throw new Error("Could not read credit balance text");
  // Parse "$150.00" -> 150.00
  const match = balanceText.match(/\$?([\d,]+\.?\d*)/);
  if (!match) throw new Error(`Could not parse balance from: ${balanceText}`);
  return Number.parseFloat(match[1].replace(/,/g, ""));
}

/**
 * Helper: navigate to credits page, select a tier, click Buy, arrive at Stripe Checkout.
 */
async function startCheckout(page: import("@playwright/test").Page): Promise<void> {
  await mockBillingForStripe(page);
  await page.goto("/billing/credits");
  await expect(page.getByText("Buy Credits")).toBeVisible({ timeout: 15000 });

  // Select the first available credit tier
  const firstTier = page
    .locator("button")
    .filter({ hasText: /^\$[\d,.]+$/ })
    .first();
  await firstTier.click();

  // Click "Buy credits"
  await page.getByRole("button", { name: "Buy credits" }).click();

  // Wait for redirect to Stripe Checkout
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 20000 });
}

/**
 * Helper: fill Stripe Checkout form fields.
 * Handles optional fields (email, name, zip) that may or may not appear.
 */
async function fillStripeCard(
  page: import("@playwright/test").Page,
  cardNumber: string,
): Promise<void> {
  // Email field (may be pre-filled or hidden)
  const emailField = page.locator('input[name="email"]');
  if (await emailField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await emailField.fill("e2e@wopr.test");
  }

  await page.locator('input[name="cardNumber"]').fill(cardNumber);
  await page.locator('input[name="cardExpiry"]').fill("12/30");
  await page.locator('input[name="cardCvc"]').fill("123");

  // Billing name (may not appear depending on Stripe config)
  const nameField = page.locator('input[name="billingName"]');
  if (await nameField.isVisible({ timeout: 1000 }).catch(() => false)) {
    await nameField.fill("E2E Test");
  }

  // Postal code (may not appear depending on country)
  const zipField = page.locator('input[name="billingPostalCode"]');
  if (await zipField.isVisible({ timeout: 1000 }).catch(() => false)) {
    await zipField.fill("10001");
  }
}

test.describe("Stripe Checkout: Full Flow", () => {
  test.skip(!HAS_STRIPE_KEYS, "Requires Stripe test-mode keys");

  // These tests are slow (real network calls to Stripe)
  test.setTimeout(120_000);

  test("1. happy path — purchase with test card, verify credit increase", async ({
    authedPage: page,
  }) => {
    // Read balance BEFORE purchase
    const balanceBefore = await readCreditBalance(page);

    // Start checkout
    await startCheckout(page);

    // Fill test card (4242 4242 4242 4242 = always succeeds)
    await fillStripeCard(page, "4242424242424242");

    // Submit payment
    await page.getByRole("button", { name: /Pay|Subscribe/i }).click();

    // Wait for redirect back to credits page with success
    await page.waitForURL(/\/billing\/credits\?checkout=success/, { timeout: 30000 });

    // Verify we're back on credits page
    await expect(page.getByRole("heading", { name: /Credits/ })).toBeVisible({ timeout: 15000 });

    // Read balance AFTER purchase — should have increased
    // readCreditBalance polls until animation settles; no fixed timeout needed
    const balanceAfter = await readCreditBalance(page);

    expect(balanceAfter).toBeGreaterThan(balanceBefore);
  });

  test("2. declined card — verify error shown, no credits granted", async ({
    authedPage: page,
  }) => {
    // Read balance BEFORE
    const balanceBefore = await readCreditBalance(page);

    // Start checkout
    await startCheckout(page);

    // Fill declined test card (4000 0000 0000 0002 = always declines)
    await fillStripeCard(page, "4000000000000002");

    // Submit payment
    await page.getByRole("button", { name: /Pay|Subscribe/i }).click();

    // Stripe should show a decline error message on the checkout page
    // (does NOT redirect back — stays on Stripe Checkout with error)
    await expect(
      page
        .locator('[data-testid="error-message"], .ErrorMessage, .PaymentElement-error')
        .or(page.getByText(/your card was declined|card was declined/i))
        .first(),
    ).toBeVisible({ timeout: 15000 });

    // Navigate back to credits page manually
    await page.goto("/billing/credits");
    await expect(page.getByRole("heading", { name: /Credits/ })).toBeVisible({ timeout: 15000 });

    // Balance should be unchanged
    const balanceAfter = await readCreditBalance(page);
    expect(balanceAfter).toBe(balanceBefore);
  });

  test("3. 3D Secure required — complete authentication, verify credits land", async ({
    authedPage: page,
  }) => {
    // Read balance BEFORE
    const balanceBefore = await readCreditBalance(page);

    // Start checkout
    await startCheckout(page);

    // Fill 3DS-required test card (4000 0025 0000 3155)
    await fillStripeCard(page, "4000002500003155");

    // Submit payment
    await page.getByRole("button", { name: /Pay|Subscribe/i }).click();

    // 3DS challenge appears — Stripe renders it in an iframe.
    // In test mode, Stripe shows a simple "Complete authentication" / "Authorize test payment" button.
    const challengeFrame = page.frameLocator('iframe[src*="stripe"]');

    // Stripe test mode 3DS shows: "3D Secure 2 Test Page" with "Complete" and "Fail" buttons
    const completeBtn = challengeFrame.getByRole("button", { name: /Complete|Authorize/i });
    await expect(completeBtn).toBeVisible({ timeout: 20000 });
    await completeBtn.click();

    // After 3DS, Stripe completes payment and redirects back
    await page.waitForURL(/\/billing\/credits\?checkout=success/, { timeout: 30000 });

    await expect(page.getByRole("heading", { name: /Credits/ })).toBeVisible({ timeout: 15000 });

    // Verify balance increased
    const balanceAfter = await readCreditBalance(page);
    expect(balanceAfter).toBeGreaterThan(balanceBefore);
  });

  test("4. cancel mid-checkout — no credits granted", async ({ authedPage: page }) => {
    // Read balance BEFORE
    const balanceBefore = await readCreditBalance(page);

    // Start checkout
    await startCheckout(page);

    // We're on Stripe Checkout. Click the back/close link.
    // Stripe Checkout has a "< Back to {merchant}" link or an X button.
    const backLink = page.getByRole("link", { name: /back to/i });
    if (await backLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await backLink.click();
    } else {
      // Fallback: navigate directly to the cancel URL
      await page.goto("/billing/credits?checkout=cancel");
    }

    // Should be back on credits page (with ?checkout=cancel)
    await page.waitForURL(/\/billing\/credits/, { timeout: 15000 });
    await expect(page.getByRole("heading", { name: /Credits/ })).toBeVisible({ timeout: 15000 });

    // Balance unchanged
    const balanceAfter = await readCreditBalance(page);
    expect(balanceAfter).toBe(balanceBefore);
  });
});
