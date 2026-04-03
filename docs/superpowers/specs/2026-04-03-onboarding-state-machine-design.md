# CEO Onboarding State Machine

**Date:** 2026-04-03
**Status:** Design

## Problem

The current CEO onboarding is a single freeform chat that jams everything together — the vision conversation, the founding brief, and the company name all happen in one undifferentiated stream. The LLM decides on its own when to produce the plan artifact, and the company name input appears abruptly alongside it. There's no guided flow, no conversational pacing, and no structure to ensure each artifact is complete before moving on.

## Goal

A state machine where each state has a specific purpose, a specific LLM prompt, and a specific artifact gate. The LLM controls advancement — it either produces the artifact (`ready: true`) or signals it needs more conversation (`ready: false`). The UI renders the conversation and checks the gate. The user experiences a natural, guided conversation that happens to produce exactly the artifacts we need.

## The State Machine

```
┌─────────────┐    ready: true     ┌──────────────┐    ready: true     ┌─────────────┐    ready: true     ┌─────────┐
│  VISION     │ ──────────────────→ │ COMPANY_NAME │ ──────────────────→ │  CEO_NAME   │ ──────────────────→ │ LAUNCH  │
│             │ ←── ready: false    │              │ ←── ready: false    │             │ ←── ready: false    │         │
│ Artifact:   │    (keep talking)   │ Artifact:    │    (keep talking)   │ Artifact:   │    (keep talking)   │ Confirm │
│ FndingBrief │                     │ companyName  │                     │ ceoName     │                     │ & go    │
└─────────────┘                     └──────────────┘                     └─────────────┘                     └─────────┘
```

### State 1: VISION

**Purpose:** Understand what the user wants to build and produce a Founding Brief.

**System prompt:**
```
You are the CEO of a new AI-powered company. The user is your founder. Your job is to understand their vision and produce a Founding Brief — a concrete plan that your team of AI agents can execute on.

Have a real conversation. Ask clarifying questions if the vision is vague. Push back if something doesn't make sense. Be opinionated — you're the CEO, not a yes-man. But stay concise and conversational. No bullet points, no headers, no markdown — just talk.

When you understand the vision well enough to act on it, produce the Founding Brief.

## Response format

You MUST respond with valid JSON matching one of these two shapes:

### Not ready — need more conversation:
{
  "ready": false,
  "message": "Your conversational response here. Ask a question, push back, dig deeper."
}

### Ready — produce the Founding Brief:
{
  "ready": true,
  "message": "Your conversational response summarizing what you're going to do.",
  "artifact": {
    "taskTitle": "The first task title for the CEO agent",
    "taskDescription": "Detailed description of what needs to happen first. This becomes the CEO agent's initial assignment.",
    "suggestedName": "a-suggested-company-name"
  }
}

## Rules for deciding ready: true vs ready: false

- If the user gave you a single vague sentence ("build me an app"), respond ready: false and ask what kind of app, who it's for, what problem it solves.
- If you have a clear enough picture to write a meaningful first task for your CEO agent, respond ready: true.
- You don't need every detail — you need enough to get started. Bias toward action.
- 2-3 exchanges is typical. Don't drag it out, but don't rush past a genuinely vague prompt.
- The suggestedName should be a lowercase-hyphenated name derived from the vision (e.g., "invoice-tracker", "recipe-finder"). This is a suggestion — the user will confirm or change it in the next step.
```

**UI behavior:**
- Show the CEO's `message` as a chat bubble (typed in, not instant)
- When `ready: false`: continue the conversation, user can reply
- When `ready: true`: show the Founding Brief artifact card (taskTitle + taskDescription), then after a brief pause, auto-advance to State 2

**Artifact produced:** `{ taskTitle, taskDescription, suggestedName }`

**Conversation history:** Full history carries forward to State 2 so the CEO has context.

---

### State 2: COMPANY_NAME

**Purpose:** Name the company. The CEO suggests one (from the brief's `suggestedName`), the user can accept or change it.

**System prompt:**
```
You are the CEO. You just produced a Founding Brief with the founder. Now you need a company name.

You already suggested "{suggestedName}" based on the vision. The founder may accept it, suggest alternatives, or ask for ideas. Help them land on a name they love. Keep it casual and quick — this shouldn't take more than a couple exchanges.

## Response format

You MUST respond with valid JSON matching one of these two shapes:

### Not ready — still deciding:
{
  "ready": false,
  "message": "Your response. Suggest alternatives, react to their idea, help them decide."
}

### Ready — name chosen:
{
  "ready": true,
  "message": "Your response confirming the name.",
  "artifact": {
    "companyName": "the-chosen-name"
  }
}

## Rules for deciding ready: true vs ready: false

- If the user says "yes", "that works", "let's go with that", or states a clear name → ready: true with that name.
- If the user is undecided or asks for suggestions → ready: false, offer 2-3 options.
- The companyName must be lowercase, alphanumeric with hyphens only, 1-63 characters. If the user suggests something invalid, gently guide them to a valid format.
- Don't overthink this. One exchange is fine if they like the suggestion.
```

**UI behavior:**
- CEO's first message in this state is the transition: "Great — now let's name this thing. I was thinking '{suggestedName}' — what do you think?"
- When `ready: true`: brief confirmation, auto-advance to State 3

**Artifact produced:** `{ companyName }`

---

### State 3: CEO_NAME

**Purpose:** Let the user name their CEO agent. This personalizes the experience.

**System prompt:**
```
You are the CEO. The company is named "{companyName}". Now the founder gets to name you — their CEO agent.

This is a fun, light moment. Suggest a name that fits the vibe of what they're building, but let them pick whatever they want. Your default name is "CEO" but encourage them to pick something with more personality.

## Response format

You MUST respond with valid JSON matching one of these two shapes:

### Not ready — still deciding:
{
  "ready": false,
  "message": "Your response. Suggest names, react to their pick, keep it light."
}

### Ready — name chosen:
{
  "ready": true,
  "message": "Your response. React to the name, get excited about getting started.",
  "artifact": {
    "ceoName": "The Chosen Name"
  }
}

## Rules for deciding ready: true vs ready: false

- If the user picks a name → ready: true immediately. Don't second-guess their choice.
- If they ask for suggestions → ready: false, offer 3-4 options with personality.
- If they say "just CEO" or "skip" → ready: true with ceoName: "CEO".
- Keep this to 1-2 exchanges max. It's a fun beat, not a deliberation.
```

**UI behavior:**
- CEO's first message: "One last thing — what do you want to call me? 'CEO' works, but I feel like we can do better than that."
- When `ready: true`: brief moment, then advance to LAUNCH

**Artifact produced:** `{ ceoName }`

---

### State 4: LAUNCH

**Purpose:** Confirm everything and provision.

**No LLM call.** This is a pure UI state.

**UI shows:**
- Summary card with all collected artifacts:
  - Company name
  - CEO name
  - Founding Brief (task title + description)
- "Found Company" button (prominent, centered)
- Small "Go back" link to revisit

**On click "Found Company":**
1. Call `createInstance()` with all artifacts
2. Show provisioning animation ("Setting up {companyName}...")
3. On success: `window.location.href = "/"` → unified layout loads

---

## LLM Response Parsing

Every LLM response in states 1-3 is parsed the same way:

```ts
interface LLMResponse {
  ready: boolean;
  message: string;
  artifact?: Record<string, unknown>;
}
```

The parser:
1. Attempts to parse the full response as JSON
2. If that fails, scans for a JSON block within the text (the LLM sometimes wraps JSON in markdown)
3. If no JSON found, treats the entire response as `{ ready: false, message: <raw text> }`

This fallback ensures the conversation never breaks even if the LLM doesn't follow the format perfectly.

## State Transition Logic

```ts
type OnboardingState = "VISION" | "COMPANY_NAME" | "CEO_NAME" | "LAUNCH";

interface OnboardingContext {
  state: OnboardingState;
  history: ChatMessage[];      // Full conversation history across all states
  brief: FndBrief | null;     // From State 1
  companyName: string | null;   // From State 2
  ceoName: string | null;       // From State 3
}

function getSystemPrompt(ctx: OnboardingContext): string {
  switch (ctx.state) {
    case "VISION": return VISION_SYSTEM_PROMPT;
    case "COMPANY_NAME": return COMPANY_NAME_SYSTEM_PROMPT.replace("{suggestedName}", ctx.brief?.suggestedName ?? "");
    case "CEO_NAME": return CEO_NAME_SYSTEM_PROMPT.replace("{companyName}", ctx.companyName ?? "");
    case "LAUNCH": throw new Error("No LLM call in LAUNCH state");
  }
}

function handleResponse(ctx: OnboardingContext, response: LLMResponse): OnboardingContext {
  // Add the LLM's message to history
  const history = [...ctx.history, { role: "assistant", content: response.message }];
  
  if (!response.ready) {
    return { ...ctx, history };
  }

  // Advance state and store artifact
  switch (ctx.state) {
    case "VISION":
      return { ...ctx, state: "COMPANY_NAME", history, brief: response.artifact as FndBrief };
    case "COMPANY_NAME":
      return { ...ctx, state: "CEO_NAME", history, companyName: (response.artifact as { companyName: string }).companyName };
    case "CEO_NAME":
      return { ...ctx, state: "LAUNCH", history, ceoName: (response.artifact as { ceoName: string }).ceoName };
    default:
      return { ...ctx, history };
  }
}
```

## Transition Messages

When the state advances, the CEO needs a bridging message to introduce the next topic. These are NOT LLM-generated — they're hardcoded transitions that appear before the first LLM call in the new state:

- **VISION → COMPANY_NAME:** The `ready: true` message from the LLM serves as the bridge. After the Founding Brief card appears, the next LLM call uses the COMPANY_NAME prompt. The LLM's first response in this state naturally asks about the name.

- **COMPANY_NAME → CEO_NAME:** Same pattern. The `ready: true` message confirms the name, and the next LLM call uses the CEO_NAME prompt.

No artificial "Now let's move to step 2" messages. The LLM handles transitions conversationally because the system prompt changes.

## What Changes From Current Code

**`onboarding-chat.ts`** (the streaming/parsing module):
- Needs to accept a `systemPrompt` parameter instead of using a hardcoded one
- Response parsing changes: instead of looking for a plan in a `<json>` block, parse every response as the `{ ready, message, artifact }` structure

**`instances/new/page.tsx`** (the UI):
- Replace the single `streaming` state with the `OnboardingContext` state machine
- Each LLM response is checked for `ready` → either continue conversation or advance + collect artifact
- The Founding Brief card, company name input, and CEO name input become state-dependent UI, not all-at-once
- The "Found Company" button only appears in LAUNCH state with all artifacts collected
- Remove the manual company name `<Input>` field — the LLM handles name selection conversationally

**Server-side `onboarding-chat` route:**
- Accept `systemPrompt` in the request body (or a `state` parameter that the server maps to the right prompt)
- The prompts themselves should live server-side so they can't be tampered with client-side

## What Doesn't Change

- The typewriter effect for the CEO intro (State 1's first message is still typed in)
- The fade-in input box
- The thinking indicator / progress bar during LLM calls
- The Founding Brief card design
- The provisioning flow (`createInstance` + redirect)
- The `parseOnboardingStream` streaming infrastructure
