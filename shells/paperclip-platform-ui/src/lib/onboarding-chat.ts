import { API_BASE_URL } from "@core/lib/api-config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OnboardingState = "VISION" | "COMPANY_NAME" | "CEO_NAME" | "LAUNCH";
export type PromptPhase = "entry" | "continue";

export interface OnboardingArtifacts {
  suggestedName?: string;
  taskTitle?: string;
  taskDescription?: string;
  companyName?: string;
  ceoName?: string;
}

export interface LLMGate {
  ready: boolean;
  artifact?: Record<string, unknown>;
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
  visibleContent: string;
  gate: LLMGate;
}

/**
 * Parse an SSE ReadableStream from the onboarding-chat endpoint.
 * Calls onDelta for each visible text token. Suppresses raw JSON blocks
 * (the gate + artifact) and signals "thinking" while they stream.
 * The gate is extracted silently and returned in the result.
 */
export async function parseStateMachineStream(
  body: ReadableStream<Uint8Array>,
  callbacks: StreamCallbacks,
): Promise<StreamResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let visibleContent = "";
  let gate: LLMGate = { ready: false };

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
            // Found complete fenced block — extract gate
            const jsonContent = fullRaw.slice(afterOpen + 1, closeFence).trim();
            try {
              const parsed = JSON.parse(jsonContent);
              gate = {
                ready: !!parsed.ready,
                artifact: parsed.artifact ?? undefined,
              };
            } catch {
              // malformed — default gate (ready: false)
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
        }
        // chunk.type === "done" — stream complete, no further action needed
      } catch {
        // Skip malformed chunks
      }
    }
  }

  // Fallback: if we never found a fenced JSON block, treat entire response
  // as ready: false with the full text as visible content
  if (!jsonExtracted && fullRaw) {
    // Try to extract from raw content as last resort
    const match = fullRaw.match(/```json\s*(\{[\s\S]*?\})\s*```/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        gate = { ready: !!parsed.ready, artifact: parsed.artifact ?? undefined };
      } catch {
        /* ignore */
      }
    }
    if (!visibleContent) {
      // No fence found at all — emit entire raw as visible
      visibleContent = fullRaw;
    }
  }

  return { visibleContent, gate };
}

/**
 * Send a state-machine chat request and stream the response.
 * Returns an AbortController for cancellation + the ReadableStream body.
 */
export function sendStateMachineChat(
  messages: ChatMessage[],
  state: OnboardingState,
  phase: PromptPhase,
  artifacts?: OnboardingArtifacts,
): {
  abort: AbortController;
  response: Promise<ReadableStream<Uint8Array>>;
} {
  const abort = new AbortController();
  const response = fetch(`${API_BASE_URL}/onboarding-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    signal: abort.signal,
    body: JSON.stringify({ messages, state, phase, artifacts }),
  }).then((res) => {
    if (!res.ok) throw new Error(`Onboarding chat failed: ${res.status}`);
    if (!res.body) throw new Error("No response body");
    return res.body;
  });

  return { abort, response };
}
