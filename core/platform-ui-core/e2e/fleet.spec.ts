import { expect, test } from "./fixtures/auth";
import { createFleetMockState, mockFleetAPI } from "./fixtures/fleet";

test.describe("Fleet overview and health", () => {
	test("fleet overview redirects to /fleet/health and lists instances with status indicators", async ({
		authedPage: page,
	}) => {
		const state = createFleetMockState();
		const now = new Date().toISOString();
		state.bots.push(
			{
				id: "fleet-bot-1",
				name: "alpha-unit",
				state: "running",
				env: {},
				uptime: new Date(Date.now() - 7200000).toISOString(),
				createdAt: now,
				stats: { cpuPercent: 15, memoryUsageMb: 128, memoryLimitMb: 512, memoryPercent: 25 },
			},
			{
				id: "fleet-bot-2",
				name: "beta-unit",
				state: "running",
				env: {},
				uptime: new Date(Date.now() - 3600000).toISOString(),
				createdAt: now,
				stats: { cpuPercent: 30, memoryUsageMb: 256, memoryLimitMb: 512, memoryPercent: 50 },
			},
			{
				id: "fleet-bot-3",
				name: "gamma-unit",
				state: "exited",
				env: {},
				uptime: now,
				createdAt: now,
				stats: null,
			},
		);
		await mockFleetAPI(page, state);

		// Navigate to /fleet — should redirect to /fleet/health
		await page.goto("/fleet");
		await page.waitForURL("**/fleet/health");

		// Verify heading
		await expect(
			page.getByRole("heading", { name: "Fleet Health" }),
		).toBeVisible({ timeout: 10000 });

		// Verify aggregate instance count: 3 instances
		await expect(page.getByRole("main").getByText(/^3$/).first()).toBeVisible({ timeout: 5000 });
		await expect(page.getByText("instances").first()).toBeVisible();

		// Verify running count label appears (status bar shows "running" beside emerald dot)
		await expect(page.getByText("running").first()).toBeVisible();

		// Verify all 3 instance names render as cards
		await expect(page.getByText("alpha-unit").first()).toBeVisible();
		await expect(page.getByText("beta-unit").first()).toBeVisible();
		await expect(page.getByText("gamma-unit").first()).toBeVisible();

		// alpha-unit and beta-unit are running -> "Healthy"; gamma-unit is exited -> "Degraded"
		// Use locator('span') with exact regex to match only the badge spans, not parent containers
		await expect(page.getByRole("main").locator("span", { hasText: /^Healthy$/ })).toHaveCount(2);
		await expect(page.getByRole("main").locator("span", { hasText: /^Degraded$/ })).toHaveCount(1);

		// Verify card metric column headers render
		await expect(page.getByText("Uptime").first()).toBeVisible();
	});

	test("fleet health page shows ALL SYSTEMS NOMINAL when all instances are healthy", async ({
		authedPage: page,
	}) => {
		const state = createFleetMockState();
		const now = new Date().toISOString();
		state.bots.push(
			{
				id: "healthy-bot-1",
				name: "sentinel-one",
				state: "running",
				env: {},
				uptime: new Date(Date.now() - 86400000).toISOString(),
				createdAt: now,
				stats: { cpuPercent: 10, memoryUsageMb: 64, memoryLimitMb: 512, memoryPercent: 12.5 },
			},
			{
				id: "healthy-bot-2",
				name: "sentinel-two",
				state: "running",
				env: {},
				uptime: new Date(Date.now() - 43200000).toISOString(),
				createdAt: now,
				stats: { cpuPercent: 20, memoryUsageMb: 128, memoryLimitMb: 512, memoryPercent: 25 },
			},
		);
		await mockFleetAPI(page, state);

		await page.goto("/fleet/health");

		// Verify heading
		await expect(
			page.getByRole("heading", { name: "Fleet Health" }),
		).toBeVisible({ timeout: 10000 });

		// Verify ALL SYSTEMS NOMINAL banner (rendered when all instances are healthy)
		await expect(
			page.getByText("ALL SYSTEMS NOMINAL").first(),
		).toBeVisible({ timeout: 5000 });

		// Verify both instance cards render
		await expect(page.getByText("sentinel-one").first()).toBeVisible();
		await expect(page.getByText("sentinel-two").first()).toBeVisible();

		// Verify instance count shows 2
		await expect(page.getByRole("main").getByText(/^2$/).first()).toBeVisible();

		// Verify no degraded or unhealthy indicators
		await expect(page.getByRole("main").locator("span", { hasText: /^Degraded$/ })).toHaveCount(0);
		await expect(page.getByRole("main").locator("span", { hasText: /^Unhealthy$/ })).toHaveCount(0);

		// Verify health card metric columns render (scoped to main to avoid sidebar nav "Plugins" match)
		await expect(page.getByRole("main").getByText("Plugins").first()).toBeVisible();
		await expect(page.getByRole("main").getByText("Sessions").first()).toBeVisible();
	});

	test("fleet health page shows empty state when no instances deployed", async ({
		authedPage: page,
	}) => {
		const state = createFleetMockState();
		// No bots pushed — state.bots is empty
		await mockFleetAPI(page, state);

		await page.goto("/fleet/health");

		// Verify heading
		await expect(
			page.getByRole("heading", { name: "Fleet Health" }),
		).toBeVisible({ timeout: 10000 });

		// Verify empty state message (renders as "> FLEET EMPTY. NO PLATFORM UNITS DEPLOYED.")
		await expect(
			page.getByText("FLEET EMPTY").first(),
		).toBeVisible({ timeout: 5000 });
		await expect(
			page.getByText("NO PLATFORM UNITS DEPLOYED").first(),
		).toBeVisible();

		// Verify "Deploy your first instance" CTA link points to /instances/new
		// Fleet health uses a single grid (no dual DOM) — link renders once
		const deployLink = page.getByRole("link", { name: "Deploy your first instance" });
		await expect(deployLink).toHaveCount(1);
		await expect(deployLink.first()).toHaveAttribute("href", "/instances/new");

		// Verify no instance cards or system nominal banner
		await expect(page.getByRole("main").locator("span", { hasText: /^Healthy$/ })).toHaveCount(0);
		await expect(page.getByRole("main").getByText("ALL SYSTEMS NOMINAL")).toHaveCount(0);
	});
});
