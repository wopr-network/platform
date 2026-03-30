import { chromium } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const AUTH_FILE = path.join(__dirname, "../.auth/user.json");
const BASE_URL = "https://app.nemopod.com";
const API_URL = "https://api.nemopod.com";
const EMAIL = "e2e+checkout@nemopod.com";
const PASSWORD = "TestPassword123!";

export async function setupAuth(): Promise<void> {
  // Skip if already have a valid session file
  if (fs.existsSync(AUTH_FILE)) {
    const stat = fs.statSync(AUTH_FILE);
    const ageMs = Date.now() - stat.mtimeMs;
    // Reuse if less than 30 minutes old
    if (ageMs < 30 * 60 * 1000) {
      return;
    }
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: BASE_URL });
  const page = await context.newPage();

  // Try sign-up first
  try {
    const signUpRes = await page.request.post(`${API_URL}/api/auth/sign-up/email`, {
      data: {
        email: EMAIL,
        password: PASSWORD,
        name: "E2E Checkout User",
      },
      headers: { "Content-Type": "application/json" },
    });

    if (signUpRes.ok() || signUpRes.status() === 422) {
      // 422 = user already exists — fall through to sign-in
    }
  } catch {
    // ignore, fall through to sign-in
  }

  // Sign in via UI to capture browser cookies/storage
  await page.goto(`${BASE_URL}/login`);
  await page.waitForLoadState("networkidle");

  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  await emailInput.fill(EMAIL);

  const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
  await passwordInput.fill(PASSWORD);

  // Use type="submit" to avoid detached-node race with React re-renders
  await page.locator('button[type="submit"]').first().click();

  // Wait for redirect away from login
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15000 });

  // Save storage state
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  await context.storageState({ path: AUTH_FILE });

  await browser.close();
}
