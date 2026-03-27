"use client";

import { useRef, useState } from "react";
import type { FlowChatMessage } from "@/lib/types";

interface FlowChatProps {
  messages: FlowChatMessage[];
  onSend: (message: string) => void;
  sending: boolean;
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex gap-2 items-start">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-xs text-orange-400">
        Y
      </div>
      <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-foreground">{text}</div>
    </div>
  );
}

function AiBubble({ text, changes }: { text: string; changes?: string[] }) {
  return (
    <div className="flex gap-2 items-start">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-xs text-green-400">
        &#x2731;
      </div>
      <div className="space-y-2">
        <div className="rounded-lg border border-green-500/10 bg-green-500/5 px-3 py-2 text-sm text-foreground">
          {text}
        </div>
        {changes && changes.length > 0 && (
          <div className="rounded-lg bg-black/30 px-3 py-2 font-mono text-xs leading-relaxed">
            {changes.map((change, i) => {
              const color = change.startsWith("+")
                ? "text-green-400"
                : change.startsWith("~")
                  ? "text-amber-400"
                  : change.startsWith("-")
                    ? "text-red-400"
                    : "text-muted-foreground";
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: diff lines are append-only
                <div key={`${i}-${change.slice(0, 20)}`} className={color}>
                  {change}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function FlowChat({ messages, onSend, sending }: FlowChatProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit() {
    const trimmed = input.trim();
    if (!trimmed || sending) return;
    onSend(trimmed);
    setInput("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="space-y-3">
      {messages.length > 0 && (
        <div className="space-y-3 max-h-80 overflow-y-auto">
          {messages.map((msg, i) => {
            if (msg.role === "user") {
              return (
                // biome-ignore lint/suspicious/noArrayIndexKey: messages are append-only
                <UserBubble key={`${i}-user`} text={msg.text} />
              );
            }
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: messages are append-only
              <AiBubble key={`${i}-ai`} text={msg.text} changes={msg.changes} />
            );
          })}
        </div>
      )}

      <div className="flex gap-2 items-end">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Talk about changes..."
          rows={1}
          disabled={sending}
          className="flex-1 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none resize-none disabled:opacity-50"
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!input.trim() || sending}
          className="shrink-0 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
        >
          {sending ? "Thinking..." : "Update"}
        </button>
      </div>
    </div>
  );
}
