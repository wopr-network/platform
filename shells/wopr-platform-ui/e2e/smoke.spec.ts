import { expect, test } from "@playwright/test";

test("homepage loads with status 200", async ({ page }) => {
	const response = await page.goto("/");
	expect(response).not.toBeNull();
	expect(response!.status()).toBe(200);
});

test("homepage has correct title and nav", async ({ page }) => {
	await page.goto("/", { waitUntil: "domcontentloaded" });
	await expect(page).toHaveTitle(/WOPR/);
	await expect(page.getByRole("link", { name: "WOPR" })).toBeVisible();
	await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
});

test("login page renders sign-in form", async ({ page }) => {
	await page.goto("/login", { waitUntil: "domcontentloaded" });
	await expect(page.getByText(/sign in/i).first()).toBeVisible();
	await expect(page.getByLabel("Email")).toBeVisible();
	await expect(page.getByLabel("Password")).toBeVisible();
	await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});

test("unauthenticated access to /dashboard redirects to login", async ({ page }) => {
	const response = await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
	expect(response).not.toBeNull();
	// Middleware redirects to /login?callbackUrl=/dashboard
	expect(page.url()).toContain("/login");
	expect(page.url()).toContain("callbackUrl");
	// After redirect, the login form should be visible
	await expect(page.getByText(/sign in/i).first()).toBeVisible();
});
