import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import {
	AddPaperclipCard,
	toSubdomainLabel,
} from "@/components/add-paperclip-card";

describe("AddPaperclipCard", () => {
	it("renders the + card with prompt text", () => {
		render(<AddPaperclipCard onAdd={vi.fn()} />);
		expect(screen.getByText(/add another paperclip/i)).toBeInTheDocument();
	});

	it("shows name input when clicked", async () => {
		const user = userEvent.setup();
		render(<AddPaperclipCard onAdd={vi.fn()} />);
		await user.click(screen.getByText(/add another paperclip/i));
		expect(screen.getByPlaceholderText(/name/i)).toBeInTheDocument();
	});

	it("calls onAdd with trimmed name on Enter", async () => {
		const user = userEvent.setup();
		const onAdd = vi.fn();
		render(<AddPaperclipCard onAdd={onAdd} />);
		await user.click(screen.getByText(/add another paperclip/i));
		const input = screen.getByPlaceholderText(/name/i);
		await user.type(input, "new-bot{Enter}");
		expect(onAdd).toHaveBeenCalledWith("new-bot");
	});

	it("does not call onAdd with empty name", async () => {
		const user = userEvent.setup();
		const onAdd = vi.fn();
		render(<AddPaperclipCard onAdd={onAdd} />);
		await user.click(screen.getByText(/add another paperclip/i));
		const input = screen.getByPlaceholderText(/name/i);
		await user.type(input, "{Enter}");
		expect(onAdd).not.toHaveBeenCalled();
	});

	it("shows error for names that produce empty subdomain labels", async () => {
		const user = userEvent.setup();
		const onAdd = vi.fn();
		render(<AddPaperclipCard onAdd={onAdd} />);
		await user.click(screen.getByText(/add another paperclip/i));
		const input = screen.getByPlaceholderText(/name/i);
		await user.type(input, "!!!{Enter}");
		expect(onAdd).not.toHaveBeenCalled();
		expect(screen.getByText(/at least one letter/i)).toBeInTheDocument();
	});

	it("sanitizes name with spaces and uppercase to DNS label", async () => {
		const user = userEvent.setup();
		const onAdd = vi.fn();
		render(<AddPaperclipCard onAdd={onAdd} />);
		await user.click(screen.getByText(/add another paperclip/i));
		const input = screen.getByPlaceholderText(/name/i);
		await user.type(input, "My Bot{Enter}");
		expect(onAdd).toHaveBeenCalledWith("my-bot");
	});

	it("collapses back on Escape", async () => {
		const user = userEvent.setup();
		render(<AddPaperclipCard onAdd={vi.fn()} />);
		await user.click(screen.getByText(/add another paperclip/i));
		expect(screen.getByPlaceholderText(/name/i)).toBeInTheDocument();
		await user.keyboard("{Escape}");
		expect(screen.queryByPlaceholderText(/name/i)).not.toBeInTheDocument();
	});

	it("shows loading state when adding is true", () => {
		render(<AddPaperclipCard onAdd={vi.fn()} adding={true} />);
		expect(screen.getByText(/creating/i)).toBeInTheDocument();
	});

	it("renders as subtle link variant without card border", () => {
		const { container } = render(
			<AddPaperclipCard onAdd={vi.fn()} variant="link" />,
		);
		expect(
			container.querySelector("[class*='border-dashed']"),
		).not.toBeInTheDocument();
	});
});

describe("toSubdomainLabel", () => {
	it("lowercases and replaces spaces with hyphens", () => {
		expect(toSubdomainLabel("My Bot")).toBe("my-bot");
	});

	it("strips invalid characters", () => {
		expect(toSubdomainLabel("bot_1!@#")).toBe("bot-1");
	});

	it("collapses multiple hyphens", () => {
		expect(toSubdomainLabel("a--b---c")).toBe("a-b-c");
	});

	it("trims leading and trailing hyphens", () => {
		expect(toSubdomainLabel("-hello-")).toBe("hello");
	});

	it("truncates to 63 characters", () => {
		const long = "a".repeat(100);
		expect(toSubdomainLabel(long).length).toBeLessThanOrEqual(63);
	});

	it("returns empty string for all-invalid input", () => {
		expect(toSubdomainLabel("!!!")).toBe("");
	});
});
