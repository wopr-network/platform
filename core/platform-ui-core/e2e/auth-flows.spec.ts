import { bypassOnboarding, expect, mockAuthAPI, test, testEmail } from "./fixtures/auth";

test.describe("Auth flows", () => {
	test("login with email/password → redirects to dashboard with session", async ({ page }) => {
		await mockAuthAPI(page);
		await page.goto("/login?callbackUrl=/dashboard");
		await bypassOnboarding(page);

		// Fill login form
		await page.getByLabel("Email").first().fill("e2e@wopr.test");
		await page.getByLabel("Password").first().fill("TestPassword123!");

		// Submit
		await page.getByRole("button", { name: "Sign in" }).click();

		// Verify redirect to dashboard
		await page.waitForURL("**/dashboard");
		await expect(page).toHaveURL(/\/dashboard/);

		// Verify session cookie is set
		const cookies = await page.context().cookies();
		const sessionCookie = cookies.find((c) => c.name === "better-auth.session_token");
		expect(sessionCookie).toBeTruthy();
		expect(sessionCookie!.value).toContain("e2e-session-");

		// Verify the page rendered (not stuck on login)
		await expect(page.locator("body")).not.toContainText("Sign in");
	});

	test("forgot password → reset password → redirect to login", async ({ page }) => {
		const email = testEmail();
		await mockAuthAPI(page);

		// 1. Go to forgot-password page
		await page.goto("/forgot-password");

		// 2. Submit email
		await page.getByLabel("Email").first().fill(email);
		await page.getByRole("button", { name: "Send reset link" }).click();

		// 3. Verify "Transmission sent" interstitial
		await expect(page.getByText("Transmission sent").first()).toBeVisible();
		await expect(page.getByText("We sent a password reset link to").first()).toBeVisible();
		await expect(page.getByText(email).first()).toBeVisible();

		// 4. Navigate to reset-password with a mock token
		await page.goto("/reset-password?token=mock-reset-token-123");

		// 5. Verify the reset form renders (not "Access denied")
		await expect(page.getByText("Set new credentials").first()).toBeVisible();
		await expect(page.getByLabel("New password").first()).toBeVisible();
		await expect(page.getByLabel("Confirm password").first()).toBeVisible();

		// 6. Submit new password
		const newPassword = "NewStr0ngP@ssword!";
		await page.getByLabel("New password").first().fill(newPassword);
		await page.getByLabel("Confirm password").first().fill(newPassword);
		await page.getByRole("button", { name: "Reset password" }).click();

		// 7. Verify redirect to login
		await page.waitForURL("**/login");
		await expect(page).toHaveURL(/\/login/);
	});

	test("OAuth button redirects to provider, callback page handles success", async ({ page }) => {
		await mockAuthAPI(page);

		// Stub external OAuth provider domain to prevent real navigation
		await page.route("https://github.example.com/**", async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "text/html",
				body: "<html></html>",
			});
		});

		await page.goto("/login");

		// 1. Verify OAuth buttons render (requires enabledSocialProviders mock)
		await expect(page.getByText("or continue with").first()).toBeVisible();
		await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();

		// 2. Click GitHub OAuth button and intercept the redirect
		const [request] = await Promise.all([
			page.waitForRequest((req) => req.url().includes("github.example.com/oauth/authorize")),
			page.getByRole("button", { name: "Continue with GitHub" }).click(),
		]);

		// 3. Verify the redirect URL contains expected OAuth params (redirect_uri is URL-encoded)
		const redirectUrl = request.url();
		expect(redirectUrl).toContain("client_id=test");
		expect(redirectUrl).toContain("redirect_uri=");
		// The redirect_uri is URL-encoded, so check for the encoded form
		expect(redirectUrl).toContain("%2Fauth%2Fcallback%2Fgithub");

		// Wait for the browser to fully land on the stubbed OAuth provider page
		// before navigating away. Without this, goto() can be interrupted by the
		// in-flight OAuth redirect that hasn't settled yet.
		await page.waitForURL("**/github.example.com/**", { timeout: 5000 });

		// 4. Simulate the OAuth callback return — inject session cookie so middleware
		// allows the subsequent redirect to /onboarding
		await page.context().addCookies([{
			name: "better-auth.session_token",
			value: `e2e-oauth-session-${Date.now()}`,
			domain: "localhost",
			path: "/",
			httpOnly: true,
			sameSite: "Lax",
			secure: false,
			expires: Math.floor(Date.now() / 1000) + 86400,
		}]);

		// Navigate to the callback page (simulating provider redirect).
		await page.goto("/auth/callback/github");

		// 5. Verify the callback page shows spinner then redirects to an authenticated page.
		// After OAuth, the app redirects to /onboarding for new users or /marketplace for
		// users whose onboarding is already complete (localStorage flag or org exists).
		await expect(page.getByText("Completing sign in with github").first()).toBeVisible();
		await page.waitForURL(/\/(onboarding|marketplace)/, { timeout: 5000 });
		await expect(page).toHaveURL(/\/(onboarding|marketplace)/);
	});

	test("OAuth callback with error shows error message", async ({ page }) => {
		await mockAuthAPI(page);

		// Navigate directly to callback page with an error param
		await page.goto("/auth/callback/github?error=access_denied");

		// Verify error UI renders
		await expect(page.getByText("Authentication failed").first()).toBeVisible();
		await expect(page.getByText("Could not sign in with github").first()).toBeVisible();

		// Verify "Back to sign in" link
		await expect(page.getByRole("link", { name: "Back to sign in" })).toBeVisible();
	});

	test("email verification success → shows $5 credit → redirects to onboarding", async ({ page }) => {
		await mockAuthAPI(page);

		// Inject session cookie so middleware allows the redirect to /onboarding
		await page.context().addCookies([{
			name: "better-auth.session_token",
			value: `e2e-verify-session-${Date.now()}`,
			domain: "localhost",
			path: "/",
			httpOnly: true,
			sameSite: "Lax",
			secure: false,
			expires: Math.floor(Date.now() / 1000) + 86400,
		}]);

		// Navigate to verify page with success status
		await page.goto("/auth/verify?status=success");

		// Verify success UI
		await expect(page.getByText("Email verified").first()).toBeVisible();
		await expect(page.getByText("Your email has been verified successfully.").first()).toBeVisible();

		// Verify $5 signup credit message
		await expect(page.getByText("$5 signup credit").first()).toBeVisible();

		// Verify countdown text is visible
		await expect(page.getByText(/Redirecting in/).first()).toBeVisible();

		// Verify "Continue to setup" link exists as fallback
		await expect(page.getByRole("link", { name: "Continue to setup" })).toBeVisible();

		// Wait for auto-redirect to /onboarding (3s countdown)
		await page.waitForURL("**/onboarding", { timeout: 10000 });
		await expect(page).toHaveURL(/\/onboarding/);
	});

	test("email verification with expired token shows error", async ({ page }) => {
		await mockAuthAPI(page);

		await page.goto("/auth/verify?status=error&reason=token-expired&email=test@wopr.test");

		// Verify error UI
		await expect(page.getByText("Link expired").first()).toBeVisible();
		await expect(page.getByText("This verification link has expired.").first()).toBeVisible();

		// Verify resend button is shown (since email param is provided)
		await expect(page.getByRole("button", { name: /resend/i })).toBeVisible();
	});

	test("email verification with invalid token shows error", async ({ page }) => {
		await mockAuthAPI(page);

		await page.goto("/auth/verify?status=error&reason=invalid-token");

		await expect(page.getByText("Invalid link").first()).toBeVisible();
		await expect(page.getByText("This verification link is invalid or malformed.").first()).toBeVisible();
	});
});
