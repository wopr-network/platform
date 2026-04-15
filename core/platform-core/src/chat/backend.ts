import type { ChatEvent } from "./types.js";

/** Role-tagged message as understood by chat backends. */
export interface BackendMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

/**
 * Interface for the chat backend that processes user messages
 * and produces ChatEvents.
 *
 * Products provide implementations (e.g. gateway inference, WOPR inject,
 * Nemoclaw OpenClaw-sidecar proxy). Core provides the SSE transport,
 * session registry, and per-instance history persistence.
 *
 * Backends receive the full message array (including prior turns from
 * history) so they don't need to know about the persistence layer. The
 * route is responsible for assembling the array.
 */
export interface IChatBackend {
  /**
   * Stream a response for a conversation. `messages` contains the full
   * context in order (oldest → newest, with the current user turn as the
   * last element). Calls `emit` for each ChatEvent produced, ending with
   * { type: "done" }.
   */
  process(sessionId: string, messages: BackendMessage[], emit: (event: ChatEvent) => void): Promise<void>;
}
