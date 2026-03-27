"use client";

import type { ChatMessage as ChatMessageType } from "@/lib/chat/types";

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  if (message.role === "event") {
    return (
      <div className="flex justify-center py-1" data-testid="chat-event-marker">
        <span className="text-xs font-mono text-muted-foreground/50">-&gt; {message.content}</span>
      </div>
    );
  }

  const isUser = message.role === "user";

  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
      data-testid={`chat-message-${message.role}`}
    >
      <div
        className={`max-w-[80%] rounded-lg px-3 py-2 ${
          isUser
            ? "bg-primary/20 text-sm font-mono text-foreground"
            : "bg-muted/30 text-sm font-mono text-muted-foreground"
        }`}
      >
        {message.content}
      </div>
    </div>
  );
}
