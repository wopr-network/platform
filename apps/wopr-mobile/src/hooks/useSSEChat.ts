import { useCallback, useEffect, useRef, useState } from "react";
import EventSource from "react-native-sse";
import { apiFetch } from "../api/client";
import { API_BASE_URL } from "../lib/constants";
import type { ChatEvent } from "../types/chat";

export interface ChatMessage {
  _id: string;
  text: string;
  createdAt: Date;
  user: { _id: string; name: string };
}

const BOT_USER = { _id: "bot", name: "WOPR" };
const ME_USER = { _id: "me", name: "You" };

export function useSSEChat(sessionId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const pendingRef = useRef<string>("");

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryCount is intentionally used as a reconnect trigger
  useEffect(() => {
    const url = `${API_BASE_URL}/api/chat/stream?sessionId=${encodeURIComponent(sessionId)}`;
    const es = new EventSource(url, { withCredentials: true });

    es.addEventListener("open", () => setIsConnected(true));

    es.addEventListener("message", (event: { data?: string | null }) => {
      if (!event.data) return;
      try {
        const parsed = JSON.parse(event.data) as ChatEvent;
        if (parsed.type === "text") {
          pendingRef.current += parsed.delta;
          setIsTyping(true);
        } else if (parsed.type === "error") {
          setMessages((prev) => [
            {
              _id: crypto.randomUUID(),
              text: `Error: ${parsed.message}`,
              createdAt: new Date(),
              user: BOT_USER,
            },
            ...prev,
          ]);
          setIsTyping(false);
        } else if (parsed.type === "done") {
          if (pendingRef.current) {
            const text = pendingRef.current;
            pendingRef.current = "";
            setMessages((prev) => [
              {
                _id: crypto.randomUUID(),
                text,
                createdAt: new Date(),
                user: BOT_USER,
              },
              ...prev,
            ]);
          }
          setIsTyping(false);
        }
      } catch {
        // ignore malformed SSE
      }
    });

    es.addEventListener("error", () => {
      setIsConnected(false);
      es.close();
      // Reconnect after 3 seconds by incrementing retryCount, which re-runs this effect
      setTimeout(() => {
        setRetryCount((c) => c + 1);
      }, 3000);
    });

    return () => {
      es.close();
    };
  }, [sessionId, retryCount]);

  const sendMessage = useCallback(
    async (text: string) => {
      // Add user message immediately
      setMessages((prev) => [
        {
          _id: crypto.randomUUID(),
          text,
          createdAt: new Date(),
          user: ME_USER,
        },
        ...prev,
      ]);

      await apiFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify({ sessionId, message: text }),
      });
    },
    [sessionId],
  );

  return { messages, sendMessage, isConnected, isTyping };
}
