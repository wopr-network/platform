import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures/auth";

const PLATFORM_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? process.env.BASE_URL ?? "http://localhost:3001";

/**
 * Mock all dashboard API endpoints.
 *
 * The authedPage fixture already mocks auth + org tRPC procedures.
 * This adds fleet, activity, resources, and dividend mocks.
 * Because authedPage registers a catch-all 503 fallback with LOWEST priority,
 * our specific routes registered here take priority (Playwright LIFO).
 */
async function mockDashboardAPI(
	page: Page,
	opts: {
		bots: Array<{
			id: string;
			name: string;
			state: string;
			health: string | null;
			stats: {
				cpuPercent: number;
				memoryUsageMb: number;
				memoryLimitMb: number;
				memoryPercent: number;
			} | null;
		}>;
		activity?: Array<{
			id: string;
			timestamp: string;
			actor: string;
			action: string;
			target: string;
			targetHref: string;
		}>;
		resources?: {
			totalCpuPercent: number;
			totalMemoryMb: number;
			memoryCapacityMb: number;
		};
	},
) {
	// Known tRPC procedure responses (fleet + org + pageContext + billing)
	const DASHBOARD_TRPC_MOCKS: Record<string, unknown> = {
		"fleet.listInstances": { bots: opts.bots },
		"org.getOrganization": {
			id: "e2e-org-id",
			name: "E2E Test Org",
			slug: "e2e-test-org",
			billingEmail: "e2e@wopr.test",
			members: [{ userId: "e2e-user-id", role: "admin", email: "e2e@wopr.test" }],
			invites: [],
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
		"billing.creditsBalance": {
			balance_cents: 5000,
			daily_burn_cents: 100,
			runway_days: 50,
		},
		"billing.accountStatus": {
			status: "active",
			status_reason: null,
			grace_deadline: null,
		},
		"billing.usageSummary": {
			period_start: new Date().toISOString(),
			period_end: new Date().toISOString(),
			total_spend_cents: 0,
			plan_name: "Free",
		},
	};

	// Batch-aware tRPC handler — intercept ALL tRPC requests to the platform
	await page.route(
		(url) =>
			url.href.includes(PLATFORM_BASE_URL) && url.pathname.startsWith("/trpc/"),
		async (route) => {
			const procs =
				route.request().url().split("?")[0].split("/trpc/")[1]?.split(",") ?? [];
			const unknownProcs = procs.filter((proc) => !(proc in DASHBOARD_TRPC_MOCKS));
			if (unknownProcs.length > 0) {
				await route.fulfill({
					status: 503,
					contentType: "application/json",
					body: JSON.stringify({ error: `Unmocked tRPC procedures: ${unknownProcs.join(", ")}` }),
				});
				return;
			}
			const results = procs.map((proc) => ({
				result: {
					data: DASHBOARD_TRPC_MOCKS[proc],
				},
			}));
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(results),
			});
		},
	);

	// REST: GET /api/activity
	await page.route(
		(url) =>
			url.href.includes(PLATFORM_BASE_URL) && url.pathname === "/api/activity",
		async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(opts.activity ?? []),
			});
		},
	);

	// REST: GET /api/fleet/resources
	await page.route(
		(url) =>
			url.href.includes(PLATFORM_BASE_URL) &&
			url.pathname === "/api/fleet/resources",
		async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(
					opts.resources ?? {
						totalCpuPercent: 0,
						totalMemoryMb: 0,
						memoryCapacityMb: 2048,
					},
				),
			});
		},
	);

	// REST: GET /api/billing/dividend/stats — return empty/ineligible
	await page.route(
		(url) =>
			url.href.includes(PLATFORM_BASE_URL) &&
			url.pathname === "/api/billing/dividend/stats",
		async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					pool_cents: 0,
					active_users: 0,
					per_user_cents: 0,
					next_distribution_at: new Date().toISOString(),
					user_eligible: false,
					user_last_purchase_at: null,
					user_window_expires_at: null,
				}),
			});
		},
	);

	// SSE: /fleet/events — return empty response to prevent hanging
	await page.route(
		(url) =>
			url.href.includes(PLATFORM_BASE_URL) &&
			url.pathname.includes("/fleet/events"),
		async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "text/event-stream",
				body: "",
			});
		},
	);
}

test.describe("Dashboard: Command Center", () => {
	test("dashboard with active bot shows status, health, and activity", async ({
		authedPage: page,
	}) => {
		await mockDashboardAPI(page, {
			bots: [
				{
					id: "bot-1",
					name: "my-test-bot",
					state: "running",
					health: "healthy",
					stats: {
						cpuPercent: 25,
						memoryUsageMb: 512,
						memoryLimitMb: 2048,
						memoryPercent: 25,
					},
				},
			],
			activity: [
				{
					id: "evt-1",
					timestamp: new Date().toISOString(),
					actor: "system",
					action: "started",
					target: "my-test-bot",
					targetHref: "/instances/bot-1",
				},
			],
			resources: {
				totalCpuPercent: 25,
				totalMemoryMb: 512,
				memoryCapacityMb: 2048,
			},
		});

		await page.goto("/dashboard");

		// Verify Command Center heading renders
		await expect(
			page.getByRole("heading", { name: "Command Center" }),
		).toBeVisible();

		// Verify Running count card shows 1
		await expect(page.getByTestId("running-count").first()).toBeVisible();
		await expect(page.getByTestId("running-count").first()).toContainText("1", {
			timeout: 5000,
		});

		// Verify Stopped count is 0
		await expect(page.getByTestId("stopped-count").first()).toContainText("0", {
			timeout: 5000,
		});

		// Verify bot card renders with name and running status
		await expect(page.getByText("my-test-bot").first()).toBeVisible();
		await expect(page.getByText("running").first()).toBeVisible();

		// Verify Recent Activity section renders with the event
		await expect(page.getByText("Recent Activity").first()).toBeVisible();
		await expect(page.getByText("started").first()).toBeVisible();

		// Verify Resources card shows CPU and memory values
		await expect(page.getByRole("main").getByTestId("cpu-usage")).toBeVisible();
		await expect(page.getByRole("main").getByTestId("memory-usage")).toBeVisible();
	});

	test("dashboard with no bots shows empty state", async ({
		authedPage: page,
	}) => {
		await mockDashboardAPI(page, {
			bots: [],
			activity: [],
		});

		await page.goto("/dashboard");

		// Verify Command Center heading
		await expect(
			page.getByRole("heading", { name: "Command Center" }),
		).toBeVisible();

		// Verify all status counts are 0
		await expect(page.getByTestId("running-count").first()).toContainText("0", {
			timeout: 5000,
		});
		await expect(page.getByTestId("stopped-count").first()).toContainText("0", {
			timeout: 5000,
		});
		await expect(page.getByTestId("degraded-count").first()).toContainText("0", {
			timeout: 5000,
		});

		// Verify no bot cards
		await expect(page.getByText("my-test-bot").first()).not.toBeVisible();

		// Verify activity empty state
		await expect(page.getByText("STANDING BY").first()).toBeVisible();
		await expect(page.getByText("NO EVENTS LOGGED").first()).toBeVisible();

		// Resources card still renders
		await expect(page.getByRole("main").getByTestId("cpu-usage")).toBeVisible();
	});

	test("dashboard with offline bot shows stopped status", async ({
		authedPage: page,
	}) => {
		await mockDashboardAPI(page, {
			bots: [
				{
					id: "bot-2",
					name: "offline-bot",
					state: "stopped",
					health: null,
					stats: null,
				},
			],
		});

		await page.goto("/dashboard");

		// Verify Command Center heading
		await expect(
			page.getByRole("heading", { name: "Command Center" }),
		).toBeVisible();

		// Verify Running is 0, Stopped is 1
		await expect(page.getByTestId("running-count").first()).toContainText("0", {
			timeout: 5000,
		});
		await expect(page.getByTestId("stopped-count").first()).toContainText("1", {
			timeout: 5000,
		});

		// Verify bot card renders with name and stopped status
		await expect(page.getByText("offline-bot").first()).toBeVisible();
		await expect(page.getByText("stopped").first()).toBeVisible();
	});
});
