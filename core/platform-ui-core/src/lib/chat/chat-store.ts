import { z } from "zod";
import { storageKey } from "../brand-config";
import { uuid } from "../uuid";
import type { ChatMessage } from "./types";

const HISTORY_KEY = storageKey("chat-history");
const SESSION_KEY = storageKey("chat-session");

/** Maximum number of messages persisted to localStorage. */
export const MAX_CHAT_HISTORY = 100;

/** Maximum character length for a single message's content field. */
export const MAX_MESSAGE_CONTENT_LENGTH = 4_000;

const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "bot", "event"]),
  content: z.string(),
  timestamp: z.number(),
});

export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const id = uuid();
    localStorage.setItem(SESSION_KEY, id);
    return id;
  } catch {
    // localStorage blocked (private browsing) — use ephemeral session ID
    return uuid();
  }
}

export function loadChatHistory(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : [];
    return arr.flatMap((item) => {
      const result = ChatMessageSchema.safeParse(item);
      return result.success ? [result.data] : [];
    });
  } catch {
    // ignore — malformed JSON
  }
  return [];
}

export function saveChatHistory(messages: ChatMessage[]): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = messages.slice(-MAX_CHAT_HISTORY).map((msg) => {
      const codepoints = [...msg.content];
      return codepoints.length > MAX_MESSAGE_CONTENT_LENGTH
        ? { ...msg, content: `${codepoints.slice(0, MAX_MESSAGE_CONTENT_LENGTH).join("")}…` }
        : msg;
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
  } catch {
    // ignore — quota exceeded or private browsing
  }
}

export function clearChatHistory(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // ignore
  }
}
