import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ChatPanel } from "@/components/chat/chat-panel";
import type { ChatMessage as ChatMessageType } from "@/lib/chat/types";
import { uuid } from "@/lib/uuid";

// jsdom does not implement scrollIntoView — polyfill it for ChatPanel's auto-scroll useEffect
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

function msg(
  overrides: Partial<ChatMessageType> & { role: ChatMessageType["role"]; content: string },
): ChatMessageType {
  return { id: uuid(), timestamp: Date.now(), ...overrides };
}

const baseProps = {
  messages: [] as ChatMessageType[],
  mode: "expanded" as const,
  isConnected: true,
  isTyping: false,
  onSend: vi.fn(),
  onClose: vi.fn(),
  onFullscreen: vi.fn(),
};

describe("ChatPanel", () => {
  it("renders in expanded mode with panel testid", () => {
    render(<ChatPanel {...baseProps} />);
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
  });

  it("renders in fullscreen mode with fullscreen testid", () => {
    render(<ChatPanel {...baseProps} mode="fullscreen" />);
    expect(screen.getByTestId("chat-fullscreen")).toBeInTheDocument();
  });

  it("shows connected indicator when isConnected is true", () => {
    render(<ChatPanel {...baseProps} isConnected={true} />);
    expect(screen.getByLabelText("Connected")).toBeInTheDocument();
  });

  it("shows disconnected indicator when isConnected is false", () => {
    render(<ChatPanel {...baseProps} isConnected={false} />);
    expect(screen.getByLabelText("Disconnected")).toBeInTheDocument();
  });

  it("renders message list with user and bot messages", () => {
    const messages = [
      msg({ role: "user", content: "Question?" }),
      msg({ role: "bot", content: "Answer!" }),
    ];
    render(<ChatPanel {...baseProps} messages={messages} />);
    expect(screen.getByText("Question?")).toBeInTheDocument();
    expect(screen.getByText("Answer!")).toBeInTheDocument();
  });

  it("shows 'Connecting to Platform' when no messages and disconnected", () => {
    render(<ChatPanel {...baseProps} messages={[]} isConnected={false} />);
    expect(screen.getByText("Connecting to Platform")).toBeInTheDocument();
  });

  it("does NOT show connecting text when connected with no messages", () => {
    render(<ChatPanel {...baseProps} messages={[]} isConnected={true} />);
    expect(screen.queryByText("Connecting to Platform")).not.toBeInTheDocument();
  });

  it("shows typing indicator when isTyping is true", () => {
    render(<ChatPanel {...baseProps} isTyping={true} />);
    expect(screen.getByTestId("chat-typing-indicator")).toBeInTheDocument();
  });

  it("hides typing indicator when isTyping is false", () => {
    render(<ChatPanel {...baseProps} isTyping={false} />);
    expect(screen.queryByTestId("chat-typing-indicator")).not.toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<ChatPanel {...baseProps} onClose={onClose} />);

    await user.click(screen.getByLabelText("Close chat"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows fullscreen button in expanded mode", () => {
    render(<ChatPanel {...baseProps} mode="expanded" />);
    expect(screen.getByLabelText("Full screen")).toBeInTheDocument();
  });

  it("hides fullscreen button in fullscreen mode", () => {
    render(<ChatPanel {...baseProps} mode="fullscreen" />);
    expect(screen.queryByLabelText("Full screen")).not.toBeInTheDocument();
  });

  it("calls onFullscreen when fullscreen button is clicked", async () => {
    const user = userEvent.setup();
    const onFullscreen = vi.fn();
    render(<ChatPanel {...baseProps} onFullscreen={onFullscreen} />);

    await user.click(screen.getByLabelText("Full screen"));
    expect(onFullscreen).toHaveBeenCalledOnce();
  });

  it("disables chat input when disconnected", () => {
    render(<ChatPanel {...baseProps} isConnected={false} />);
    expect(screen.getByLabelText("Chat message input")).toBeDisabled();
  });
});
