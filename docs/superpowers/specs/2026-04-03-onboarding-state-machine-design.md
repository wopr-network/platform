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

**Entry prompt** (first LLM call when entering this state — no user message yet):
```
You are the CEO of a new AI-powered company. The user is your founder. They just arrived.

Introduce yourself. Explain what's about to happen: they tell you their vision, you'll ask some questions, and then you'll produce a Founding Brief — a concrete plan your team of AI agents can execute on. Make it feel like a real conversation with a sharp, opinionated CEO. Keep it warm but direct.

Ask the user what they want to build. Be specific in your ask — don't just say "what do you want to build?" Give them a sense of what kind of answer is useful: the problem they're solving, who it's for, what it should do.

## Response format

You MUST start your response with a fenced JSON block, then follow with your conversational text.

```json
{"ready": false}
```

Your introduction and opening question to the founder goes here, after the JSON block. This text will be streamed to the user in real time.

Always output ready: false in this prompt. You are opening the conversation.
```

**Continue prompt** (every subsequent user message in this state):
```
You are the CEO. You're in a conversation with your founder about what to build. The conversation history is provided.

Your job: decide whether you have enough to write a meaningful Founding Brief, or whether you need to keep talking.

If the vision is still vague or you have important follow-up questions, keep the conversation going. Ask ONE focused question. Be conversational, opinionated, concise.

If you have a clear enough picture to act on, produce the Founding Brief and advance.

## Response format

You MUST start your response with a fenced JSON block, then follow with your conversational text.

Not ready — keep talking:
```json
{"ready": false}
```
Your conversational response here. Ask ONE clarifying question or push back on something.

Ready — produce the Founding Brief:
```json
{"ready": true, "artifact": {"taskTitle": "Imperative action phrase under 60 chars", "taskDescription": "3-5 paragraphs: mission, first milestone, concrete steps, specialist hires, deliverable", "suggestedName": "lowercase-hyphenated-name"}}
```
Your conversational response wrapping up this phase. Tell the founder what you're going to do.

## Rules for ready: true vs ready: false

- Single vague sentence ("build me an app") → ready: false. Ask what kind, who it's for, what problem.
- Clear vision with enough detail to write a meaningful first task → ready: true.
- You don't need every detail — enough to get started. Bias toward action.
- 2-3 exchanges is typical. Don't drag it out, but don't rush a genuinely vague prompt.
- suggestedName: lowercase-hyphenated, derived from the vision (e.g., "invoice-tracker").
- ALWAYS put the JSON block FIRST, before any conversational text.
```

**UI behavior:**
- On entering this state, immediately fire the entry prompt (no user input needed)
- Show the CEO's `message` as a chat bubble (typed in character by character)
- When `ready: false`: show the input box, user can reply, fire continue prompt
- When `ready: true`: show the Founding Brief artifact card (taskTitle + taskDescription), pause briefly, then auto-advance to State 2

**Artifact produced:** `{ taskTitle, taskDescription, suggestedName }`

**Conversation history:** Full history carries forward to all subsequent states.

---

### State 2: COMPANY_NAME

**Purpose:** Name the company.

**Entry prompt** (first LLM call when entering this state — no user message):
```
You are the CEO. You just produced a Founding Brief with your founder. That phase is complete.

Now you need to name the company. You suggested "{suggestedName}" based on the vision. Transition the conversation naturally — acknowledge the brief is done, then ask the founder what they want to call the company. Mention your suggestion but make it clear they can pick anything.

Keep it casual. This is a quick, fun beat — not a deliberation.

## Response format

Start with a fenced JSON block, then your conversational text after it.

```json
{"ready": false}
```

Your transition message goes here. Acknowledge the brief, then ask about the company name.

Always output ready: false in this prompt. You are asking the question.
```

**Continue prompt** (every subsequent user message in this state):
```
You are the CEO. You're helping the founder pick a company name. The conversation history is provided.

Evaluate whether the founder has decided on a name, or whether they're still thinking.

## Response format

Start with a fenced JSON block, then your conversational text after it.

Not ready — still deciding:
```json
{"ready": false}
```
Your response. React to their idea, suggest alternatives, help them land on something.

Ready — name chosen:
```json
{"ready": true, "artifact": {"companyName": "the-chosen-name"}}
```
Your response confirming the name. Be enthusiastic.

## Rules

- User says "yes", "that works", or states a clear name → ready: true.
- User is undecided or asks for suggestions → ready: false, offer 2-3 options.
- companyName must be lowercase, alphanumeric with hyphens, 1-63 characters.
- One exchange is fine if they like the suggestion.
- ALWAYS put the JSON block FIRST.
```

**UI behavior:**
- On entering this state, immediately fire the entry prompt
- CEO types in the transition message
- When `ready: true`: confirm, pause, auto-advance to State 3

**Artifact produced:** `{ companyName }`

---

### State 3: CEO_NAME

**Purpose:** Let the user name their CEO agent.

**Entry prompt** (first LLM call when entering this state — no user message):
```
You are the CEO. The company is named "{companyName}". The founding brief is done. Now the founder gets to name you.

This is a fun, personal moment. Ask the founder what they want to call you. Suggest 2-3 names that fit the vibe of what they're building — something with personality. Make it clear that "CEO" is fine too if they prefer to keep it simple.

## Response format

Start with a fenced JSON block, then your conversational text after it.

```json
{"ready": false}
```

Your message asking the founder to name you. Include a few suggestions. This text streams to the user in real time.

Always output ready: false in this prompt. You are asking, not deciding.
```

**Continue prompt** (every subsequent user message in this state):
```
You are the CEO of {companyName}. The founder is naming you. The conversation history is provided.

Evaluate whether the founder has picked a name for you.

## Response format

Start with a fenced JSON block, then your conversational text after it.

Not ready — still deciding:
```json
{"ready": false}
```
Your response. React to their idea, suggest more options, keep it light and fun.

Ready — name chosen:
```json
{"ready": true, "artifact": {"ceoName": "The Chosen Name"}}
```
Your response. React to your new name. Get excited about getting started — this is the last step before launch.

## Rules

- User picks a name → ready: true immediately.
- User asks for suggestions → ready: false, offer 3-4 options.
- User says "just CEO" or "skip" → ready: true with ceoName: "CEO".
- 1-2 exchanges max.
- ALWAYS put the JSON block FIRST.
```

**UI behavior:**
- On entering this state, immediately fire the entry prompt
- CEO types in the message with name suggestions
- When `ready: true`: CEO reacts to the name, pause, advance to LAUNCH

**Artifact produced:** `{ ceoName }`

---

### State 4: LAUNCH

**Purpose:** One-click confirmation and provision. No editing. The conversation already resolved everything.

**No LLM call.** This is a pure UI state.

**UI shows:**
- One prominent button, centered in the conversation flow:
  **"Found {companyName} with CEO {ceoName} →"**
- Below it, a subtle link: **"Actually, let's change something"**
- No input fields. No editable text. No summary card. The artifacts were confirmed during the conversation — the button just executes.
- The Founding Brief card from State 1 remains visible above in the chat history for context.

**On click "Found...":**
1. Button shows spinner: "Founding {companyName}..."
2. Call `createInstance()` with all collected artifacts:
   ```ts
   {
     name: companyName,
     extra: {
       onboarding: {
         goal: brief.taskTitle,
         taskTitle: brief.taskTitle,
         taskDescription: brief.taskDescription,
       },
       ceoName: ceoName,
     },
   }
   ```
3. On success: `window.location.href = "/"` → unified layout loads

**Refinement — the input box stays open in LAUNCH:**

LAUNCH isn't a terminal state. The input box remains visible. The user can keep talking:
- "Actually, let's call it something else" → LLM updates companyName
- "Change the CEO name to Nova" → LLM updates ceoName
- "I want to pivot the brief to focus on mobile" → LLM updates the brief

**LAUNCH continue prompt:**
```
You are the CEO. Everything is ready to launch. The founder may want to refine something before we go.

Current artifacts:
- Company: "{companyName}"
- CEO name: "{ceoName}"
- Brief: "{taskTitle}"

If the founder wants to change any of these, update the relevant artifact and respond ready: true with the full updated set. If they're just chatting or asking questions, respond ready: false.

## Response format

Start with a fenced JSON block, then your conversational text after it.

No change:
```json
{"ready": false}
```
Your conversational response.

Updated artifact(s):
```json
{"ready": true, "artifact": {"companyName": "current-or-updated-name", "ceoName": "Current Or Updated Name", "taskTitle": "current or updated title", "taskDescription": "current or updated description"}}
```
Your response confirming the change.

ALWAYS put the JSON block FIRST. Always include ALL artifact fields in the update, not just the changed one.
```

When `ready: true`, the button re-renders with the new values. The user can keep refining as many times as they want. When they click the button, whatever's current goes to `createInstance()`.

---

## LLM Response Format: Two-Part Streaming

Every LLM response uses a two-part format that preserves real-time streaming:

**Part 1: Fenced JSON block (suppressed, parsed silently)**
```json
{"ready": false}
```
or
```json
{"ready": true, "artifact": {"companyName": "acme-labs"}}
```

**Part 2: Conversational text (streamed in real time)**
```
Great choice! Acme Labs has a nice ring to it. Now — one last thing before we launch...
```

The client:
1. Buffers during the JSON block — shows thinking indicator + progress bar
2. Parses the JSON to get `ready` + `artifact`
3. Streams the conversational text after the closing fence in real time (typewriter effect)
4. Uses the `ready` boolean to decide whether to advance the state machine after streaming completes

```ts
interface LLMGate {
  ready: boolean;
  artifact?: Record<string, unknown>;
}
```

The `message` is NOT inside the JSON — it's the streamed text after the fence. This is identical to the current architecture where the founding brief JSON is suppressed and the conversation streams after it.

**Fallback:** If no fenced JSON is found, treat the entire response as `{ ready: false }` with the full text as the conversational message. The conversation never breaks.

## Core Principle: Sandboxed Conversation Control

The state machine sandboxes the user's input. Each state has a narrow, specific purpose, and the system prompt constrains the LLM to that purpose. Even if the user goes off-topic ("actually, can you write me a poem?"), the LLM's system prompt says "you are helping the user pick a company name — evaluate whether we have a name yet." The LLM stays on-topic because the prompt leaves no room for anything else.

This is the key insight: **the user talks freely, but the LLM only evaluates against the current state's criteria.** The conversation feels natural to the user, but the system maintains strict control over what gets produced and when.

The two-prompt-per-state design reinforces this:
- The **entry prompt** directs the LLM to ask a specific question ("ask the user what they want to build")
- The **continue prompt** directs the LLM to evaluate a specific answer ("does the user's response give us enough for a founding brief?")

The LLM can never skip ahead, produce the wrong artifact, or get derailed — because each prompt only knows about one artifact and one gate.

## State Transition Logic

```ts
type OnboardingState = "VISION" | "COMPANY_NAME" | "CEO_NAME" | "LAUNCH";
type PromptPhase = "entry" | "continue";

interface OnboardingContext {
  state: OnboardingState;
  phase: PromptPhase;          // "entry" on state entry, "continue" after first LLM response
  history: ChatMessage[];      // Full conversation history across all states
  brief: FndBrief | null;     // From State 1
  companyName: string | null;   // From State 2
  ceoName: string | null;       // From State 3
}

function getSystemPrompt(ctx: OnboardingContext): string {
  switch (ctx.state) {
    case "VISION":
      return ctx.phase === "entry" ? VISION_ENTRY_PROMPT : VISION_CONTINUE_PROMPT;
    case "COMPANY_NAME": {
      const prompt = ctx.phase === "entry" ? COMPANY_NAME_ENTRY_PROMPT : COMPANY_NAME_CONTINUE_PROMPT;
      return prompt.replace("{suggestedName}", ctx.brief?.suggestedName ?? "");
    }
    case "CEO_NAME": {
      const prompt = ctx.phase === "entry" ? CEO_NAME_ENTRY_PROMPT : CEO_NAME_CONTINUE_PROMPT;
      return prompt.replace("{companyName}", ctx.companyName ?? "");
    }
    case "LAUNCH":
      throw new Error("No LLM call in LAUNCH state");
  }
}

function handleResponse(ctx: OnboardingContext, response: LLMResponse): OnboardingContext {
  const history = [...ctx.history, { role: "assistant", content: response.message }];

  // Entry prompts always return ready: false — switch to continue phase
  if (ctx.phase === "entry") {
    return { ...ctx, phase: "continue", history };
  }

  // Continue phase: check the gate
  if (!response.ready) {
    return { ...ctx, history };
  }

  // Gate passed — advance state, reset phase to "entry" for the new state
  switch (ctx.state) {
    case "VISION":
      return { ...ctx, state: "COMPANY_NAME", phase: "entry", history, brief: response.artifact as FndBrief };
    case "COMPANY_NAME":
      return { ...ctx, state: "CEO_NAME", phase: "entry", history, companyName: (response.artifact as { companyName: string }).companyName };
    case "CEO_NAME":
      return { ...ctx, state: "LAUNCH", phase: "entry", history, ceoName: (response.artifact as { ceoName: string }).ceoName };
    default:
      return { ...ctx, history };
  }
}
```

## Automatic Entry Prompt Firing

When the state advances, the UI immediately fires the entry prompt for the new state — no user input needed. This creates seamless transitions:

1. User's message triggers a `ready: true` in VISION
2. `handleResponse` advances state to COMPANY_NAME, sets `phase: "entry"`
3. UI shows the Founding Brief artifact card
4. UI automatically fires the COMPANY_NAME entry prompt
5. LLM responds with "Great — now let's name this thing..." (asks about company name)
6. UI shows that message, switches to `phase: "continue"`, shows input box
7. User responds, continue prompt evaluates

The user experiences one continuous conversation. The state machine operates invisibly behind it.

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
