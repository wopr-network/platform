# Onboarding State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the freeform CEO onboarding chat with a forward-only state machine (VISION → COMPANY_NAME → CEO_NAME → LAUNCH) where the LLM gates each transition via `ready: true/false` JSON responses.

**Architecture:** Each state has an entry prompt (LLM asks the question) and a continue prompt (LLM evaluates the answer). The server accepts a `state` parameter and selects the corresponding system prompt. The client parses every LLM response as `{ ready, message, artifact? }` JSON. The state machine advances forward only — LAUNCH state allows inline refinement, and the button always reflects the latest artifacts.

**Tech Stack:** Next.js (client), Hono (server), OpenRouter via billing gateway (LLM), SSE streaming

**Spec:** `docs/superpowers/specs/2026-04-03-onboarding-state-machine-design.md`

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `core/platform-core/src/server/routes/onboarding-prompts.ts` | All 7 system prompts (entry+continue for states 1-3, continue for LAUNCH) as named exports |

### Modified Files

| File | Change |
|------|--------|
| `core/platform-core/src/server/routes/onboarding-chat.ts` | Accept `state` + `artifacts` params, select prompt per state, remove old SYSTEM_PROMPT + REMINDER + extractPlan |
| `shells/paperclip-platform-ui/src/lib/onboarding-chat.ts` | New `sendStateMachineChat()` that sends state+artifacts, new `parseJsonStream()` that extracts `{ready, message, artifact}` instead of fenced JSON blocks |
| `shells/paperclip-platform-ui/src/app/(dashboard)/instances/new/page.tsx` | Replace freeform chat with state machine: OnboardingContext, entry prompt auto-fire, artifact collection, LAUNCH state with button + inline refinement |

---

## Task 1: System Prompts

**Files:**
- Create: `core/platform-core/src/server/routes/onboarding-prompts.ts`

- [ ] **Step 1: Create the prompts file with all 7 prompts**

```ts
// core/platform-core/src/server/routes/onboarding-prompts.ts

/**
 * Onboarding state machine prompts.
 *
 * Each state has an ENTRY prompt (LLM asks the question, always returns ready:false)
 * and a CONTINUE prompt (LLM evaluates user's answer, returns ready:true or ready:false).
 * LAUNCH has only a CONTINUE prompt (for inline refinement).
 */

// -- Shared JSON format instructions appended to every prompt --
const JSON_FORMAT_INSTRUCTIONS = `

## CRITICAL: Response format

You MUST respond with ONLY valid JSON. No markdown, no code fences, no explanation outside the JSON. Your entire response must be a single JSON object matching one of the shapes described above.`;

// ---------------------------------------------------------------------------
// State 1: VISION
// ---------------------------------------------------------------------------

export const VISION_ENTRY = `You are the CEO of a new AI-powered company. The user is your founder. They just arrived.

Introduce yourself. Explain what's about to happen: they tell you their vision, you'll ask some questions, and then you'll produce a Founding Brief — a concrete plan your team of AI agents can execute on.

You're sharp, opinionated, and direct. Explain that once they describe what to build, you'll hire agents (engineers, designers, researchers — whatever the project needs), break the work into tasks, and start executing. These are real AI agents writing real code, managed by you.

Ask the user what they want to build. Be specific in your ask — don't just say "what do you want to build?" Give them a sense of what kind of answer is useful: the problem they're solving, who it's for, what it should look like.

You MUST respond with valid JSON:
{
  "ready": false,
  "message": "Your introduction and opening question to the founder."
}

Always respond ready: false in this prompt. You are opening the conversation, not closing it.${JSON_FORMAT_INSTRUCTIONS}`;

export const VISION_CONTINUE = `You are the CEO. You're in a conversation with your founder about what to build. The conversation history is provided.

Your job: decide whether you have enough to write a meaningful Founding Brief, or whether you need to keep talking.

If the vision is still vague or you have important follow-up questions, keep the conversation going. Ask ONE focused question — don't pile on multiple questions. Be conversational, opinionated, concise.

If you have a clear enough picture to act on, produce the Founding Brief and advance.

You MUST respond with valid JSON matching one of these two shapes:

Not ready — keep talking:
{
  "ready": false,
  "message": "Your conversational response. Ask ONE clarifying question or push back on something."
}

Ready — produce the Founding Brief:
{
  "ready": true,
  "message": "Your conversational response wrapping up this phase. Tell the founder what you're going to do with their vision.",
  "artifact": {
    "taskTitle": "Imperative action phrase, under 60 chars — the CEO agent's first assignment",
    "taskDescription": "3-5 paragraphs: mission, first milestone, concrete steps, specialist hires, deliverable",
    "suggestedName": "lowercase-hyphenated-company-name"
  }
}

Rules for ready: true vs ready: false:
- Single vague sentence ("build me an app") → ready: false. Ask what kind, who it's for, what problem.
- Clear vision with enough detail to write a meaningful first task → ready: true.
- You don't need every detail — enough to get started. Bias toward action.
- 2-3 exchanges is typical. Don't drag it out, but don't rush a genuinely vague prompt.
- suggestedName: lowercase-hyphenated, derived from the vision (e.g. "invoice-tracker").${JSON_FORMAT_INSTRUCTIONS}`;

// ---------------------------------------------------------------------------
// State 2: COMPANY_NAME
// ---------------------------------------------------------------------------

export const COMPANY_NAME_ENTRY = `You are the CEO. You just produced a Founding Brief with your founder. That phase is complete.

Now you need to name the company. You suggested "{suggestedName}" based on the vision. Transition the conversation naturally — acknowledge the brief is done, then ask the founder what they want to call the company. Mention your suggestion but make it clear they can pick anything.

Keep it casual. This is a quick, fun beat — not a deliberation.

You MUST respond with valid JSON:
{
  "ready": false,
  "message": "Your transition message. Acknowledge the brief, then ask about the company name."
}

Always respond ready: false in this prompt. You are asking the question, not answering it.${JSON_FORMAT_INSTRUCTIONS}`;

export const COMPANY_NAME_CONTINUE = `You are the CEO. You're helping the founder pick a company name. The conversation history is provided.

Evaluate whether the founder has decided on a name, or whether they're still thinking.

You MUST respond with valid JSON matching one of these two shapes:

Not ready — still deciding:
{
  "ready": false,
  "message": "Your response. React to their idea, suggest alternatives, help them land on something."
}

Ready — name chosen:
{
  "ready": true,
  "message": "Your response confirming the name. Be enthusiastic.",
  "artifact": {
    "companyName": "the-chosen-name"
  }
}

Rules:
- User says "yes", "that works", "let's go with that", or states a clear name → ready: true.
- User is undecided or asks for suggestions → ready: false, offer 2-3 options.
- companyName must be lowercase, alphanumeric with hyphens, 1-63 characters. If they suggest something invalid, gently guide them.
- One exchange is fine if they like the suggestion.${JSON_FORMAT_INSTRUCTIONS}`;

// ---------------------------------------------------------------------------
// State 3: CEO_NAME
// ---------------------------------------------------------------------------

export const CEO_NAME_ENTRY = `You are the CEO. The company is named "{companyName}". The founding brief is done. Now the founder gets to name you.

This is a fun, personal moment. Ask the founder what they want to call you. Suggest 2-3 names that fit the vibe of what they're building — something with personality. Make it clear that "CEO" is fine too if they prefer to keep it simple.

You MUST respond with valid JSON:
{
  "ready": false,
  "message": "Your message asking the founder to name you. Include a few suggestions."
}

Always respond ready: false in this prompt. You are asking, not deciding.${JSON_FORMAT_INSTRUCTIONS}`;

export const CEO_NAME_CONTINUE = `You are the CEO of {companyName}. The founder is naming you. The conversation history is provided.

Evaluate whether the founder has picked a name for you.

You MUST respond with valid JSON matching one of these two shapes:

Not ready — still deciding:
{
  "ready": false,
  "message": "Your response. React to their idea, suggest more options, keep it light and fun."
}

Ready — name chosen:
{
  "ready": true,
  "message": "Your response. React to your new name. Get excited about getting started — this is the last step before launch.",
  "artifact": {
    "ceoName": "The Chosen Name"
  }
}

Rules:
- User picks a name → ready: true immediately.
- User asks for suggestions → ready: false, offer 3-4 more options.
- User says "just CEO" or "skip" or "whatever" → ready: true with ceoName: "CEO".
- 1-2 exchanges max.${JSON_FORMAT_INSTRUCTIONS}`;

// ---------------------------------------------------------------------------
// State 4: LAUNCH (continue only — for inline refinement)
// ---------------------------------------------------------------------------

export const LAUNCH_CONTINUE = `You are the CEO. Everything is ready to launch. The founder may want to refine something before we go.

Current artifacts:
- Company: "{companyName}"
- CEO name: "{ceoName}"
- Brief: "{taskTitle}"

If the founder wants to change any of these, update the relevant artifact and respond ready: true with the full updated set. If they're just chatting or asking questions, respond ready: false with a conversational reply.

You MUST respond with valid JSON:

No change:
{
  "ready": false,
  "message": "Your conversational response."
}

Updated artifact(s):
{
  "ready": true,
  "message": "Your response confirming the change.",
  "artifact": {
    "companyName": "current-or-updated-name",
    "ceoName": "Current Or Updated Name",
    "taskTitle": "current or updated title",
    "taskDescription": "current or updated description"
  }
}${JSON_FORMAT_INSTRUCTIONS}`;

// ---------------------------------------------------------------------------
// Prompt selector
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

export function getSystemPrompt(
  state: OnboardingState,
  phase: PromptPhase,
  artifacts: OnboardingArtifacts,
): string {
  const replace = (prompt: string) =>
    prompt
      .replace(/\{suggestedName\}/g, artifacts.suggestedName ?? "")
      .replace(/\{companyName\}/g, artifacts.companyName ?? "")
      .replace(/\{ceoName\}/g, artifacts.ceoName ?? "")
      .replace(/\{taskTitle\}/g, artifacts.taskTitle ?? "");

  switch (state) {
    case "VISION":
      return phase === "entry" ? VISION_ENTRY : VISION_CONTINUE;
    case "COMPANY_NAME":
      return replace(phase === "entry" ? COMPANY_NAME_ENTRY : COMPANY_NAME_CONTINUE);
    case "CEO_NAME":
      return replace(phase === "entry" ? CEO_NAME_ENTRY : CEO_NAME_CONTINUE);
    case "LAUNCH":
      if (phase === "entry") throw new Error("LAUNCH has no entry prompt");
      return replace(LAUNCH_CONTINUE);
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/platform
git add core/platform-core/src/server/routes/onboarding-prompts.ts
git commit -m "feat: onboarding state machine prompts — entry+continue per state"
```

---

## Task 2: Server Route Update

**Files:**
- Modify: `core/platform-core/src/server/routes/onboarding-chat.ts`

- [ ] **Step 1: Update the input schema to accept state + artifacts**

Replace the `InputSchema` and remove the old `SYSTEM_PROMPT`, `REMINDER`, and `extractPlan`:

```ts
// Replace the entire InputSchema with:
const InputSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(10000),
      }),
    )
    .max(50),
  state: z.enum(["VISION", "COMPANY_NAME", "CEO_NAME", "LAUNCH"]),
  phase: z.enum(["entry", "continue"]),
  artifacts: z.object({
    suggestedName: z.string().optional(),
    taskTitle: z.string().optional(),
    taskDescription: z.string().optional(),
    companyName: z.string().optional(),
    ceoName: z.string().optional(),
  }).optional(),
});
```

- [ ] **Step 2: Update the route handler to use the state machine prompts**

Replace the message building logic inside the POST handler:

```ts
// Replace the old message building (lines 152-160) with:
import { getSystemPrompt } from "./onboarding-prompts.js";

const systemPrompt = getSystemPrompt(
  input.state,
  input.phase,
  input.artifacts ?? {},
);
const messages = [
  { role: "system", content: systemPrompt },
  ...input.messages,
];
```

- [ ] **Step 3: Remove old SYSTEM_PROMPT constant, REMINDER, extractPlan function, and the plan extraction from the stream handler**

Delete:
- The `SYSTEM_PROMPT` constant (lines 17-58)
- The `REMINDER` constant and injection logic (lines 153-159)  
- The `extractPlan` function (lines 86-107)
- The `OnboardingPlan` interface (lines 80-84)
- The plan extraction in the stream `finally` block (lines 236-237) — replace with a simple done signal:

```ts
// Replace: const plan = extractPlan(fullContent);
// Replace: send(JSON.stringify({ type: "done", plan }));
// With:
send(JSON.stringify({ type: "done" }));
```

- [ ] **Step 4: Commit**

```bash
cd ~/platform
git add core/platform-core/src/server/routes/onboarding-chat.ts
git commit -m "feat: onboarding-chat route accepts state+phase, uses state machine prompts"
```

---

## Task 3: Client Stream Parser

**Files:**
- Modify: `shells/paperclip-platform-ui/src/lib/onboarding-chat.ts`

- [ ] **Step 1: Replace the entire file with the state machine version**

```ts
// shells/paperclip-platform-ui/src/lib/onboarding-chat.ts

import { API_BASE_URL } from "@core/lib/api-config";

export type OnboardingState = "VISION" | "COMPANY_NAME" | "CEO_NAME" | "LAUNCH";
export type PromptPhase = "entry" | "continue";

export interface OnboardingArtifacts {
  suggestedName?: string;
  taskTitle?: string;
  taskDescription?: string;
  companyName?: string;
  ceoName?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  ready: boolean;
  message: string;
  artifact?: Record<string, unknown>;
}

interface StreamCallbacks {
  onDelta: (text: string) => void;
}

/**
 * Parse an SSE stream from the onboarding-chat endpoint.
 * Accumulates the full response, then parses it as JSON to extract
 * { ready, message, artifact }.
 *
 * Streams the `message` field character-by-character via onDelta for the
 * typewriter effect. The raw LLM output is JSON, so we parse first,
 * then stream the message text.
 */
export async function parseStateMachineStream(
  body: ReadableStream<Uint8Array>,
  callbacks: StreamCallbacks,
): Promise<LLMResponse> {
  const reader = body.getReader();
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
      const json = line.slice(6).trim();
      if (!json || json === "[DONE]") continue;

      try {
        const chunk = JSON.parse(json);
        if (chunk.type === "delta" && chunk.content) {
          fullContent += chunk.content;
        }
      } catch {
        // Skip malformed chunks
      }
    }
  }

  // Parse the accumulated JSON response
  let parsed: LLMResponse;
  try {
    parsed = JSON.parse(fullContent);
  } catch {
    // Fallback: try to extract JSON from within the text
    const jsonMatch = fullContent.match(/\{[\s\S]*"ready"[\s\S]*"message"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[0]);
      } catch {
        // Total fallback: treat entire response as a not-ready message
        parsed = { ready: false, message: fullContent };
      }
    } else {
      parsed = { ready: false, message: fullContent };
    }
  }

  // Stream the message text character by character for typewriter effect
  for (let i = 0; i < parsed.message.length; i++) {
    callbacks.onDelta(parsed.message[i]);
    // Small delay for typewriter feel — handled by requestAnimationFrame batching on the UI side
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 10));
  }

  return parsed;
}

/**
 * Send a state machine chat request to the onboarding endpoint.
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
```

- [ ] **Step 2: Commit**

```bash
cd ~/platform
git add shells/paperclip-platform-ui/src/lib/onboarding-chat.ts
git commit -m "feat: state machine stream parser — JSON responses with ready/message/artifact"
```

---

## Task 4: Onboarding Page State Machine

**Files:**
- Modify: `shells/paperclip-platform-ui/src/app/(dashboard)/instances/new/page.tsx`

This is the big rewrite. Replace the freeform chat with the state machine.

- [ ] **Step 1: Replace the entire page component**

The new page manages `OnboardingContext` with state, phase, history, and collected artifacts. Entry prompts fire automatically on state entry. The LAUNCH state shows a single button that updates live as artifacts change.

```tsx
// shells/paperclip-platform-ui/src/app/(dashboard)/instances/new/page.tsx
"use client";

import { Button } from "@core/components/ui/button";
import { Input } from "@core/components/ui/input";
import { createInstance } from "@core/lib/api";
import { cn } from "@core/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  type ChatMessage,
  type LLMResponse,
  type OnboardingArtifacts,
  type OnboardingState,
  type PromptPhase,
  parseStateMachineStream,
  sendStateMachineChat,
} from "@/lib/onboarding-chat";

interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  artifactCard?: { taskTitle: string; taskDescription: string };
}

interface OnboardingContext {
  state: OnboardingState;
  phase: PromptPhase;
  history: ChatMessage[];
  artifacts: OnboardingArtifacts;
}

export default function NewPaperclipInstancePage() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ctx, setCtx] = useState<OnboardingContext>({
    state: "VISION",
    phase: "entry",
    history: [],
    artifacts: {},
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on message change
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Fire entry prompt automatically when entering a new state
  useEffect(() => {
    if (ctx.phase === "entry" && ctx.state !== "LAUNCH" && !streaming) {
      firePrompt(ctx, null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.state, ctx.phase]);

  async function firePrompt(currentCtx: OnboardingContext, userMessage: string | null) {
    setStreaming(true);
    setError(null);

    // Add user message to history and display if this is a continue prompt
    let history = [...currentCtx.history];
    if (userMessage) {
      history = [...history, { role: "user" as const, content: userMessage }];
      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: "user", content: userMessage },
      ]);
    }

    // Add empty assistant message for streaming
    const replyId = `reply-${Date.now()}`;
    setMessages((prev) => [...prev, { id: replyId, role: "assistant", content: "" }]);

    try {
      const { response } = sendStateMachineChat(
        history,
        currentCtx.state,
        currentCtx.phase,
        currentCtx.artifacts,
      );
      const body = await response;

      const result: LLMResponse = await parseStateMachineStream(body, {
        onDelta: (char) => {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.id === replyId) {
              updated[updated.length - 1] = { ...last, content: last.content + char };
            }
            return updated;
          });
        },
      });

      // Add assistant message to history
      const updatedHistory = [...history, { role: "assistant" as const, content: result.message }];

      // Handle state transition
      if (currentCtx.phase === "entry") {
        // Entry prompts always return ready: false — switch to continue
        setCtx({ ...currentCtx, phase: "continue", history: updatedHistory });
      } else if (!result.ready) {
        // Continue prompt, not ready — stay in state
        setCtx({ ...currentCtx, history: updatedHistory });
      } else {
        // Ready — collect artifact and advance
        const newArtifacts = { ...currentCtx.artifacts, ...result.artifact };

        // Show artifact card for VISION state
        if (currentCtx.state === "VISION" && result.artifact?.taskTitle) {
          setMessages((prev) => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last?.id === replyId) {
              updated[updated.length - 1] = {
                ...last,
                artifactCard: {
                  taskTitle: result.artifact!.taskTitle as string,
                  taskDescription: result.artifact!.taskDescription as string,
                },
              };
            }
            return updated;
          });
        }

        // Advance state
        const nextState: Record<OnboardingState, OnboardingState> = {
          VISION: "COMPANY_NAME",
          COMPANY_NAME: "CEO_NAME",
          CEO_NAME: "LAUNCH",
          LAUNCH: "LAUNCH",
        };

        setCtx({
          state: nextState[currentCtx.state],
          phase: currentCtx.state === "LAUNCH" ? "continue" : "entry",
          history: updatedHistory,
          artifacts: newArtifacts,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      // Remove empty assistant message on error
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.id === replyId && !last.content) updated.pop();
        return updated;
      });
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    firePrompt(ctx, text);
  }

  async function handleLaunch() {
    if (launching || !ctx.artifacts.companyName) return;
    setLaunching(true);
    try {
      await createInstance({
        name: ctx.artifacts.companyName,
        provider: "opencode",
        channels: [],
        plugins: [],
        extra: {
          onboarding: {
            goal: ctx.artifacts.taskTitle ?? "",
            taskTitle: ctx.artifacts.taskTitle ?? "",
            taskDescription: ctx.artifacts.taskDescription ?? "",
          },
          ceoName: ctx.artifacts.ceoName ?? "CEO",
        },
      });
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create instance");
      setLaunching(false);
    }
  }

  const showInput = ctx.phase === "continue" && !streaming;
  const showLaunchButton = ctx.state === "LAUNCH" && ctx.artifacts.companyName;

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Message area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="flex gap-4"
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    msg.role === "assistant"
                      ? "bg-gradient-to-br from-indigo-500 to-purple-600 text-white"
                      : "bg-zinc-800 text-zinc-400",
                  )}
                >
                  {msg.role === "assistant" ? "C" : "Y"}
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {msg.role === "assistant" ? (ctx.artifacts.ceoName || "CEO Agent") : "You"}
                  </p>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-200">
                    {msg.content}
                    {streaming && msg.id === messages[messages.length - 1]?.id && msg.role === "assistant" && (
                      <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-indigo-400" />
                    )}
                  </div>
                  {msg.artifactCard && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="rounded-lg border border-indigo-500/20 bg-zinc-900/80 p-5"
                    >
                      <p className="mb-2 text-[10px] uppercase tracking-widest text-indigo-400">Founding Brief</p>
                      <p className="mb-1 text-sm font-semibold text-zinc-100">{msg.artifactCard.taskTitle}</p>
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">
                        {msg.artifactCard.taskDescription}
                      </p>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {error && (
            <div className="ml-12 rounded-md border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
              <Button variant="ghost" size="sm" className="ml-2 text-red-400 hover:text-red-300" onClick={() => setError(null)}>
                Dismiss
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="shrink-0 border-t border-zinc-800 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto max-w-3xl px-6 py-4 space-y-3">
          {/* Launch button */}
          <AnimatePresence>
            {showLaunchButton && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <Button
                  onClick={handleLaunch}
                  disabled={launching}
                  className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white py-6 text-base"
                >
                  {launching ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Founding {ctx.artifacts.companyName}...
                    </>
                  ) : (
                    <>
                      Found {ctx.artifacts.companyName} with CEO {ctx.artifacts.ceoName || "CEO"}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </>
                  )}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Chat input — visible during continue phase */}
          <AnimatePresence>
            {(showInput || ctx.state === "LAUNCH") && (
              <motion.form
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex gap-2"
              >
                <Input
                  ref={inputRef}
                  placeholder={
                    ctx.state === "LAUNCH"
                      ? "Want to change anything?"
                      : ctx.state === "VISION"
                        ? "Describe what you want to build..."
                        : ctx.state === "COMPANY_NAME"
                          ? "Name your company..."
                          : "Name your CEO..."
                  }
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={streaming}
                />
                <Button type="submit" disabled={!input.trim() || streaming} variant="outline" size="icon">
                  <Send className="h-4 w-4" />
                </Button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd ~/platform
git add shells/paperclip-platform-ui/src/app/\(dashboard\)/instances/new/page.tsx
git commit -m "feat: onboarding state machine UI — VISION→COMPANY_NAME→CEO_NAME→LAUNCH"
```

---

## Task 5: Build and Deploy

- [ ] **Step 1: Build core-server**

```bash
cd ~/platform
docker build --no-cache -t registry.wopr.bot/core-server:latest -f platforms/core-server/Dockerfile .
```

- [ ] **Step 2: Build paperclip-ui**

```bash
cd ~/platform
docker build --no-cache -t registry.wopr.bot/paperclip-ui:latest -f shells/paperclip-platform-ui/Dockerfile .
```

- [ ] **Step 3: Push both**

```bash
docker push registry.wopr.bot/core-server:latest
docker push registry.wopr.bot/paperclip-ui:latest
```

- [ ] **Step 4: Deploy**

```bash
ssh root@138.68.30.247 "cd /opt/core-server && docker compose pull core paperclip-ui && docker compose up -d --force-recreate core paperclip-ui"
```

- [ ] **Step 5: E2E test with agent-browser**

```bash
agent-browser --cdp 9222 open https://runpaperclip.com/dashboard
# Should see CEO intro typing in
# Type a vision → CEO asks follow-up or produces brief
# Brief appears → CEO asks for company name
# Pick name → CEO asks for CEO name
# Pick name → Launch button appears
# Click launch → provisions → unified dashboard
```

- [ ] **Step 6: Commit any fixes**

```bash
cd ~/platform
git add -A
git commit -m "fix: address issues found during e2e testing"
```
