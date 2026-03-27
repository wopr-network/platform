"use client";

import { motion } from "framer-motion";
import { Maximize2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { brandName } from "@/lib/brand-config";
import type { ChatMessage as ChatMessageType, ChatMode } from "@/lib/chat/types";
import { ChatInput } from "./chat-input";
import { ChatMessage } from "./chat-message";

interface ChatPanelProps {
  messages: ChatMessageType[];
  mode: ChatMode;
  isConnected: boolean;
  isTyping: boolean;
  onSend: (text: string) => void;
  onClose: () => void;
  onFullscreen: () => void;
}

const panelVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring" as const, damping: 25, stiffness: 300 },
  },
  exit: { opacity: 0, y: 20, scale: 0.95, transition: { duration: 0.15 } },
};

const fullscreenVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export function ChatPanel({
  messages,
  mode,
  isConnected,
  isTyping,
  onSend,
  onClose,
  onFullscreen,
}: ChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isFullscreen = mode === "fullscreen";

  // Auto-scroll on new messages — messageCount and isTyping are intentional triggers
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll must fire when message count or typing state changes
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isTyping]);

  const variants = isFullscreen ? fullscreenVariants : panelVariants;

  return (
    <motion.div
      variants={variants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={
        isFullscreen
          ? "fixed inset-0 z-50 flex flex-col bg-background"
          : "fixed bottom-0 right-0 z-50 flex h-[60vh] w-full flex-col rounded-t-lg border border-border bg-background shadow-2xl lg:bottom-6 lg:right-6 lg:h-[500px] lg:w-[400px] lg:rounded-lg"
      }
      data-testid={isFullscreen ? "chat-fullscreen" : "chat-panel"}
      style={
        !isFullscreen
          ? { boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 15px rgba(0, 255, 65, 0.05)" }
          : undefined
      }
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <output
            className={`h-2 w-2 rounded-full inline-block ${isConnected ? "bg-terminal" : "bg-destructive"}`}
            aria-label={isConnected ? "Connected" : "Disconnected"}
          />
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            {brandName()}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {!isFullscreen && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={onFullscreen}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Full screen"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close chat"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div
        className={`flex-1 overflow-y-auto px-4 py-3 space-y-2 ${isFullscreen ? "max-w-2xl mx-auto w-full" : ""}`}
      >
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
      <ChatInput onSend={onSend} disabled={!isConnected} />
    </motion.div>
  );
}
