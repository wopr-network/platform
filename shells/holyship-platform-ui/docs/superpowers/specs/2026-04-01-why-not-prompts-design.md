# Why Not Prompts — Marketing Page Design

**URL:** `/why-not-prompts`
**Route:** `(marketing)/why-not-prompts/page.tsx`
**Audience:** Developers who read the Claude Code leak (technical, HN/Twitter) + Engineering leads/CTOs evaluating agent orchestration.
**CTA:** "See the engine" → `/how-it-works`

## Design Language

Matches existing marketing pages:
- Dark mode, `near-black` background
- `signal-orange` accent for headlines and one-liners
- `off-white/70` for body copy
- `FadeIn` component for scroll-triggered animations
- Framer Motion for transitions
- Code snippets in monospace with syntax highlighting (dim/grey treatment)
- Left-right split layout for code-vs-critique sections

## Sections

### Section 1: The Hook (full viewport hero)

**Headline** (signal-orange, text-5xl md:text-7xl):
> Why Not Prompts.

**Subhead** (off-white/70, text-xl md:text-2xl, static — not animated like hero taglines):
> The most popular AI coding tool in the world just leaked its source code. 500,000 lines of TypeScript. Here's what we found inside — and why it proves that orchestrating agents with prompts is architecturally bankrupt.

No CTA button. Scroll indicator (chevron-down, subtle pulse animation).

---

### Section 2: "The Coordinator" (left-right split)

**Left panel:** Code snippet from leaked `coordinatorMode.ts:111-116`

```typescript
return `You are Claude Code, an AI assistant that orchestrates
software engineering tasks across multiple workers.

## 1. Your Role
You are a **coordinator**. Your job is to:
- Help the user achieve their goal
- Direct workers to research, implement and verify code changes
- Synthesize results and communicate with the user`
```

**Right panel copy:**

> **Their orchestrator is a system prompt.**
>
> The most sophisticated agent coordination system at Anthropic is a string template injected into a chat window. The "state machine" is whatever the LLM remembers. The "recovery strategy" is "resume the conversation." If the context window fills up or the session crashes, the entire pipeline state is gone.

**One-liner** (signal-orange, text-2xl, centered full-width below the split):
> An engine doesn't forget.

---

### Section 3: "The Mailbox" (left-right split)

**Left panel:** Code from leaked `permissionSync.ts`

```typescript
// ~/.claude/teams/{team_name}/permissions/pending/{requestId}.json
// ~/.claude/teams/{team_name}/permissions/resolved/{requestId}.json

const LOCK_OPTIONS = {
  retries: {
    retries: 10,
    minTimeout: 5,
    maxTimeout: 100,
  },
}
```

**Right panel copy:**

> **Their IPC is JSON files with lockfiles.**
>
> Workers communicate by writing JSON to a shared directory. Concurrent access is handled by filesystem locks with retry loops. The leader polls for new files. The worker polls for responses. If a lock fails, the message is lost. If the process dies mid-write, the file is corrupted.
>
> This is how programs communicated in 1985.

**One-liner** (signal-orange):
> An engine has event-sourced state with CAS guarantees.

---

### Section 4: "The Scratchpad" (left-right split)

**Left panel:** Code from leaked `filesystem.ts` and `prompts.ts`

```typescript
export function isScratchpadEnabled(): boolean {
  return checkStatsigFeatureGate_CACHED_MAY_BE_STALE('tengu_scratch')
}
```

```
IMPORTANT: Always use this scratchpad directory for temporary
files instead of `/tmp` or other system temp directories:
`/private/tmp/claude-501/`

The scratchpad directory is session-specific, isolated from the
user's project, and can be used freely without permission prompts.
```

**Right panel copy:**

> **Their shared workspace is /tmp.**
>
> Workers share state through a temporary directory that's gone when the session ends. The "security model" is a GrowthBook feature flag called `tengu_scratch`. The path is hardcoded into the system prompt. If two sessions run simultaneously, they collide.

**One-liner** (signal-orange):
> An engine has versioned, event-sourced artifacts that survive anything.

---

### Section 5: "The Recovery" (two-column comparison, no code)

**Left column header** (dim grey): What happens when it crashes

Vertical timeline/sequence items (grey text, numbered):
1. Session dies mid-task
2. Context window is gone
3. Pipeline state is gone
4. "Resume conversation" — maybe
5. Coordinator tries to remember what was happening
6. Workers are dead. No way to know what they finished.
7. Start over.

**Right column header** (signal-orange): What happens when it crashes

Vertical timeline/sequence items (off-white, numbered):
1. Worker process dies
2. Entity is still in `coding` state in Postgres
3. Another worker claims it
4. Picks up from the last reported artifact
5. Continues.

**One-liner** (signal-orange):
> Their state lives in a conversation. Ours lives in a database.

---

### Section 6: "The Feature Flags" (left-right split)

**Left panel:** Actual feature flag list extracted from leak

```typescript
feature('KAIROS')
feature('KAIROS_BRIEF')
feature('KAIROS_CHANNELS')
feature('KAIROS_DREAM')
feature('KAIROS_GITHUB_WEBHOOKS')
feature('KAIROS_PUSH_NOTIFICATION')
feature('VOICE_MODE')
feature('COORDINATOR_MODE')
feature('BUDDY')
feature('DAEMON')
feature('WEB_BROWSER_TOOL')
feature('ANTI_DISTILLATION_CC')
// ... 88 build-time feature flags
// ... 17+ runtime flags with bird codenames
// tengu_amber_quartz_disabled
// tengu_turtle_carbon
// tengu_onyx_plover
// tengu_passport_quail
```

**Right panel copy:**

> **88 feature flags. 17 obfuscated runtime gates. Bird codenames.**
>
> The daemon mode you want? Gated behind a server-side flag Anthropic controls. The voice mode? Requires OAuth and a kill switch called `tengu_amber_quartz_disabled`. The coordinator mode? An environment variable that only works if the build-time flag was compiled in.
>
> You don't control the tool. The tool controls what you're allowed to use.

**One-liner** (signal-orange):
> An engine doesn't need permission from its vendor to run.

---

### Section 7: "The Architecture" (full-width, two diagrams stacked)

**Top diagram** (grey/dim, labelled "Prompt-Based Orchestration"):

Visual representation of:
```
User Input
  → Chat Window (state lives here)
    → System Prompt (orchestration logic)
      → Agent Tool (spawn worker)
        → JSON files in /tmp (IPC)
        → Lockfiles (concurrency)
        → tmux panes (observability)
        → GrowthBook (permission to use features)
      → Context Window (state tracking)
        → Hope (recovery strategy)
```

**Bottom diagram** (signal-orange, labelled "Engine-Based Orchestration"):

Visual representation of:
```
Flow Definition (declarative)
  → State Machine (Postgres-backed)
    → Claim/Report (any worker, any machine)
      → Event-Sourced Entities (crash-proof)
      → Gates (conditional transitions)
      → Artifacts (versioned state)
    → Learning Loop (evolves its own flows)
      → Next issue is cheaper than the last
```

**Final copy block** (centered, generous whitespace):

> **One of these is 500,000 lines of TypeScript built by a $60 billion company.**
>
> **The other is an engine.**
>
> They're reaching for the same thing. Autonomous agent coordination. Workers that claim tasks, do work, report back. State that survives crashes. Flows that learn.
>
> They're building it inside a chat client with JSON files and system prompts and feature flags named after birds.
>
> We built the engine.

---

### Section 8: CTA (centered, breathing room)

**Button** (signal-orange bg, near-black text, same style as hero CTA):
> See the engine.

Links to `/how-it-works`.

**Below button** (off-white/50, smaller text links):
> Or read the marketing pages: [How it works](/how-it-works) / [The real cost](/the-real-cost) / [The learning loop](/the-learning-loop)

---

## Implementation Notes

- **File:** `src/app/(marketing)/why-not-prompts/page.tsx`
- **Components:** Reuse `FadeIn` from `@/components/landing`. Create a `CodeVsCritique` component for the repeating left-right split pattern (sections 2-4, 6). Create a `ComparisonTimeline` component for section 5. Create `ArchitectureDiagram` component for section 7.
- **Code highlighting:** Use a simple pre/code block with monospace font and muted syntax colors (grey-400 for keywords, grey-500 for strings). No full syntax highlighter needed — the snippets are short.
- **Responsive:** On mobile, left-right splits stack vertically (code on top, critique below). Diagrams simplify to bullet lists.
- **Animation:** Each section fades in on scroll using `FadeIn`. Code snippets get a subtle typewriter or line-by-line reveal. One-liners get a slight scale-up on enter.
- **Nav:** Add "Why Not Prompts" to the marketing nav alongside existing pages.
