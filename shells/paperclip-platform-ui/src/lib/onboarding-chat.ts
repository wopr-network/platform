import { API_BASE_URL } from "@core/lib/api-config";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OnboardingState = "VISION" | "COMPANY_NAME" | "CEO_NAME" | "LAUNCH";
export type PromptPhase = "initial" | "followup";

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

export interface StreamError {
  code: string;
  message: string;
}

interface StreamResult {
  visibleContent: string;
  gate: LLMGate;
  error?: StreamError;
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
  let streamError: StreamError | undefined;

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
        } else if (chunk.type === "error") {
          streamError = { code: chunk.code ?? "unknown", message: chunk.message ?? "Unknown error" };
          console.error("[onboarding] server error event", streamError);
        }
        // chunk.type === "done" — stream complete
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

  console.log("[onboarding] stream parsed", {
    ready: gate.ready,
    hasArtifact: !!gate.artifact,
    artifactKeys: gate.artifact ? Object.keys(gate.artifact) : [],
    visibleContentLength: visibleContent.length,
    jsonExtracted,
    error: streamError?.code,
  });

  return { visibleContent, gate, error: streamError };
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
  // Filter out messages with empty content — server rejects them
  const cleanMessages = messages.filter((m) => m.content.length > 0);

  console.log("[onboarding] sending", {
    state,
    phase,
    messageCount: cleanMessages.length,
    artifacts: artifacts ? Object.keys(artifacts).filter((k) => !!(artifacts as Record<string, unknown>)[k]) : [],
    emptyFiltered: messages.length - cleanMessages.length,
  });

  const abort = new AbortController();
  const response = fetch(`${API_BASE_URL}/onboarding-chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    signal: abort.signal,
    body: JSON.stringify({ messages: cleanMessages, state, phase, artifacts }),
  }).then(async (res) => {
    if (!res.ok) {
      let incidentId: string | undefined;
      try {
        const body = (await res.json()) as { incident_id?: string };
        incidentId = body.incident_id;
      } catch {
        /* no json */
      }
      const suffix = incidentId ? ` (${incidentId})` : "";
      console.error("[onboarding] server error", { status: res.status, state, phase, incidentId });
      throw new Error(`Onboarding chat failed: ${res.status}${suffix}`);
    }
    if (!res.body) throw new Error("No response body");
    return res.body;
  });

  return { abort, response };
}
