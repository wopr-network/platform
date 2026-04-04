/**
 * Onboarding chat SSE route — streams a CEO agent conversation through a
 * 4-state onboarding flow: VISION -> COMPANY_NAME -> CEO_NAME -> LAUNCH.
 *
 * All LLM calls go through the billing gateway at localhost:3001 using a
 * platform service key so metering applies even to pre-creation conversations.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { PlatformContainer } from "../container.js";
import {
  getSystemPrompt,
  type OnboardingArtifacts,
  type OnboardingState,
  type PromptPhase,
} from "./onboarding-prompts.js";

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

const InputSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(10000),
      }),
    )
    .max(40),
  state: z.enum(["VISION", "COMPANY_NAME", "CEO_NAME", "LAUNCH"]),
  phase: z.enum(["initial", "followup"]),
  artifacts: z
    .object({
      suggestedName: z.string().optional(),
      taskTitle: z.string().optional(),
      taskDescription: z.string().optional(),
      companyName: z.string().optional(),
      ceoName: z.string().optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

/**
 * Create the onboarding chat SSE Hono sub-app.
 *
 * Mount it at `/api/onboarding-chat`.
 *
 * ```ts
 * app.route("/api/onboarding-chat", createOnboardingChatRoutes(container));
 * ```
 */
export function createOnboardingChatRoutes(container: PlatformContainer): Hono {
  const app = new Hono();

  app.post("/", async (c) => {
    const { logger } = await import("../../config/logger.js");

    // Validate input
    let input: z.infer<typeof InputSchema>;
    try {
      const raw = await c.req.json();
      logger.info("Onboarding chat request", {
        state: raw.state,
        phase: raw.phase,
        messageCount: raw.messages?.length,
        artifacts: raw.artifacts ? Object.keys(raw.artifacts) : [],
        // Log empty messages for debugging
        emptyMessages: raw.messages?.filter((m: { content?: string }) => !m.content?.length).length ?? 0,
      });
      input = InputSchema.parse(raw);
    } catch (err) {
      if (err instanceof z.ZodError) {
        logger.warn("Onboarding chat validation failed", { issues: err.issues });
        return c.json({ error: "Invalid request", issues: err.issues }, 400);
      }
      logger.warn("Onboarding chat invalid JSON");
      return c.json({ error: "Invalid JSON" }, 400);
    }

    // Require serviceKeyRepo
    const serviceKeyRepo = container.fleet?.serviceKeyRepo;
    if (!serviceKeyRepo) {
      return c.json({ error: "Onboarding chat not available: service key repository not configured" }, 500);
    }

    // Generate a platform key for billing-metered gateway access
    let platformKey: string;
    try {
      platformKey = await serviceKeyRepo.generate("__platform__", "onboarding-chat", "paperclip");
    } catch {
      return c.json({ error: "Failed to generate platform service key" }, 500);
    }

    // Build system prompt from state machine + messages
    const systemPrompt = getSystemPrompt(
      input.state as OnboardingState,
      input.phase as PromptPhase,
      (input.artifacts ?? {}) as OnboardingArtifacts,
    );
    const messages = [{ role: "system", content: systemPrompt }, ...input.messages];

    // Call the billing gateway with streaming
    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch("http://localhost:3001/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${platformKey}`,
        },
        body: JSON.stringify({
          model: "default",
          messages,
          stream: true,
        }),
      });
    } catch {
      return c.json({ error: "Failed to reach inference gateway" }, 502);
    }

    if (!upstreamResponse.ok || !upstreamResponse.body) {
      const text = await upstreamResponse.text().catch(() => "");
      return c.json({ error: "Gateway error", detail: text }, 502);
    }

    // Stream SSE back to the client with typed protocol:
    //   {type:"delta", content:"..."} — content token
    //   {type:"error", code:"...", message:"..."} — error signal
    //   {type:"done", tokenCount:N} — guaranteed terminal event
    const upstreamBody = upstreamResponse.body;
    const STALL_TIMEOUT_MS = 30_000;

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const reader = upstreamBody.getReader();

        let buffer = "";
        let tokenCount = 0;
        let malformedChunks = 0;

        const send = (data: string) => {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        };

        const sendError = (code: string, message: string) => {
          logger.warn("Onboarding SSE error", { code, message, state: input.state, phase: input.phase });
          send(JSON.stringify({ type: "error", code, message }));
        };

        try {
          while (true) {
            // Timeout watchdog: if upstream stalls for 30s, kill it
            const readPromise = reader.read();
            const timeout = new Promise<{ done: true; value: undefined }>((resolve) =>
              setTimeout(() => resolve({ done: true, value: undefined }), STALL_TIMEOUT_MS),
            );
            const raceResult = await Promise.race([
              readPromise.then((r) => ({ ...r, timedOut: false })),
              timeout.then((r) => ({ ...r, timedOut: true })),
            ]);

            if ((raceResult as { timedOut?: boolean }).timedOut) {
              sendError("upstream_timeout", "Model stopped responding");
              break;
            }

            const { done, value } = raceResult;
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
                  choices?: Array<{ delta?: { content?: string }; finish_reason?: string }>;
                  error?: { message?: string };
                };
                // Upstream error object (OpenRouter sends these)
                if (parsed.error?.message) {
                  sendError("upstream_error", parsed.error.message);
                  continue;
                }
                const token = parsed.choices?.[0]?.delta?.content;
                if (token) {
                  tokenCount++;
                  send(JSON.stringify({ type: "delta", content: token }));
                }
              } catch {
                malformedChunks++;
                if (malformedChunks > 10) {
                  sendError("upstream_malformed", "Too many malformed chunks from model");
                  break;
                }
              }
            }
          }
        } catch (err) {
          sendError("stream_error", err instanceof Error ? err.message : "Stream read failed");
        } finally {
          reader.releaseLock();
        }

        // Empty response detection
        if (tokenCount === 0) {
          sendError("empty_response", "Model returned no content");
        }

        // Guaranteed terminal event — client ALWAYS gets this
        send(JSON.stringify({ type: "done", tokenCount }));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });

  return app;
}
