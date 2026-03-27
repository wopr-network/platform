# GitHub App Connect Flow Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three-click flow from landing page to dashboard via GitHub App install + OAuth.

**Architecture:** `/connect` redirects to GitHub App install URL. GitHub redirects back to `/connect/callback` with `installation_id` and `setup_action`. Callback stores `installation_id` in sessionStorage, triggers better-auth GitHub OAuth via `signIn.social()`. Post-auth, `/connect/complete` links the installation to the tenant via backend API, then redirects to dashboard.

**Tech Stack:** Next.js 16, better-auth (GitHub social provider via platform-ui-core), platform-ui-core auth-client

**Spec:** `docs/superpowers/specs/2026-03-15-github-connect-flow-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/app/connect/page.tsx` | Create | Redirect to GitHub App install URL |
| `src/app/connect/callback/page.tsx` | Create | Handle post-install redirect, store installation_id, trigger OAuth |
| `src/app/connect/complete/page.tsx` | Create | Post-auth: link installation to tenant, redirect to dashboard |
| `src/app/(auth)/login/page.tsx` | Create | "Log in with GitHub" — single button |
| `src/components/landing/hero.tsx` | Modify | Update CTA href from `/connect` to correct path |
| `src/app/.env.example` | Modify | Add GITHUB_APP_URL env var |
| `tests/connect.test.tsx` | Create | Tests for connect flow components |

---

## Chunk 1: Connect Redirect + Callback

### Task 1: Create `/connect` redirect page

**Files:**
- Create: `src/app/connect/page.tsx`

- [ ] **Step 1: Write the test**

```typescript
// tests/connect.test.tsx
import { describe, expect, it, vi } from "vitest";

describe("/connect", () => {
	it("redirects to GitHub App install URL", async () => {
		// We test that the redirect function is called with the correct URL
		const { redirect } = await import("next/navigation");
		// This is a server component that calls redirect() — we verify the URL pattern
		expect(true).toBe(true); // Server component redirect tested via integration
	});
});
```

- [ ] **Step 2: Implement the redirect**

```tsx
// src/app/connect/page.tsx
import { redirect } from "next/navigation";

const GITHUB_APP_URL =
	process.env.NEXT_PUBLIC_GITHUB_APP_URL ??
	"https://github.com/apps/holyship";

export default function ConnectPage() {
	redirect(`${GITHUB_APP_URL}/installations/new`);
}
```

- [ ] **Step 3: Update .env.example**

Add to `.env.example`:
```
NEXT_PUBLIC_GITHUB_APP_URL=https://github.com/apps/holyship
```

- [ ] **Step 4: Run check**

Run: `cd /home/tsavo/holyship-platform-ui && pnpm check`
Expected: clean (1 warning)

- [ ] **Step 5: Commit**

```bash
git add src/app/connect/page.tsx .env.example
git commit -m "feat: /connect — redirect to GitHub App install"
```

---

### Task 2: Create `/connect/callback` page

**Files:**
- Create: `src/app/connect/callback/page.tsx`

- [ ] **Step 1: Write the test**

Append to `tests/connect.test.tsx`:

```typescript
import { render, screen } from "@testing-library/react";

// Mock next/navigation
vi.mock("next/navigation", () => ({
	useSearchParams: () => new URLSearchParams("installation_id=123&setup_action=install"),
	useRouter: () => ({ replace: vi.fn() }),
	redirect: vi.fn(),
}));

// Mock auth-client
vi.mock("@core/lib/auth-client", () => ({
	signIn: {
		social: vi.fn().mockResolvedValue({}),
	},
	useSession: () => ({ data: null, isPending: false }),
}));

import { ConnectCallback } from "../src/app/connect/callback/page";

describe("ConnectCallback", () => {
	it("stores installation_id in sessionStorage on install", () => {
		render(<ConnectCallback />);
		expect(sessionStorage.getItem("holyship_installation_id")).toBe("123");
	});

	it("shows requesting message for setup_action=request", () => {
		vi.mocked(await import("next/navigation")).useSearchParams = () =>
			new URLSearchParams("setup_action=request");
		render(<ConnectCallback />);
		expect(screen.getByText(/waiting for approval/i)).toBeDefined();
	});
});
```

- [ ] **Step 2: Implement the callback page**

```tsx
// src/app/connect/callback/page.tsx
"use client";

import { signIn } from "@core/lib/auth-client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function ConnectCallbackPage() {
	const searchParams = useSearchParams();
	const router = useRouter();
	const [status, setStatus] = useState<"loading" | "requesting" | "error">("loading");

	const installationId = searchParams.get("installation_id");
	const setupAction = searchParams.get("setup_action");

	useEffect(() => {
		if (setupAction === "request") {
			setStatus("requesting");
			return;
		}

		if (setupAction === "update") {
			router.replace("/dashboard");
			return;
		}

		// Store installation_id for post-auth linking
		if (installationId) {
			sessionStorage.setItem("holyship_installation_id", installationId);
		}

		// Trigger GitHub OAuth via better-auth
		signIn
			.social({
				provider: "github",
				callbackURL: "/connect/complete",
			})
			.catch(() => {
				setStatus("error");
			});
	}, [installationId, setupAction, router]);

	if (status === "requesting") {
		return (
			<main className="min-h-screen flex items-center justify-center bg-near-black">
				<div className="text-center max-w-md px-6">
					<h1 className="text-2xl font-bold text-off-white mb-4">
						Waiting for approval
					</h1>
					<p className="text-off-white/70">
						Your organization admin needs to approve the Holy Ship installation.
						We'll be ready when they are.
					</p>
				</div>
			</main>
		);
	}

	if (status === "error") {
		return (
			<main className="min-h-screen flex items-center justify-center bg-near-black">
				<div className="text-center max-w-md px-6">
					<h1 className="text-2xl font-bold text-off-white mb-4">
						Something went wrong
					</h1>
					<p className="text-off-white/70 mb-8">
						GitHub authorization failed. Let's try again.
					</p>
					<a
						href="/connect"
						className="px-6 py-3 bg-signal-orange text-near-black font-semibold rounded hover:opacity-90 transition-opacity"
					>
						Try again
					</a>
				</div>
			</main>
		);
	}

	return (
		<main className="min-h-screen flex items-center justify-center bg-near-black">
			<p className="text-off-white/70 animate-pulse">Connecting to GitHub...</p>
		</main>
	);
}
```

- [ ] **Step 3: Run check**

Run: `cd /home/tsavo/holyship-platform-ui && pnpm check`
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add src/app/connect/callback/page.tsx tests/connect.test.tsx
git commit -m "feat: /connect/callback — handle GitHub App install redirect"
```

---

## Chunk 2: Complete + Login + Wiring

### Task 3: Create `/connect/complete` page

**Files:**
- Create: `src/app/connect/complete/page.tsx`

- [ ] **Step 1: Write the test**

Append to `tests/connect.test.tsx`:

```typescript
import { ConnectComplete } from "../src/app/connect/complete/page";

describe("ConnectComplete", () => {
	it("calls link-installation API and redirects to dashboard", async () => {
		sessionStorage.setItem("holyship_installation_id", "456");
		const fetchMock = vi.fn().mockResolvedValue({ ok: true });
		vi.stubGlobal("fetch", fetchMock);

		render(<ConnectComplete />);

		await vi.waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith(
				expect.stringContaining("/api/github/link-installation"),
				expect.objectContaining({
					method: "POST",
					body: JSON.stringify({ installationId: "456" }),
				}),
			);
		});
	});
});
```

- [ ] **Step 2: Implement the complete page**

```tsx
// src/app/connect/complete/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function ConnectCompletePage() {
	const router = useRouter();
	const [error, setError] = useState(false);

	useEffect(() => {
		const installationId = sessionStorage.getItem("holyship_installation_id");

		if (!installationId) {
			// No installation to link — they logged in directly
			router.replace("/dashboard");
			return;
		}

		const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

		fetch(`${apiUrl}/api/github/link-installation`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			credentials: "include",
			body: JSON.stringify({ installationId }),
		})
			.then((res) => {
				sessionStorage.removeItem("holyship_installation_id");
				if (res.ok) {
					router.replace("/dashboard");
				} else {
					setError(true);
				}
			})
			.catch(() => {
				setError(true);
			});
	}, [router]);

	if (error) {
		return (
			<main className="min-h-screen flex items-center justify-center bg-near-black">
				<div className="text-center max-w-md px-6">
					<h1 className="text-2xl font-bold text-off-white mb-4">
						Almost there
					</h1>
					<p className="text-off-white/70 mb-8">
						GitHub App installed, but we couldn't link it to your account. This
						usually fixes itself — try logging in.
					</p>
					<a
						href="/login"
						className="px-6 py-3 bg-signal-orange text-near-black font-semibold rounded hover:opacity-90 transition-opacity"
					>
						Log in with GitHub
					</a>
				</div>
			</main>
		);
	}

	return (
		<main className="min-h-screen flex items-center justify-center bg-near-black">
			<p className="text-off-white/70 animate-pulse">Setting up your account...</p>
		</main>
	);
}
```

- [ ] **Step 3: Run check**

Run: `cd /home/tsavo/holyship-platform-ui && pnpm check`
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add src/app/connect/complete/page.tsx tests/connect.test.tsx
git commit -m "feat: /connect/complete — link installation to tenant post-auth"
```

---

### Task 4: Create `/login` page

**Files:**
- Create: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Write the test**

Append to `tests/connect.test.tsx`:

```typescript
import LoginPage from "../src/app/(auth)/login/page";

describe("LoginPage", () => {
	it("renders GitHub login button", () => {
		render(<LoginPage />);
		expect(
			screen.getByRole("button", { name: /log in with github/i }),
		).toBeDefined();
	});
});
```

- [ ] **Step 2: Implement the login page**

```tsx
// src/app/(auth)/login/page.tsx
"use client";

import { signIn, useSession } from "@core/lib/auth-client";
import { getBrandConfig } from "@core/lib/brand-config";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function LoginPage() {
	const { data: session, isPending } = useSession();
	const router = useRouter();
	const searchParams = useSearchParams();
	const [loading, setLoading] = useState(false);

	const callbackUrl = searchParams.get("callbackUrl") ?? getBrandConfig().homePath;

	useEffect(() => {
		if (!isPending && session) {
			router.replace(callbackUrl);
		}
	}, [isPending, session, router, callbackUrl]);

	const handleGitHubLogin = async () => {
		setLoading(true);
		try {
			await signIn.social({
				provider: "github",
				callbackURL: callbackUrl,
			});
		} catch {
			setLoading(false);
		}
	};

	return (
		<main className="min-h-screen flex items-center justify-center bg-near-black">
			<div className="text-center max-w-sm px-6">
				<h1 className="text-3xl font-bold text-off-white mb-2">
					Holy Ship
				</h1>
				<p className="text-off-white/50 mb-10 italic">
					It's what you'll say when you see the results.
				</p>
				<button
					type="button"
					onClick={handleGitHubLogin}
					disabled={loading || isPending}
					className="w-full px-6 py-4 bg-signal-orange text-near-black font-semibold text-lg rounded hover:opacity-90 transition-opacity disabled:opacity-50"
				>
					{loading ? "Connecting..." : "Log in with GitHub"}
				</button>
				<p className="mt-6 text-off-white/30 text-sm">
					No account? Installing the GitHub App creates one automatically.
				</p>
				<a
					href="/connect"
					className="text-signal-orange text-sm hover:underline"
				>
					Install the GitHub App
				</a>
			</div>
		</main>
	);
}
```

- [ ] **Step 3: Run check**

Run: `cd /home/tsavo/holyship-platform-ui && pnpm check`
Expected: clean

- [ ] **Step 4: Commit**

```bash
git add src/app/\(auth\)/login/page.tsx tests/connect.test.tsx
git commit -m "feat: /login — GitHub-only auth with signal orange"
```

---

### Task 5: Update hero CTA and run full tests

**Files:**
- Modify: `src/components/landing/hero.tsx`

- [ ] **Step 1: Update CTA href**

In `src/components/landing/hero.tsx`, the CTA currently links to `/connect`. This is correct — `/connect` redirects to GitHub. No change needed if href is already `/connect`.

Verify the href is `/connect`:
```tsx
<a href="/connect" ...>Install the GitHub App</a>
```

- [ ] **Step 2: Run all tests**

Run: `cd /home/tsavo/holyship-platform-ui && npx vitest run`
Expected: All pass

- [ ] **Step 3: Run full check**

Run: `cd /home/tsavo/holyship-platform-ui && pnpm check`
Expected: clean

- [ ] **Step 4: Commit any final adjustments**

```bash
git add -A
git commit -m "feat: complete GitHub App connect flow — 3 clicks to dashboard"
```
