import { API_BASE_URL } from "@core/lib/api-config";

export interface OnboardingPlan {
  suggestedName?: string;
  taskTitle: string;
  taskDescription: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface StreamCallbacks {
  onDelta: (text: string) => void;
  onThinking?: (thinking: boolean) => void;
  onJsonToken?: () => void;
}

interface StreamResult {
  content: string;
  plan: OnboardingPlan | null;
}

/**
 * Parse an SSE ReadableStream from the onboarding-chat endpoint.
 * Calls onDelta for each visible text token. Suppresses raw JSON blocks
 * (the structured plan) and signals "thinking" while they stream.
 * The plan is extracted silently and returned in the result.
 */
export async function parseOnboardingStream(
  body: ReadableStream<Uint8Array>,
  callbacks: StreamCallbacks,
): Promise<StreamResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let visibleContent = "";
  let plan: OnboardingPlan | null = null;

  // JSON suppression: the LLM puts ```json{...}``` FIRST, then natural language.
  // Buffer everything, suppress the JSON block, only emit the visible text after it.
  let fullRaw = "";
  let jsonExtracted = false;
  let fenceCloseIdx = -1;

  function processToken(token: string) {
    fullRaw += token;

    if (!jsonExtracted) {
      // Still looking for the end of the JSON block
      // Check for closing fence: find second ``` after the opening one
      const openFence = fullRaw.indexOf("```");
      if (openFence >= 0) {
        const afterOpen = fullRaw.indexOf("\n", openFence);
        if (afterOpen >= 0) {
          const closeFence = fullRaw.indexOf("```", afterOpen + 1);
          if (closeFence >= 0) {
            // Found complete fenced block — extract plan
            const jsonContent = fullRaw.slice(afterOpen + 1, closeFence).trim();
            try {
              const parsed = JSON.parse(jsonContent);
              if (parsed.taskTitle && parsed.taskDescription) {
                plan = {
                  suggestedName: parsed.suggestedName ?? "",
                  taskTitle: parsed.taskTitle,
                  taskDescription: parsed.taskDescription,
                };
              }
            } catch {
              // malformed — no plan
            }
            jsonExtracted = true;
            fenceCloseIdx = closeFence + 3; // skip past closing ```
            // Emit any text that came after the closing fence
            const afterFence = fullRaw.slice(fenceCloseIdx).replace(/^\n+/, "");
            if (afterFence) {
              visibleContent += afterFence;
              callbacks.onDelta(afterFence);
            }
            callbacks.onThinking?.(false);
            return;
          }
        }
      }
      // Still buffering — show thinking indicator and count tokens
      if (fullRaw.trimStart().startsWith("`") || fullRaw.trimStart().startsWith("{")) {
        callbacks.onThinking?.(true);
        callbacks.onJsonToken?.();
      }
      return;
    }

    // JSON already extracted — stream visible text directly
    visibleContent += token;
    callbacks.onDelta(token);
  }

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
          processToken(chunk.content);
        } else if (chunk.type === "done") {
          // Server-side plan extraction (backup)
          if (!plan && chunk.plan?.taskTitle && chunk.plan?.taskDescription) {
            plan = { taskTitle: chunk.plan.taskTitle, taskDescription: chunk.plan.taskDescription };
          }
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  // If we never found the closing fence, try to extract from raw content
  if (!jsonExtracted && fullRaw.includes("taskTitle")) {
    const match = fullRaw.match(/\{[\s\S]*?"taskTitle"[\s\S]*?"taskDescription"[\s\S]*?\}/);
    if (match) {
      try {
        const parsed = JSON.parse(match[0]);
        if (parsed.taskTitle && parsed.taskDescription) {
          plan = {
            suggestedName: parsed.suggestedName ?? "",
            taskTitle: parsed.taskTitle,
            taskDescription: parsed.taskDescription,
          };
        }
      } catch {
        /* ignore */
      }
    }
  }

  return { content: visibleContent, plan };
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
