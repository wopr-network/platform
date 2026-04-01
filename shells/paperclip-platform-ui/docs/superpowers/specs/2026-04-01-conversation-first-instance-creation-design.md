# Conversation-First Instance Creation

**Date:** 2026-04-01
**Status:** Draft
**Scope:** Paperclip `/instances/new` page + `generateOnboarding` replacement

## Problem

The current instance creation page is a form: name input, goal input, "Plan it" button, editable textarea for the CEO brief, "Create Instance" button. It feels dead — no personality, no excitement, a lifeless wait while the LLM thinks. The user is founding an AI company but the experience feels like configuring a server.

## Solution

Replace the form with a conversation. The user talks to the CEO agent directly. The CEO asks about the vision, proposes a plan, refines based on feedback. When the plan is ready, the user names the company and launches. The structured artifact (`taskTitle` + `taskDescription`) is identical — only the path to it changes.

## Flow

1. User lands on `/instances/new`. The CEO's intro message is already rendered: *"I'm your CEO. Tell me what you want to build and I'll put together a plan to make it happen."*
2. User types their goal in a chat input.
3. CEO streams back a response — acknowledges the vision, proposes a plan with first hires and week-1 deliverable, asks clarifying questions.
4. User can refine, push back, ask questions. Multi-turn conversation.
5. When the CEO has enough context, it emits a `plan_ready` structured response containing the founding brief (rendered as a highlighted card in the chat).
6. An inline company name input appears below the conversation.
7. User names the company, clicks **"Found Company"**.
8. `createInstance()` fires with `{ name, provider: "opencode", extra: { onboarding: { goal, taskTitle, taskDescription } } }` — same payload as today.
9. Redirect to `https://{name}.runpaperclip.com` — their new company's dashboard. No intermediate success screen. The user lands directly on their Paperclip, where the CEO is already starting work.

## Structured Output Protocol

The CEO's LLM responses use a structured output with a `type` discriminator:

```typescript
type OnboardingResponse =
  | { type: "conversation"; content: string }
  | { type: "plan_ready"; content: string; taskTitle: string; taskDescription: string };
```

- **`conversation`**: The CEO is talking and expects user input. `content` is the message to display (markdown).
- **`plan_ready`**: The CEO has produced the founding brief. `content` is the conversational message (e.g., "Here's the final plan..."). `taskTitle` and `taskDescription` are the extracted artifact, rendered as a highlighted card within the message. The user can still respond to refine — a new `plan_ready` replaces the previous one.

The frontend tracks the latest `plan_ready` payload. When the user clicks "Found Company", that payload becomes the `extra.onboarding` data in the `createInstance` call.

## Backend Changes

### Delete `generateOnboarding`

Remove the `generateOnboarding` mutation from `fleet-core.ts` entirely. It is replaced by the new endpoint.

### New endpoint: `fleet.onboardingChat`

An SSE endpoint that accepts the conversation history and streams back the CEO's response. The frontend calls it via `fetch` and reads the `ReadableStream`. This matches how the gateway already streams `/v1/chat/completions` — no new transport needed.

**Input (POST body):**
```typescript
{
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}
```

**Streaming output:** SSE stream. Each `data:` line contains a JSON chunk with `{ type: "delta", content: "..." }` for text tokens. The final chunk contains `{ type: "done", plan?: { taskTitle, taskDescription } }` — if the CEO produced a plan, `plan` is present. The frontend accumulates deltas into the displayed message and extracts the plan from the final chunk.

**System prompt:** Similar to the current `generateOnboarding` system prompt but updated to be conversational:
- The CEO should introduce itself, ask questions, and refine based on user input
- When it has enough context, it should emit a `plan_ready` response with the artifact
- It can emit multiple `plan_ready` responses as the conversation evolves — the frontend always uses the latest one
- The CEO should naturally ask "what do you want to call the company?" or similar when the plan is solid

**Billing:** Same pattern as today — platform service key via `serviceKeyRepo.generate("__platform__", "onboarding-chat", "paperclip")`, routed through the gateway.

## Frontend Changes

### Replace `NewPaperclipInstancePage`

The current form component (`shells/paperclip-platform-ui/src/app/(dashboard)/instances/new/page.tsx`) is replaced with a chat interface.

**State:**
```typescript
const [messages, setMessages] = useState<Message[]>([
  { role: "assistant", content: CEO_INTRO_MESSAGE }
]);
const [input, setInput] = useState("");
const [streaming, setStreaming] = useState(false);
const [plan, setPlan] = useState<{ taskTitle: string; taskDescription: string } | null>(null);
const [companyName, setCompanyName] = useState("");
```

**Components:**
- **Message list** — renders the conversation. Assistant messages stream in token-by-token. `plan_ready` responses render a highlighted "Founding Brief" card inline.
- **Chat input** — text input + send button at the bottom. Disabled while streaming.
- **Company name + launch bar** — appears after the first `plan_ready`. Inline input + "Found Company" button. Stays at the bottom below the chat input.

**Message rendering:**
- User messages: simple text bubble, right-aligned or left-aligned with user avatar
- CEO messages: left-aligned with CEO avatar (purple gradient), markdown rendered
- `plan_ready` artifact: rendered as a visually distinct card within the CEO's message — indigo left border, "Founding Brief" label, the `taskTitle` as heading and `taskDescription` as body

**On send:**
1. Append user message to `messages`
2. Call `onboardingChat` with full message history
3. Stream response into a new assistant message
4. If response contains `plan_ready`, extract and store `{ taskTitle, taskDescription }` in `plan` state
5. Show the company name input if not already visible

**On "Found Company":**
1. Validate company name (same `NAME_PATTERN` as today)
2. Call `createInstance({ name, provider: "opencode", extra: { onboarding: { goal: messages[1].content, taskTitle: plan.taskTitle, taskDescription: plan.taskDescription } } })`
3. Redirect to `https://{name}.runpaperclip.com` — their new company's dashboard

### No changes to `createInstance`

The `createInstance` API call, its payload shape, and the backend `instanceService.create` handler are unchanged. The `extra.onboarding` object is identical.

### No changes to the dashboard

The instance detail page (`paperclip-instance-detail.tsx`) and dashboard (`paperclip-dashboard.tsx`) are unchanged. They already handle provisioning state.

## Design Details

- **Dark mode, matches existing Paperclip aesthetic.** No new design system components needed — chat bubbles are simple divs with existing Tailwind classes.
- **CEO avatar:** Purple gradient circle with "C" — matches the brand.
- **Streaming:** Token-by-token rendering with a blinking cursor indicator while streaming.
- **The "Found Company" button** (not "Create Instance") — founding language matches the metaphor.
- **Company name input** shows `{name}.runpaperclip.com` preview, same as current page.
- **Mobile:** Single column chat, input pinned to bottom. Name bar stacks vertically.

## What's NOT Changing

- `createInstance()` payload and backend handler
- Instance provisioning flow
- Dashboard / instance detail page
- The sidecar's `provision.ts` onboarding task creation
- Any other product's instance creation (WOPR, NemoPod, HolyShip keep their current forms)

## Edge Cases

- **User just types one line and wants to go:** The CEO's first response should always include a `plan_ready` with a reasonable default plan. The user can name the company and launch immediately after the first CEO response — no mandatory back-and-forth.
- **LLM fails mid-stream:** Show an error message in the chat ("I had trouble thinking about that — try again?") with a retry button. Fall back to the same default brief that exists today.
- **User refreshes the page:** Conversation is lost, starts fresh. No persistence needed — this is a creation flow, not an ongoing chat.
- **Very long conversations:** Cap at ~10 turns. After that, the CEO should strongly push toward finalizing.
