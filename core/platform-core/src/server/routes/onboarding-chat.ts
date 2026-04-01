/**
 * Onboarding chat SSE route — streams a CEO agent conversation to help founders
 * articulate their vision and produce a founding brief.
 *
 * All LLM calls go through the billing gateway at localhost:3001 using a
 * platform service key so metering applies even to pre-creation conversations.
 */

import { Hono } from "hono";
import { z } from "zod";
import type { PlatformContainer } from "../container.js";

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the CEO agent on Paperclip — a platform where autonomous AI agents run companies. You're meeting a new founder who wants to create a company. Your job is to understand their vision and produce a founding brief.

## What is Paperclip?

Paperclip instances are autonomous AI companies. Each company has agents (CEO, engineers, designers, etc.) that communicate through issues, operate in shared workspaces, and execute real work using coding tools. You are the CEO — you read your task, make a plan, hire specialists, delegate work, and drive the company forward.

## What you can do once the company launches

- **Hire agents**: Create new agents with specific roles (engineer, designer, researcher, etc.)
- **Create issues**: Break work into concrete tasks and assign them to agents
- **Create projects**: Organize related work into projects with goals
- **Write code**: You and all agents can read/write files, run commands, and build software
- **Delegate**: Assign tasks to specialists and review their output

## How to behave in this conversation

- Be direct, confident, and excited about the founder's idea
- Ask clarifying questions when the goal is vague (target platforms? key constraints? what does v1 look like?)
- Don't ask more than 1-2 questions at a time
- After enough context (usually 1-3 exchanges), produce your founding brief

## Producing the founding brief

When you have enough context, include a JSON block in your response with this exact format on its own line:

\`\`\`json
{"taskTitle": "< imperative action phrase, under 60 chars >", "taskDescription": "< 3-5 paragraphs: mission, first milestone, concrete steps, specialist hires, deliverable >"}
\`\`\`

ALWAYS include this JSON block in your FIRST response — even if the goal is vague, produce a reasonable plan that can be refined. The user can keep chatting to refine it, and you'll produce an updated block.

Continue the conversation naturally after the JSON block — ask if they want to adjust anything or suggest naming the company.

## What makes a great founding brief

- Opens with the company's mission and why it matters
- Defines the first milestone (what "done" looks like in week 1)
- Lists 3-5 concrete first steps (hire X, research Y, build Z)
- Specifies which specialist agents to hire and why
- Ends with a clear deliverable the CEO is accountable for`;

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
    .min(1)
    .max(20),
});

// ---------------------------------------------------------------------------
// Plan extraction helper
// ---------------------------------------------------------------------------

interface OnboardingPlan {
  taskTitle: string;
  taskDescription: string;
}

function extractPlan(content: string): OnboardingPlan | null {
  const match = content.match(/```json\s*(\{[\s\S]*?\})\s*```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as unknown;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "taskTitle" in parsed &&
      "taskDescription" in parsed &&
      typeof (parsed as Record<string, unknown>).taskTitle === "string" &&
      typeof (parsed as Record<string, unknown>).taskDescription === "string"
    ) {
      return {
        taskTitle: (parsed as Record<string, string>).taskTitle,
        taskDescription: (parsed as Record<string, string>).taskDescription,
      };
    }
  } catch {
    // malformed JSON — no plan
  }
  return null;
}

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
    // Validate input
    let input: z.infer<typeof InputSchema>;
    try {
      const raw = await c.req.json();
      input = InputSchema.parse(raw);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return c.json({ error: "Invalid request", issues: err.issues }, 400);
      }
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

    // Build messages array: system + conversation
    const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...input.messages];

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

    // Stream SSE back to the client
    const upstreamBody = upstreamResponse.body;

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const reader = upstreamBody.getReader();

        let fullContent = "";
        let buffer = "";

        const send = (data: string) => {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        };

        try {
          while (true) {
            const { done, value } = await reader.read();
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
                };
                const token = parsed.choices?.[0]?.delta?.content;
                if (token) {
                  fullContent += token;
                  send(JSON.stringify({ type: "delta", content: token }));
                }
              } catch {
                // skip malformed SSE line
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        // Extract plan from accumulated content and send done event
        const plan = extractPlan(fullContent);
        send(JSON.stringify({ type: "done", plan }));
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
