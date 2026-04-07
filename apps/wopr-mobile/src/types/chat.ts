export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; tool: string; args: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "done" };

export interface ChatRequest {
  sessionId: string;
  message: string;
}

export interface ChatResponse {
  streamId: string;
}
