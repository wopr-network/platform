import { beforeEach, describe, expect, it } from "vitest";
import {
  clearChatHistory,
  getSessionId,
  loadChatHistory,
  MAX_CHAT_HISTORY,
  MAX_MESSAGE_CONTENT_LENGTH,
  saveChatHistory,
} from "@/lib/chat/chat-store";
import type { ChatMessage } from "@/lib/chat/types";

describe("chat-store", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("getSessionId", () => {
    it("generates a session ID on first call", () => {
      const id = getSessionId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(typeof id).toBe("string");
      expect(id.length).toBeGreaterThan(10);
    });

    it("returns the same session ID on subsequent calls", () => {
      const id1 = getSessionId();
      const id2 = getSessionId();
      expect(id1).toBe(id2);
    });
  });

  describe("loadChatHistory / saveChatHistory", () => {
    it("returns empty array when no history saved", () => {
      expect(loadChatHistory()).toEqual([]);
    });

    it("round-trips messages through localStorage", () => {
      const messages: ChatMessage[] = [
        { id: "1", role: "user", content: "hello", timestamp: 1000 },
        { id: "2", role: "bot", content: "hi there", timestamp: 1001 },
      ];
      saveChatHistory(messages);
      expect(loadChatHistory()).toEqual(messages);
    });

    it("returns empty array when localStorage contains invalid JSON shape", () => {
      localStorage.setItem("platform-chat-history", JSON.stringify([{ bad: "data" }]));
      expect(loadChatHistory()).toEqual([]);
    });

    it("returns empty array when localStorage contains non-array JSON", () => {
      localStorage.setItem("platform-chat-history", JSON.stringify({ id: "1", role: "user" }));
      expect(loadChatHistory()).toEqual([]);
    });

    it("returns empty array when a message has an invalid role", () => {
      localStorage.setItem(
        "platform-chat-history",
        JSON.stringify([{ id: "1", role: "admin", content: "hi", timestamp: 1000 }]),
      );
      expect(loadChatHistory()).toEqual([]);
    });

    it("returns empty array when a message is missing required fields", () => {
      localStorage.setItem("platform-chat-history", JSON.stringify([{ id: "1", role: "user" }]));
      expect(loadChatHistory()).toEqual([]);
    });

    it("strips extra fields from valid messages", () => {
      localStorage.setItem(
        "platform-chat-history",
        JSON.stringify([
          { id: "1", role: "user", content: "hi", timestamp: 1000, xss: "<script>" },
        ]),
      );
      const result = loadChatHistory();
      expect(result).toEqual([{ id: "1", role: "user", content: "hi", timestamp: 1000 }]);
      expect((result[0] as unknown as Record<string, unknown>).xss).toBeUndefined();
    });
  });

  describe("clearChatHistory", () => {
    it("removes saved history", () => {
      saveChatHistory([{ id: "1", role: "user", content: "hello", timestamp: 1000 }]);
      clearChatHistory();
      expect(loadChatHistory()).toEqual([]);
    });
  });

  describe("saveChatHistory limits", () => {
    it("keeps only the last MAX_CHAT_HISTORY messages", () => {
      const total = MAX_CHAT_HISTORY + 50;
      const messages: ChatMessage[] = Array.from({ length: total }, (_, i) => ({
        id: String(i),
        role: "user" as const,
        content: `msg ${i}`,
        timestamp: 1000 + i,
      }));
      saveChatHistory(messages);
      const loaded = loadChatHistory();
      expect(loaded).toHaveLength(MAX_CHAT_HISTORY);
      // Should keep the LAST MAX_CHAT_HISTORY (indices 50-149)
      expect(loaded[0].id).toBe("50");
      expect(loaded[MAX_CHAT_HISTORY - 1].id).toBe(String(total - 1));
    });

    it("truncates message content exceeding MAX_MESSAGE_CONTENT_LENGTH and appends ellipsis", () => {
      const longContent = "x".repeat(MAX_MESSAGE_CONTENT_LENGTH + 1000);
      const messages: ChatMessage[] = [
        { id: "1", role: "user", content: longContent, timestamp: 1000 },
      ];
      saveChatHistory(messages);
      const loaded = loadChatHistory();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].content).toHaveLength(MAX_MESSAGE_CONTENT_LENGTH + 1);
      expect(loaded[0].content).toBe(`${"x".repeat(MAX_MESSAGE_CONTENT_LENGTH)}…`);
    });

    it("does not mutate the original messages array when saving", () => {
      const longContent = "x".repeat(MAX_MESSAGE_CONTENT_LENGTH + 1000);
      const messages: ChatMessage[] = [
        { id: "1", role: "user", content: longContent, timestamp: 1000 },
      ];
      const originalContent = messages[0].content;
      saveChatHistory(messages);
      // localStorage copy is truncated; in-memory array must be unchanged
      expect(messages[0].content).toBe(originalContent);
      expect(messages[0].content).toHaveLength(MAX_MESSAGE_CONTENT_LENGTH + 1000);
    });

    it("slices by Unicode codepoints so emoji are not split", () => {
      // Each emoji is 2 UTF-16 code units but 1 codepoint.
      // String.slice() cuts by code units; [...str].slice() cuts by codepoints.
      // A string of MAX_MESSAGE_CONTENT_LENGTH emoji has 2*MAX code units.
      // With .slice() the last emoji would be split; with spread it must not be.
      const emoji = "\u{1F600}"; // 😀 — 2 code units
      const longContent = emoji.repeat(MAX_MESSAGE_CONTENT_LENGTH + 100);
      const messages: ChatMessage[] = [
        { id: "1", role: "user", content: longContent, timestamp: 1000 },
      ];
      saveChatHistory(messages);
      const loaded = loadChatHistory();
      const stored = loaded[0].content;
      // The stored content (minus ellipsis) must decode to valid codepoints only.
      // If the last emoji were split, it would contain a lone surrogate which
      // JSON.parse would either mangle or preserve as an invalid codepoint.
      const withoutEllipsis = stored.slice(0, -1); // remove "…"
      expect([...withoutEllipsis].every((ch) => ch === emoji)).toBe(true);
    });

    it("does not truncate content at or below the limit", () => {
      const exactContent = "y".repeat(MAX_MESSAGE_CONTENT_LENGTH);
      const messages: ChatMessage[] = [
        { id: "1", role: "user", content: exactContent, timestamp: 1000 },
      ];
      saveChatHistory(messages);
      const loaded = loadChatHistory();
      expect(loaded[0].content).toBe(exactContent);
    });

    it("applies both message count and content length limits together", () => {
      const total = MAX_CHAT_HISTORY + 10;
      const messages: ChatMessage[] = Array.from({ length: total }, (_, i) => ({
        id: String(i),
        role: "bot" as const,
        content: "z".repeat(MAX_MESSAGE_CONTENT_LENGTH + 1000),
        timestamp: 1000 + i,
      }));
      saveChatHistory(messages);
      const loaded = loadChatHistory();
      expect(loaded).toHaveLength(MAX_CHAT_HISTORY);
      expect(loaded[0].id).toBe("10");
      for (const msg of loaded) {
        expect(msg.content).toHaveLength(MAX_MESSAGE_CONTENT_LENGTH + 1);
        expect(msg.content.endsWith("…")).toBe(true);
      }
    });
  });
});
