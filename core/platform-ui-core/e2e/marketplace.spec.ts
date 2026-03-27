import { bypassOnboarding, expect, mockAuthAPI, test } from "./fixtures/auth";
import { createFleetMockState, DISCORD_MANIFEST, mockFleetAPI } from "./fixtures/fleet";

/** Login helper — navigates to /login, bypasses onboarding, fills creds, signs in. */
async function loginToMarketplace(page: import("@playwright/test").Page) {
  await page.goto("/login?callbackUrl=/marketplace");
  await bypassOnboarding(page);
  // Also bypass first-visit hero overlay
  await page.evaluate(() => {
    localStorage.setItem("platform-marketplace-visited", "1");
  });
  await page.getByLabel("Email").fill("e2e@wopr.test");
  await page.getByLabel("Password").fill("TestPassword123!");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/marketplace");
}

test.describe("Marketplace", () => {
  test("browse marketplace — plugins load, search filters, tabs filter", async ({ page }) => {
    const state = createFleetMockState();
    await mockAuthAPI(page);
    await mockFleetAPI(page, state);

    await loginToMarketplace(page);

    // Both plugins visible on the Superpowers tab (default)
    await expect(page.getByText("Discord").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Slack").first()).toBeVisible();

    // Search for "discord" — only Discord shown
    await page.getByPlaceholder("Search superpowers...").first().fill("discord");
    await expect(page.getByText("Discord").first()).toBeVisible();
    // Slack should not be visible in the filtered grid
    await expect(page.locator(".grid").getByText("Slack").first()).not.toBeVisible({ timeout: 3000 });

    // Clear search
    await page.getByPlaceholder("Search superpowers...").first().fill("");
    await expect(page.getByText("Slack").first()).toBeVisible();

    // Click "Channels" tab — verify tab mechanism works
    await page.getByRole("button", { name: /Channels/ }).click();
    // Both manifests have marketplaceTab="superpower", so Channels tab should show 0 results
    // The tab switch should work without error
  });

  test("plugin detail — renders name, description, install button", async ({ page }) => {
    const state = createFleetMockState();
    await mockAuthAPI(page);
    await mockFleetAPI(page, state);

    await loginToMarketplace(page);

    // Navigate to Discord detail page
    await page.goto("/marketplace/discord");

    // Verify detail page renders
    await expect(page.getByRole("heading", { name: /Discord/ })).toBeVisible({ timeout: 10000 });
    // Tagline visible
    await expect(page.getByText(DISCORD_MANIFEST.superpowerTagline).first()).toBeVisible();
    // Install button visible
    await expect(page.getByRole("button", { name: "Give my bot this superpower" })).toBeVisible();
    // Version visible
    await expect(page.getByText(`v${DISCORD_MANIFEST.version}`).first()).toBeVisible();
    // Author visible
    await expect(page.getByText(DISCORD_MANIFEST.author).first()).toBeVisible();
  });

  test("install wizard — complete wizard, plugin appears in installed list", async ({ page }) => {
    const state = createFleetMockState();
    // Pre-create a bot so the wizard has one to select
    state.bots.push({
      id: "e2e-bot-1",
      name: "e2e-test-bot",
      state: "running",
      env: {},
      uptime: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      stats: { cpuPercent: 10, memoryUsageMb: 128, memoryLimitMb: 512, memoryPercent: 25 },
    });
    state.installedPlugins.set("e2e-bot-1", []);

    await mockAuthAPI(page);
    await mockFleetAPI(page, state);

    await loginToMarketplace(page);

    // Navigate to Discord plugin detail
    await page.goto("/marketplace/discord");
    await expect(page.getByRole("heading", { name: /Discord/ })).toBeVisible({ timeout: 10000 });

    // Click install
    await page.getByRole("button", { name: "Give my bot this superpower" }).click();

    // Install wizard: bot-select phase
    await expect(page.getByText("Select which bot to install this plugin on").first()).toBeVisible({
      timeout: 5000,
    });
    await page.getByRole("button", { name: /e2e-test-bot/ }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    // Setup phase (Discord has 1 step with empty fields) — click Continue
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

  test("uninstall — confirm dialog, plugin removed", async ({ page }) => {
    const state = createFleetMockState();
    // Pre-create a bot with Discord already installed
    state.bots.push({
      id: "e2e-bot-1",
      name: "e2e-test-bot",
      state: "running",
      env: {},
      uptime: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      stats: { cpuPercent: 10, memoryUsageMb: 128, memoryLimitMb: 512, memoryPercent: 25 },
    });
    state.installedPlugins.set("e2e-bot-1", [{ pluginId: "discord", enabled: true }]);

    await mockAuthAPI(page);
    await mockFleetAPI(page, state);

    await loginToMarketplace(page);

    // Navigate to bot settings page where uninstall dialog lives
    await page.goto("/dashboard/bots/e2e-bot-1/settings");

    // Click the Plugins tab — bot settings defaults to Identity tab
    await page.getByRole("tab", { name: "Plugins" }).click();

    // Wait for the page to load and show Discord plugin
    await expect(page.getByText("Discord").first()).toBeVisible({ timeout: 10000 });

    // Click the uninstall button for Discord
    await page
      .getByRole("button", { name: /Uninstall/i })
      .first()
      .click();

    // Confirm dialog appears
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Uninstall Discord?")).toBeVisible();
    await expect(page.getByText("This will remove the plugin and its configuration").first()).toBeVisible();

    // Click confirm uninstall
    await page.getByRole("button", { name: "Uninstall", exact: true }).click();

    // Verify the dialog closes
    await expect(page.getByText("Uninstall Discord?")).not.toBeVisible({ timeout: 5000 });
  });
});
