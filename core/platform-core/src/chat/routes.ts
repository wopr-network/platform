import { Hono } from "hono";
import { z } from "zod";
import { logger } from "../config/logger.js";
import type { IChatBackend } from "./backend.js";
import type { IChatMessageRepository } from "./repository.js";
import { ChatStreamRegistry, type SSEWriter } from "./stream-registry.js";
import type { ChatEvent } from "./types.js";

const chatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string(), // empty string = greeting trigger
  /**
   * Optional: scope this message to a specific bot instance. When present,
   * core persists the user turn and the assistant turn to chat_messages
   * keyed by instanceId. When absent, behaves as before (in-memory session
   * only — used by onboarding flows that don't have an instance yet).
   */
  instanceId: z.string().uuid().optional(),
});

export interface ChatRouteDeps {
  backend: IChatBackend;
  /**
   * Optional repository. When provided, instanceId-scoped messages are
   * persisted and the GET /history route is mounted. Omit for session-only
   * deployments (e.g. onboarding chat where there's no instance to key on).
   */
  messageRepo?: IChatMessageRepository;
}

/** Extract authenticated user from Hono context or internal forwarding header. */
function getUser(c: {
  get(key: string): unknown;
  req?: { header?(name: string): string | undefined };
}): { id: string } | null {
  try {
    const user = c.get("user") as { id: string } | undefined;
    if (user) return user;
    const forwarded = c.req?.header?.("x-internal-user-id");
    if (forwarded) return { id: forwarded };
    return null;
  } catch {
    return null;
  }
}

/**
 * Create chat routes with injected dependencies.
 * Returns a Hono app with:
 *   GET  /stream?sessionId — SSE stream
 *   POST /                 — send message to backend
 */
export function createChatRoutes(deps: ChatRouteDeps): Hono {
  const routes = new Hono();
  const registry = new ChatStreamRegistry();

  routes.get("/stream", (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    // Accept sessionId from either ?sessionId query param OR X-Session-ID
    // header. Different clients have landed on different conventions; both
    // are equally unambiguous for a single-value identifier.
    const sessionId = c.req.query("sessionId") ?? c.req.header("X-Session-ID");
    if (!sessionId) {
      return c.json({ error: "sessionId is required (query param or X-Session-ID header)" }, 400);
    }

    if (!registry.claimOrVerifyOwner(sessionId, user.id)) {
      return c.json({ error: "Session access denied" }, 403);
    }

    const { readable, writable } = new TransformStream<string, string>();
    const writer = writable.getWriter();

    const sseWriter: SSEWriter = {
      write(chunk: string) {
        writer.write(chunk).catch((err) => {
          logger.debug("SSE writer write error (client likely disconnected)", { err });
        });
      },
      close() {
        writer.close().catch((err) => {
          logger.debug("SSE writer close error", { err });
        });
      },
    };

    const streamId = registry.register(sessionId, sseWriter);

    const signal = c.req.raw.signal;
    if (signal) {
      signal.addEventListener("abort", () => {
        registry.remove(streamId);
        if (registry.listBySession(sessionId).length === 0) {
          registry.clearOwner(sessionId);
        }
        writer.close().catch((err) => {
          logger.debug("SSE writer close error (client disconnect)", { err });
        });
      });
    }

    const encoder = new TextEncoder();
    const encodedStream = readable.pipeThrough(
      new TransformStream<string, Uint8Array>({
        transform(chunk, controller) {
          controller.enqueue(encoder.encode(chunk));
        },
      }),
    );

    return new Response(encodedStream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  routes.post("/", async (c) => {
    const user = getUser(c);
    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const parsed = chatRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json({ error: "Validation failed", details: parsed.error.flatten() }, 400);
    }

    const { sessionId, message, instanceId } = parsed.data;

    if (!registry.claimOrVerifyOwner(sessionId, user.id)) {
      return c.json({ error: "Session access denied" }, 403);
    }

    // Persist the user turn immediately (before backend hop) so a crash
    // between here and the assistant response still leaves a recoverable
    // transcript. Only when instanceId is provided — session-only mode
    // (onboarding) skips persistence.
    if (deps.messageRepo && instanceId && message) {
      try {
        await deps.messageRepo.append({
          instanceId,
          userId: user.id,
          role: "user",
          content: message,
        });
      } catch (err) {
        logger.error("Failed to persist user turn", { instanceId, err });
        // Don't block the chat — persistence is best-effort for the user
        // message; the assistant's reply is where history continuity matters.
      }
    }

    // Accumulate assistant reply for persistence. Tokens stream to the UI
    // in real time via `emit`, AND also into this buffer. When the backend
    // signals done, we write the full reply to chat_messages.
    let assistantBuffer = "";

    // Fire-and-forget: process in background so POST returns immediately
    const emit = (event: ChatEvent) => {
      if (event.type === "text" && typeof event.delta === "string") {
        assistantBuffer += event.delta;
      }
      const streamIds = registry.listBySession(sessionId);
      const line = `data: ${JSON.stringify(event)}\n\n`;
      for (const id of streamIds) {
        const w = registry.get(id);
        if (w) {
          w.write(line);
          if (event.type === "done") {
            w.close();
            registry.remove(id);
          }
        }
      }
      if (event.type === "done" && deps.messageRepo && instanceId && assistantBuffer) {
        deps.messageRepo
          .append({
            instanceId,
            userId: null,
            role: "assistant",
            content: assistantBuffer,
          })
          .catch((err) => {
            logger.error("Failed to persist assistant turn", { instanceId, err });
          });
      }
    };

    // Assemble the messages array for the backend. When we have history
    // (instanceId + repo), replay prior turns as context so the model is
    // coherent across reconnects. The user turn was just persisted above,
    // so it's already the last entry in `history`. In session-only mode
    // (onboarding), just send the current message.
    const messages = await (async () => {
      if (deps.messageRepo && instanceId) {
        try {
          const rows = await deps.messageRepo.listByInstance(instanceId);
          return rows.map((m) => ({ role: m.role, content: m.content }));
        } catch (err) {
          logger.error("Failed to load chat history for context", { instanceId, err });
          // Fall back to just the current message — better a one-shot reply
          // than a total failure.
          return [{ role: "user" as const, content: message }];
        }
      }
      return [{ role: "user" as const, content: message }];
    })();

    deps.backend.process(sessionId, messages, emit).catch((err) => {
      logger.error("Chat backend processing failed", { sessionId, err });
      emit({ type: "error", message: "Internal error" });
      emit({ type: "done" });
    });

    return c.json({ streamId: registry.listBySession(sessionId)[0] ?? "pending" });
  });

  // History replay. Returns full transcript for an instance, oldest first.
  // Only mounted when a messageRepo is provided. UI hits this on mount
  // before opening the SSE stream so the panel renders context immediately.
  if (deps.messageRepo) {
    const repo = deps.messageRepo;
    routes.get("/history", async (c) => {
      const user = getUser(c);
      if (!user) {
        return c.json({ error: "Authentication required" }, 401);
      }
      const instanceId = c.req.query("instanceId");
      if (!instanceId) {
        return c.json({ error: "instanceId query parameter is required" }, 400);
      }
      // TODO(nemoclaw): ownership check — confirm the requesting user's
      // tenant owns this instanceId. bot_instances.tenant_id is the
      // predicate; need to thread an IBotInstanceRepository through deps.
      // For now any authenticated user with a valid instanceId gets the
      // transcript. Filed as followup — don't ship to prod without it.
      try {
        const messages = await repo.listByInstance(instanceId);
        return c.json({
          messages: messages.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: m.createdAt.toISOString(),
          })),
        });
      } catch (err) {
        logger.error("Failed to load chat history", { instanceId, err });
        return c.json({ error: "Failed to load history" }, 500);
      }
    });
  }

  return routes;
}
