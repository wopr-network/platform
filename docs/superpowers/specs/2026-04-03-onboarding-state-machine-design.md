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

You MUST respond with valid JSON:
{
  "ready": false,
  "message": "Your introduction and opening question to the founder."
}

Always respond ready: false in the entry prompt. You're opening the conversation, not closing it.
```

**Continue prompt** (every subsequent user message in this state):
```
You are the CEO. You're in a conversation with your founder about what to build. The conversation history is provided.

Your job: decide whether you have enough to write a meaningful Founding Brief, or whether you need to keep talking.

If the vision is still vague or you have important follow-up questions, keep the conversation going. Ask ONE focused question — don't pile on multiple questions. Be conversational, opinionated, concise.

If you have a clear enough picture to act on, produce the Founding Brief and move on.

You MUST respond with valid JSON matching one of these two shapes:

### Not ready — keep talking:
{
  "ready": false,
  "message": "Your conversational response. Ask ONE clarifying question or push back on something."
}

### Ready — produce the Founding Brief:
{
  "ready": true,
  "message": "Your conversational response wrapping up this phase. Tell the founder what you're going to do with their vision.",
  "artifact": {
    "taskTitle": "The first task title for the CEO agent",
    "taskDescription": "Detailed description of what needs to happen first. This becomes the CEO agent's initial assignment.",
    "suggestedName": "a-suggested-company-name"
  }
}

## Rules for ready: true vs ready: false

- Single vague sentence ("build me an app") → ready: false. Ask what kind, who it's for, what problem.
- Clear vision with enough detail to write a first task → ready: true.
- You don't need every detail — you need enough to get started. Bias toward action.
- 2-3 exchanges is typical. Don't drag it out, but don't rush a genuinely vague prompt.
- suggestedName: lowercase-hyphenated, derived from the vision (e.g., "invoice-tracker").
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

You MUST respond with valid JSON:
{
  "ready": false,
  "message": "Your transition message. Acknowledge the brief, then ask about the company name."
}

Always respond ready: false in the entry prompt. You're asking the question, not answering it.
```

**Continue prompt** (every subsequent user message in this state):
```
You are the CEO. You're helping the founder pick a company name. The conversation history is provided.

Evaluate whether the founder has decided on a name, or whether they're still thinking.

You MUST respond with valid JSON matching one of these two shapes:

### Not ready — still deciding:
{
  "ready": false,
  "message": "Your response. React to their idea, suggest alternatives, help them land on something."
}

### Ready — name chosen:
{
  "ready": true,
  "message": "Your response confirming the name. Be enthusiastic.",
  "artifact": {
    "companyName": "the-chosen-name"
  }
}

## Rules for ready: true vs ready: false

- User says "yes", "that works", "let's go with that", or states a clear name → ready: true.
- User is undecided or asks for suggestions → ready: false, offer 2-3 options.
- companyName must be lowercase, alphanumeric with hyphens, 1-63 characters. If they suggest something invalid, gently guide them.
- One exchange is fine if they like the suggestion. Don't drag this out.
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

You MUST respond with valid JSON:
{
  "ready": false,
  "message": "Your message asking the founder to name you. Include a few suggestions."
}

Always respond ready: false in the entry prompt. You're asking, not deciding.
```

**Continue prompt** (every subsequent user message in this state):
```
You are the CEO of {companyName}. The founder is naming you. The conversation history is provided.

Evaluate whether the founder has picked a name for you.

You MUST respond with valid JSON matching one of these two shapes:

### Not ready — still deciding:
{
  "ready": false,
  "message": "Your response. React to their idea, suggest more options, keep it light and fun."
}

### Ready — name chosen:
{
  "ready": true,
  "message": "Your response. React to your new name. Get excited about getting started — this is the last step before launch.",
  "artifact": {
    "ceoName": "The Chosen Name"
  }
}

## Rules for ready: true vs ready: false

- User picks a name → ready: true immediately. Don't second-guess their choice.
- User asks for suggestions → ready: false, offer 3-4 more options.
- User says "just CEO" or "skip" or "whatever" → ready: true with ceoName: "CEO".
- 1-2 exchanges max. This is a quick beat.
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

**On click "Actually, let's change something":**
1. Input box reappears in the conversation
2. User types what they want to change ("let's call it something else", "change the CEO name")
3. Fire the VISION continue prompt — the LLM has the full history, sees the user wants to revisit
4. State machine resets to VISION with all history intact — the LLM naturally walks through only the parts that need changing
5. Artifacts overwrite as the user confirms new values
6. Eventually lands back at LAUNCH with updated artifacts

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
