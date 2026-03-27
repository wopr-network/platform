import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ChatInput } from "@/components/chat/chat-input";

describe("ChatInput", () => {
  it("renders textarea and send button", () => {
    render(<ChatInput onSend={vi.fn()} />);
    expect(screen.getByLabelText("Chat message input")).toBeInTheDocument();
    expect(screen.getByLabelText("Send message")).toBeInTheDocument();
  });

  it("calls onSend with trimmed text when clicking send", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    await user.type(screen.getByLabelText("Chat message input"), "  hello world  ");
    await user.click(screen.getByLabelText("Send message"));

    expect(onSend).toHaveBeenCalledWith("hello world");
  });

  it("clears input after sending", async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={vi.fn()} />);

    const input = screen.getByLabelText("Chat message input");
    await user.type(input, "test");
    await user.click(screen.getByLabelText("Send message"));

    expect(input).toHaveValue("");
  });

  it("sends on Enter key (without Shift)", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    await user.type(screen.getByLabelText("Chat message input"), "enter test");
    await user.keyboard("{Enter}");

    expect(onSend).toHaveBeenCalledWith("enter test");
  });

  it("does not send on Shift+Enter", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    await user.type(screen.getByLabelText("Chat message input"), "multi");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not send empty/whitespace-only messages", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} />);

    await user.type(screen.getByLabelText("Chat message input"), "   ");
    await user.click(screen.getByLabelText("Send message"));

    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables textarea and button when disabled prop is true", () => {
    render(<ChatInput onSend={vi.fn()} disabled />);
    expect(screen.getByLabelText("Chat message input")).toBeDisabled();
    expect(screen.getByLabelText("Send message")).toBeDisabled();
  });

  it("disables send button when input is empty", () => {
    render(<ChatInput onSend={vi.fn()} />);
    expect(screen.getByLabelText("Send message")).toBeDisabled();
  });
});
