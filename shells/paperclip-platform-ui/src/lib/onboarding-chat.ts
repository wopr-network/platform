import { API_BASE_URL } from "@core/lib/api-config";

export interface OnboardingPlan {
  taskTitle: string;
  taskDescription: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface StreamCallbacks {
  onDelta: (text: string) => void;
}

interface StreamResult {
  content: string;
  plan: OnboardingPlan | null;
}

/**
 * Parse an SSE ReadableStream from the onboarding-chat endpoint.
 * Calls onDelta for each text token. Returns accumulated content + extracted plan.
 */
export async function parseOnboardingStream(
  body: ReadableStream<Uint8Array>,
  callbacks: StreamCallbacks,
): Promise<StreamResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let plan: OnboardingPlan | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (!json || json === "[DONE]") continue;

      try {
        const chunk = JSON.parse(json);
        if (chunk.type === "delta" && chunk.content) {
          content += chunk.content;
          callbacks.onDelta(chunk.content);
        } else if (chunk.type === "done") {
          if (chunk.plan?.taskTitle && chunk.plan?.taskDescription) {
            plan = {
              taskTitle: chunk.plan.taskTitle,
              taskDescription: chunk.plan.taskDescription,
            };
          }
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  return { content, plan };
}

/**
 * Send messages to the onboarding chat endpoint and stream the response.
 * Returns an AbortController for cancellation + the ReadableStream body.
 */
export function sendOnboardingChat(messages: ChatMessage[]): {
  abort: AbortController;
  response: Promise<ReadableStream<Uint8Array>>;
} {
  const abort = new AbortController();
  const response = fetch(`${API_BASE_URL}/onboarding-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    signal: abort.signal,
    body: JSON.stringify({ messages }),
  }).then((res) => {
    if (!res.ok) throw new Error(`Onboarding chat failed: ${res.status}`);
    if (!res.body) throw new Error("No response body");
    return res.body;
  });

  return { abort, response };
}
