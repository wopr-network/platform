"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { ChatInput } from "@/components/chat/chat-input";
import { ChatMessage } from "@/components/chat/chat-message";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ChatMessage as ChatMessageType } from "@/lib/chat/types";

interface SetupChatPanelProps {
  isOpen: boolean;
  pluginName: string | null;
  messages: ChatMessageType[];
  isConnected: boolean;
  isTyping: boolean;
  isComplete: boolean;
  onSend: (text: string) => void;
  onClose: () => void;
}

export function SetupChatPanel({
  isOpen,
  pluginName,
  messages,
  isConnected,
  isTyping,
  isComplete,
  onSend,
  onClose,
}: SetupChatPanelProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on message/typing state changes is intentional
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col p-0 sm:w-[440px]">
        {/* Header */}
        <SheetHeader className="border-b border-border bg-card px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isConnected ? "animate-pulse bg-terminal" : "bg-muted-foreground"
              }`}
            />
            <div>
              <SheetTitle className="text-sm font-mono uppercase tracking-[0.15em]">
                {pluginName ?? "Plugin"} Setup
              </SheetTitle>
              <SheetDescription className="text-xs font-mono text-muted-foreground">
                {isComplete ? "Configuration complete" : "Configure via conversation"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Messages area */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.length === 0 && !isConnected && (
            <p className="font-mono text-sm text-terminal/60 animate-pulse">
              &gt; Initializing setup...
            </p>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={
                  msg.role === "user"
                    ? { opacity: 0, x: 8 }
                    : msg.role === "bot"
                      ? { opacity: 0, x: -8 }
                      : { opacity: 0 }
                }
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
              >
                {msg.role === "bot" ? (
                  <div className="flex gap-2">
                    <span className="mt-0.5 font-mono text-sm text-terminal/40 select-none">
                      &gt;
                    </span>
                    <p className="font-mono text-sm leading-relaxed text-terminal">{msg.content}</p>
                  </div>
                ) : msg.role === "event" ? (
                  <div className="flex gap-2">
                    <span className="mt-0.5 font-mono text-sm text-destructive/60 select-none">
                      !
                    </span>
                    <p className="font-mono text-sm leading-relaxed text-destructive">
                      {msg.content}
                    </p>
                  </div>
                ) : (
                  <ChatMessage message={msg} />
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing indicator */}
          <AnimatePresence>
            {isTyping && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 pl-5"
              >
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1 w-1 rounded-full bg-terminal"
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{
                      repeat: Number.POSITIVE_INFINITY,
                      duration: 1.2,
                      delay: i * 0.15,
                    }}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Completion state */}
          <AnimatePresence>
            {isComplete && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="flex flex-col items-center justify-center gap-2 py-4"
              >
                <CheckCircle2 className="h-8 w-8 text-terminal" />
                <span className="font-mono text-sm uppercase tracking-wider text-terminal">
                  Setup complete
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          <div ref={messagesEndRef} />
        </div>

        {/* Input area or Done button */}
        <AnimatePresence>
          {isComplete ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.2 }}
              className="border-t border-border p-4"
            >
              <Button
                onClick={onClose}
                className="w-full rounded-sm bg-terminal font-mono text-black hover:bg-terminal/80"
              >
                Done
              </Button>
            </motion.div>
          ) : (
            <motion.div exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              <ChatInput onSend={onSend} disabled={!isConnected} />
            </motion.div>
          )}
        </AnimatePresence>
      </SheetContent>
    </Sheet>
  );
}
