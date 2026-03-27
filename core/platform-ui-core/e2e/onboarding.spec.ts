import { expect, type Page } from "@playwright/test";
import { mockAuthAPI, test } from "./fixtures/auth";

/** Set up an authenticated page with onboarding NOT completed. */
async function setupFreshUser(page: Page) {
	await mockAuthAPI(page);

	await page.context().addCookies([
		{
			name: "better-auth.session_token",
			value: "e2e-onboarding-session",
			domain: "localhost",
			path: "/",
			httpOnly: true,
			sameSite: "Lax" as const,
			secure: false,
			expires: Math.floor(Date.now() / 1000) + 86400,
		},
	]);

	// Navigate to establish origin, then clear onboarding state
	await page.goto("/onboarding");
	await page.evaluate(() => {
		localStorage.removeItem("platform-onboarding-complete");
		localStorage.removeItem("platform-onboarding");
	});
}

test.describe("Onboarding wizard", () => {
	test("complete onboarding — happy path", async ({ page }) => {
		await setupFreshUser(page);
		await page.goto("/onboarding");

		// Step 0: Name your WOPR
		await expect(
			page.locator('[data-onboarding-id="onboarding.name-bot"]').first(),
		).toBeVisible();
		await page
			.locator('[data-onboarding-id="onboarding.name-bot"]')
			.first()
			.fill("TestBot");
		await page
			.locator('[data-onboarding-id="onboarding.continue.name"]')
			.first()
			.click();

		// Step 1: Pick a preset
		await expect(
			page
				.locator(
					'[data-onboarding-id="onboarding.select-preset.discord-ai-bot"]',
				)
				.first(),
		).toBeVisible();
		await page
			.locator(
				'[data-onboarding-id="onboarding.select-preset.discord-ai-bot"]',
			)
			.first()
			.click();
		await page
			.locator('[data-onboarding-id="onboarding.continue.preset"]')
			.first()
			.click();

		// Step 2: Launch
		await expect(
			page.locator('[data-onboarding-id="onboarding.launch"]').first(),
		).toBeVisible();
		await expect(page.getByText("TestBot").first()).toBeVisible();
		await expect(page.getByText("Discord AI Bot").first()).toBeVisible();
		await page
			.locator('[data-onboarding-id="onboarding.launch"]')
			.first()
			.click();

		// Should redirect to /marketplace
		await page.waitForURL("**/marketplace");
		await expect(page).toHaveURL(/\/marketplace/);

		// Verify onboarding is marked complete — revisiting should redirect
		await page.goto("/onboarding");
		await page.waitForURL("**/marketplace");
		await expect(page).toHaveURL(/\/marketplace/);
	});

	test("skip onboarding — lands on marketplace", async ({ page }) => {
		await setupFreshUser(page);
		await page.goto("/onboarding");

		// Step 0 should be visible
		await expect(
			page.locator('[data-onboarding-id="onboarding.name-bot"]').first(),
		).toBeVisible();

		// Click "Skip setup"
		await page.getByRole("button", { name: "Skip setup" }).click();

		// Should redirect to /marketplace
		await page.waitForURL("**/marketplace");
		await expect(page).toHaveURL(/\/marketplace/);

		// Verify onboarding is marked complete
		await page.goto("/onboarding");
		await page.waitForURL("**/marketplace");
		await expect(page).toHaveURL(/\/marketplace/);
	});

	test("partial completion — resume from last step", async ({ page }) => {
		await setupFreshUser(page);
		await page.goto("/onboarding");

		// Step 0: Name your WOPR
		await expect(
			page.locator('[data-onboarding-id="onboarding.name-bot"]').first(),
		).toBeVisible();
		await page
			.locator('[data-onboarding-id="onboarding.name-bot"]')
			.first()
			.fill("ResumeBot");
		await page
			.locator('[data-onboarding-id="onboarding.continue.name"]')
			.first()
			.click();

		// Step 1 should now be visible
		await expect(
			page
				.locator(
					'[data-onboarding-id="onboarding.select-preset.discord-ai-bot"]',
				)
				.first(),
		).toBeVisible();

		// Navigate away WITHOUT completing step 1
		await page.goto("/marketplace");

		// Return to onboarding — should resume at step 1 (not step 0)
		await page.goto("/onboarding");

		// Step 1 (preset selection) should be visible, NOT step 0 (name input)
		await expect(
			page
				.locator(
					'[data-onboarding-id="onboarding.select-preset.discord-ai-bot"]',
				)
				.first(),
		).toBeVisible();
		await expect(
			page.locator('[data-onboarding-id="onboarding.name-bot"]').first(),
		).not.toBeVisible();

		// Complete from here: select preset and launch
		await page
			.locator(
				'[data-onboarding-id="onboarding.select-preset.discord-ai-bot"]',
			)
			.first()
			.click();
		await page
			.locator('[data-onboarding-id="onboarding.continue.preset"]')
			.first()
			.click();

		// Step 2: Verify bot name was preserved from earlier
		await expect(
			page.locator('[data-onboarding-id="onboarding.launch"]').first(),
		).toBeVisible();
		await expect(page.getByText("ResumeBot").first()).toBeVisible();
		await page
			.locator('[data-onboarding-id="onboarding.launch"]')
			.first()
			.click();

		// Should redirect to /marketplace
		await page.waitForURL("**/marketplace");
		await expect(page).toHaveURL(/\/marketplace/);
	});
});
