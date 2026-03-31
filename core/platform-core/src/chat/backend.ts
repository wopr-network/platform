import type { ChatEvent } from "./types.js";

/**
 * Interface for the chat backend that processes user messages
 * and produces ChatEvents.
 *
 * Products provide implementations (e.g. gateway inference, WOPR inject).
 * Core provides the SSE transport and session registry.
 */
export interface IChatBackend {
  /**
   * Process a user message in a session.
   * Calls `emit` for each ChatEvent produced, ending with { type: "done" }.
   */
  process(sessionId: string, message: string, emit: (event: ChatEvent) => void): Promise<void>;
}
