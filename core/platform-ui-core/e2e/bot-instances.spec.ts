import { expect, test } from "./fixtures/auth";
import { createFleetMockState, mockFleetAPI } from "./fixtures/fleet";

test.describe("Bot instance lifecycle", () => {
	test("create bot instance — fill name, submit, see success", async ({ authedPage: page }) => {
		const state = createFleetMockState();
		await mockFleetAPI(page, state);

		await page.goto("/instances/new");

		// Wait for plugin registry to load
		await expect(page.getByText("Loading plugins...")).not.toBeVisible({ timeout: 10000 });

		// Fill instance name
		await page.getByLabel("Instance Name").fill("test-bot-1");

		// Click Create Instance
		await page.getByRole("button", { name: "Create Instance" }).click();

		// Verify success interstitial
		await expect(page.getByText("Instance created")).toBeVisible({ timeout: 10000 });
		await expect(page.getByText("test-bot-1")).toBeVisible();

		// Click back to instances and verify it appears in the list
		await page.getByRole("link", { name: "Back to Instances" }).click();
		await page.waitForURL("**/instances");
		await expect(page.getByRole("link", { name: "test-bot-1" })).toBeVisible({ timeout: 10000 });
	});

	test("bot settings — update config and persist", async ({ authedPage: page }) => {
		const state = createFleetMockState();
		state.bots.push({
			id: "e2e-bot-settings",
			name: "settings-bot",
			state: "running",
			env: { SYSTEM_PROMPT: "You are a helpful bot." },
			uptime: new Date().toISOString(),
			createdAt: new Date().toISOString(),
			stats: { cpuPercent: 10, memoryUsageMb: 64, memoryLimitMb: 512, memoryPercent: 12.5 },
		});
		state.installedPlugins.set("e2e-bot-settings", []);
		await mockFleetAPI(page, state);

		// Navigate to instance detail, config tab
		await page.goto("/instances/e2e-bot-settings?tab=config");

		// Wait for config editor to load with current config
		const configTextarea = page.locator("#config-editor");
		await expect(configTextarea).toBeVisible({ timeout: 10000 });
		await expect(configTextarea).toContainText("SYSTEM_PROMPT", { timeout: 5000 });

		// Clear and update config
		await configTextarea.clear();
		await configTextarea.fill(JSON.stringify({ SYSTEM_PROMPT: "Updated prompt." }, null, 2));

		// Save
		await page.getByRole("button", { name: "Save Config" }).click();

		// Verify saved indicator
		await expect(page.getByText("Config saved")).toBeVisible({ timeout: 5000 });

		// Reload page and verify config persisted (stateful mock)
		await page.reload();
		await expect(configTextarea).toBeVisible({ timeout: 10000 });
		await expect(configTextarea).toContainText("Updated prompt.", { timeout: 5000 });
	});

	test("instance detail — header, status badge, overview metrics render", async ({ authedPage: page }) => {
		const state = createFleetMockState();
		state.bots.push({
			id: "e2e-bot-detail",
			name: "detail-bot",
			state: "running",
			env: {},
			uptime: new Date(Date.now() - 3600000).toISOString(),
			createdAt: new Date().toISOString(),
			stats: { cpuPercent: 25, memoryUsageMb: 256, memoryLimitMb: 512, memoryPercent: 50 },
		});
		state.installedPlugins.set("e2e-bot-detail", [
			{ pluginId: "discord", enabled: true },
		]);
		await mockFleetAPI(page, state);

		await page.goto("/instances/e2e-bot-detail");

		// Header: name and status badge
		await expect(page.getByRole("heading", { name: "detail-bot" })).toBeVisible({ timeout: 10000 });
		await expect(page.getByText("Running", { exact: true }).first()).toBeVisible();

		// Overview tab metric card titles (scoped to the overview tabpanel)
		const overview = page.getByRole("tabpanel", { name: "Overview" });
		await expect(overview.getByText("Status")).toBeVisible();
		await expect(overview.getByText("Uptime")).toBeVisible();
		await expect(overview.getByText("Memory")).toBeVisible();
		await expect(overview.getByText("CPU")).toBeVisible();
		await expect(overview.getByText("Plugins")).toBeVisible();
		await expect(overview.getByText("Channels")).toBeVisible();
		await expect(overview.getByText("Active Sessions")).toBeVisible();
		await expect(overview.getByText("Created")).toBeVisible();

		// Verify resource values render (from stats)
		await expect(overview.getByText("256 MB")).toBeVisible();
		await expect(overview.getByText("25%")).toBeVisible();
	});

	test("instance list — 3 instances with correct names and statuses", async ({ authedPage: page }) => {
		const state = createFleetMockState();
		const now = new Date().toISOString();
		state.bots.push(
			{ id: "bot-1", name: "alpha-bot", state: "running", env: {}, uptime: now, createdAt: now, stats: { cpuPercent: 5, memoryUsageMb: 64, memoryLimitMb: 512, memoryPercent: 12.5 } },
			{ id: "bot-2", name: "beta-bot", state: "exited", env: {}, uptime: now, createdAt: now, stats: null },
			{ id: "bot-3", name: "gamma-bot", state: "running", env: {}, uptime: now, createdAt: now, stats: { cpuPercent: 30, memoryUsageMb: 200, memoryLimitMb: 512, memoryPercent: 39 } },
		);
		await mockFleetAPI(page, state);

		await page.goto("/instances");

		// All 3 instance names visible as links
		await expect(page.getByRole("link", { name: "alpha-bot" })).toBeVisible({ timeout: 10000 });
		await expect(page.getByRole("link", { name: "beta-bot" })).toBeVisible();
		await expect(page.getByRole("link", { name: "gamma-bot" })).toBeVisible();

		// Status badges — "Running" should appear, "Stopped" should appear
		await expect(page.getByText("Running").first()).toBeVisible();
		await expect(page.getByText("Stopped")).toBeVisible();

		// Table rows: 3 data rows
		const rows = page.locator("tbody tr");
		await expect(rows).toHaveCount(3);
	});
});
