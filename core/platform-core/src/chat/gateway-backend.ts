import { logger } from "../config/logger.js";
import type { BackendMessage, IChatBackend } from "./backend.js";
import type { ChatEvent } from "./types.js";

export interface GatewayChatBackendDeps {
  /**
   * URL of the metered inference gateway. In production this is the
   * in-process core gateway at http://localhost:3001/v1/chat/completions;
   * can be overridden for tests.
   */
  gatewayUrl: string;
  /**
   * Platform service key for authenticating to the gateway. Called once
   * per chat turn; implementations can cache or mint fresh per-call keys.
   */
  getServiceKey: () => Promise<string>;
  /** Model name to pass to the gateway. Defaults to "default" which the gateway resolves to the tenant's current selection. */
  model?: string;
  /** Upstream stall timeout. */
  stallTimeoutMs?: number;
  /** Custom fetch for tests. */
  fetchFn?: typeof fetch;
}

const DEFAULT_STALL_TIMEOUT_MS = 30_000;

/**
 * Chat backend that streams LLM responses via core's metered inference
 * gateway. Uses the OpenAI-compatible /v1/chat/completions endpoint with
 * streaming; translates each upstream delta into a ChatEvent for the SSE
 * registry to fan out.
 *
 * Stateless — the route layer assembles the messages array (history +
 * current user turn) and passes it in. Persistence lives in the routes.
 *
 * This is the "minimal chat works end-to-end" backend. A future backend
 * will swap in a proxy to the Nemoclaw sidecar's OpenClaw gateway so
 * agent-side tools run inside the sandbox. The route/persistence/history
 * layers don't change when that backend ships — only this class.
 */
export class GatewayChatBackend implements IChatBackend {
  private readonly stallTimeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(private readonly deps: GatewayChatBackendDeps) {
    this.stallTimeoutMs = deps.stallTimeoutMs ?? DEFAULT_STALL_TIMEOUT_MS;
    this.fetchFn = deps.fetchFn ?? fetch;
  }

  async process(sessionId: string, messages: BackendMessage[], emit: (event: ChatEvent) => void): Promise<void> {
    try {
      const key = await this.deps.getServiceKey();
      const upstream = await this.fetchFn(this.deps.gatewayUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ model: this.deps.model ?? "default", messages, stream: true }),
      });

      if (!upstream.ok || !upstream.body) {
        const text = await upstream.text().catch(() => "");
        logger.warn("Chat gateway returned non-ok", { status: upstream.status, body: text.slice(0, 500) });
        emit({ type: "error", message: `Gateway error (${upstream.status})` });
        emit({ type: "done" });
        return;
      }

      await this.relayStream(upstream.body, emit);
    } catch (err) {
      logger.error("GatewayChatBackend process failed", { sessionId, err });
      emit({ type: "error", message: err instanceof Error ? err.message : "Chat backend failure" });
      emit({ type: "done" });
    }
  }

  private async relayStream(body: ReadableStream<Uint8Array>, emit: (event: ChatEvent) => void): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let malformedChunks = 0;
    let sawAny = false;

    try {
      for (;;) {
        // Per-chunk stall timer. Previously this leaked: each iteration
        // created a setTimeout that was never cleared on the success
        // path, so long streams accumulated dead timers. Capture the
        // timer id and clearTimeout on either outcome.
        let timerId: ReturnType<typeof setTimeout> | null = null;
        const readPromise = reader.read();
        const timeout = new Promise<{ done: true; value: undefined }>((resolve) => {
          timerId = setTimeout(() => resolve({ done: true, value: undefined }), this.stallTimeoutMs);
        });
        const result = await Promise.race([
          readPromise.then((r) => ({ ...r, timedOut: false })),
          timeout.then((r) => ({ ...r, timedOut: true })),
        ]);
        if (timerId) clearTimeout(timerId);
        if ((result as { timedOut?: boolean }).timedOut) {
          // Cancel the underlying reader so the upstream fetch tears
          // down rather than hanging. Failure to cancel here was the
          // second half of the leak — even with the timer cleared, a
          // stalled upstream would keep the fetch connection open.
          reader.cancel().catch(() => {});
          emit({ type: "error", message: "Model stopped responding" });
          break;
        }
        const { done, value } = result;
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const payload = trimmed.slice("data:".length).trim();
          if (payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>;
              error?: { message?: string };
            };
            if (parsed.error?.message) {
              emit({ type: "error", message: parsed.error.message });
              continue;
            }
            const token = parsed.choices?.[0]?.delta?.content;
            if (token) {
              sawAny = true;
              emit({ type: "text", delta: token });
            }
          } catch {
            malformedChunks++;
            if (malformedChunks > 10) {
              emit({ type: "error", message: "Too many malformed chunks from model" });
              return;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!sawAny) {
      emit({ type: "error", message: "Model returned no content" });
    }
    emit({ type: "done" });
  }
}
