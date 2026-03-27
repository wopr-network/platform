import { expect, test } from "@playwright/test";

test.describe("Public pages (no auth required)", () => {
	test("pricing page renders hero and Get Started CTA linking to /signup", async ({ page }) => {
		await page.goto("/pricing", { waitUntil: "domcontentloaded" });

		// Hero heading
		await expect(page.getByText(/Platform pays for itself/i).first()).toBeVisible({
			timeout: 10000,
		});

		// At least one "Get started" / "Get Started" link pointing to /signup
		const ctaLinks = page.getByRole("link", { name: /get started/i });
		await expect(ctaLinks.first()).toBeVisible();
		const href = await ctaLinks.first().getAttribute("href");
		expect(href).toContain("/signup");
	});

	test("status page renders Platform Status heading without 500 error", async ({ page }) => {
		await page.route("**/api/health", (route) =>
			route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({
					status: "healthy",
					services: [{ name: "api", status: "healthy", latencyMs: 12 }],
					version: "1.0.0",
					uptime: 99.9,
				}),
			}),
		);

		const response = await page.goto("/status", { waitUntil: "domcontentloaded" });

		// Page must not 500
		expect(response).not.toBeNull();
		expect(response!.ok()).toBe(true);

		// Main heading
		await expect(page.getByRole("heading", { name: "Platform Status" }).first()).toBeVisible({
			timeout: 10000,
		});

		// Services section (health indicators rendered)
		await expect(page.getByText("Services").first()).toBeVisible({
			timeout: 10000,
		});
	});

	test("privacy policy page renders with content and key sections", async ({ page }) => {
		await page.goto("/privacy", { waitUntil: "domcontentloaded" });

		// Main heading
		await expect(
			page.getByRole("heading", { name: "Privacy Policy" }).first(),
		).toBeVisible({ timeout: 10000 });

		// Key section links present in the table of contents
		await expect(page.getByText("Identity and Contact Details").first()).toBeVisible();
		await expect(page.getByText("What We Collect and Why").first()).toBeVisible();
		await expect(page.getByText(/Your Rights Under GDPR/i).first()).toBeVisible();
	});

	test("terms of service page renders with content and key sections", async ({ page }) => {
		await page.goto("/terms", { waitUntil: "domcontentloaded" });

		// Main heading
		await expect(
			page.getByRole("heading", { name: "Terms of Service" }).first(),
		).toBeVisible({ timeout: 10000 });

		// Key section links present in the table of contents
		await expect(page.getByText("Acceptance of Terms").first()).toBeVisible();
		await expect(page.getByText("Cancellation and Termination").first()).toBeVisible();
		await expect(page.getByText("Governing Law").first()).toBeVisible();
	});
});
