import { Hono } from "hono";
import { z } from "zod";
import { logger } from "../config/logger.js";
import type { IChatBackend } from "./backend.js";
import { ChatStreamRegistry, type SSEWriter } from "./stream-registry.js";
import type { ChatEvent } from "./types.js";

const chatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string(), // empty string = greeting trigger
});

export interface ChatRouteDeps {
  backend: IChatBackend;
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

    const sessionId = c.req.query("sessionId");
    if (!sessionId) {
      return c.json({ error: "sessionId query parameter is required" }, 400);
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

    const { sessionId, message } = parsed.data;

    if (!registry.claimOrVerifyOwner(sessionId, user.id)) {
      return c.json({ error: "Session access denied" }, 403);
    }

    // Fire-and-forget: process in background so POST returns immediately
    const emit = (event: ChatEvent) => {
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
    };

    deps.backend.process(sessionId, message, emit).catch((err) => {
      logger.error("Chat backend processing failed", { sessionId, err });
      emit({ type: "error", message: "Internal error" });
      emit({ type: "done" });
    });

    return c.json({ streamId: registry.listBySession(sessionId)[0] ?? "pending" });
  });

  return routes;
}
