import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatContextValue } from "@/lib/chat/chat-context";

// ChatPanel uses scrollIntoView for auto-scroll; jsdom doesn't implement it
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

let mockContext: ChatContextValue;

vi.mock("@/lib/chat/chat-context", () => ({
  useChatContext: () => mockContext,
}));

// Import AFTER mock is defined
import { ChatWidget } from "@/components/chat/chat-widget";

describe("ChatWidget", () => {
  beforeEach(() => {
    mockContext = {
      messages: [],
      mode: "collapsed",
      isConnected: true,
      isTyping: false,
      hasUnread: false,
      sessionId: "test-session",
      expand: vi.fn(),
      collapse: vi.fn(),
      fullscreen: vi.fn(),
      sendMessage: vi.fn(),
      addEventMarker: vi.fn(),
      showTyping: vi.fn(),
      notify: vi.fn(),
      clearHistory: vi.fn(),
    };
  });

  it("shows ambient dot in collapsed mode", () => {
    mockContext.mode = "collapsed";
    render(<ChatWidget />);
    expect(screen.getByTestId("chat-ambient-dot")).toBeInTheDocument();
  });

  it("shows chat panel in expanded mode", () => {
    mockContext.mode = "expanded";
    render(<ChatWidget />);
    expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
    expect(screen.queryByTestId("chat-ambient-dot")).not.toBeInTheDocument();
  });

  it("shows fullscreen panel in fullscreen mode", () => {
    mockContext.mode = "fullscreen";
    render(<ChatWidget />);
    expect(screen.getByTestId("chat-fullscreen")).toBeInTheDocument();
  });

  it("calls expand when ambient dot is clicked", async () => {
    const user = userEvent.setup();
    mockContext.mode = "collapsed";
    render(<ChatWidget />);

    await user.click(screen.getByTestId("chat-ambient-dot"));
    expect(mockContext.expand).toHaveBeenCalledOnce();
  });

  it("calls collapse when close button is clicked in expanded mode", async () => {
    const user = userEvent.setup();
    mockContext.mode = "expanded";
    render(<ChatWidget />);

    await user.click(screen.getByLabelText("Close chat"));
    expect(mockContext.collapse).toHaveBeenCalledOnce();
  });

  it("passes hasUnread to ambient dot", () => {
    mockContext.hasUnread = true;
    render(<ChatWidget />);
    expect(screen.getByTestId("chat-unread-pulse")).toBeInTheDocument();
  });
});
