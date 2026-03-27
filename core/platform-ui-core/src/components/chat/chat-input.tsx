"use client";

import { type KeyboardEvent, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

interface ChatInputProps {
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  }, [value, onSend]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="flex gap-2 border-t border-border p-3" data-testid="chat-input">
      <textarea
        rows={1}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a message..."
        disabled={disabled}
        className="flex-1 resize-none bg-transparent font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
        aria-label="Chat message input"
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleSend}
        disabled={!value.trim() || disabled}
        className="px-3 py-1 text-xs font-mono text-terminal hover:text-terminal/80 hover:bg-transparent"
        aria-label="Send message"
      >
        SEND
      </Button>
    </div>
  );
}
