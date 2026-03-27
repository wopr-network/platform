import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@core/lib/brand-config", () => ({
	getBrandConfig: () => ({ domain: "nemopod.com", productName: "NemoPod" }),
	productName: () => "NemoPod",
}));

vi.mock("@core/lib/api", () => ({
	mapBotState: (s: string) => s,
	apiFetch: vi.fn(),
}));
vi.mock("@core/lib/errors", () => ({
	toUserMessage: (_: unknown, f: string) => f,
}));

vi.mock("@core/components/chat/chat-panel", () => ({
	ChatPanel: (props: Record<string, unknown>) =>
		React.createElement("div", {
			"data-testid": "chat-panel",
			"data-connected": String(props.isConnected),
		}),
}));

vi.mock("@/hooks/use-instance-chat", () => ({
	useInstanceChat: () => ({
		messages: [],
		isConnected: false,
		isTyping: false,
		sessionId: "test-session",
		sendMessage: vi.fn(),
		clearHistory: vi.fn(),
	}),
}));

import { NemoClawApp } from "@/components/nemoclaw-app";

function renderWith(ui: React.ReactElement) {
	const qc = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function mockFetchInstances(
	bots: Array<{ id: string; name: string; state: string }>,
) {
	vi.spyOn(global, "fetch").mockResolvedValue({
		ok: true,
		json: async () => ({ result: { data: { bots } } }),
	} as Response);
}

describe("NemoClawApp", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("shows first-run when no instances", async () => {
		mockFetchInstances([]);
		renderWith(<NemoClawApp />);
		await waitFor(() => {
			expect(
				screen.getByPlaceholderText(/name your first agent/i),
			).toBeInTheDocument();
		});
	});

	it("shows tabs when instances exist", async () => {
		mockFetchInstances([{ id: "1", name: "my-bot", state: "running" }]);
		renderWith(<NemoClawApp />);
		await waitFor(() => {
			expect(screen.getByText("my-bot")).toBeInTheDocument();
		});
	});

	it("shows loading state initially", () => {
		vi.spyOn(global, "fetch").mockReturnValue(new Promise(() => {}));
		renderWith(<NemoClawApp />);
		expect(screen.getByText(/loading/i)).toBeInTheDocument();
	});

	it("shows ChatPanel for active instance", async () => {
		mockFetchInstances([
			{ id: "a", name: "alpha", state: "running" },
			{ id: "b", name: "beta", state: "stopped" },
		]);
		renderWith(<NemoClawApp />);
		await waitFor(() => {
			expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
			expect(screen.getByText("alpha")).toBeInTheDocument();
			expect(screen.getByText("beta")).toBeInTheDocument();
		});
	});
});
