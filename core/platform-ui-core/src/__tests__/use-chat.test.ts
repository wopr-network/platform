import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock dependencies before importing the hook
vi.mock("@/lib/api", () => ({
  openChatStream: vi.fn(),
  sendChatMessage: vi.fn(),
}));

vi.mock("@/lib/chat/chat-store", () => ({
  getSessionId: vi.fn(() => "test-session-id"),
  loadChatHistory: vi.fn(() => []),
  saveChatHistory: vi.fn(),
  clearChatHistory: vi.fn(),
}));

import { openChatStream, sendChatMessage } from "@/lib/api";
import { clearChatHistory, saveChatHistory } from "@/lib/chat/chat-store";
import { useChat } from "@/lib/chat/use-chat";

// Helper: create a controllable ReadableStream that simulates SSE
function createMockSSEStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
  });
  const encoder = new TextEncoder();
  const response = new Response(stream, { status: 200 });
  return {
    stream,
    push(line: string) {
      controller.enqueue(encoder.encode(`${line}\n`));
    },
    close() {
      controller.close();
    },
    response,
  };
}

// A response that never resolves its body — keeps the hook in "connecting" state without timing out
function createHangingSSEStream() {
  const stream = new ReadableStream<Uint8Array>({
    start() {
      // never enqueue, never close — blocks reader.read() indefinitely
    },
  });
  return new Response(stream, { status: 200 });
}

describe("useChat", () => {
  let mockOpenChatStream: ReturnType<typeof vi.fn>;
  let mockSendChatMessage: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOpenChatStream = vi.mocked(openChatStream);
    mockSendChatMessage = vi.mocked(sendChatMessage);
    // Default: hang forever (prevents reconnect loops and test timeouts)
    mockOpenChatStream.mockResolvedValue(createHangingSSEStream());
    mockSendChatMessage.mockResolvedValue(undefined);
    vi.mocked(saveChatHistory).mockClear();
    vi.mocked(clearChatHistory).mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("connection on mount", () => {
    it("calls openChatStream with session ID on mount", async () => {
      const sse = createMockSSEStream();
      mockOpenChatStream.mockResolvedValueOnce(sse.response);

      const { result } = renderHook(() => useChat());

      expect(mockOpenChatStream).toHaveBeenCalledWith("test-session-id", expect.any(AbortSignal));

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      expect(result.current.sessionId).toBe("test-session-id");

      sse.close();
    });

    it("sets isConnected to true after successful connection", async () => {
      const sse = createMockSSEStream();
      mockOpenChatStream.mockResolvedValueOnce(sse.response);

      const { result } = renderHook(() => useChat());

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      sse.close();
    });
  });

  describe("disconnection cleanup", () => {
    it("closes the SSE connection on unmount", async () => {
      const sse = createMockSSEStream();
      mockOpenChatStream.mockResolvedValueOnce(sse.response);

      const { result, unmount } = renderHook(() => useChat());

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      unmount();

      // The hook stores a pseudo-EventSource with a close() that calls abort().
      // Verify by checking the AbortSignal passed to openChatStream.
      const signal = mockOpenChatStream.mock.calls[0][1] as AbortSignal;
      expect(signal.aborted).toBe(true);

      sse.close();
    });

    it("clears reconnect timeout on unmount", async () => {
      vi.useFakeTimers();

      // Reject to trigger reconnect scheduling
      mockOpenChatStream.mockRejectedValueOnce(new Error("fail"));
      // Provide a hanging response for the reconnect so it doesn't keep failing
      mockOpenChatStream.mockResolvedValue(createHangingSSEStream());

      const { unmount } = renderHook(() => useChat());

      // Allow the rejected promise to settle
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // A reconnect timeout is now pending (1000ms). Unmount should clear it.
      const callCountBeforeUnmount = mockOpenChatStream.mock.calls.length;
      unmount();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });

      // No additional calls after unmount
      expect(mockOpenChatStream).toHaveBeenCalledTimes(callCountBeforeUnmount);

      vi.useRealTimers();
    });
  });

  describe("sendMessage", () => {
    it("adds a user message and calls sendChatMessage API", async () => {
      const sse = createMockSSEStream();
      mockOpenChatStream.mockResolvedValueOnce(sse.response);

      const { result } = renderHook(() => useChat());

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      act(() => {
        result.current.sendMessage("hello world");
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].role).toBe("user");
      expect(result.current.messages[0].content).toBe("hello world");
      expect(result.current.isTyping).toBe(true);

      expect(mockSendChatMessage).toHaveBeenCalledWith("test-session-id", "hello world");

      sse.close();
    });

    it("ignores empty or whitespace-only messages", async () => {
      const sse = createMockSSEStream();
      mockOpenChatStream.mockResolvedValueOnce(sse.response);

      const { result } = renderHook(() => useChat());

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      act(() => {
        result.current.sendMessage("   ");
      });

      expect(result.current.messages).toHaveLength(0);
      expect(mockSendChatMessage).not.toHaveBeenCalled();

      sse.close();
    });

    it("sets isTyping back to false and shows error when sendChatMessage fails", async () => {
      const sse = createMockSSEStream();
      mockOpenChatStream.mockResolvedValueOnce(sse.response);
      mockSendChatMessage.mockRejectedValueOnce(new Error("API error"));

      const { result } = renderHook(() => useChat());

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      act(() => {
        result.current.sendMessage("test");
      });

      expect(result.current.isTyping).toBe(true);

      await waitFor(() => {
        expect(result.current.isTyping).toBe(false);
      });

      // User message + error message
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].role).toBe("user");
      expect(result.current.messages[0].content).toBe("test");
      expect(result.current.messages[1].role).toBe("bot");
      expect(result.current.messages[1].content).toBe(
        "Sorry, your message could not be sent. Please try again.",
      );

      sse.close();
    });
  });

  describe("receive message via SSE", () => {
    it("assembles streaming text deltas into a single bot message", async () => {
      const sse = createMockSSEStream();
      mockOpenChatStream.mockResolvedValueOnce(sse.response);

      const { result } = renderHook(() => useChat());

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      await act(async () => {
        sse.push('data: {"type":"text","delta":"Hello "}');
        sse.push('data: {"type":"text","delta":"world"}');
        await new Promise((r) => setTimeout(r, 50));
      });

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0].role).toBe("bot");
        expect(result.current.messages[0].content).toBe("Hello world");
      });

      expect(result.current.isTyping).toBe(true);

      // Send done event
      await act(async () => {
        sse.push('data: {"type":"done"}');
        await new Promise((r) => setTimeout(r, 50));
      });

      await waitFor(() => {
        expect(result.current.isTyping).toBe(false);
      });

      sse.close();
    });

    it("handles error events from SSE", async () => {
      const sse = createMockSSEStream();
      mockOpenChatStream.mockResolvedValueOnce(sse.response);

      const { result } = renderHook(() => useChat());

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      await act(async () => {
        sse.push('data: {"type":"error","message":"Something went wrong"}');
        await new Promise((r) => setTimeout(r, 50));
      });

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(1);
        expect(result.current.messages[0].content).toBe("Error: Something went wrong");
        expect(result.current.messages[0].role).toBe("bot");
      });

      expect(result.current.isTyping).toBe(false);

      sse.close();
    });

    it("dispatches tool_call events to window", async () => {
      const sse = createMockSSEStream();
      mockOpenChatStream.mockResolvedValueOnce(sse.response);

      const toolCallHandler = vi.fn();
      window.addEventListener("platform-chat-tool-call", toolCallHandler);

      const { result } = renderHook(() => useChat());

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      await act(async () => {
        sse.push('data: {"type":"tool_call","tool":"ui.showPricing","args":{"plan":"pro"}}');
        await new Promise((r) => setTimeout(r, 50));
      });

      await waitFor(() => {
        expect(toolCallHandler).toHaveBeenCalledTimes(1);
      });

      const event = toolCallHandler.mock.calls[0][0] as CustomEvent;
      expect(event.detail.tool).toBe("ui.showPricing");
      expect(event.detail.args).toEqual({ plan: "pro" });

      window.removeEventListener("platform-chat-tool-call", toolCallHandler);
      sse.close();
    });
  });

  describe("reconnect on connection loss", () => {
    it("reconnects after backoff when connection fails", async () => {
      vi.useFakeTimers();

      // First call fails, second succeeds (then hangs to prevent further reconnects)
      mockOpenChatStream.mockRejectedValueOnce(new Error("connection lost"));
      const sse2 = createMockSSEStream();
      mockOpenChatStream.mockResolvedValueOnce(sse2.response);
      // Subsequent calls hang to prevent cascading reconnects
      mockOpenChatStream.mockResolvedValue(createHangingSSEStream());

      const { result } = renderHook(() => useChat());

      // Let the rejected promise settle
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.isConnected).toBe(false);
      expect(mockOpenChatStream).toHaveBeenCalledTimes(1);

      // Advance past the 1000ms initial backoff, then flush promises
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
        // Flush all pending microtasks so the resolved promise is processed
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockOpenChatStream).toHaveBeenCalledTimes(2);
      // isConnected is set synchronously in the .then handler once the stream is read
      expect(result.current.isConnected).toBe(true);

      sse2.close();
      vi.useRealTimers();
    });

    it("doubles backoff delay on consecutive failures up to 10s cap", async () => {
      vi.useFakeTimers();

      // Fail 5 times: delays should be 1000, 2000, 4000, 8000, 10000 (capped)
      for (let i = 0; i < 5; i++) {
        mockOpenChatStream.mockRejectedValueOnce(new Error("fail"));
      }
      const sse = createMockSSEStream();
      mockOpenChatStream.mockResolvedValueOnce(sse.response);
      mockOpenChatStream.mockResolvedValue(createHangingSSEStream());

      renderHook(() => useChat());

      // 1st fail -> schedule at 1000ms
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(mockOpenChatStream).toHaveBeenCalledTimes(1);

      // Advance 1000ms -> 2nd call, fails -> schedule at 2000ms
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(mockOpenChatStream).toHaveBeenCalledTimes(2);

      // Advance 2000ms -> 3rd call, fails -> schedule at 4000ms
      await act(async () => {
        await vi.advanceTimersByTimeAsync(2000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(mockOpenChatStream).toHaveBeenCalledTimes(3);

      // Advance 4000ms -> 4th call, fails -> schedule at 8000ms
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(mockOpenChatStream).toHaveBeenCalledTimes(4);

      // Advance 8000ms -> 5th call, fails -> schedule at 10000ms (cap)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8000);
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(mockOpenChatStream).toHaveBeenCalledTimes(5);

      // Advance 10000ms -> 6th call succeeds
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect(mockOpenChatStream).toHaveBeenCalledTimes(6);

      sse.close();
      vi.useRealTimers();
    });

    it("resets backoff delay after successful connection", async () => {
      vi.useFakeTimers();

      // Fail once (delay would double to 2000), then succeed with hanging stream
      mockOpenChatStream.mockRejectedValueOnce(new Error("fail"));
      mockOpenChatStream.mockResolvedValue(createHangingSSEStream());

      const { result } = renderHook(() => useChat());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      // After failure, isConnected is false
      expect(result.current.isConnected).toBe(false);
      expect(mockOpenChatStream).toHaveBeenCalledTimes(1);

      // Advance 1000ms -> reconnect, this time succeeds (hanging = stays connected)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });

      expect(mockOpenChatStream).toHaveBeenCalledTimes(2);

      vi.useRealTimers();
    });
  });

  describe("send while disconnected", () => {
    it("sends message via API even when not connected (no client-side queue)", async () => {
      // openChatStream rejects, so isConnected stays false
      mockOpenChatStream.mockRejectedValueOnce(new Error("fail"));
      // Subsequent reconnect attempts hang
      mockOpenChatStream.mockResolvedValue(createHangingSSEStream());

      vi.useFakeTimers();

      const { result } = renderHook(() => useChat());

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });

      expect(result.current.isConnected).toBe(false);

      act(() => {
        result.current.sendMessage("offline message");
      });

      // Message is added to local state and API is called immediately
      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].content).toBe("offline message");
      expect(mockSendChatMessage).toHaveBeenCalledWith("test-session-id", "offline message");

      vi.useRealTimers();
    });
  });

  describe("mode management", () => {
    it("starts collapsed and can expand/collapse/fullscreen", () => {
      // Don't need a connected stream for mode tests
      const { result, unmount } = renderHook(() => useChat());

      expect(result.current.mode).toBe("collapsed");

      act(() => {
        result.current.expand();
      });
      expect(result.current.mode).toBe("expanded");

      act(() => {
        result.current.collapse();
      });
      expect(result.current.mode).toBe("collapsed");

      act(() => {
        result.current.fullscreen();
      });
      expect(result.current.mode).toBe("fullscreen");

      unmount();
    });

    it("sets hasUnread on done event when collapsed, clears on expand", async () => {
      const sse = createMockSSEStream();
      mockOpenChatStream.mockResolvedValueOnce(sse.response);

      const { result } = renderHook(() => useChat());

      await waitFor(() => {
        expect(result.current.isConnected).toBe(true);
      });

      // Mode is collapsed by default. Push text + done.
      await act(async () => {
        sse.push('data: {"type":"text","delta":"hi"}');
        sse.push('data: {"type":"done"}');
        await new Promise((r) => setTimeout(r, 50));
      });

      await waitFor(() => {
        expect(result.current.hasUnread).toBe(true);
      });

      act(() => {
        result.current.expand();
      });
      expect(result.current.hasUnread).toBe(false);

      sse.close();
    });
  });

  describe("utility methods", () => {
    it("addEventMarker adds an event-role message", () => {
      const { result, unmount } = renderHook(() => useChat());

      act(() => {
        result.current.addEventMarker("Bot started");
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].role).toBe("event");
      expect(result.current.messages[0].content).toBe("Bot started");

      unmount();
    });

    it("notify adds a bot message", () => {
      const { result, unmount } = renderHook(() => useChat());

      act(() => {
        result.current.notify("Welcome!");
      });

      expect(result.current.messages).toHaveLength(1);
      expect(result.current.messages[0].role).toBe("bot");
      expect(result.current.messages[0].content).toBe("Welcome!");

      unmount();
    });

    it("showTyping sets isTyping to true", () => {
      const { result, unmount } = renderHook(() => useChat());

      act(() => {
        result.current.showTyping();
      });

      expect(result.current.isTyping).toBe(true);

      unmount();
    });

    it("clearHistory empties messages and calls clearChatHistory", () => {
      const { result, unmount } = renderHook(() => useChat());

      act(() => {
        result.current.sendMessage("test");
      });
      expect(result.current.messages).toHaveLength(1);

      act(() => {
        result.current.clearHistory();
      });

      expect(result.current.messages).toHaveLength(0);
      expect(clearChatHistory).toHaveBeenCalled();

      unmount();
    });

    it("persists messages to chat store on change", () => {
      const { result, unmount } = renderHook(() => useChat());

      act(() => {
        result.current.notify("persisted");
      });

      expect(saveChatHistory).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ content: "persisted", role: "bot" })]),
      );

      unmount();
    });
  });
});
