import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted mocks — these run before imports
const { mockReplace, mockSignInSocial, mockSearchParams } = vi.hoisted(() => {
	const params = { current: new URLSearchParams("installation_id=123&setup_action=install") };
	return {
		mockReplace: vi.fn(),
		mockSignInSocial: vi.fn().mockResolvedValue({}),
		mockSearchParams: params,
	};
});

vi.mock("next/navigation", () => ({
	useSearchParams: () => mockSearchParams.current,
	useRouter: () => ({ replace: mockReplace }),
	redirect: vi.fn(),
}));

vi.mock("@core/lib/auth-client", () => ({
	signIn: { social: mockSignInSocial },
	useSession: () => ({ data: null, isPending: false }),
}));

vi.mock("@core/lib/brand-config", () => ({
	getBrandConfig: () => ({
		homePath: "/dashboard",
		productName: "Holy Ship",
		brandName: "Holy Ship",
		domain: "holyship.wtf",
	}),
}));

import ConnectCallbackPage from "../src/app/connect/callback/page";
import ConnectCompletePage from "../src/app/connect/complete/page";
import LoginPage from "../src/app/(auth)/login/page";

describe("ConnectCallback", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
		mockSearchParams.current = new URLSearchParams(
			"installation_id=123&setup_action=install",
		);
	});

	it("stores installation_id in sessionStorage on install", () => {
		render(<ConnectCallbackPage />);
		expect(sessionStorage.getItem("holyship_installation_id")).toBe("123");
	});

	it("triggers GitHub OAuth via better-auth", () => {
		render(<ConnectCallbackPage />);
		expect(mockSignInSocial).toHaveBeenCalledWith({
			provider: "github",
			callbackURL: "/connect/complete",
		});
	});

	it("redirects to dashboard on setup_action=update", () => {
		mockSearchParams.current = new URLSearchParams("setup_action=update");
		render(<ConnectCallbackPage />);
		expect(mockReplace).toHaveBeenCalledWith("/dashboard");
	});

	it("shows requesting message for setup_action=request", () => {
		mockSearchParams.current = new URLSearchParams("setup_action=request");
		render(<ConnectCallbackPage />);
		expect(screen.getByText(/waiting for approval/i)).toBeDefined();
	});
});

describe("ConnectComplete", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		sessionStorage.clear();
	});

	it("redirects to dashboard when no installation_id stored", () => {
		render(<ConnectCompletePage />);
		expect(mockReplace).toHaveBeenCalledWith("/dashboard");
	});
});

describe("LoginPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSearchParams.current = new URLSearchParams();
	});

	it("renders GitHub login button", () => {
		render(<LoginPage />);
		expect(
			screen.getByRole("button", { name: /log in with github/i }),
		).toBeDefined();
	});

});
