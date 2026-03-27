export type ChatEvent =
  | { type: "text"; delta: string }
  | { type: "tool_call"; tool: string; args: Record<string, unknown> }
  | { type: "error"; message: string }
  | { type: "done" };

export type ChatMode = "collapsed" | "expanded" | "fullscreen";
export type MessageRole = "user" | "bot" | "event";

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
}

export interface ChatState {
  mode: ChatMode;
  messages: ChatMessage[];
  sessionId: string;
  isConnected: boolean;
  isTyping: boolean;
  hasUnread: boolean;
}

export interface ChatActions {
  expand: () => void;
  collapse: () => void;
  fullscreen: () => void;
  sendMessage: (text: string) => void;
  addEventMarker: (text: string) => void;
  showTyping: () => void;
  notify: (text: string) => void;
  clearHistory: () => void;
}
