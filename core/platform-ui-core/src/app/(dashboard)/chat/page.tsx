"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessage } from "@/components/chat/chat-message";
import { Button } from "@/components/ui/button";
import { brandName } from "@/lib/brand-config";
import { useChatContext } from "@/lib/chat/chat-context";

export default function ChatPage() {
  const { messages, isConnected, isTyping, sendMessage, clearHistory } = useChatContext();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll must fire when messages or typing state changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <div className="flex h-full flex-col" data-testid="chat-page">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <output
            className={`h-2 w-2 rounded-full inline-block ${isConnected ? "bg-terminal" : "bg-destructive"}`}
            aria-label={isConnected ? "Connected" : "Disconnected"}
          />
          <h1 className="text-sm font-mono uppercase tracking-wider text-muted-foreground">
            {brandName()}
          </h1>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => clearHistory()}
          className="text-muted-foreground hover:text-foreground"
          aria-label="Clear chat history"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2 max-w-2xl mx-auto w-full">
        {messages.length === 0 && isConnected && (
          <p className="text-center text-sm text-muted-foreground py-12">
            Send a message to start a conversation with your bot.
          </p>
        )}
        {messages.length === 0 && !isConnected && (
          <p className="text-center text-xs text-muted-foreground animate-ellipsis">
            Connecting to {brandName()}
          </p>
        )}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {isTyping && (
          <div className="flex justify-start" data-testid="chat-typing-indicator">
            <span className="text-xs font-mono text-terminal animate-ellipsis">...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="max-w-2xl mx-auto w-full">
        <ChatInput onSend={sendMessage} disabled={!isConnected} />
      </div>
    </div>
  );
}
