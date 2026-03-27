/**
 * Chat proxy — bridges the platform UI's SSE-based chat to the
 * metered inference gateway (/v1/chat/completions).
 *
 * GET  /chat/stream   — long-lived SSE connection (one per session)
 * POST /chat          — send a user message, response streams via SSE
 * GET  /chat/history  — fetch persisted messages for an instance
 */

import { logger } from "@wopr-network/platform-core/config/logger";
import type { IProfileStore } from "@wopr-network/platform-core/fleet/profile-store";
import type { ProductConfig } from "@wopr-network/platform-core/product-config";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type pg from "pg";

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface ChatRoutesDeps {
  pool: pg.Pool;
  profileStore: IProfileStore;
  productConfig: ProductConfig;
}

let _deps: ChatRoutesDeps | null = null;

export function setChatRoutesDeps(d: ChatRoutesDeps): void {
  _deps = d;
}

function deps(): ChatRoutesDeps {
  if (!_deps) throw new Error("ChatRoutes deps not initialized — call setChatRoutesDeps() first");
  return _deps;
}

interface SessionWriter {
  write: (event: string, data: string) => void;
  closed: boolean;
}

// Active SSE connections keyed by sessionId
const sessions = new Map<string, SessionWriter>();

const MAX_HISTORY = 20;

function db(): pg.Pool {
  return deps().pool;
}

export const chatRoutes = new Hono();

/**
 * Resolve the authenticated user from BetterAuth session cookies.
 */
async function resolveUser(req: Request): Promise<{ id: string } | null> {
  try {
    const { getAuth } = await import("@wopr-network/platform-core/auth/better-auth");
    const session = await getAuth().api.getSession({ headers: req.headers });
    if (session?.user) return { id: (session.user as { id: string }).id };
  } catch {
    // no session
  }
  return null;
}

/**
 * Resolve chat target (gateway key + container URL) for a specific instance.
 */
async function resolveInstanceChat(instanceId: string): Promise<{ gatewayKey: string; containerUrl: string } | null> {
  try {
    const pc = deps().productConfig;
    const containerPort = pc.fleet?.containerPort ?? Number(process.env.CONTAINER_PORT ?? 3100);
    const profiles = await deps().profileStore.list();
    const profile = profiles.find((p) => p.id === instanceId);
    if (!profile) return null;
    const gatewayKey = profile.env?.GATEWAY_KEY;
    if (!gatewayKey) return null;
    return {
      gatewayKey,
      containerUrl: `http://wopr-${profile.name}:${containerPort}`,
    };
  } catch {
    return null;
  }
}

/**
 * Load recent messages for an instance from the DB.
 */
async function loadHistory(instanceId: string, limit = MAX_HISTORY): Promise<Array<{ role: string; content: string }>> {
  const res = await db().query(
    `SELECT role, content FROM chat_messages
     WHERE instance_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [instanceId, limit],
  );
  // Reverse so oldest first
  return res.rows.reverse();
}

/**
 * Save a chat message to the DB.
 */
async function saveMessage(
  instanceId: string,
  tenantId: string,
  userId: string,
  role: string,
  content: string,
): Promise<void> {
  await db().query(
    `INSERT INTO chat_messages (instance_id, tenant_id, user_id, role, content) VALUES ($1, $2, $3, $4, $5)`,
    [instanceId, tenantId, userId, role, content],
  );
}

// ── Chat history endpoint ──────────────────────────────────────────
chatRoutes.get("/history", async (c) => {
  const user = await resolveUser(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const instanceId = c.req.query("instanceId");
  if (!instanceId) return c.json({ error: "Missing instanceId" }, 400);

  const messages = await loadHistory(instanceId);
  return c.json({ messages });
});

// ── SSE stream endpoint ───────────────────────────────────────────
chatRoutes.get("/stream", async (c) => {
  const user = await resolveUser(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const sessionId = c.req.header("x-session-id") ?? crypto.randomUUID();

  return streamSSE(c, async (stream) => {
    const writer: SessionWriter = {
      write: (event, data) => {
        stream.writeSSE({ event, data }).catch(() => {
          writer.closed = true;
        });
      },
      closed: false,
    };

    sessions.set(sessionId, writer);

    // Send initial connected event
    await stream.writeSSE({ data: JSON.stringify({ type: "connected", sessionId }) });

    // Keep alive with heartbeat
    const heartbeat = setInterval(() => {
      if (writer.closed) {
        clearInterval(heartbeat);
        return;
      }
      stream.writeSSE({ data: ": heartbeat" }).catch(() => {
        writer.closed = true;
        clearInterval(heartbeat);
      });
    }, 15_000);

    // Wait until the connection closes
    try {
      while (!writer.closed) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    } finally {
      clearInterval(heartbeat);
      sessions.delete(sessionId);
    }
  });
});

// ── Send message endpoint ─────────────────────────────────────────
chatRoutes.post("/", async (c) => {
  const user = await resolveUser(c.req.raw);
  if (!user) return c.json({ error: "Unauthorized" }, 401);

  const body = await c.req.json<{ sessionId: string; message: string; instanceId?: string }>();
  const { sessionId, message, instanceId } = body;

  if (!sessionId || !message) {
    return c.json({ error: "Missing sessionId or message" }, 400);
  }

  const writer = sessions.get(sessionId);
  if (!writer || writer.closed) {
    return c.json({ error: "No active stream for this session" }, 400);
  }

  let chatTarget: { gatewayKey: string; containerUrl: string } | null = null;
  let resolvedInstanceId = instanceId;

  if (instanceId) {
    chatTarget = await resolveInstanceChat(instanceId);
  } else {
    // Legacy fallback: find first instance for tenant
    const tenantId = c.req.header("x-tenant-id") ?? user.id;
    const profiles = await deps().profileStore.list();
    const profile = profiles.find((p) => p.tenantId === tenantId);
    if (profile) {
      chatTarget = await resolveInstanceChat(profile.id);
      resolvedInstanceId = profile.id;
    }
  }

  if (!chatTarget || !resolvedInstanceId) {
    writer.write("message", JSON.stringify({ type: "error", message: "No Managed instance found. Create one first." }));
    return c.json({ ok: true });
  }

  // Save user message to DB
  const tenantId = c.req.header("x-tenant-id") ?? user.id;
  await saveMessage(resolvedInstanceId, tenantId, user.id, "user", message);

  // Load conversation history from DB for context
  const history = await loadHistory(resolvedInstanceId);

  // Call platform's metered inference gateway (not the container's)
  // This ensures all inference goes through credit metering → OpenRouter
  const port = process.env.PORT ?? "3001";
  const gatewayUrl = `http://localhost:${port}/v1/chat/completions`;

  try {
    const res = await fetch(gatewayUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${chatTarget.gatewayKey}`,
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-v3.2",
        messages: [
          {
            role: "system",
            content: "You are a helpful AI assistant. Be concise and friendly.",
          },
          ...history,
        ],
        stream: true,
        max_tokens: 2048,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      logger.warn("Inference call failed", { status: res.status, body: errText.slice(0, 200) });
      writer.write("message", JSON.stringify({ type: "error", message: "Inference failed. Please try again." }));
      return c.json({ ok: true });
    }

    // Parse SSE stream from gateway and relay to client
    const reader = res.body?.getReader();
    if (!reader) {
      writer.write("message", JSON.stringify({ type: "error", message: "No response stream" }));
      return c.json({ ok: true });
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullResponse = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const raw = line.slice(5).trim();
        if (raw === "[DONE]") continue;
        try {
          const chunk = JSON.parse(raw);
          const delta = chunk.choices?.[0]?.delta?.content;
          if (delta) {
            fullResponse += delta;
            writer.write("message", JSON.stringify({ type: "text", delta }));
          }
        } catch {
          // skip malformed chunks
        }
      }
    }

    // Save assistant response to DB
    if (fullResponse) {
      await saveMessage(resolvedInstanceId, tenantId, "assistant", "assistant", fullResponse);
    }

    writer.write("message", JSON.stringify({ type: "done" }));
  } catch (err) {
    logger.error("Chat inference error", { error: (err as Error).message });
    writer.write("message", JSON.stringify({ type: "error", message: "Connection error. Please try again." }));
  }

  return c.json({ ok: true });
});
