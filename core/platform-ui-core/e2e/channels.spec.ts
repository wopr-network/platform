import { expect, test } from "./fixtures/auth";
import {
  createFleetMockState,
  mockFleetAPI,
} from "./fixtures/fleet";

test.describe("Channels", () => {
  test("channel list — renders available channels and empty linked state", async ({
    authedPage: page,
  }) => {
    const state = createFleetMockState();
    state.bots.push({
      id: "e2e-bot-ch",
      name: "channel-test-bot",
      state: "running",
      env: {},
      uptime: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      stats: { cpuPercent: 10, memoryUsageMb: 128, memoryLimitMb: 512, memoryPercent: 25 },
    });
    state.installedPlugins.set("e2e-bot-ch", []);
    await mockFleetAPI(page, state);

    await page.goto("/channels");

    // Page heading
    await expect(page.getByText("COMMS CHANNELS").first()).toBeVisible({ timeout: 10000 });

    // Available channels section
    await expect(page.getByText("AVAILABLE").first()).toBeVisible();
    await expect(page.getByText("Discord").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Slack").first()).toBeVisible();
    await expect(page.getByText("Telegram").first()).toBeVisible();

    // No channels linked — empty state
    await expect(
      page.getByText("NO CHANNELS LINKED").first(),
    ).toBeVisible();

    // Connect links should be present (single bot = auto botId)
    const connectButtons = page.getByRole("link", { name: "Connect" });
    await expect(connectButtons.first()).toBeVisible();
  });

  test("channel setup wizard — complete Discord setup, redirects to instance", async ({
    authedPage: page,
  }) => {
    const state = createFleetMockState();
    state.bots.push({
      id: "e2e-bot-setup",
      name: "setup-test-bot",
      state: "running",
      env: {},
      uptime: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      stats: { cpuPercent: 10, memoryUsageMb: 128, memoryLimitMb: 512, memoryPercent: 25 },
    });
    state.installedPlugins.set("e2e-bot-setup", []);
    await mockFleetAPI(page, state);

    // Navigate directly to Discord setup with botId
    await page.goto("/channels/setup/discord?botId=e2e-bot-setup");

    // Discord e2e manifest has 1 step: "Connection Complete" with no fields
    await expect(page.getByText("Connection Complete").first()).toBeVisible({ timeout: 10000 });

    // Step indicator
    await expect(page.getByText("Step 1 of 1").first()).toBeVisible();

    // Click Finish to complete
    await page.getByRole("button", { name: "Finish" }).click();

    // Should redirect to instance detail with channels tab
    await page.waitForURL("**/instances/e2e-bot-setup?tab=channels", { timeout: 10000 });
  });

  test("channel setup wizard — validation blocks advancement on required fields", async ({
    authedPage: page,
  }) => {
    const state = createFleetMockState();
    state.bots.push({
      id: "e2e-bot-val",
      name: "validation-test-bot",
      state: "running",
      env: {},
      uptime: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      stats: { cpuPercent: 10, memoryUsageMb: 128, memoryLimitMb: 512, memoryPercent: 25 },
    });
    state.installedPlugins.set("e2e-bot-val", []);
    await mockFleetAPI(page, state);

    // Navigate to Telegram setup (has required token field with regex validation)
    await page.goto("/channels/setup/telegram?botId=e2e-bot-val");

    // Step 1: "Create a Telegram Bot" — no fields, just instruction
    await expect(page.getByText("Create a Telegram Bot").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Step 1 of 3").first()).toBeVisible();

    // Advance to step 2
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 2: "Enter Bot Token" — has required field
    await expect(page.getByText("Enter Bot Token").first()).toBeVisible();
    await expect(page.getByText("Step 2 of 3").first()).toBeVisible();

    // Try to advance without filling required field
    await page.getByRole("button", { name: "Continue" }).click();

    // Validation error should appear
    await expect(page.getByText("Bot Token is required").first()).toBeVisible({ timeout: 5000 });

    // Still on step 2
    await expect(page.getByText("Step 2 of 3").first()).toBeVisible();

    // Fill with invalid format
    await page
      .getByPlaceholder("123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11")
      .first()
      .fill("bad token with spaces");
    await page.getByRole("button", { name: "Continue" }).click();

    // Regex validation error
    await expect(
      page.getByText("Invalid Telegram bot token format").first(),
    ).toBeVisible({ timeout: 5000 });

    // Still on step 2
    await expect(page.getByText("Step 2 of 3").first()).toBeVisible();

    // Fill with valid token format and advance
    await page
      .getByPlaceholder("123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11")
      .first()
      .fill("123456789:ABCDefGhIJKlmnoPQRStuVwXyz1234567890");
    await page.getByRole("button", { name: "Continue" }).click();

    // Should advance to step 3 (done)
    await expect(page.getByText("Step 3 of 3").first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Connection Complete").first()).toBeVisible();
  });
});
