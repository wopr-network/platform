import { bypassOnboarding, expect, mockAuthAPI, test, testEmail } from "./fixtures/auth";

test.describe("Auth critical path", () => {
	test("unauthenticated user is redirected to /login from /dashboard", async ({ page }) => {
		// No mockAuthAPI — middleware checks cookie, finds none, redirects.
		// No session cookie is set, so middleware at src/middleware.ts:152
		// will redirect to /login?callbackUrl=/dashboard.
		await page.goto("/dashboard");
		await expect(page).toHaveURL(/\/login/);
		// Verify callbackUrl is preserved so user returns to /dashboard after login
		await expect(page).toHaveURL(/callbackUrl=%2Fdashboard/);
	});

	test("signup — fill form, submit, see verification interstitial", async ({ page }) => {
		const email = testEmail();

		await mockAuthAPI(page);

		// Capture any request failures so CI logs show exactly what network error occurred
		page.on("requestfailed", (req) => {
			console.error(`[e2e] Request FAILED: ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
		});
		// Log all requests to http://localhost:3001 so we can see if mocks fire
		page.on("request", (req) => {
			if (req.url().includes("localhost:3001")) {
				console.log(`[e2e] Request: ${req.method()} ${req.url()}`);
			}
		});
		page.on("response", (res) => {
			if (res.url().includes("localhost:3001")) {
				console.log(`[e2e] Response: ${res.status()} ${res.url()}`);
			}
		});

		await page.goto("/signup");
		await bypassOnboarding(page);

		// Fill the signup form via JS evaluation to avoid React re-render race conditions
		// (password strength meter + Better Auth session polling cause rapid DOM updates).
		const PASSWORD = "StrongP@ssw0rd!";
		await page.evaluate(
			({ testEmail, pwd }) => {
				function triggerReactInput(id: string, value: string) {
					const el = document.getElementById(id) as HTMLInputElement | null;
					if (!el) return;
					const nativeSetter = Object.getOwnPropertyDescriptor(
						HTMLInputElement.prototype,
						"value",
					)?.set;
					nativeSetter?.call(el, value);
					el.dispatchEvent(new Event("input", { bubbles: true }));
					el.dispatchEvent(new Event("change", { bubbles: true }));
				}
				triggerReactInput("name", "E2E Test User");
				triggerReactInput("email", testEmail);
				triggerReactInput("password", pwd);
				triggerReactInput("confirm-password", pwd);
			},
			{ testEmail: email, pwd: PASSWORD },
		);

		// Click the Radix checkbox button element (not the hidden native input)
		await page.getByRole("checkbox").click();

		// Wait for React to process all state updates
		await page.waitForTimeout(300);

		// Submit
		await page.evaluate(() => {
			const form = document.getElementById("signup-form") as HTMLFormElement | null;
			form?.requestSubmit();
		});

		// Expect the "Transmission sent" verification interstitial (no redirect — stays on /signup)
		await expect(page.getByText("Transmission sent").first()).toBeVisible();
		await expect(page.getByText("We sent a verification link to").first()).toBeVisible();
		await expect(page.getByText(email).first()).toBeVisible();
	});

	test("login — fill form, submit, arrive at marketplace", async ({ page }) => {
		await mockAuthAPI(page);

		// Navigate to login with callbackUrl so the login handler redirects to /marketplace
		await page.goto("/login?callbackUrl=/marketplace");
		await bypassOnboarding(page);

		// Fill login form
		await page.getByLabel("Email").first().fill("e2e@wopr.test");
		await page.getByLabel("Password").first().fill("TestPassword123!");

		// Submit
		await page.getByRole("button", { name: "Sign in" }).click();

		// After login, the client calls router.push(callbackUrl) which defaults to "/"
		// Middleware then redirects / -> /marketplace when session cookie is present
		// Wait for the auth redirect + middleware chain to settle
		await page.waitForURL("**/marketplace");
		await expect(page).toHaveURL(/\/marketplace/);
	});

	test("forgot password — fill email, submit, see confirmation", async ({ page }) => {
		const email = testEmail();

		await mockAuthAPI(page);

		// Capture request failures for CI diagnostics
		page.on("requestfailed", (req) => {
			console.error(`[e2e] Request FAILED: ${req.method()} ${req.url()} — ${req.failure()?.errorText}`);
		});
		page.on("request", (req) => {
			if (req.url().includes("localhost:3001")) {
				console.log(`[e2e] Request: ${req.method()} ${req.url()}`);
			}
		});
		page.on("response", (res) => {
			if (res.url().includes("localhost:3001")) {
				console.log(`[e2e] Response: ${res.status()} ${res.url()}`);
			}
		});

		await page.goto("/forgot-password");

		// Fill the email
		await page.getByLabel("Email").first().fill(email);

		// Submit
		await page.getByRole("button", { name: "Send reset link" }).click();

		// Expect the "Transmission sent" confirmation
		await expect(page.getByText("Transmission sent").first()).toBeVisible();
		await expect(page.getByText("We sent a password reset link to").first()).toBeVisible();
		await expect(page.getByText(email).first()).toBeVisible();
	});
});
