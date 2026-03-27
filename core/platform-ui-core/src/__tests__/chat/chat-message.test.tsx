import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatMessage } from "@/components/chat/chat-message";
import type { ChatMessage as ChatMessageType } from "@/lib/chat/types";
import { uuid } from "@/lib/uuid";

function msg(
  overrides: Partial<ChatMessageType> & { role: ChatMessageType["role"]; content: string },
): ChatMessageType {
  return { id: uuid(), timestamp: Date.now(), ...overrides };
}

describe("ChatMessage", () => {
  it("renders user message with right-aligned styling", () => {
    render(<ChatMessage message={msg({ role: "user", content: "Hello bot" })} />);
    const el = screen.getByTestId("chat-message-user");
    expect(el).toBeInTheDocument();
    expect(el.className).toContain("justify-end");
    expect(screen.getByText("Hello bot")).toBeInTheDocument();
  });

  it("renders bot message with left-aligned styling", () => {
    render(<ChatMessage message={msg({ role: "bot", content: "Hi there" })} />);
    const el = screen.getByTestId("chat-message-bot");
    expect(el).toBeInTheDocument();
    expect(el.className).toContain("justify-start");
    expect(screen.getByText("Hi there")).toBeInTheDocument();
  });

  it("renders event message as centered marker", () => {
    render(<ChatMessage message={msg({ role: "event", content: "session started" })} />);
    const el = screen.getByTestId("chat-event-marker");
    expect(el).toBeInTheDocument();
    expect(screen.getByText(/session started/)).toBeInTheDocument();
  });

  it("applies different background classes for user vs bot", () => {
    const { rerender } = render(<ChatMessage message={msg({ role: "user", content: "u" })} />);
    const userBubble = screen.getByText("u");
    expect(userBubble.className).toContain("bg-primary/20");

    rerender(<ChatMessage message={msg({ role: "bot", content: "b" })} />);
    const botBubble = screen.getByText("b");
    expect(botBubble.className).toContain("bg-muted/30");
  });
});
