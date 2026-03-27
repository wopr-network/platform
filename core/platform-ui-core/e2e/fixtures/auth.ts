import { test as base, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

const PLATFORM_BASE_URL = process.env.BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/**
 * Intercept Better Auth API calls and return mock success responses.
 * This avoids needing a running backend for E2E tests.
 */
export async function mockAuthAPI(page: Page) {
	// Catch-all fallback: intercept ANY unhandled request to the platform API and return a
	// structured error so tests fail fast with a descriptive message rather than timing out.
	// Registered FIRST so it has LOWEST priority (Playwright uses LIFO — last registered
	// route wins). Specific mocks registered below will override this for their paths.
	await page.route(
		(url) => url.href.includes(PLATFORM_BASE_URL),
		async (route) => {
			const url = route.request().url();
			const method = route.request().method();
			console.error(`[auth-mock] UNHANDLED platform request: ${method} ${url}`);
			await route.fulfill({
				status: 503,
				contentType: "application/json",
				body: JSON.stringify({ error: `No mock registered for ${method} ${url}` }),
			});
		},
	);

	// Mock sign-up endpoint
	await page.route(`${PLATFORM_BASE_URL}/api/auth/sign-up/email`, async (route) => {
		const body = route.request().postDataJSON();
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				user: {
					id: randomUUID(),
					name: body?.name ?? "Test User",
					email: body?.email ?? "test@wopr.test",
					emailVerified: false,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
				session: null,
			}),
		});
	});

	// Mock sign-in endpoint
	await page.route(`${PLATFORM_BASE_URL}/api/auth/sign-in/email`, async (route) => {
		const sessionToken = `e2e-session-${randomUUID()}`;
		// Inject the session cookie onto the app origin (localhost:3000) BEFORE fulfilling
		// the response. The set-cookie header in the response lands on localhost:3001 (the
		// platform origin) and is invisible to the Next.js middleware on localhost:3000.
		// Setting the cookie first ensures it is present when the browser processes the
		// successful sign-in response and immediately navigates to "/".
		await page.context().addCookies([{
			name: "better-auth.session_token",
			value: sessionToken,
			domain: "localhost",
			path: "/",
			httpOnly: true,
			sameSite: "Lax",
			secure: false,
			expires: Math.floor(Date.now() / 1000) + 86400,
		}]);
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			headers: {
				"set-cookie": `better-auth.session_token=${sessionToken}; Path=/; HttpOnly; SameSite=Lax`,
			},
			body: JSON.stringify({
				user: {
					id: "e2e-user-id",
					name: "E2E Test User",
					email: "e2e@wopr.test",
					emailVerified: true,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
				session: {
					id: randomUUID(),
					userId: "e2e-user-id",
					token: sessionToken,
					expiresAt: new Date(Date.now() + 86400000).toISOString(),
				},
			}),
		});
	});

	// Mock get-session endpoint (for useSession hook after login).
	// Only return a valid session when the browser has already received the session cookie
	// (i.e. after a successful sign-in). This prevents AuthRedirect from firing on /login
	// before the user has actually logged in.
	await page.route(`${PLATFORM_BASE_URL}/api/auth/get-session`, async (route) => {
		const cookieHeader = route.request().headers()["cookie"] ?? "";
		const hasSession = cookieHeader.includes("better-auth.session_token");
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify(
				hasSession
					? {
							user: {
								id: "e2e-user-id",
								name: "E2E Test User",
								email: "e2e@wopr.test",
								emailVerified: true,
								twoFactorEnabled: false,
								createdAt: new Date().toISOString(),
								updatedAt: new Date().toISOString(),
							},
							session: {
								id: "e2e-session-id",
								userId: "e2e-user-id",
								token: "e2e-token",
								expiresAt: new Date(Date.now() + 86400000).toISOString(),
							},
						}
					: null,
			),
		});
	});

	// Mock password reset endpoint
	// authClient.$fetch("/request-password-reset") resolves to
	// PLATFORM_BASE_URL/api/auth/request-password-reset
	await page.route(`${PLATFORM_BASE_URL}/api/auth/request-password-reset`, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ status: true }),
		});
	});

	// Mock reset-password endpoint (submit new password with token)
	await page.route(`${PLATFORM_BASE_URL}/api/auth/reset-password`, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({ status: true }),
		});
	});

	// Mock OAuth social sign-in redirect
	await page.route(`${PLATFORM_BASE_URL}/api/auth/sign-in/social`, async (route) => {
		const body = route.request().postDataJSON();
		const provider = body?.provider ?? "github";
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				url: `https://${provider}.example.com/oauth/authorize?client_id=test&redirect_uri=${encodeURIComponent(`http://localhost:3000/auth/callback/${provider}`)}`,
				redirect: true,
			}),
		});
	});

	// Mock send-verification-email endpoint
	await page.route(
		`${PLATFORM_BASE_URL}/api/auth/send-verification-email`,
		async (route) => {
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ status: true }),
			});
		},
	);

	// Mock tRPC endpoints used by all authenticated dashboard pages.
	// tRPC's httpBatchLink batches multiple queries into a single request like:
	//   /trpc/org.getOrganization,org.listMyOrganizations?batch=1&input={...}
	// The handler MUST return one result per procedure in the batch.
	const mockOrg = {
		id: "e2e-org-id",
		name: "E2E Test Org",
		slug: "e2e-test-org",
		billingEmail: "e2e@wopr.test",
		members: [{ userId: "e2e-user-id", role: "admin", email: "e2e@wopr.test" }],
		invites: [],
	};
	const TRPC_MOCKS: Record<string, unknown> = {
		"org.getOrganization": mockOrg,
		"org.listMyOrganizations": [mockOrg],
		"pageContext.update": null,
		"authSocial.enabledSocialProviders": ["github", "google", "discord"],
		"billing.creditsBalance": { balance: 1000, currency: "USD" },
		"billing.usageSummary": { used: 0, limit: 1000 },
		"billing.accountStatus": { status: "active", plan: "pro" },
		"fleet.getInstanceHealth": { state: "running", health: "healthy" },
	};
	await page.route(
		(url) =>
			url.href.includes(PLATFORM_BASE_URL) &&
			url.pathname.startsWith("/trpc/") &&
			Object.keys(TRPC_MOCKS).some((proc) => url.pathname.includes(proc)),
		async (route) => {
			const procs = route.request().url().split("?")[0].split("/trpc/")[1]?.split(",") ?? [];
			const results = procs.map((proc) =>
				proc in TRPC_MOCKS
					? { result: { data: TRPC_MOCKS[proc] } }
					: { result: { data: null } },
			);
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(results),
			});
		},
	);
}

/**
 * Set localStorage flags to bypass onboarding gate.
 * Must be called after page.goto() so there's a page context.
 */
export async function bypassOnboarding(page: Page) {
	await page.evaluate(() => {
		localStorage.setItem("platform-onboarding-complete", "1");
	});
}

/** Generate a unique test email that won't collide across runs. */
export function testEmail(): string {
	return `e2e-test-${randomUUID()}@wopr.test`;
}

/** Extended test fixtures for auth E2E tests. */
export const test = base.extend<{ authedPage: Page }>({
	authedPage: async ({ page }, use) => {
		await mockAuthAPI(page);

		// Navigate to login with callbackUrl so login redirects to /marketplace
		await page.goto("/login?callbackUrl=/marketplace");
		await bypassOnboarding(page);

		// Perform login via the form
		await page.getByLabel("Email").first().fill("e2e@wopr.test");
		await page.getByLabel("Password").first().fill("TestPassword123!");
		await page.getByRole("button", { name: "Sign in" }).click();

		// Wait for redirect to complete (middleware redirects / -> /marketplace)
		await page.waitForURL("**/marketplace");

		await use(page);
	},
});

export { expect };
