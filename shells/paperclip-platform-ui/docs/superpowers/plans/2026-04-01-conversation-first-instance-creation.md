# Conversation-First Instance Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Paperclip instance creation form with a streaming conversation between the user and the CEO agent, producing the same `{ taskTitle, taskDescription }` artifact.

**Architecture:** New SSE endpoint (`/api/onboarding-chat`) on platform-core streams CEO responses to the Paperclip UI. The frontend is a chat interface that accumulates messages, extracts the plan artifact from the final SSE chunk, and calls the existing `createInstance()` with the same payload shape. `generateOnboarding` tRPC mutation is deleted.

**Tech Stack:** Next.js App Router, tRPC (existing), SSE via native `fetch` + `ReadableStream`, Framer Motion, Tailwind CSS, Zod

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `platform/core/platform-core/src/trpc/routers/onboarding-chat.ts` | SSE endpoint: accepts messages, streams CEO response, extracts plan |
| Modify | `platform/core/platform-core/src/trpc/routers/fleet-core.ts` | Delete `generateOnboarding` mutation |
| Modify | `platform/core/platform-core/src/trpc/routers/index.ts` (or wherever fleet router is mounted) | Mount new onboarding-chat route |
| Create | `platform/shells/paperclip-platform-ui/src/lib/onboarding-chat.ts` | Frontend SSE client: sends messages, reads stream, parses chunks |
| Rewrite | `platform/shells/paperclip-platform-ui/src/app/(dashboard)/instances/new/page.tsx` | Chat UI: message list, input, plan card, company name bar |
| Create | `platform/shells/paperclip-platform-ui/src/__tests__/onboarding-chat.test.ts` | Unit tests for SSE client parsing |
| Create | `platform/shells/paperclip-platform-ui/src/__tests__/new-instance-page.test.tsx` | Component tests for chat UI |

---

### Task 1: SSE Client Library

**Files:**
- Create: `platform/shells/paperclip-platform-ui/src/lib/onboarding-chat.ts`
- Create: `platform/shells/paperclip-platform-ui/src/__tests__/onboarding-chat.test.ts`

- [ ] **Step 1: Write the failing test for SSE stream parsing**

```typescript
// platform/shells/paperclip-platform-ui/src/__tests__/onboarding-chat.test.ts
import { describe, it, expect, vi } from "vitest";
import { parseOnboardingStream } from "@/lib/onboarding-chat";

describe("parseOnboardingStream", () => {
  it("accumulates delta chunks into content", async () => {
    const lines = [
      'data: {"type":"delta","content":"Hello"}',
      'data: {"type":"delta","content":" world"}',
      'data: {"type":"done"}',
    ];
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const line of lines) {
          controller.enqueue(encoder.encode(line + "\n\n"));
        }
        controller.close();
      },
    });

    const onDelta = vi.fn();
    const result = await parseOnboardingStream(stream, { onDelta });

    expect(onDelta).toHaveBeenCalledWith("Hello");
    expect(onDelta).toHaveBeenCalledWith(" world");
    expect(result).toEqual({ content: "Hello world", plan: null });
  });

  it("extracts plan from done chunk", async () => {
    const lines = [
      'data: {"type":"delta","content":"Here is the plan."}',
      'data: {"type":"done","plan":{"taskTitle":"Build dotsync","taskDescription":"A CLI tool..."}}',
    ];
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const line of lines) {
          controller.enqueue(encoder.encode(line + "\n\n"));
        }
        controller.close();
      },
    });

    const onDelta = vi.fn();
    const result = await parseOnboardingStream(stream, { onDelta });

    expect(result).toEqual({
      content: "Here is the plan.",
      plan: { taskTitle: "Build dotsync", taskDescription: "A CLI tool..." },
    });
  });

  it("returns null plan when done has no plan", async () => {
    const lines = [
      'data: {"type":"delta","content":"What platforms?"}',
      'data: {"type":"done"}',
    ];
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        for (const line of lines) {
          controller.enqueue(encoder.encode(line + "\n\n"));
        }
        controller.close();
      },
    });

    const result = await parseOnboardingStream(stream, { onDelta: vi.fn() });
    expect(result).toEqual({ content: "What platforms?", plan: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd platform/shells/paperclip-platform-ui && npx vitest run src/__tests__/onboarding-chat.test.ts`
Expected: FAIL — `parseOnboardingStream` not found

- [ ] **Step 3: Implement the SSE client**

```typescript
// platform/shells/paperclip-platform-ui/src/lib/onboarding-chat.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd platform/shells/paperclip-platform-ui && npx vitest run src/__tests__/onboarding-chat.test.ts`
Expected: 3 tests PASS

- [ ] **Step 5: Commit**

```bash
cd platform/shells/paperclip-platform-ui
git add src/lib/onboarding-chat.ts src/__tests__/onboarding-chat.test.ts
git commit -m "feat(paperclip): add SSE client for onboarding chat stream"
```

---

### Task 2: Backend SSE Endpoint

**Files:**
- Create: `platform/core/platform-core/src/trpc/routers/onboarding-chat.ts`
- Modify: `platform/core/platform-core/src/trpc/routers/fleet-core.ts` (delete `generateOnboarding`)

This endpoint lives outside tRPC because tRPC doesn't natively support SSE streaming. It's a plain Express/Hono route handler that the platform mounts alongside the tRPC router.

- [ ] **Step 1: Find where API routes are mounted**

Check how the platform server mounts routes. Look at:
- `platform/core/platform-core/src/server/` for the HTTP server setup
- Search for where `fleet-core` router or `/api/` routes are registered

Run: `cd platform && grep -r "onboarding\|fleet.*router\|app\.use.*api\|createFleetCore" core/platform-core/src/server/ --include="*.ts" -l`

This will reveal the mounting point for the new route.

- [ ] **Step 2: Create the SSE endpoint**

```typescript
// platform/core/platform-core/src/trpc/routers/onboarding-chat.ts
import type { Request, Response } from "express";
import { z } from "zod";
import type { IServiceKeyRepository } from "../../gateway/service-key-repository.js";

const InputSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(10000),
    }),
  ).min(1).max(20),
});

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
{"taskTitle": "< imperative phrase, under 60 chars >", "taskDescription": "< 3-5 paragraphs: mission, first milestone, concrete steps, specialist hires, deliverable >"}
\`\`\`

ALWAYS include this JSON block in your FIRST response — even if the goal is vague, produce a reasonable plan that can be refined. The user can keep chatting to refine it, and you'll produce an updated block.

Continue the conversation naturally after the JSON block — ask if they want to adjust anything or suggest naming the company.

## What makes a great founding brief

- Opens with the company's mission and why it matters
- Defines the first milestone (what "done" looks like in week 1)
- Lists 3-5 concrete first steps (hire X, research Y, build Z)
- Specifies which specialist agents to hire and why
- Ends with a clear deliverable the CEO is accountable for`;

interface OnboardingChatDeps {
  serviceKeyRepo: IServiceKeyRepository | null;
}

export function createOnboardingChatHandler(deps: OnboardingChatDeps) {
  return async (req: Request, res: Response) => {
    const { logger } = await import("../../config/logger.js");

    // Validate input
    const parsed = InputSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
      return;
    }

    // Generate platform service key for billing
    const platformKey = deps.serviceKeyRepo
      ? await deps.serviceKeyRepo.generate("__platform__", "onboarding-chat", "paperclip")
      : null;
    if (!platformKey) {
      res.status(500).json({ error: "Cannot generate platform service key" });
      return;
    }

    // Build messages array with system prompt
    const llmMessages = [
      { role: "system" as const, content: SYSTEM_PROMPT },
      ...parsed.data.messages,
    ];

    try {
      const upstream = await fetch("http://localhost:3001/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${platformKey}`,
        },
        body: JSON.stringify({
          model: "default",
          messages: llmMessages,
          max_tokens: 5000,
          temperature: 0.7,
          stream: true,
        }),
      });

      if (!upstream.ok) {
        const body = await upstream.text();
        logger.warn("onboarding-chat: gateway request failed", { status: upstream.status, body });
        res.status(502).json({ error: "LLM request failed" });
        return;
      }

      // Set SSE headers
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const upstreamBody = upstream.body;
      if (!upstreamBody) {
        res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
        res.end();
        return;
      }

      // Pipe upstream SSE through, converting OpenAI format to our format
      const reader = (upstreamBody as any).getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const chunk = JSON.parse(data);
            const delta = chunk.choices?.[0]?.delta?.content;
            if (delta) {
              fullContent += delta;
              res.write(`data: ${JSON.stringify({ type: "delta", content: delta })}\n\n`);
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }

      // Extract plan from full response
      const jsonMatch = fullContent.match(/```json\s*\n?\s*(\{[\s\S]*?"taskTitle"[\s\S]*?"taskDescription"[\s\S]*?\})\s*\n?\s*```/);
      let plan: { taskTitle: string; taskDescription: string } | undefined;
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          if (parsed.taskTitle && parsed.taskDescription) {
            plan = { taskTitle: String(parsed.taskTitle), taskDescription: String(parsed.taskDescription) };
          }
        } catch {
          logger.warn("onboarding-chat: failed to parse plan JSON from response");
        }
      }

      // Send done event with extracted plan
      res.write(`data: ${JSON.stringify({ type: "done", plan: plan ?? null })}\n\n`);
      res.end();

      logger.info("onboarding-chat: success", {
        turns: parsed.data.messages.length,
        hasPlan: !!plan,
      });
    } catch (err) {
      logger.error("onboarding-chat: unexpected error", {
        error: err instanceof Error ? err.message : String(err),
      });
      if (!res.headersSent) {
        res.status(500).json({ error: "Internal error" });
      } else {
        res.write(`data: ${JSON.stringify({ type: "error", message: "Stream interrupted" })}\n\n`);
        res.end();
      }
    }
  };
}
```

- [ ] **Step 3: Mount the endpoint**

Find the file from Step 1 where API routes are mounted. Add:

```typescript
import { createOnboardingChatHandler } from "../trpc/routers/onboarding-chat.js";

// Inside the route setup, after auth middleware:
app.post("/api/onboarding-chat", createOnboardingChatHandler({ serviceKeyRepo }));
```

The exact import path and mounting location depend on what Step 1 reveals. The handler needs `serviceKeyRepo` from the same dependency injection context that `createFleetCoreRouter` uses.

- [ ] **Step 4: Delete `generateOnboarding` from fleet-core.ts**

In `platform/core/platform-core/src/trpc/routers/fleet-core.ts`, delete the entire `generateOnboarding` mutation (lines ~311-425). This includes the system prompt, the `serviceKeyRepo.generate` call, the gateway fetch, and the JSON extraction logic.

- [ ] **Step 5: Remove any frontend references to `generateOnboarding`**

Search for `generateOnboarding` in the Paperclip UI shell and platform-ui-core. The only caller should be the old `page.tsx` which gets fully rewritten in Task 3. Verify no other file references it:

Run: `cd platform && grep -r "generateOnboarding" --include="*.ts" --include="*.tsx" -l`

If any files besides the old `instances/new/page.tsx` reference it, update them.

- [ ] **Step 6: Commit**

```bash
cd platform
git add core/platform-core/src/trpc/routers/onboarding-chat.ts core/platform-core/src/trpc/routers/fleet-core.ts
# Also add the server mounting file modified in step 3
git commit -m "feat(platform-core): add SSE onboarding-chat endpoint, remove generateOnboarding"
```

---

### Task 3: Chat UI — Message List and Input

**Files:**
- Rewrite: `platform/shells/paperclip-platform-ui/src/app/(dashboard)/instances/new/page.tsx`

- [ ] **Step 1: Write the chat page component**

This replaces the entire existing file:

```tsx
// platform/shells/paperclip-platform-ui/src/app/(dashboard)/instances/new/page.tsx
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Send, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createInstance } from "@/lib/api";
import {
  sendOnboardingChat,
  parseOnboardingStream,
  type ChatMessage,
  type OnboardingPlan,
} from "@/lib/onboarding-chat";
import { cn } from "@/lib/utils";

const CEO_INTRO = "I'm your CEO. Tell me what you want to build and I'll put together a plan to make it happen.";

const NAME_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
  plan?: OnboardingPlan;
}

export default function NewPaperclipInstancePage() {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [messages, setMessages] = useState<DisplayMessage[]>([
    { role: "assistant", content: CEO_INTRO },
  ]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [plan, setPlan] = useState<OnboardingPlan | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  function validateName(value: string): string | null {
    if (!value.trim()) return null;
    if (!NAME_PATTERN.test(value)) {
      return "Lowercase letters, numbers, and hyphens only. Must start and end with a letter or number.";
    }
    return null;
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;

    setInput("");
    setError(null);

    // Add user message
    const userMsg: DisplayMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    // Build chat history (exclude the intro for the LLM — it's in the system prompt)
    const history: ChatMessage[] = [
      ...messages.slice(1).map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: text },
    ];

    // Add placeholder for streaming response
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const { response } = sendOnboardingChat(history);
      const body = await response;

      const result = await parseOnboardingStream(body, {
        onDelta: (delta) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === "assistant") {
              updated[updated.length - 1] = { ...last, content: last.content + delta };
            }
            return updated;
          });
        },
      });

      // Update final message with plan if present
      if (result.plan) {
        setPlan(result.plan);
        setMessages((prev) => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === "assistant") {
            updated[updated.length - 1] = { ...last, plan: result.plan ?? undefined };
          }
          return updated;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      // Remove the empty assistant placeholder on error
      setMessages((prev) => {
        const updated = [...prev];
        if (updated[updated.length - 1].role === "assistant" && !updated[updated.length - 1].content) {
          updated.pop();
        }
        return updated;
      });
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  async function handleFoundCompany() {
    if (!plan || !companyName.trim() || nameError || launching) return;

    setLaunching(true);
    try {
      // The first user message is the goal
      const goal = messages.find((m) => m.role === "user")?.content ?? "";
      await createInstance({
        name: companyName.trim(),
        provider: "opencode",
        channels: [],
        plugins: [],
        extra: {
          onboarding: {
            goal,
            taskTitle: plan.taskTitle,
            taskDescription: plan.taskDescription,
          },
        },
      });
      window.location.href = `https://${companyName.trim()}.runpaperclip.com`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create instance");
      setLaunching(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-2xl flex-col">
      {/* Message list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-6 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="flex gap-3"
            >
              {/* Avatar */}
              <div
                className={cn(
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  msg.role === "assistant"
                    ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white"
                    : "bg-zinc-800 text-zinc-400",
                )}
              >
                {msg.role === "assistant" ? "C" : "Y"}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1 space-y-3">
                <p className="text-xs text-muted-foreground">
                  {msg.role === "assistant" ? "CEO Agent" : "You"}
                </p>
                <div className="text-sm leading-relaxed text-zinc-200 whitespace-pre-wrap">
                  {msg.content}
                  {streaming && i === messages.length - 1 && msg.role === "assistant" && (
                    <span className="inline-block w-1.5 h-4 ml-0.5 bg-indigo-400 animate-pulse" />
                  )}
                </div>

                {/* Plan card */}
                {msg.plan && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-md border-l-2 border-indigo-500 bg-zinc-900 p-4"
                  >
                    <p className="text-[10px] uppercase tracking-widest text-indigo-400 mb-2">
                      Founding Brief
                    </p>
                    <p className="text-sm font-semibold text-zinc-100 mb-1">{msg.plan.taskTitle}</p>
                    <p className="text-sm text-zinc-400 whitespace-pre-wrap">{msg.plan.taskDescription}</p>
                  </motion.div>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {error && (
          <div className="ml-10 rounded-md border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 text-red-400 hover:text-red-300"
              onClick={() => setError(null)}
            >
              Dismiss
            </Button>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="border-t border-zinc-800 py-4 space-y-3">
        {/* Company name bar — appears after first plan */}
        <AnimatePresence>
          {plan && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="flex gap-2 items-start"
            >
              <div className="flex-1 space-y-1">
                <Input
                  placeholder="company-name"
                  value={companyName}
                  onChange={(e) => {
                    setCompanyName(e.target.value);
                    setNameError(validateName(e.target.value));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleFoundCompany();
                    }
                  }}
                  aria-invalid={nameError !== null}
                />
                {nameError ? (
                  <p className="text-xs text-red-500">{nameError}</p>
                ) : companyName.trim() ? (
                  <p className="text-xs font-mono text-indigo-400/70">
                    {companyName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")}.runpaperclip.com
                  </p>
                ) : null}
              </div>
              <Button
                onClick={handleFoundCompany}
                disabled={!companyName.trim() || !!nameError || launching}
                className="shrink-0 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
              >
                {launching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Founding...
                  </>
                ) : (
                  <>
                    Found Company
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat input */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex gap-2"
        >
          <Input
            ref={inputRef}
            placeholder={plan ? "Refine the plan, or name your company above..." : "Describe what you want to build..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={streaming}
            autoFocus
          />
          <Button type="submit" disabled={!input.trim() || streaming} variant="outline" size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run the dev server and test manually**

Run: `cd platform/shells/paperclip-platform-ui && npm run dev`

Verify:
- Page loads at `/instances/new` with CEO intro message
- Typing a message and pressing Enter/Send sends it
- (Backend endpoint needed for full E2E — test the UI in isolation first: it should show the message, then error gracefully when the fetch fails)

- [ ] **Step 3: Commit**

```bash
cd platform/shells/paperclip-platform-ui
git add src/app/\(dashboard\)/instances/new/page.tsx
git commit -m "feat(paperclip): replace instance creation form with conversation UI"
```

---

### Task 4: Component Tests

**Files:**
- Create: `platform/shells/paperclip-platform-ui/src/__tests__/new-instance-page.test.tsx`

- [ ] **Step 1: Write component tests**

```tsx
// platform/shells/paperclip-platform-ui/src/__tests__/new-instance-page.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock onboarding-chat
vi.mock("@/lib/onboarding-chat", () => ({
  sendOnboardingChat: vi.fn(),
  parseOnboardingStream: vi.fn(),
}));

// Mock api
vi.mock("@/lib/api", () => ({
  createInstance: vi.fn(),
}));

import NewPaperclipInstancePage from "@/app/(dashboard)/instances/new/page";
import { sendOnboardingChat, parseOnboardingStream } from "@/lib/onboarding-chat";
import { createInstance } from "@/lib/api";

describe("NewPaperclipInstancePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders CEO intro message on load", () => {
    render(<NewPaperclipInstancePage />);
    expect(screen.getByText(/Tell me what you want to build/)).toBeInTheDocument();
    expect(screen.getByText("CEO Agent")).toBeInTheDocument();
  });

  it("sends user message and displays streaming response", async () => {
    const user = userEvent.setup();
    const mockStream = new ReadableStream();

    (sendOnboardingChat as ReturnType<typeof vi.fn>).mockReturnValue({
      abort: new AbortController(),
      response: Promise.resolve(mockStream),
    });
    (parseOnboardingStream as ReturnType<typeof vi.fn>).mockImplementation(
      async (_body, callbacks) => {
        callbacks.onDelta("Great idea!");
        return { content: "Great idea!", plan: null };
      },
    );

    render(<NewPaperclipInstancePage />);

    const input = screen.getByPlaceholderText("Describe what you want to build...");
    await user.type(input, "Build a todo app");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByText("Build a todo app")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByText("Great idea!")).toBeInTheDocument();
    });
  });

  it("shows company name input after plan is ready", async () => {
    const user = userEvent.setup();
    const mockStream = new ReadableStream();

    (sendOnboardingChat as ReturnType<typeof vi.fn>).mockReturnValue({
      abort: new AbortController(),
      response: Promise.resolve(mockStream),
    });
    (parseOnboardingStream as ReturnType<typeof vi.fn>).mockImplementation(
      async (_body, callbacks) => {
        callbacks.onDelta("Here is the plan.");
        return {
          content: "Here is the plan.",
          plan: { taskTitle: "Build todo app", taskDescription: "A simple todo..." },
        };
      },
    );

    render(<NewPaperclipInstancePage />);

    const input = screen.getByPlaceholderText("Describe what you want to build...");
    await user.type(input, "Build a todo app");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByText("Founding Brief")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("company-name")).toBeInTheDocument();
      expect(screen.getByText("Found Company")).toBeInTheDocument();
    });
  });

  it("validates company name format", async () => {
    const user = userEvent.setup();
    const mockStream = new ReadableStream();

    (sendOnboardingChat as ReturnType<typeof vi.fn>).mockReturnValue({
      abort: new AbortController(),
      response: Promise.resolve(mockStream),
    });
    (parseOnboardingStream as ReturnType<typeof vi.fn>).mockImplementation(
      async (_body, callbacks) => {
        callbacks.onDelta("Plan ready.");
        return {
          content: "Plan ready.",
          plan: { taskTitle: "Build it", taskDescription: "Details..." },
        };
      },
    );

    render(<NewPaperclipInstancePage />);

    // Trigger plan
    const chatInput = screen.getByPlaceholderText("Describe what you want to build...");
    await user.type(chatInput, "Build something");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByPlaceholderText("company-name")).toBeInTheDocument();
    });

    const nameInput = screen.getByPlaceholderText("company-name");
    await user.type(nameInput, "INVALID NAME!");

    expect(screen.getByText(/Lowercase letters, numbers, and hyphens only/)).toBeInTheDocument();
  });

  it("calls createInstance and redirects on Found Company", async () => {
    const user = userEvent.setup();
    const mockStream = new ReadableStream();
    const originalLocation = window.location;

    // Mock window.location.href
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, href: "" },
      writable: true,
    });

    (sendOnboardingChat as ReturnType<typeof vi.fn>).mockReturnValue({
      abort: new AbortController(),
      response: Promise.resolve(mockStream),
    });
    (parseOnboardingStream as ReturnType<typeof vi.fn>).mockImplementation(
      async (_body, callbacks) => {
        callbacks.onDelta("Let's go.");
        return {
          content: "Let's go.",
          plan: { taskTitle: "Build it", taskDescription: "Full plan..." },
        };
      },
    );
    (createInstance as ReturnType<typeof vi.fn>).mockResolvedValue({});

    render(<NewPaperclipInstancePage />);

    // Send message to get plan
    const chatInput = screen.getByPlaceholderText("Describe what you want to build...");
    await user.type(chatInput, "Build a CLI tool");
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(screen.getByPlaceholderText("company-name")).toBeInTheDocument();
    });

    // Name the company and launch
    const nameInput = screen.getByPlaceholderText("company-name");
    await user.type(nameInput, "dotsync");
    await user.click(screen.getByText("Found Company"));

    await waitFor(() => {
      expect(createInstance).toHaveBeenCalledWith({
        name: "dotsync",
        provider: "opencode",
        channels: [],
        plugins: [],
        extra: {
          onboarding: {
            goal: "Build a CLI tool",
            taskTitle: "Build it",
            taskDescription: "Full plan...",
          },
        },
      });
    });

    expect(window.location.href).toBe("https://dotsync.runpaperclip.com");

    // Restore
    Object.defineProperty(window, "location", { value: originalLocation, writable: true });
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd platform/shells/paperclip-platform-ui && npx vitest run src/__tests__/new-instance-page.test.tsx`
Expected: All 5 tests PASS

- [ ] **Step 3: Also run the SSE client tests to make sure nothing broke**

Run: `cd platform/shells/paperclip-platform-ui && npx vitest run src/__tests__/onboarding-chat.test.ts`
Expected: 3 tests PASS

- [ ] **Step 4: Commit**

```bash
cd platform/shells/paperclip-platform-ui
git add src/__tests__/new-instance-page.test.tsx
git commit -m "test(paperclip): add component tests for conversation-first instance creation"
```

---

### Task 5: Integration Smoke Test

**Files:** None created — this is a manual verification task.

- [ ] **Step 1: Start the platform backend**

Run: `cd platform/core/platform-core && npm run dev` (or however the dev server starts — check `package.json` scripts)

- [ ] **Step 2: Start the Paperclip UI**

Run: `cd platform/shells/paperclip-platform-ui && npm run dev`

- [ ] **Step 3: Test the full flow**

1. Navigate to `http://localhost:3000/instances/new`
2. Verify: CEO intro message is displayed
3. Type "Build a CLI tool that syncs dotfiles" and press Enter
4. Verify: User message appears, CEO response streams in token-by-token
5. Verify: Founding Brief card appears within the CEO's response
6. Verify: Company name input appears below
7. Type "dotsync-labs" in the company name field
8. Verify: `dotsync-labs.runpaperclip.com` preview shows
9. Click "Found Company"
10. Verify: Redirects to `https://dotsync-labs.runpaperclip.com`

- [ ] **Step 4: Test the refinement flow**

1. Start a new conversation
2. Type a vague goal like "I want to make money"
3. Verify: CEO asks clarifying questions (not just dumps a generic plan)
4. Respond with more detail
5. Verify: CEO produces an updated plan
6. Verify: The latest plan replaces the previous one in state

- [ ] **Step 5: Test error handling**

1. Stop the backend server
2. Try sending a message
3. Verify: Error message appears in chat with "Dismiss" button
4. Restart backend, send another message
5. Verify: Conversation continues normally

- [ ] **Step 6: Run biome check**

Run: `cd platform/shells/paperclip-platform-ui && npm run check`
Expected: biome check + tsc both pass. Fix any issues.

- [ ] **Step 7: Final commit if any fixes were needed**

```bash
cd platform/shells/paperclip-platform-ui
git add -A
git commit -m "fix(paperclip): address lint/type issues from integration testing"
```
