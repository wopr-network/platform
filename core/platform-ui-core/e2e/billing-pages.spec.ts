import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/auth";
import { pricingData } from "../src/lib/pricing-data";

const MOCK_ORG = {
  id: "e2e-org-id",
  name: "E2E Test Org",
  slug: "e2e-test-org",
  billingEmail: "e2e@wopr.test",
  members: [{ userId: "e2e-user-id", role: "admin", email: "e2e@wopr.test" }],
  invites: [],
};

/**
 * Base tRPC mocks shared across all billing page tests.
 * Layout requires billing.inferenceMode; most pages need org context.
 */
const BASE_TRPC_MOCKS: Record<string, unknown> = {
  "billing.inferenceMode": { mode: "hosted" },
  "billing.accountStatus": { status: "active", status_reason: null, grace_deadline: null },
  "billing.creditsBalance": { balance_cents: 5000, daily_burn_cents: 100, runway_days: 50 },
  "billing.currentPlan": { tier: "free" },
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
 * Register a batch-aware tRPC handler that merges page-specific mocks
 * with the base mocks. Also registers the billing REST API fallback.
 */
async function mockBillingPageAPI(page: Page, pageMocks: Record<string, unknown> = {}) {
  const allMocks = { ...BASE_TRPC_MOCKS, ...pageMocks };

  await page.route(
    (url) => url.pathname.startsWith("/trpc/"),
    async (route) => {
      const procs = route.request().url().split("?")[0].split("/trpc/")[1]?.split(",") ?? [];
      const results = procs.map((proc) => {
        if (!(proc in allMocks)) {
          throw new Error(`[mockBillingPageAPI] Unhandled tRPC procedure: ${proc}`);
        }
        return {
          result: {
            data: allMocks[proc],
          },
        };
      });
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(results),
      });
    },
  );

  // REST fallback for billing API endpoints (dividend stats, etc.)
  await page.route("**/api/billing/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
test.describe("Billing Pages", () => {
  test("referrals page shows referral link and stats", async ({ authedPage: page }) => {
    await mockBillingPageAPI(page, {
      "billing.affiliateStats": {
        referral_code: "WOPR-E2E-REF",
        referral_url: "https://wopr.ai/r/WOPR-E2E-REF",
        total_referred: 7,
        total_converted: 3,
        total_earned_cents: 1500,
      },
      "billing.affiliateReferrals": {
        referrals: [
          {
            id: "ref-1",
            masked_email: "a***@gmail.com",
            joined_at: "2026-02-15T10:00:00Z",
            status: "matched",
            match_amount_cents: 500,
          },
          {
            id: "ref-2",
            masked_email: "b***@outlook.com",
            joined_at: "2026-03-01T08:00:00Z",
            status: "pending",
            match_amount_cents: null,
          },
        ],
        total: 2,
      },
    });

    await page.goto("/billing/referrals");

    // Page heading (rendered as h1 in AffiliateDashboard)
    await expect(page.getByRole("heading", { name: "Refer & Earn" }).first()).toBeVisible({
      timeout: 10000,
    });

    // Referral link displayed (referralUrl shown in monospace div)
    await expect(page.getByText("https://wopr.ai/r/WOPR-E2E-REF").first()).toBeVisible();

    // Copy and Share buttons
    await expect(page.getByRole("button", { name: "Copy" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Share" }).first()).toBeVisible();

    // Stats cards — friends referred, converted, earned
    await expect(page.getByText("7").first()).toBeVisible();
    await expect(page.getByText("friends referred").first()).toBeVisible();
    await expect(page.getByText("3").first()).toBeVisible();
    await expect(page.getByText("converted").first()).toBeVisible();
    // 1500 cents = $15.00
    await expect(page.getByText("$15.00").first()).toBeVisible();
    await expect(page.getByText("earned").first()).toBeVisible();

    // Recent referrals card title
    await expect(page.getByText("Recent referrals").first()).toBeVisible();

    // Referral rows
    await expect(page.getByText("a***@gmail.com").first()).toBeVisible();
    // 500 cents = $5.00
    await expect(page.getByText("$5.00").first()).toBeVisible();
    await expect(page.getByText("b***@outlook.com").first()).toBeVisible();
    await expect(page.getByText("pending").first()).toBeVisible();
  });

  test("hosted usage detail page shows event table", async ({ authedPage: page }) => {
    await mockBillingPageAPI(page, {
      "billing.hostedUsageEvents": [
        {
          id: "evt-1",
          date: "2026-03-05T14:30:00Z",
          capability: "text_gen",
          provider: "Anthropic",
          units: 500,
          unitLabel: "tokens",
          cost: 1.5,
        },
        {
          id: "evt-2",
          date: "2026-03-04T09:15:00Z",
          capability: "image_gen",
          provider: "Stability",
          units: 3,
          unitLabel: "images",
          cost: 0.15,
        },
        {
          id: "evt-3",
          date: "2026-03-03T18:00:00Z",
          capability: "transcription",
          provider: "OpenAI",
          units: 60,
          unitLabel: "seconds",
          cost: 0.02,
        },
      ],
    });

    await page.goto("/billing/usage/hosted");

    // Page heading
    await expect(page.getByRole("heading", { name: "Hosted Usage Detail" }).first()).toBeVisible({
      timeout: 10000,
    });

    // CardDescription shows event count
    await expect(page.getByText(/3 events/).first()).toBeVisible();

    // Table header sort buttons
    await expect(page.getByRole("button", { name: /Date/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Capability/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Provider/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Units/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Cost/ }).first()).toBeVisible();

    // Provider names in table rows
    await expect(page.getByText("Anthropic").first()).toBeVisible();
    await expect(page.getByText("Stability").first()).toBeVisible();
    await expect(page.getByText("OpenAI").first()).toBeVisible();

    // Capability badge labels
    await expect(page.getByText("Text Generation").first()).toBeVisible();
    await expect(page.getByText("Image Generation").first()).toBeVisible();
    await expect(page.getByText("Transcription").first()).toBeVisible();

    // Filter dropdown and Export CSV button
    await expect(page.getByRole("combobox").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Export CSV" }).first()).toBeVisible();
  });

  test("plans page shows pricing card with correct amounts", async ({ authedPage: page }) => {
    await mockBillingPageAPI(page);

    await page.goto("/billing/plans");

    // Page heading
    await expect(page.getByRole("heading", { name: "Your Plan" }).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(
      page.getByText("Simple pricing. No tiers. No gotchas.").first(),
    ).toBeVisible();

    // Plan card title (rendered as uppercase CardTitle, uses productName())
    await expect(page.getByText("Platform").first()).toBeVisible();

    // Price: from pricingData.bot_price
    await expect(page.getByText(`$${pricingData.bot_price.amount}`).first()).toBeVisible();
    await expect(page.getByText(new RegExp(`\\/${pricingData.bot_price.period}`)).first()).toBeVisible();
    await expect(page.getByText("per bot").first()).toBeVisible();

    // Features list (pricingData.signup_credit)
    await expect(page.getByText(`$${pricingData.signup_credit} signup credit included`).first()).toBeVisible();
    await expect(page.getByText("All channels").first()).toBeVisible();
    await expect(page.getByText("All plugins").first()).toBeVisible();
    await expect(page.getByText("All providers").first()).toBeVisible();

    // Billing note
    await expect(
      page.getByText("Usage is billed from credits at transparent per-use rates.").first(),
    ).toBeVisible();

    // Link to full pricing page
    await expect(page.getByRole("link", { name: "View full pricing" }).first()).toBeVisible();
  });
});
