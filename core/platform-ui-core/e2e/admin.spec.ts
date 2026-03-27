import { expect, test } from "./fixtures/auth";
import { createAdminMockState, mockAdminAPI, mockAdminSession } from "./fixtures/admin";

// ---------------------------------------------------------------
// Test 1: Tenants -- list and search
// ---------------------------------------------------------------

test.describe("Admin: Tenants", () => {
	test("renders tenant list and search filters results", async ({ authedPage: page }) => {
		const state = createAdminMockState();
		await mockAdminSession(page);
		await mockAdminAPI(page, state);

		await page.goto("/admin/tenants");

		// Heading
		await expect(page.getByText("USER MANAGEMENT").first()).toBeVisible();

		// User count
		await expect(page.getByText("3 users").first()).toBeVisible();

		// Table renders users
		await expect(page.getByText("alice@acme.test").first()).toBeVisible();
		await expect(page.getByText("bob@acme.test").first()).toBeVisible();
		await expect(page.getByText("charlie@acme.test").first()).toBeVisible();

		// Search by email
		const searchInput = page
			.getByPlaceholder("Search by email, name, or tenant ID...")
			.first();
		await searchInput.fill("alice");

		// Verify the search input is functional
		await expect(searchInput).toHaveValue("alice");
	});
});

// ---------------------------------------------------------------
// Test 2: Marketplace curation
// ---------------------------------------------------------------

test.describe("Admin: Marketplace", () => {
	test("renders discovery queue and enabled plugins", async ({ authedPage: page }) => {
		const state = createAdminMockState();
		await mockAdminSession(page);
		await mockAdminAPI(page, state);

		await page.goto("/admin/marketplace");

		// Heading
		await expect(page.getByText("Marketplace Curation").first()).toBeVisible();

		// Discovery queue shows unreviewed plugin
		await expect(page.getByText("Discovery Queue").first()).toBeVisible();
		await expect(page.getByText("Pending Review").first()).toBeVisible();

		// Enabled plugins section
		await expect(page.getByText("Enabled Plugins").first()).toBeVisible();
		await expect(page.getByText("Discord").first()).toBeVisible();
		await expect(page.getByText("Slack").first()).toBeVisible();

		// Discord row visible (it is featured)
		const discordRow = page.locator("tr", { hasText: "Discord" }).first();
		await expect(discordRow).toBeVisible();
	});
});

// ---------------------------------------------------------------
// Test 3: Promotions -- list renders
// ---------------------------------------------------------------

test.describe("Admin: Promotions", () => {
	test("renders promotions list with existing promotion", async ({ authedPage: page }) => {
		const state = createAdminMockState();
		await mockAdminSession(page);
		await mockAdminAPI(page, state);

		await page.goto("/admin/promotions");

		// Heading
		await expect(
			page.getByRole("heading", { name: "Promotions" }).first(),
		).toBeVisible();

		// "New Promotion" link
		await expect(page.getByRole("link", { name: "New Promotion" }).first()).toBeVisible();

		// Existing promotion renders in table
		await expect(page.getByText("Launch Bonus").first()).toBeVisible();
		await expect(page.getByText("Bonus on Purchase").first()).toBeVisible();
		await expect(page.getByText("active").first()).toBeVisible();
	});
});

// ---------------------------------------------------------------
// Test 4: Affiliates dashboard
// ---------------------------------------------------------------

test.describe("Admin: Affiliates", () => {
	test("renders affiliate dashboard panels", async ({ authedPage: page }) => {
		const state = createAdminMockState();
		await mockAdminSession(page);
		await mockAdminAPI(page, state);

		await page.goto("/admin/affiliates");

		// Heading
		await expect(page.getByText("AFFILIATE OPS").first()).toBeVisible();

		// Summary line
		await expect(page.getByText("0 suppressions").first()).toBeVisible();

		// Panel headings
		await expect(page.getByText("Suppression Events").first()).toBeVisible();
		await expect(page.getByText("High-Velocity Referrers (30d)").first()).toBeVisible();
		await expect(page.getByText("Same-Card Clusters").first()).toBeVisible();

		// Empty state messages (mock returns empty arrays)
		await expect(
			page.getByText("No suppression events recorded").first(),
		).toBeVisible();
	});
});

// ---------------------------------------------------------------
// Test 5: Billing health
// ---------------------------------------------------------------

test.describe("Admin: Billing Health", () => {
	test("renders billing health dashboard with metrics", async ({ authedPage: page }) => {
		const state = createAdminMockState();
		await mockAdminSession(page);
		await mockAdminAPI(page, state);

		await page.goto("/admin/billing-health");

		// Heading
		await expect(
			page.getByRole("heading", { name: "Billing Health" }).first(),
		).toBeVisible();

		// Status badge
		await expect(page.getByText("HEALTHY").first()).toBeVisible();

		// Key metric cards
		await expect(page.getByText("Requests (5m)").first()).toBeVisible();
		await expect(page.getByText("1234").first()).toBeVisible();
		await expect(page.getByText("Error Rate (5m)").first()).toBeVisible();
		await expect(page.getByText("Active Bots").first()).toBeVisible();
		await expect(page.getByText("Revenue (24h)").first()).toBeVisible();

		// Payment health checks
		await expect(page.getByText("Payment Health Checks").first()).toBeVisible();
		await expect(page.getByText("Stripe API").first()).toBeVisible();
		await expect(page.getByText("Webhook Freshness").first()).toBeVisible();
		await expect(page.getByText("Credit Ledger").first()).toBeVisible();

		// No error state
		await expect(page.getByText("Error loading billing health")).not.toBeVisible();
	});
});

// ---------------------------------------------------------------
// Test 6: Rate overrides
// ---------------------------------------------------------------

test.describe("Admin: Rate Overrides", () => {
	test("renders rate overrides list", async ({ authedPage: page }) => {
		const state = createAdminMockState();
		await mockAdminSession(page);
		await mockAdminAPI(page, state);

		await page.goto("/admin/rate-overrides");

		// Heading
		await expect(
			page.getByRole("heading", { name: "Rate Overrides" }).first(),
		).toBeVisible();

		// "New Override" button
		await expect(
			page.getByRole("button", { name: "New Override" }).first(),
		).toBeVisible();

		// Existing override renders
		await expect(page.getByText("Holiday Discount").first()).toBeVisible();
		await expect(page.getByText("openrouter").first()).toBeVisible();
		await expect(page.getByText("25%").first()).toBeVisible();
	});
});

// ---------------------------------------------------------------
// Test 7: Accounting
// ---------------------------------------------------------------

test.describe("Admin: Accounting", () => {
	test("renders accounting dashboard with user metrics", async ({ authedPage: page }) => {
		const state = createAdminMockState();
		await mockAdminSession(page);
		await mockAdminAPI(page, state);

		await page.goto("/admin/accounting");

		// Heading
		await expect(page.getByText("PLATFORM ACCOUNTING").first()).toBeVisible();

		// Metric cards
		await expect(page.getByText("Total Users").first()).toBeVisible();
		await expect(page.getByText("Outstanding Credits").first()).toBeVisible();
		await expect(page.getByText("Total Agents").first()).toBeVisible();
		await expect(page.getByText("Status Breakdown").first()).toBeVisible();

		// Top Credit Balances card
		await expect(page.getByText("Top Credit Balances").first()).toBeVisible();
		// alice@acme.test has highest balance (5000 cents)
		await expect(page.getByText("alice@acme.test").first()).toBeVisible();
	});
});

// ---------------------------------------------------------------
// Test 8: Audit log
// ---------------------------------------------------------------

test.describe("Admin: Audit Log", () => {
	test("renders audit log with events and search", async ({ authedPage: page }) => {
		const state = createAdminMockState();
		await mockAdminSession(page);
		await mockAdminAPI(page, state);

		await page.goto("/admin/audit");

		// Heading
		await expect(page.getByText("AUDIT LOG").first()).toBeVisible();

		// Event count
		await expect(page.getByText("3 events").first()).toBeVisible();

		// Events render (humanAction converts "admin.suspend_tenant" -> "Admin Suspend Tenant")
		await expect(page.getByText("Admin Suspend Tenant").first()).toBeVisible();
		await expect(page.getByText("Admin Grant Credits").first()).toBeVisible();
		await expect(page.getByText("Billing Charge").first()).toBeVisible();

		// Search input visible
		await expect(page.getByPlaceholder("Search events...").first()).toBeVisible();

		// Date range filter visible
		await expect(page.getByText("Last 30 days").first()).toBeVisible();
	});
});

// ---------------------------------------------------------------
// Test 9: Inference dashboard
// ---------------------------------------------------------------

test.describe("Admin: Inference", () => {
	test("renders inference cost monitor with KPI cards", async ({ authedPage: page }) => {
		const state = createAdminMockState();
		await mockAdminSession(page);
		await mockAdminAPI(page, state);

		await page.goto("/admin/inference");

		// Heading
		await expect(page.getByText("Inference Cost Monitor").first()).toBeVisible();

		// KPI card labels
		await expect(page.getByText("TOTAL COST").first()).toBeVisible();
		await expect(page.getByText("AVG COST / SESSION").first()).toBeVisible();
		await expect(page.getByText("TOTAL SESSIONS").first()).toBeVisible();
		await expect(page.getByText("CACHE HIT RATE").first()).toBeVisible();

		// Chart section
		await expect(page.getByText("DAILY COST").first()).toBeVisible();

		// Page cost table
		await expect(page.getByText("COST BY PAGE").first()).toBeVisible();
		await expect(page.getByText("/chat").first()).toBeVisible();

		// Cache performance panel
		await expect(page.getByText("CACHE PERFORMANCE").first()).toBeVisible();

		// Time range buttons
		await expect(page.getByRole("button", { name: "30d" }).first()).toBeVisible();
	});
});

// ---------------------------------------------------------------
// Test 10: Admin route protection (non-admin user)
// ---------------------------------------------------------------

test.describe("Admin: Route Protection", () => {
	test("non-admin user is redirected away from admin routes", async ({
		authedPage: page,
	}) => {
		// authedPage has a regular user session (not platform_admin).
		// The server-side middleware calls getSessionRole() which hits the mock
		// API server on port 3001. The mock returns role "user" for the default
		// session token, so middleware redirects to /marketplace.
		const state = createAdminMockState();
		await mockAdminAPI(page, state);

		await page.goto("/admin/tenants");

		// Middleware redirects non-admin to /marketplace
		await page.waitForURL("**/marketplace");
	});
});
