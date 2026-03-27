import { expect, test } from "./fixtures/auth";
import { createSettingsMockState, mockSettingsAPI } from "./fixtures/settings";

test.describe("Settings: Profile", () => {
  test("loads and can update display name", async ({ authedPage: page }) => {
    const state = createSettingsMockState();
    await mockSettingsAPI(page, state);

    await page.goto("/settings/profile");

    await expect(page.getByRole("heading", { name: "Profile" }).first()).toBeVisible();
    await expect(page.getByText("Personal Information").first()).toBeVisible();

    // Form is populated with mock data
    const nameInput = page.locator("#profile-name").first();
    await expect(nameInput).toHaveValue("E2E Test User");

    const emailInput = page.locator("#profile-email").first();
    await expect(emailInput).toHaveValue("e2e@wopr.test");

    // Change display name
    await nameInput.clear();
    await nameInput.fill("Updated Name");
    await page.getByRole("button", { name: "Save changes" }).first().click();

    // Verify success message
    await expect(page.getByText("Profile updated.").first()).toBeVisible();
    expect(state.profile.name).toBe("Updated Name");
  });

  test("change password form shows success message", async ({ authedPage: page }) => {
    const state = createSettingsMockState();
    await mockSettingsAPI(page, state);

    await page.goto("/settings/profile");

    await expect(page.getByText("Change Password").first()).toBeVisible();

    await page.locator("#current-password").first().fill("OldPassword123!");
    await page.locator("#new-password").first().fill("NewPassword456!");
    await page.locator("#confirm-new-password").first().fill("NewPassword456!");

    await page.getByRole("button", { name: "Change password" }).first().click();

    await expect(page.getByText("Password changed.").first()).toBeVisible();
  });

  test("connected accounts section renders OAuth providers", async ({ authedPage: page }) => {
    const state = createSettingsMockState();
    await mockSettingsAPI(page, state);

    await page.goto("/settings/profile");

    await expect(page.getByText("Connected Accounts").first()).toBeVisible();
    // Providers are rendered as capitalized text
    await expect(page.getByText("github").first()).toBeVisible();
    await expect(page.getByText("discord").first()).toBeVisible();
    await expect(page.getByText("google").first()).toBeVisible();
  });

  test("delete account dialog requires confirmation text", async ({ authedPage: page }) => {
    const state = createSettingsMockState();
    await mockSettingsAPI(page, state);

    await page.goto("/settings/profile");

    await page.getByRole("button", { name: "Delete account" }).first().click();

    // Dialog opens
    await expect(page.getByText("Are you absolutely sure?").first()).toBeVisible();

    // Delete button should be disabled without confirmation text
    await expect(page.getByRole("button", { name: "Delete permanently" }).first()).toBeDisabled();

    // Type confirmation
    await page.getByPlaceholder("delete my account").first().fill("delete my account");

    // Delete button should now be enabled
    await expect(page.getByRole("button", { name: "Delete permanently" }).first()).toBeEnabled();
  });
});

test.describe("Settings: Account", () => {
  test("loads and shows current plan", async ({ authedPage: page }) => {
    const state = createSettingsMockState();
    await mockSettingsAPI(page, state);

    await page.goto("/settings/account");

    await expect(page.getByRole("heading", { name: "Account" }).first()).toBeVisible();
    await expect(page.getByText("Current Plan").first()).toBeVisible();
    // getBillingUsage calls billing.currentPlan which returns { tier: "free" }
    // planName = "Free" (capitalized)
    await expect(page.getByText("Free").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Manage Billing" }).first()).toBeVisible();
  });

  test("teams and organizations section renders", async ({ authedPage: page }) => {
    const state = createSettingsMockState();
    await mockSettingsAPI(page, state);

    await page.goto("/settings/account");

    await expect(page.getByText("Teams & Organizations").first()).toBeVisible();
  });
});

test.describe("Settings: Security", () => {
  test("page loads and shows 2FA section", async ({ authedPage: page }) => {
    const state = createSettingsMockState();
    await mockSettingsAPI(page, state);

    await page.goto("/settings/security");

    await expect(page.getByRole("heading", { name: "Security" }).first()).toBeVisible({ timeout: 10000 });

    // 2FA section renders with disabled state
    await expect(page.getByText("Two-Factor Authentication").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("Two-factor authentication is not enabled").first()).toBeVisible({ timeout: 10000 });
    // Wait for network to settle before checking the button (profile tRPC query may still be in-flight)
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: "Enable 2FA" }).first()).toBeVisible({ timeout: 10000 });
  });

  test("shows 2FA enabled state when twoFactorEnabled is true", async ({ authedPage: page }) => {
    const state = createSettingsMockState();
    await mockSettingsAPI(page, state, { twoFactorEnabled: true });

    await page.goto("/settings/security");

    await page.waitForLoadState("networkidle");
    await expect(
      page.getByText("Two-factor authentication is active").first(),
    ).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: "Disable 2FA" }).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("shows active sessions section", async ({ authedPage: page }) => {
    const state = createSettingsMockState();
    await mockSettingsAPI(page, state);

    await page.goto("/settings/security");

    await expect(page.getByText("Active Sessions").first()).toBeVisible({ timeout: 10000 });
    // Current session should be shown (wait for async session fetch to complete)
    await expect(page.getByText("Current").first()).toBeVisible({ timeout: 10000 });
  });

  test("shows login history section", async ({ authedPage: page }) => {
    const state = createSettingsMockState();
    await mockSettingsAPI(page, state);

    await page.goto("/settings/security");

    await expect(page.getByText("Login History").first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText("1 total events").first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Settings: API Keys", () => {
  test("loads and can create a key", async ({ authedPage: page }) => {
    const state = createSettingsMockState();
    await mockSettingsAPI(page, state);

    await page.goto("/settings/api-keys");

    await expect(page.getByRole("heading", { name: "API Keys" }).first()).toBeVisible();
    await expect(page.getByText("No API keys yet").first()).toBeVisible();

    // Create a key
    await page.getByRole("button", { name: "Generate new key" }).first().click();

    // Dialog opens
    await expect(page.getByText("Generate API Key").first()).toBeVisible();

    // Fill form
    await page.locator("#key-name").first().fill("CI Pipeline");

    await page.getByRole("button", { name: "Generate key" }).first().click();

    // Key secret should be shown
    await expect(page.getByText("Your new API key has been created").first()).toBeVisible();
    await expect(page.getByText(/platform_test_/).first()).toBeVisible();

    // Dismiss the secret banner
    await page.getByRole("button", { name: "Dismiss" }).first().click();

    // Key should appear in the table
    await expect(page.getByText("CI Pipeline").first()).toBeVisible();

    // Verify state was mutated
    expect(state.apiKeys.length).toBe(1);
    expect(state.apiKeys[0].name).toBe("CI Pipeline");
  });

  test("can revoke a key", async ({ authedPage: page }) => {
    const state = createSettingsMockState();
    // Pre-populate with a key
    state.apiKeys.push({
      id: "existing-key",
      name: "Old Key",
      prefix: "platform_",
      scope: "full",
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      expiresAt: null,
    });
    await mockSettingsAPI(page, state);

    await page.goto("/settings/api-keys");

    await expect(page.getByText("Old Key").first()).toBeVisible();

    // Revoke the key
    await page.getByRole("button", { name: "Revoke" }).first().click();

    // Confirm revoke dialog
    await expect(page.getByText("Revoke API Key").first()).toBeVisible();
    await page.getByRole("button", { name: "Revoke key" }).first().click();

    // Key should be removed
    await expect(page.getByText("No API keys yet").first()).toBeVisible();
  });
});

test.describe("Settings: Providers", () => {
  test("loads and shows capability routing", async ({ authedPage: page }) => {
    const state = createSettingsMockState();
    await mockSettingsAPI(page, state);

    await page.goto("/settings/providers");

    await expect(page.getByRole("heading", { name: "Provider Settings" }).first()).toBeVisible();

    // Capability cards should render (from tRPC capabilities.listCapabilityMeta mock)
    await expect(page.getByText("Text Generation").first()).toBeVisible();
    await expect(page.getByText("Transcription").first()).toBeVisible();

    // Provider keys section
    await expect(page.getByText("Provider Keys").first()).toBeVisible();
  });
});

test.describe("Settings: Brain", () => {
  test("loads and shows current model", async ({ authedPage: page }) => {
    const state = createSettingsMockState();
    await mockSettingsAPI(page, state);

    await page.goto("/settings/brain");

    await expect(page.getByRole("heading", { name: "Brain" }).first()).toBeVisible();
    await expect(page.getByText("Choose which AI model powers your Platform").first()).toBeVisible();

    // Current model card should be visible
    await expect(page.getByTestId("current-model").first()).toBeVisible();

    // View mode buttons
    await expect(page.getByRole("button", { name: /Pick a model/ }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Bring Your Own Key/ }).first()).toBeVisible();

    // Hero models should be visible (from static onboarding-data)
    const modelCards = page.locator("[data-testid^='model-card-']");
    await expect(modelCards.first()).toBeVisible();
  });

  test("more models toggle expands additional models", async ({ authedPage: page }) => {
    const state = createSettingsMockState();
    await mockSettingsAPI(page, state);

    await page.goto("/settings/brain");

    await expect(page.getByTestId("more-models-toggle").first()).toBeVisible();
    await page.getByTestId("more-models-toggle").first().click();

    // Additional models section should now be visible
    await expect(page.getByText(/models available/).first()).toBeVisible();
  });
});

test.describe("Settings: Notifications", () => {
  test("loads and can toggle a preference", async ({ authedPage: page }) => {
    const state = createSettingsMockState();
    await mockSettingsAPI(page, state);

    await page.goto("/settings/notifications");

    await expect(page.getByText("Notifications").first()).toBeVisible();
    await expect(page.getByText("Control which system emails you receive").first()).toBeVisible();

    // Preference groups should render
    await expect(page.getByText("Billing").first()).toBeVisible();
    await expect(page.getByText("Agents").first()).toBeVisible();

    // Toggle a preference -- "Low balance alerts" switch should be checked initially
    const lowBalanceToggle = page.getByRole("switch", {
      name: "Low balance alerts",
    }).first();
    await expect(lowBalanceToggle).toBeVisible();
    await expect(lowBalanceToggle).toBeChecked();

    // Toggle it off
    await lowBalanceToggle.click();

    // Should see "Saved" indicator
    await expect(page.getByText("Saved").first()).toBeVisible();

    // State should be updated
    expect(state.notificationPrefs.billing_low_balance).toBe(false);
  });
});

test.describe("Settings: Organization", () => {
  test("loads and shows members", async ({ authedPage: page }) => {
    const state = createSettingsMockState();
    await mockSettingsAPI(page, state);

    await page.goto("/settings/org");

    await expect(page.getByRole("heading", { name: "Organization" }).first()).toBeVisible();
    await expect(page.getByText("Organization Details").first()).toBeVisible();

    // Org form should be populated
    const nameInput = page.locator("#org-name").first();
    await expect(nameInput).toHaveValue("E2E Test Org");

    // Members section
    await expect(page.getByText("Members").first()).toBeVisible();
    await expect(page.getByText("2 members").first()).toBeVisible();
    await expect(page.getByText("E2E Test User").first()).toBeVisible();
    await expect(page.getByText("Team Member").first()).toBeVisible();
  });

  test("can invite a member", async ({ authedPage: page }) => {
    const state = createSettingsMockState();
    await mockSettingsAPI(page, state);

    await page.goto("/settings/org");

    await page.getByRole("button", { name: "Invite member" }).first().click();

    // Dialog opens
    await expect(page.getByText("Invite Member").first()).toBeVisible();

    // Fill email
    await page.locator("#invite-email").first().fill("newmember@wopr.test");

    // Submit — wait for the tRPC response before checking state
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/trpc/") && resp.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Send invitation" }).first().click();
    await responsePromise;

    // Invite should be added to state
    expect(state.org.invites.length).toBe(1);
    expect(state.org.invites[0].email).toBe("newmember@wopr.test");
  });
});

test.describe("Settings: Activity", () => {
  test("loads and shows audit events", async ({ authedPage: page }) => {
    const state = createSettingsMockState();
    await mockSettingsAPI(page, state);

    await page.goto("/settings/activity");

    await expect(page.getByRole("heading", { name: "Activity" }).first()).toBeVisible();
    await expect(page.getByText("Events").first()).toBeVisible();
    await expect(page.getByText("3 total events").first()).toBeVisible();

    // Events should render in the table (humanAction converts "profile.update" to "Profile Update")
    await expect(page.getByText("Profile Update").first()).toBeVisible();
    await expect(page.getByText("Api Key Create").first()).toBeVisible();
    await expect(page.getByText("Security Password Change").first()).toBeVisible();

    // Search input should be visible
    await expect(page.getByPlaceholder("Search...").first()).toBeVisible();
  });

  test("search filters events client-side", async ({ authedPage: page }) => {
    const state = createSettingsMockState();
    await mockSettingsAPI(page, state);

    await page.goto("/settings/activity");

    await expect(page.getByText("3 total events").first()).toBeVisible();

    // Search for "profile"
    await page.getByPlaceholder("Search...").first().fill("profile");

    // Only profile event should be visible
    await expect(page.getByText("Profile Update").first()).toBeVisible();
    await expect(page.getByText("Api Key Create").first()).not.toBeVisible();
  });
});
