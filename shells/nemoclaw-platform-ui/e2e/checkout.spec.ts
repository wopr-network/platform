import { expect, test } from "@playwright/test";

test("buy $5 credits and verify balance increases", async ({ page }) => {
  await page.goto("/billing/credits");
  await page.waitForLoadState("networkidle");

  // Must be authenticated — if redirected to login, fail loudly
  expect(page.url()).not.toContain("/login");
  expect(page.url()).not.toContain("/sign-in");
  expect(page.url()).not.toContain("/auth");

  // Capture the balance shown before purchase (may not exist yet → 0)
  const balanceBefore = await getBalanceCents(page);

  // Page renders desktop+mobile simultaneously — buttons appear twice, first is hidden (mobile).
  // Use button:visible to pick the rendered one.
  const tierBtnLocator = page.locator("button:visible").filter({ hasText: /^\$5$/ }).first();
  await tierBtnLocator.waitFor({ state: "visible", timeout: 15000 });
  await tierBtnLocator.click();

  // Click the "Buy credits" submit button (use visible to avoid hidden mobile duplicate)
  await page
    .locator("button:visible")
    .filter({ hasText: /buy credits/i })
    .first()
    .click();

  // Wait for redirect to Stripe checkout
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 15000 });
  expect(page.url()).toContain("checkout.stripe.com");

  // Wait for Stripe page to settle
  await page.waitForTimeout(5000);

  // Fill email
  await page.locator('input[name="email"]').fill("e2e+checkout@nemopod.com");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(500);

  // Uncheck "Save my information for faster checkout" (Link) to dismiss phone field
  // and reveal card number inputs directly on the page
  const saveInfo = page.locator('input[name="enableStripePass"]');
  if (await saveInfo.isVisible({ timeout: 2000 }).catch(() => false)) {
    if (await saveInfo.isChecked()) {
      await saveInfo.click();
      await page.waitForTimeout(500);
    }
  }

  // Select Card payment method (expands card form)
  await page.locator('input[value="card"]').click({ force: true });
  await page.waitForTimeout(2000);

  // Fill card number directly (no iframes — Stripe renders inputs in main frame)
  await page.locator('input[name="cardNumber"]').fill("4242 4242 4242 4242");
  await page.locator('input[name="cardExpiry"]').fill("12 / 30");
  await page.locator('input[name="cardCvc"]').fill("123");

  // Name on card
  const nameField = page.locator('input[name="billingName"]');
  if (await nameField.isVisible({ timeout: 2000 }).catch(() => false)) {
    await nameField.fill("E2E Checkout User");
  }

  // ZIP code
  const zipField = page.locator('input[name="billingPostalCode"]');
  if (await zipField.isVisible({ timeout: 2000 }).catch(() => false)) {
    await zipField.fill("10001");
  }

  // Submit payment — use data-testid to avoid matching accordion "Pay with card" buttons
  await page.locator('[data-testid="hosted-payment-submit-button"]').click();

  // Wait for redirect back to the app with checkout=success
  await page.waitForURL(/nemopod\.com.*checkout=success/, { timeout: 30000 });
  expect(page.url()).toContain("checkout=success");

  // Wait for balance to update (webhook may take a moment)
  await page.waitForTimeout(5000);
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  // Verify balance increased
  const balanceAfter = await getBalanceCents(page);
  expect(balanceAfter).toBeGreaterThan(balanceBefore);
});

/**
 * Scrape the displayed credit balance from the page using page.evaluate.
 * Finds the element containing "Credit Balance" label and extracts the dollar amount.
 * Returns cents (e.g. "$14.17" → 1417). Returns 0 if not found.
 */
async function getBalanceCents(page: import("@playwright/test").Page): Promise<number> {
  const text = await page.evaluate((): string => {
    const all = Array.from(document.querySelectorAll("div, span, p"));
    // Find an element whose text matches "$X.XX" and is a leaf or near-leaf node
    for (const el of all) {
      const t = el.textContent?.trim() ?? "";
      if (/^\$\d+\.\d{2}$/.test(t)) {
        return t;
      }
    }
    return "";
  });
  if (!text) return 0;
  const m = text.match(/\$(\d+(?:\.\d+)?)/);
  return m ? Math.round(parseFloat(m[1]) * 100) : 0;
}
