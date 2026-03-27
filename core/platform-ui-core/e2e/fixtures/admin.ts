import type { Page } from "@playwright/test";
import { E2E_ADMIN_TOKEN } from "../mock-api-server";

const PLATFORM_BASE_URL =
	process.env.NEXT_PUBLIC_API_URL ?? process.env.BASE_URL ?? "http://localhost:3001";
const API_BASE_URL = `${PLATFORM_BASE_URL}/api`;

// ---------- Mock data types ----------

export interface AdminMockState {
	users: Array<{
		id: string;
		email: string;
		name: string | null;
		tenant_id: string;
		status: string;
		role: string;
		credit_balance_cents: number;
		agent_count: number;
		last_seen: number | null;
		created_at: number;
	}>;
	plugins: Array<{
		id: string;
		npm_package: string;
		name: string;
		description: string;
		version: string;
		author: string;
		category: string;
		icon_url: string | null;
		enabled: boolean;
		featured: boolean;
		sort_order: number;
		notes: string;
		superpower_md: string | null;
		discovered_at: number;
		enabled_at: number | null;
		reviewed: boolean;
	}>;
	promotions: Array<{
		id: string;
		name: string;
		type: string;
		status: string;
		valueType: string;
		amount: number;
		cap: number | null;
		startsAt: string | null;
		endsAt: string | null;
		firstPurchaseOnly: boolean;
		minPurchaseCents: number | null;
		userSegment: string;
		totalUseLimit: number | null;
		perUserLimit: number;
		budgetCap: number | null;
		totalUses: number;
		totalCreditsGranted: number;
		couponCode: string | null;
		notes: string | null;
		createdAt: string;
		updatedAt: string;
	}>;
	rateOverrides: Array<{
		id: string;
		adapterId: string;
		name: string;
		discountPercent: number;
		startsAt: string;
		endsAt: string | null;
		status: string;
		notes: string | null;
		createdBy: string | null;
		createdAt: string;
	}>;
	auditEvents: Array<{
		id: string;
		action: string;
		resourceType: string;
		resourceId: string;
		resourceName: string | null;
		details: string | null;
		createdAt: string;
	}>;
	_promotionCounter: number;
	_rateOverrideCounter: number;
}

export function createAdminMockState(): AdminMockState {
	return {
		users: [
			{
				id: "user-1",
				email: "alice@acme.test",
				name: "Alice Admin",
				tenant_id: "tenant-1",
				status: "active",
				role: "owner",
				credit_balance_cents: 5000,
				agent_count: 2,
				last_seen: Date.now(),
				created_at: Date.now() - 30 * 86400000,
			},
			{
				id: "user-2",
				email: "bob@acme.test",
				name: "Bob Builder",
				tenant_id: "tenant-2",
				status: "suspended",
				role: "member",
				credit_balance_cents: 0,
				agent_count: 0,
				last_seen: Date.now() - 86400000,
				created_at: Date.now() - 60 * 86400000,
			},
			{
				id: "user-3",
				email: "charlie@acme.test",
				name: "Charlie Coder",
				tenant_id: "tenant-3",
				status: "active",
				role: "member",
				credit_balance_cents: 1200,
				agent_count: 1,
				last_seen: Date.now() - 3600000,
				created_at: Date.now() - 14 * 86400000,
			},
		],
		plugins: [
			{
				id: "plugin-discord",
				npm_package: "@wopr-network/plugin-discord",
				name: "Discord",
				description: "Connect to Discord servers.",
				version: "3.2.0",
				author: "WOPR Team",
				category: "channel",
				icon_url: null,
				enabled: true,
				featured: true,
				sort_order: 0,
				notes: "",
				superpower_md: null,
				discovered_at: Date.now() - 86400000,
				enabled_at: Date.now() - 86400000,
				reviewed: true,
			},
			{
				id: "plugin-slack",
				npm_package: "@wopr-network/plugin-slack",
				name: "Slack",
				description: "Connect to Slack workspaces.",
				version: "2.1.0",
				author: "WOPR Team",
				category: "channel",
				icon_url: null,
				enabled: true,
				featured: false,
				sort_order: 1,
				notes: "",
				superpower_md: null,
				discovered_at: Date.now() - 172800000,
				enabled_at: Date.now() - 172800000,
				reviewed: true,
			},
			{
				id: "plugin-pending",
				npm_package: "@wopr-network/plugin-pending",
				name: "Pending Review",
				description: "A plugin awaiting review.",
				version: "0.1.0",
				author: "Third Party",
				category: "superpower",
				icon_url: null,
				enabled: false,
				featured: false,
				sort_order: 99,
				notes: "",
				superpower_md: null,
				discovered_at: Date.now() - 3600000,
				enabled_at: null,
				reviewed: false,
			},
		],
		promotions: [
			{
				id: "promo-1",
				name: "Launch Bonus",
				type: "bonus_on_purchase",
				status: "active",
				valueType: "flat_credits",
				amount: 500,
				cap: null,
				startsAt: null,
				endsAt: null,
				firstPurchaseOnly: false,
				minPurchaseCents: null,
				userSegment: "all",
				totalUseLimit: 1000,
				perUserLimit: 1,
				budgetCap: null,
				totalUses: 42,
				totalCreditsGranted: 21000,
				couponCode: null,
				notes: null,
				createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
				updatedAt: new Date(Date.now() - 86400000).toISOString(),
			},
		],
		rateOverrides: [
			{
				id: "ro-1",
				adapterId: "openrouter",
				name: "Holiday Discount",
				discountPercent: 25,
				startsAt: new Date(Date.now() - 86400000).toISOString(),
				endsAt: new Date(Date.now() + 7 * 86400000).toISOString(),
				status: "active",
				notes: null,
				createdBy: "admin@wopr.test",
				createdAt: new Date(Date.now() - 86400000).toISOString(),
			},
		],
		auditEvents: [
			{
				id: "audit-1",
				action: "admin.suspend_tenant",
				resourceType: "tenant",
				resourceId: "tenant-2",
				resourceName: "Bob Builder",
				details: "Suspended for TOS violation",
				createdAt: new Date(Date.now() - 3600000).toISOString(),
			},
			{
				id: "audit-2",
				action: "admin.grant_credits",
				resourceType: "tenant",
				resourceId: "tenant-1",
				resourceName: "Alice Admin",
				details: "Granted 5000 credits",
				createdAt: new Date(Date.now() - 7200000).toISOString(),
			},
			{
				id: "audit-3",
				action: "billing.charge",
				resourceType: "tenant",
				resourceId: "tenant-3",
				resourceName: "Charlie Coder",
				details: "Monthly charge processed",
				createdAt: new Date(Date.now() - 10800000).toISOString(),
			},
		],
		_promotionCounter: 1,
		_rateOverrideCounter: 1,
	};
}

/**
 * Override get-session to include `role: "platform_admin"` on the user.
 * Must be called AFTER mockAuthAPI() so this route takes LIFO priority.
 *
 * Two layers of mocking:
 * 1. page.route() — intercepts browser-side get-session (for useSession hook / AdminGuard)
 * 2. addCookies() — sets a deterministic session token that the mock API server
 *    on port 3001 recognises as admin, so the server-side middleware role check passes.
 */
export async function mockAdminSession(page: Page) {
	// Clear any existing session cookie so the regular-user token from authedPage
	// does not shadow the admin token when the middleware checks the cookie.
	// addCookies() does not reliably replace an existing httpOnly cookie of the
	// same name — clearing first guarantees the admin token is the only one present.
	await page.context().clearCookies({ name: "better-auth.session_token" });

	// Set deterministic admin session cookie for server-side middleware auth
	await page.context().addCookies([
		{
			name: "better-auth.session_token",
			value: E2E_ADMIN_TOKEN,
			domain: "localhost",
			path: "/",
			httpOnly: true,
			sameSite: "Lax",
			secure: false,
			expires: Math.floor(Date.now() / 1000) + 86400,
		},
	]);

	// Browser-side mock for useSession() / AdminGuard client component
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
								name: "E2E Admin User",
								email: "admin@wopr.test",
								emailVerified: true,
								twoFactorEnabled: false,
								role: "platform_admin",
								createdAt: new Date().toISOString(),
								updatedAt: new Date().toISOString(),
							},
							session: {
								id: "e2e-session-id",
								userId: "e2e-user-id",
								token: E2E_ADMIN_TOKEN,
								expiresAt: new Date(Date.now() + 86400000).toISOString(),
							},
						}
					: null,
			),
		});
	});
}

/**
 * Mock all admin API endpoints (tRPC + REST).
 * Must be called AFTER mockAuthAPI() and mockAdminSession().
 */
export async function mockAdminAPI(page: Page, state: AdminMockState) {
	// ---- tRPC batch handler for admin procedures ----
	const ADMIN_TRPC_MOCKS: Record<string, unknown> = {
		// Tenants / Accounting
		"admin.usersList": { users: state.users, total: state.users.length },

		// Marketplace (AdminNav + MarketplaceAdmin)
		"adminMarketplace.listPlugins": state.plugins,
		"adminMarketplace.updatePlugin": state.plugins[0],
		"adminMarketplace.addPlugin": state.plugins[0],

		// Promotions
		"promotions.list": state.promotions,
		"promotions.create": null,
		"promotions.update": null,
		"promotions.activate": null,
		"promotions.pause": null,
		"promotions.cancel": null,

		// Rate Overrides
		"rateOverrides.list": state.rateOverrides,
		"rateOverrides.create": null,
		"rateOverrides.cancel": null,

		// Affiliates
		"admin.affiliateSuppressions": { events: [], total: 0 },
		"admin.affiliateVelocity": [],
		"admin.affiliateFingerprintClusters": [],

		// Billing Health
		"admin.billingHealth": {
			timestamp: Date.now(),
			overall: "healthy",
			severity: null,
			reasons: [],
			gateway: {
				last5m: {
					totalRequests: 1234,
					totalErrors: 3,
					errorRate: 0.002,
					byCapability: {
						"text-gen": { requests: 800, errors: 2, errorRate: 0.0025 },
						transcription: { requests: 434, errors: 1, errorRate: 0.0023 },
					},
				},
				last60m: { totalRequests: 12000, totalErrors: 15, errorRate: 0.00125 },
			},
			paymentChecks: {
				stripeApi: { ok: true, latencyMs: 120, error: null },
				webhookFreshness: { ok: true, lastEventAgeMs: 30000 },
				creditLedger: { ok: true, negativeBalanceTenants: 0 },
				meterDlq: { ok: true, depth: 0 },
				gatewayMetrics: { ok: true, errorRate: 0.002, creditFailures: 0 },
				alerts: { ok: true, firingCount: 0, firingNames: [] },
			},
			alerts: [],
			system: {
				cpuLoad1m: 0.5,
				cpuCount: 4,
				memoryUsedBytes: 2_147_483_648,
				memoryTotalBytes: 8_589_934_592,
				diskUsedBytes: 21_474_836_480,
				diskTotalBytes: 107_374_182_400,
			},
			fleet: { activeBots: 5 },
			business: {
				creditsConsumed24h: 15000,
				activeTenantCount: 42,
				revenueToday: 8500,
				capabilityBreakdown: [
					{ capability: "text-gen", eventCount: 800, totalCharge: 6000 },
					{ capability: "transcription", eventCount: 434, totalCharge: 2500 },
				],
			},
		},

		// Inference
		"admin.inference.dailyCost": [
			{ day: "2026-03-04", totalCostUsd: 1.25, sessionCount: 50 },
			{ day: "2026-03-05", totalCostUsd: 2.1, sessionCount: 80 },
		],
		"admin.inference.pageCost": [
			{ page: "/chat", totalCostUsd: 1.5, callCount: 100, avgCostUsd: 0.015 },
			{ page: "/admin", totalCostUsd: 0.85, callCount: 30, avgCostUsd: 0.0283 },
		],
		"admin.inference.cacheHitRate": {
			hitRate: 0.65,
			cachedTokens: 150000,
			cacheWriteTokens: 80000,
			uncachedTokens: 50000,
		},
		"admin.inference.sessionCost": {
			totalCostUsd: 3.35,
			totalSessions: 130,
			avgCostPerSession: 0.0258,
		},

		// Dashboard layout dependencies
		"billing.accountStatus": { status: "active", status_reason: null, grace_deadline: null },
		"billing.creditsBalance": { balance: 5000, currency: "USD" },
		"pageContext.update": null,
		"org.getOrganization": {
			id: "e2e-org-id",
			name: "E2E Test Org",
			slug: "e2e-test-org",
			billingEmail: "admin@wopr.test",
			members: [{ userId: "e2e-user-id", role: "admin", email: "admin@wopr.test" }],
			invites: [],
		},
		"org.listMyOrganizations": [
			{
				id: "e2e-org-id",
				name: "E2E Test Org",
				slug: "e2e-test-org",
				billingEmail: "admin@wopr.test",
				members: [{ userId: "e2e-user-id", role: "admin", email: "admin@wopr.test" }],
				invites: [],
			},
		],
		"authSocial.enabledSocialProviders": ["github", "google", "discord"],
		"billing.usageSummary": { used: 0, limit: 1000 },
		"fleet.getInstanceHealth": { state: "running", health: "healthy" },
	};

	await page.route(
		(url) =>
			url.href.includes(PLATFORM_BASE_URL) &&
			url.pathname.startsWith("/trpc/") &&
			Object.keys(ADMIN_TRPC_MOCKS).some((proc) => {
				const trpcPath = url.pathname.split("/trpc/")[1] ?? "";
				return trpcPath.split(",").some((p) => p === proc);
			}),
		async (route) => {
			const method = route.request().method();
			const urlStr = route.request().url();
			const procs = urlStr.split("?")[0].split("/trpc/")[1]?.split(",") ?? [];

			// Handle POST mutations dynamically
			if (method === "POST") {
				const body = route.request().postDataJSON();
				const isBatchedPost = urlStr.includes("batch=1") || procs.length > 1;
				const getInput = (idx: number) => {
					if (!isBatchedPost) return body?.json ?? body;
					if (Array.isArray(body)) return body[idx]?.json ?? body[idx];
					return body?.[String(idx)]?.json ?? body?.[String(idx)];
				};

				for (let i = 0; i < procs.length; i++) {
					const proc = procs[i];
					if (proc === "promotions.create") {
						const input = getInput(i);
						const newPromo = {
							id: `promo-${++state._promotionCounter}`,
							name: input?.name ?? "Untitled",
							type: input?.type ?? "bonus_on_purchase",
							status: "draft",
							valueType: input?.valueType ?? "flat_credits",
							amount: input?.amount ?? 0,
							cap: input?.cap ?? null,
							startsAt: input?.startsAt ?? null,
							endsAt: input?.endsAt ?? null,
							firstPurchaseOnly: input?.firstPurchaseOnly ?? false,
							minPurchaseCents: input?.minPurchaseCents ?? null,
							userSegment: input?.userSegment ?? "all",
							totalUseLimit: input?.totalUseLimit ?? null,
							perUserLimit: input?.perUserLimit ?? 1,
							budgetCap: input?.budgetCap ?? null,
							totalUses: 0,
							totalCreditsGranted: 0,
							couponCode: input?.couponCode ?? null,
							notes: input?.notes ?? null,
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
						};
						state.promotions.push(newPromo);
						ADMIN_TRPC_MOCKS["promotions.create"] = newPromo;
						ADMIN_TRPC_MOCKS["promotions.list"] = state.promotions;
					}
					if (proc === "promotions.activate") {
						const input = getInput(i);
						const promo = state.promotions.find((p) => p.id === input?.id);
						if (promo) promo.status = "active";
						ADMIN_TRPC_MOCKS["promotions.list"] = state.promotions;
					}
					if (proc === "rateOverrides.create") {
						const input = getInput(i);
						const newOverride = {
							id: `ro-${++state._rateOverrideCounter}`,
							adapterId: input?.adapterId ?? "openrouter",
							name: input?.name ?? "Untitled",
							discountPercent: input?.discountPercent ?? 0,
							startsAt: input?.startsAt ?? new Date().toISOString(),
							endsAt: input?.endsAt ?? null,
							status: "active",
							notes: input?.notes ?? null,
							createdBy: "admin@wopr.test",
							createdAt: new Date().toISOString(),
						};
						state.rateOverrides.push(newOverride);
						ADMIN_TRPC_MOCKS["rateOverrides.list"] = state.rateOverrides;
					}
					if (proc === "rateOverrides.cancel") {
						const input = getInput(i);
						const override = state.rateOverrides.find((o) => o.id === input?.id);
						if (override) override.status = "cancelled";
						ADMIN_TRPC_MOCKS["rateOverrides.list"] = state.rateOverrides;
					}
					if (proc === "adminMarketplace.updatePlugin") {
						const input = getInput(i);
						const plugin = state.plugins.find((p) => p.id === input?.id);
						if (plugin) {
							if (input?.enabled !== undefined) plugin.enabled = input.enabled;
							if (input?.featured !== undefined) plugin.featured = input.featured;
							if (input?.reviewed !== undefined) plugin.reviewed = input.reviewed;
							if (input?.notes !== undefined) plugin.notes = input.notes;
							if (input?.sort_order !== undefined) plugin.sort_order = input.sort_order;
							ADMIN_TRPC_MOCKS["adminMarketplace.updatePlugin"] = plugin;
						}
						ADMIN_TRPC_MOCKS["adminMarketplace.listPlugins"] = state.plugins;
					}
				}
			}

			// Update dynamic mocks that reference state arrays
			if (method === "GET") {
				ADMIN_TRPC_MOCKS["admin.usersList"] = {
					users: state.users,
					total: state.users.length,
				};
				ADMIN_TRPC_MOCKS["adminMarketplace.listPlugins"] = state.plugins;
				ADMIN_TRPC_MOCKS["promotions.list"] = state.promotions;
				ADMIN_TRPC_MOCKS["rateOverrides.list"] = state.rateOverrides;
			}

			const results = procs.map((proc) => ({
				result: {
					data: proc in ADMIN_TRPC_MOCKS ? ADMIN_TRPC_MOCKS[proc] : null,
				},
			}));

			const isBatched = urlStr.includes("batch=1") || procs.length > 1;
			const payload = isBatched ? results : results[0];
			await route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(payload),
			});
		},
	);

	// ---- REST: Audit log ----
	await page.route(`${API_BASE_URL}/audit*`, async (route) => {
		await route.fulfill({
			status: 200,
			contentType: "application/json",
			body: JSON.stringify({
				events: state.auditEvents,
				total: state.auditEvents.length,
				hasMore: false,
			}),
		});
	});
}
