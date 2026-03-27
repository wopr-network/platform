"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { openChatStream, sendChatMessage } from "@/lib/api";
import { eventName } from "@/lib/brand-config";
import { uuid } from "@/lib/uuid";
import { clearChatHistory, getSessionId, loadChatHistory, saveChatHistory } from "./chat-store";
import type { ChatEvent, ChatMessage, ChatMode } from "./types";

/** Minimal interface for stream handles that support cleanup via .close(). */
interface Closeable {
  close(): void;
}

interface UseChatReturn {
  messages: ChatMessage[];
  mode: ChatMode;
  isConnected: boolean;
  isTyping: boolean;
  hasUnread: boolean;
  sessionId: string;
  sendMessage: (text: string) => void;
  addEventMarker: (text: string) => void;
  showTyping: () => void;
  notify: (text: string) => void;
  expand: () => void;
  collapse: () => void;
  fullscreen: () => void;
  clearHistory: () => void;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatHistory());
  const [mode, setMode] = useState<ChatMode>("collapsed");
  const modeRef = useRef<ChatMode>("collapsed");
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const sessionId = useRef(getSessionId());
  const eventSourceRef = useRef<Closeable | null>(null);
  const pendingBotMsgRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectDelayRef = useRef(1000);

  // Keep modeRef in sync for use inside callbacks
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Persist messages on change
  useEffect(() => {
    saveChatHistory(messages);
  }, [messages]);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const connectSSE = useCallback(() => {
    if (typeof window === "undefined") return;
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const abortController = new AbortController();
    eventSourceRef.current = {
      close: () => abortController.abort(),
    };

    const processLine = (line: string) => {
      if (!line.startsWith("data:")) return;
      const raw = line.slice(5).trim();
      if (!raw) return;
      try {
        const data = JSON.parse(raw) as ChatEvent;

        if (data.type === "text") {
          setIsTyping(true);
          if (pendingBotMsgRef.current === null) {
            pendingBotMsgRef.current = uuid();
          }
          const msgId = pendingBotMsgRef.current;
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === msgId);
            if (existing) {
              return prev.map((m) =>
                m.id === msgId ? { ...m, content: m.content + data.delta } : m,
              );
            }
            return [
              ...prev,
              { id: msgId, role: "bot" as const, content: data.delta, timestamp: Date.now() },
            ];
          });
        } else if (data.type === "tool_call") {
          window.dispatchEvent(
            new CustomEvent(eventName("chat-tool-call"), {
              detail: { tool: data.tool, args: data.args },
            }),
          );
        } else if (data.type === "done") {
          setIsTyping(false);
          pendingBotMsgRef.current = null;
          if (modeRef.current === "collapsed") setHasUnread(true);
        } else if (data.type === "error") {
          setIsTyping(false);
          pendingBotMsgRef.current = null;
          addMessage({
            id: uuid(),
            role: "bot",
            content: `Error: ${data.message}`,
            timestamp: Date.now(),
          });
        }
      } catch {
        // ignore malformed events
      }
    };

    openChatStream(sessionId.current, abortController.signal)
      .then(async (res) => {
        if (!res.ok || !res.body) throw new Error("SSE connection failed");
        setIsConnected(true);
        reconnectDelayRef.current = 1000;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            processLine(line);
          }
        }
      })
      .catch((err) => {
        if ((err as Error).name === "AbortError") return;
        setIsConnected(false);
        eventSourceRef.current = null;

        const delay = reconnectDelayRef.current;
        reconnectDelayRef.current = Math.min(delay * 2, 10000);
        reconnectTimeoutRef.current = setTimeout(connectSSE, delay);
      });
  }, [addMessage]);

  // Connect on mount
  useEffect(() => {
    connectSSE();
    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connectSSE]);

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      const userMsg: ChatMessage = {
        id: uuid(),
        role: "user",
        content: trimmed,
        timestamp: Date.now(),
      };
      addMessage(userMsg);
      setIsTyping(true);

      // POST to chat API
      sendChatMessage(sessionId.current, trimmed).catch(() => {
        setIsTyping(false);
        addMessage({
          id: uuid(),
          role: "bot",
          content: "Sorry, your message could not be sent. Please try again.",
          timestamp: Date.now(),
        });
      });
    },
    [addMessage],
  );

  const addEventMarker = useCallback(
    (text: string) => {
      addMessage({
        id: uuid(),
        role: "event",
        content: text,
        timestamp: Date.now(),
      });
    },
    [addMessage],
  );

  const expand = useCallback(() => {
    setMode("expanded");
    setHasUnread(false);
  }, []);

  const collapse = useCallback(() => {
    setMode("collapsed");
  }, []);

  const fullscreen = useCallback(() => {
    setMode("fullscreen");
    setHasUnread(false);
  }, []);

  const clearHistoryFn = useCallback(() => {
    setMessages([]);
    setIsTyping(false);
    pendingBotMsgRef.current = null;
    clearChatHistory();
  }, []);

  const showTyping = useCallback(() => {
    setIsTyping(true);
  }, []);

  const notify = useCallback(
    (text: string) => {
      addMessage({
        id: uuid(),
        role: "bot",
        content: text,
        timestamp: Date.now(),
      });
    },
    [addMessage],
  );

  return {
    messages,
    mode,
    isConnected,
    isTyping,
    hasUnread,
    sessionId: sessionId.current,
    sendMessage,
    addEventMarker,
    showTyping,
    notify,
    expand,
    collapse,
    fullscreen,
    clearHistory: clearHistoryFn,
  };
}
