import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@core/lib/brand-config", () => ({
	getBrandConfig: () => ({ domain: "nemopod.com" }),
}));

import { ChatTabBar } from "@/components/chat-tabs";

const instances = [
	{ id: "1", name: "my-bot", status: "running" as const },
	{ id: "2", name: "testa", status: "stopped" as const },
];

describe("ChatTabBar", () => {
	it("renders a tab for each instance", () => {
		render(
			<ChatTabBar
				instances={instances}
				activeId="1"
				onSelect={vi.fn()}
				onAdd={vi.fn()}
			/>,
		);
		expect(screen.getByText("my-bot")).toBeInTheDocument();
		expect(screen.getByText("testa")).toBeInTheDocument();
	});

	it("highlights the active tab", () => {
		render(
			<ChatTabBar
				instances={instances}
				activeId="1"
				onSelect={vi.fn()}
				onAdd={vi.fn()}
			/>,
		);
		const activeTab = screen.getByText("my-bot").closest("button");
		expect(activeTab?.className).toMatch(/border-indigo/);
	});

	it("calls onSelect when clicking a tab", async () => {
		const onSelect = vi.fn();
		const user = userEvent.setup();
		render(
			<ChatTabBar
				instances={instances}
				activeId="1"
				onSelect={onSelect}
				onAdd={vi.fn()}
			/>,
		);
		await user.click(screen.getByText("testa"));
		expect(onSelect).toHaveBeenCalledWith("2");
	});

	it("renders + button", () => {
		render(
			<ChatTabBar
				instances={instances}
				activeId="1"
				onSelect={vi.fn()}
				onAdd={vi.fn()}
			/>,
		);
		expect(screen.getByLabelText(/add agent/i)).toBeInTheDocument();
	});

	it("calls onAdd when clicking +", async () => {
		const onAdd = vi.fn();
		const user = userEvent.setup();
		render(
			<ChatTabBar
				instances={instances}
				activeId="1"
				onSelect={vi.fn()}
				onAdd={onAdd}
			/>,
		);
		await user.click(screen.getByLabelText(/add agent/i));
		expect(onAdd).toHaveBeenCalled();
	});
});
