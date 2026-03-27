import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@core/lib/brand-config", () => ({
	getBrandConfig: () => ({ domain: "nemopod.com" }),
}));

import { FirstRun } from "@/components/first-run";

function renderWith(ui: React.ReactElement) {
	const qc = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("FirstRun", () => {
	it("renders name input with prompt", () => {
		renderWith(<FirstRun onClaim={vi.fn()} claiming={false} />);
		expect(
			screen.getByPlaceholderText(/name your first agent/i),
		).toBeInTheDocument();
	});

	it("shows subdomain preview as user types", async () => {
		const user = userEvent.setup();
		renderWith(<FirstRun onClaim={vi.fn()} claiming={false} />);
		await user.type(
			screen.getByPlaceholderText(/name your first agent/i),
			"my-bot",
		);
		expect(screen.getByText(/my-bot\.nemopod\.com/)).toBeInTheDocument();
	});

	it("calls onClaim with sanitized name on Enter", async () => {
		const onClaim = vi.fn();
		const user = userEvent.setup();
		renderWith(<FirstRun onClaim={onClaim} claiming={false} />);
		await user.type(
			screen.getByPlaceholderText(/name your first agent/i),
			"My Bot{Enter}",
		);
		expect(onClaim).toHaveBeenCalledWith("my-bot");
	});

	it("shows validation error for empty input", async () => {
		const user = userEvent.setup();
		renderWith(<FirstRun onClaim={vi.fn()} claiming={false} />);
		const input = screen.getByPlaceholderText(/name your first agent/i);
		await user.click(input);
		await user.keyboard("{Enter}");
		expect(screen.getByText(/at least one letter/i)).toBeInTheDocument();
	});

	it("shows spinner when claiming", () => {
		renderWith(<FirstRun onClaim={vi.fn()} claiming={true} />);
		expect(screen.getByText(/creating/i)).toBeInTheDocument();
	});
});
