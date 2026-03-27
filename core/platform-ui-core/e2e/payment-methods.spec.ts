import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/auth";

const PLATFORM_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const MOCK_ORG = {
  id: "e2e-org-id",
  name: "E2E Test Org",
  slug: "e2e-test-org",
  billingEmail: "e2e@wopr.test",
  members: [{ userId: "e2e-user-id", role: "admin", email: "e2e@wopr.test" }],
  invites: [],
};

function createMockState() {
  return {
    billingInfo: {
      email: "e2e@wopr.test",
      paymentMethods: [
        {
          id: "pm_test_visa_1",
          brand: "visa",
          last4: "4242",
          expiryMonth: 12,
          expiryYear: 2034,
          isDefault: true,
        },
        {
          id: "pm_test_mc_2",
          brand: "mastercard",
          last4: "5555",
          expiryMonth: 6,
          expiryYear: 2026,
          isDefault: false,
        },
      ],
      invoices: [
        {
          id: "inv_test_1",
          date: "2026-01-15",
          amount: 2500,
          status: "paid",
          downloadUrl: "https://example.com/invoice/1",
          hostedLineItems: [],
        },
      ],
    },
  };
}

const TRPC_DEFAULTS: Record<string, unknown> = {
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

async function mockPaymentAPI(page: Page, state: ReturnType<typeof createMockState>) {
  // tRPC batch handler — handles both GET (queries) and POST (mutations)
  await page.route(
    (url) => url.href.includes(PLATFORM_BASE_URL) && url.pathname.startsWith("/trpc/"),
    async (route) => {
      const method = route.request().method();
      const urlStr = route.request().url();
      const procs = urlStr.split("?")[0].split("/trpc/")[1]?.split(",") ?? [];
      const isBatch = urlStr.includes("batch=1") || procs.length > 1;

      const results = procs.map((proc) => {
        if (proc === "billing.billingInfo") {
          return { result: { data: state.billingInfo } };
        }
        if (proc === "billing.removePaymentMethod" && method === "POST") {
          try {
            const body = route.request().postDataJSON();
            const id = body?.["0"]?.json?.id ?? body?.["0"]?.id;
            if (id) {
              state.billingInfo.paymentMethods = state.billingInfo.paymentMethods.filter(
                (pm) => pm.id !== id,
              );
            }
          } catch {
            // ignore
          }
          return { result: { data: null } };
        }
        if (proc === "billing.setDefaultPaymentMethod" && method === "POST") {
          try {
            const body = route.request().postDataJSON();
            const id = body?.["0"]?.json?.id ?? body?.["0"]?.id;
            if (id) {
              state.billingInfo.paymentMethods = state.billingInfo.paymentMethods.map((pm) => ({
                ...pm,
                isDefault: pm.id === id,
              }));
            }
          } catch {
            // ignore
          }
          return { result: { data: null } };
        }
        if (proc in TRPC_DEFAULTS) {
          return { result: { data: TRPC_DEFAULTS[proc] } };
        }
        return { result: { data: null } };
      });

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(isBatch ? results : results[0]),
      });
    },
  );

  // REST: catch-all for other billing REST routes (registered first = lowest LIFO priority)
  await page.route(
    (url) => url.href.includes(PLATFORM_BASE_URL) && url.pathname.includes("/api/billing/"),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      });
    },
  );

  // REST: setup-intent
  await page.route(`${PLATFORM_BASE_URL}/api/billing/setup-intent`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        clientSecret: "seti_test_mock_client_secret",
      }),
    });
  });

  // REST: dividend stats
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

test.describe("Payment Methods Page", () => {
  test("payment page loads and shows existing payment methods", async ({ authedPage: page }) => {
    const state = createMockState();
    await mockPaymentAPI(page, state);

    await page.goto("/billing/payment");

    await expect(page.getByRole("heading", { name: "Payment" })).toBeVisible();
    await expect(page.getByText("Payment Methods").first()).toBeVisible();

    // Both cards visible
    await expect(page.getByText("**** **** **** 4242").first()).toBeVisible();
    await expect(page.getByText("**** **** **** 5555").first()).toBeVisible();

    // Default badge on visa
    await expect(page.getByText("Default").first()).toBeVisible();

    // Set as default button on non-default card
    await expect(page.getByRole("button", { name: "Set as default" })).toBeVisible();

    // Two Remove buttons
    await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(2);

    // Add payment method button
    await expect(page.getByRole("button", { name: "Add payment method" })).toBeVisible();
  });

  test("set a non-default card as default", async ({ authedPage: page }) => {
    const state = createMockState();
    await mockPaymentAPI(page, state);

    await page.goto("/billing/payment");
    await expect(page.getByText("**** **** **** 5555").first()).toBeVisible();

    await page.getByRole("button", { name: "Set as default" }).click();

    // After optimistic update, the mastercard row should now have the Default badge
    // and the visa row should have the "Set as default" button
    await expect(page.getByRole("button", { name: "Set as default" })).toBeVisible({
      timeout: 5000,
    });

    // The Default badge should now be near the mastercard (5555)
    const mc5555 = page.getByText("**** **** **** 5555").first();
    await expect(mc5555).toBeVisible();
  });

  test("remove a payment method", async ({ authedPage: page }) => {
    const state = createMockState();
    await mockPaymentAPI(page, state);

    await page.goto("/billing/payment");
    await expect(page.getByText("**** **** **** 5555").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(2);

    // Remove the second card (mastercard)
    await page.getByRole("button", { name: "Remove" }).nth(1).click();

    // Mastercard should disappear
    await expect(page.getByText("**** **** **** 5555").first()).not.toBeVisible({ timeout: 5000 });

    // Only 1 Remove button remains
    await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(1);
  });

  test("add payment method dialog opens and shows Stripe Elements", async ({
    authedPage: page,
  }) => {
    test.skip(
      !process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
      "Requires NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY to load Stripe.js",
    );

    const state = createMockState();
    await mockPaymentAPI(page, state);

    await page.goto("/billing/payment");
    await expect(page.getByRole("button", { name: "Add payment method" })).toBeVisible();

    await page.getByRole("button", { name: "Add payment method" }).click();

    // Dialog should appear
    await expect(page.getByRole("heading", { name: "Add payment method" })).toBeVisible({
      timeout: 10000,
    });

    // Trust badges
    await expect(page.getByText("256-bit SSL")).toBeVisible();
    await expect(page.getByText("PCI compliant")).toBeVisible();

    // Stripe iframe should load
    const stripeFrame = page.frameLocator(
      'iframe[src*="js.stripe.com"], iframe[name*="__privateStripeFrame"]',
    );
    await expect(
      stripeFrame.first().locator('[name="number"], [name="cardNumber"], input').first(),
    ).toBeVisible({ timeout: 15000 });

    // Cancel closes dialog
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("heading", { name: "Add payment method" })).not.toBeVisible({
      timeout: 5000,
    });
  });

  test("empty state shows no-payment-methods message", async ({ authedPage: page }) => {
    const state = createMockState();
    state.billingInfo.paymentMethods = [];
    await mockPaymentAPI(page, state);

    await page.goto("/billing/payment");

    await expect(page.getByText("No payment methods on file.").first()).toBeVisible();
  });

  test("error state shows retry button", async ({ authedPage: page }) => {
    // Mock billing.billingInfo to return an error
    await page.route(
      (url) => url.href.includes(PLATFORM_BASE_URL) && url.pathname.startsWith("/trpc/"),
      async (route) => {
        const procs = route.request().url().split("?")[0].split("/trpc/")[1]?.split(",") ?? [];

        const results = procs.map((proc) => {
          if (proc === "billing.billingInfo") {
            return {
              error: {
                message: "Internal server error",
                code: -32603,
                data: { code: "INTERNAL_SERVER_ERROR" },
              },
            };
          }
          if (proc in TRPC_DEFAULTS) {
            return { result: { data: TRPC_DEFAULTS[proc] } };
          }
          return { result: { data: null } };
        });

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(results),
        });
      },
    );

    // REST mocks still needed for non-trpc routes
    await page.route(
      (url) => url.href.includes(PLATFORM_BASE_URL) && url.pathname.includes("/api/billing/"),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({}),
        });
      },
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

    await page.goto("/billing/payment");

    await expect(page.getByText("Failed to load billing information.").first()).toBeVisible({
      timeout: 10000,
    });

    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  });
});
