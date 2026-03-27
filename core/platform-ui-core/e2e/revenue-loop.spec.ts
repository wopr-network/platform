import { bypassOnboarding, expect, mockAuthAPI, test } from "./fixtures/auth";
import { createFleetMockState, mockFleetAPI } from "./fixtures/fleet";

test.describe("Core revenue loop", () => {
	test("create bot -> install plugin -> plugin active", async ({ page }) => {
		const state = createFleetMockState();

		// Set up all API mocks
		await mockAuthAPI(page);
		await mockFleetAPI(page, state);

		// Login
		await page.goto("/login?callbackUrl=/marketplace");
		await bypassOnboarding(page);
		await page.getByLabel("Email").fill("e2e@wopr.test");
		await page.getByLabel("Password").fill("TestPassword123!");
		await page.getByRole("button", { name: "Sign in" }).click();
		await page.waitForURL("**/marketplace");

		// Create a bot instance
		await page.goto("/instances/new");
		await page.getByLabel("Instance Name").fill("e2e-test-bot");
		await page.getByRole("button", { name: "Create Instance" }).click();

		await expect(page.getByText("Instance created")).toBeVisible({ timeout: 10000 });
		await expect(page.getByText("e2e-test-bot")).toBeVisible();

		// Navigate to Discord plugin detail and start install
		await page.goto("/marketplace/discord");
		await expect(page.getByRole("heading", { name: "Discord" })).toBeVisible({ timeout: 10000 });

		await page.getByRole("button", { name: "Give my bot this superpower" }).click();

		// Install wizard: bot-select phase
		await expect(
			page.getByText("Select which bot to install this plugin on").first(),
		).toBeVisible({ timeout: 5000 });
		await page.getByRole("button", { name: /e2e-test-bot/ }).click();
		await page.getByRole("button", { name: "Continue" }).click();

		// Setup phase (Discord has 1 step with empty fields) -> just click Continue
		await page.getByRole("button", { name: "Continue" }).click();

		// Complete phase
		await expect(page.getByText("Plugin installed successfully")).toBeVisible({
			timeout: 15000,
		});
		await page.getByRole("button", { name: "Done" }).click();

		// Verify plugin appears active on /plugins page
		await page.goto("/plugins");
		await expect(page.getByText("e2e-test-bot").first()).toBeVisible({ timeout: 10000 });
		await expect(page.getByText("Discord").first()).toBeVisible({ timeout: 5000 });
		await expect(page.getByText("Active").first()).toBeVisible();
	});
});
