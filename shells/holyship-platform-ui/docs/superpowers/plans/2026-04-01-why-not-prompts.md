# Why Not Prompts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `/why-not-prompts` marketing page that uses real Claude Code leaked source snippets to demonstrate why prompt-based agent orchestration is architecturally inferior to engine-based orchestration.

**Architecture:** Single Next.js page at `(marketing)/why-not-prompts/page.tsx` using existing `FadeIn` component plus three new components: `CodeVsCritique` (reusable left-right split for code-vs-commentary sections), `ComparisonTimeline` (two-column numbered timeline), and `ArchitectureDiagram` (tree-style diagram with color variants). All follow the existing marketing page patterns — `"use client"`, framer-motion, Tailwind utility classes, `signal-orange` / `off-white` / `near-black` color tokens.

**Tech Stack:** Next.js 15, React, Tailwind CSS, Framer Motion, existing `@/components/landing` barrel

---

### Task 1: Add nav link

**Files:**
- Modify: `src/components/landing/nav.tsx:7-12`

- [ ] **Step 1: Add "Why Not Prompts" to the nav links array**

In `src/components/landing/nav.tsx`, add the new link to the `links` array:

```typescript
const links = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/the-real-cost", label: "The Real Cost" },
  { href: "/the-learning-loop", label: "The Learning Loop" },
  { href: "/vibe-coding-vs-engineering", label: "Vibe vs. Engineering" },
  { href: "/why-not-prompts", label: "Why Not Prompts" },
];
```

- [ ] **Step 2: Verify nav renders**

Run: `cd ~/platform && pnpm dev --filter @wopr-network/holyship-platform-ui`

Open `http://localhost:3000` — confirm "Why Not Prompts" appears in the nav bar. It will 404 when clicked (page doesn't exist yet). That's fine.

- [ ] **Step 3: Commit**

```bash
cd ~/platform
git add shells/holyship-platform-ui/src/components/landing/nav.tsx
git commit -m "feat(holyship-ui): add Why Not Prompts to marketing nav"
```

---

### Task 2: Create CodeVsCritique component

**Files:**
- Create: `src/components/landing/code-vs-critique.tsx`
- Modify: `src/components/landing/index.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/landing/code-vs-critique.tsx`:

```tsx
"use client";

import { FadeIn } from "./fade-in";

type Props = {
  code: string;
  /** Optional second code block (e.g. scratchpad has two snippets) */
  code2?: string;
  title: string;
  paragraphs: string[];
  punchline: string;
};

export function CodeVsCritique({ code, code2, title, paragraphs, punchline }: Props) {
  return (
    <FadeIn>
      <section className="px-6 md:px-16 lg:px-24 py-16 md:py-24">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">
          {/* Code panel */}
          <div className="space-y-4">
            <pre className="bg-off-white/[0.03] border border-off-white/10 rounded-lg p-5 overflow-x-auto text-sm leading-relaxed font-mono text-off-white/40">
              <code>{code}</code>
            </pre>
            {code2 && (
              <pre className="bg-off-white/[0.03] border border-off-white/10 rounded-lg p-5 overflow-x-auto text-sm leading-relaxed font-mono text-off-white/40">
                <code>{code2}</code>
              </pre>
            )}
          </div>

          {/* Critique panel */}
          <div>
            <h2 className="text-2xl md:text-3xl font-bold text-off-white mb-6">{title}</h2>
            <div className="space-y-4 text-lg md:text-xl leading-relaxed text-off-white/70">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        </div>

        {/* Punchline */}
        <p className="text-2xl md:text-3xl font-bold text-signal-orange text-center mt-16">
          {punchline}
        </p>
      </section>
    </FadeIn>
  );
}
```

- [ ] **Step 2: Export from barrel**

In `src/components/landing/index.tsx`, add the export:

```typescript
export { CodeVsCritique } from "./code-vs-critique";
```

Add it alphabetically — it goes before the `CostCurve` export.

- [ ] **Step 3: Commit**

```bash
cd ~/platform
git add shells/holyship-platform-ui/src/components/landing/code-vs-critique.tsx shells/holyship-platform-ui/src/components/landing/index.tsx
git commit -m "feat(holyship-ui): add CodeVsCritique component for marketing pages"
```

---

### Task 3: Create ComparisonTimeline component

**Files:**
- Create: `src/components/landing/comparison-timeline.tsx`
- Modify: `src/components/landing/index.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/landing/comparison-timeline.tsx`:

```tsx
"use client";

import { FadeIn } from "./fade-in";

type Props = {
  leftTitle: string;
  leftSteps: string[];
  rightTitle: string;
  rightSteps: string[];
  punchline: string;
};

export function ComparisonTimeline({ leftTitle, leftSteps, rightTitle, rightSteps, punchline }: Props) {
  return (
    <FadeIn>
      <section className="px-6 md:px-16 lg:px-24 py-16 md:py-24">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16">
          {/* Left column — dim/grey */}
          <div>
            <h3 className="text-xl font-bold text-off-white/30 mb-8">{leftTitle}</h3>
            <ol className="space-y-4">
              {leftSteps.map((step, i) => (
                <li key={i} className="flex gap-4 items-start">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-off-white/5 text-off-white/20 text-sm font-mono flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-lg text-off-white/30">{step}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Right column — signal-orange */}
          <div>
            <h3 className="text-xl font-bold text-signal-orange mb-8">{rightTitle}</h3>
            <ol className="space-y-4">
              {rightSteps.map((step, i) => (
                <li key={i} className="flex gap-4 items-start">
                  <span className="shrink-0 w-7 h-7 rounded-full bg-signal-orange/10 text-signal-orange text-sm font-mono flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="text-lg text-off-white/90">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Punchline */}
        <p className="text-2xl md:text-3xl font-bold text-signal-orange text-center mt-16">
          {punchline}
        </p>
      </section>
    </FadeIn>
  );
}
```

- [ ] **Step 2: Export from barrel**

In `src/components/landing/index.tsx`, add:

```typescript
export { ComparisonTimeline } from "./comparison-timeline";
```

Add it alphabetically — between `CodeVsCritique` and `CostCurve`.

- [ ] **Step 3: Commit**

```bash
cd ~/platform
git add shells/holyship-platform-ui/src/components/landing/comparison-timeline.tsx shells/holyship-platform-ui/src/components/landing/index.tsx
git commit -m "feat(holyship-ui): add ComparisonTimeline component for marketing pages"
```

---

### Task 4: Create ArchitectureDiagram component

**Files:**
- Create: `src/components/landing/architecture-diagram.tsx`
- Modify: `src/components/landing/index.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/landing/architecture-diagram.tsx`:

```tsx
"use client";

type TreeNode = {
  label: string;
  annotation?: string;
  children?: TreeNode[];
};

type Props = {
  title: string;
  variant: "dim" | "orange";
  tree: TreeNode[];
};

function TreeItem({ node, variant, depth = 0 }: { node: TreeNode; variant: "dim" | "orange"; depth?: number }) {
  const textColor = variant === "dim" ? "text-off-white/30" : "text-off-white/90";
  const annotationColor = variant === "dim" ? "text-off-white/15" : "text-signal-orange/60";
  const lineColor = variant === "dim" ? "border-off-white/10" : "border-signal-orange/30";

  return (
    <div className={depth > 0 ? `ml-6 pl-4 border-l ${lineColor}` : ""}>
      <div className="py-1.5">
        <span className={`text-base md:text-lg font-mono ${textColor}`}>{node.label}</span>
        {node.annotation && (
          <span className={`text-sm ml-2 ${annotationColor}`}>({node.annotation})</span>
        )}
      </div>
      {node.children?.map((child, i) => (
        <TreeItem key={i} node={child} variant={variant} depth={depth + 1} />
      ))}
    </div>
  );
}

export function ArchitectureDiagram({ title, variant, tree }: Props) {
  const titleColor = variant === "dim" ? "text-off-white/30" : "text-signal-orange";

  return (
    <div className="py-8">
      <h3 className={`text-lg font-bold ${titleColor} mb-6 font-mono uppercase tracking-wider`}>{title}</h3>
      <div className="space-y-1">
        {tree.map((node, i) => (
          <TreeItem key={i} node={node} variant={variant} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Export from barrel**

In `src/components/landing/index.tsx`, add:

```typescript
export { ArchitectureDiagram } from "./architecture-diagram";
```

Add it alphabetically — first in the list, before `CodeVsCritique`.

- [ ] **Step 3: Commit**

```bash
cd ~/platform
git add shells/holyship-platform-ui/src/components/landing/architecture-diagram.tsx shells/holyship-platform-ui/src/components/landing/index.tsx
git commit -m "feat(holyship-ui): add ArchitectureDiagram component for marketing pages"
```

---

### Task 5: Create the page — sections 1-4 (hook + first three takedowns)

**Files:**
- Create: `src/app/(marketing)/why-not-prompts/page.tsx`

- [ ] **Step 1: Create the page file with sections 1-4**

Create `src/app/(marketing)/why-not-prompts/page.tsx`:

```tsx
"use client";

import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { ArchitectureDiagram, CodeVsCritique, ComparisonTimeline, FadeIn } from "@/components/landing";

const COORDINATOR_CODE = `return \`You are Claude Code, an AI assistant that orchestrates
software engineering tasks across multiple workers.

## 1. Your Role
You are a **coordinator**. Your job is to:
- Help the user achieve their goal
- Direct workers to research, implement and verify code changes
- Synthesize results and communicate with the user\``;

const MAILBOX_CODE = `// ~/.claude/teams/{team_name}/permissions/pending/{requestId}.json
// ~/.claude/teams/{team_name}/permissions/resolved/{requestId}.json

const LOCK_OPTIONS = {
  retries: {
    retries: 10,
    minTimeout: 5,
    maxTimeout: 100,
  },
}`;

const SCRATCHPAD_CODE = `export function isScratchpadEnabled(): boolean {
  return checkStatsigFeatureGate_CACHED_MAY_BE_STALE('tengu_scratch')
}`;

const SCRATCHPAD_PROMPT_CODE = `IMPORTANT: Always use this scratchpad directory for temporary
files instead of \`/tmp\` or other system temp directories:
\`/private/tmp/claude-501/\`

The scratchpad directory is session-specific, isolated from the
user's project, and can be used freely without permission prompts.`;

const FEATURE_FLAGS_CODE = `feature('KAIROS')
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
// tengu_passport_quail`;

export default function WhyNotPromptsPage() {
  return (
    <>
      {/* Section 1: The Hook */}
      <section className="min-h-[90vh] flex flex-col justify-center items-center text-center px-6 md:px-16 lg:px-24">
        <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold leading-tight text-signal-orange">
          Why Not Prompts.
        </h1>
        <p className="text-lg md:text-xl lg:text-2xl text-off-white/50 mt-8 max-w-3xl leading-relaxed">
          The most popular AI coding tool in the world just leaked its source code. 500,000 lines of TypeScript.
          Here&apos;s what we found inside — and why it proves that orchestrating agents with prompts is architecturally
          bankrupt.
        </p>
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="mt-16 text-off-white/20"
        >
          <ChevronDown size={32} />
        </motion.div>
      </section>

      {/* Section 2: The Coordinator */}
      <CodeVsCritique
        code={COORDINATOR_CODE}
        title="Their orchestrator is a system prompt."
        paragraphs={[
          "The most sophisticated agent coordination system at Anthropic is a string template injected into a chat window. The \"state machine\" is whatever the LLM remembers. The \"recovery strategy\" is \"resume the conversation.\"",
          "If the context window fills up or the session crashes, the entire pipeline state is gone.",
        ]}
        punchline="An engine doesn't forget."
      />

      {/* Section 3: The Mailbox */}
      <CodeVsCritique
        code={MAILBOX_CODE}
        title="Their IPC is JSON files with lockfiles."
        paragraphs={[
          "Workers communicate by writing JSON to a shared directory. Concurrent access is handled by filesystem locks with retry loops. The leader polls for new files. The worker polls for responses.",
          "If a lock fails, the message is lost. If the process dies mid-write, the file is corrupted.",
          "This is how programs communicated in 1985.",
        ]}
        punchline="An engine has event-sourced state with CAS guarantees."
      />

      {/* Section 4: The Scratchpad */}
      <CodeVsCritique
        code={SCRATCHPAD_CODE}
        code2={SCRATCHPAD_PROMPT_CODE}
        title="Their shared workspace is /tmp."
        paragraphs={[
          "Workers share state through a temporary directory that's gone when the session ends. The \"security model\" is a GrowthBook feature flag called tengu_scratch.",
          "The path is hardcoded into the system prompt. If two sessions run simultaneously, they collide.",
        ]}
        punchline="An engine has versioned, event-sourced artifacts that survive anything."
      />

      {/* Section 5: The Recovery */}
      <ComparisonTimeline
        leftTitle="What happens when it crashes"
        leftSteps={[
          "Session dies mid-task",
          "Context window is gone",
          "Pipeline state is gone",
          "\"Resume conversation\" — maybe",
          "Coordinator tries to remember what was happening",
          "Workers are dead. No way to know what they finished.",
          "Start over.",
        ]}
        rightTitle="What happens when it crashes"
        rightSteps={[
          "Worker process dies",
          "Entity is still in coding state in Postgres",
          "Another worker claims it",
          "Picks up from the last reported artifact",
          "Continues.",
        ]}
        punchline="Their state lives in a conversation. Ours lives in a database."
      />

      {/* Section 6: The Feature Flags */}
      <CodeVsCritique
        code={FEATURE_FLAGS_CODE}
        title="88 feature flags. 17 obfuscated runtime gates. Bird codenames."
        paragraphs={[
          "The daemon mode you want? Gated behind a server-side flag Anthropic controls. The voice mode? Requires OAuth and a kill switch called tengu_amber_quartz_disabled.",
          "The coordinator mode? An environment variable that only works if the build-time flag was compiled in.",
          "You don't control the tool. The tool controls what you're allowed to use.",
        ]}
        punchline="An engine doesn't need permission from its vendor to run."
      />

      {/* Section 7: The Architecture */}
      <FadeIn>
        <section className="px-6 md:px-16 lg:px-24 py-16 md:py-24">
          <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16">
            <ArchitectureDiagram
              title="Prompt-Based Orchestration"
              variant="dim"
              tree={[
                {
                  label: "User Input",
                  children: [
                    {
                      label: "Chat Window",
                      annotation: "state lives here",
                      children: [
                        {
                          label: "System Prompt",
                          annotation: "orchestration logic",
                          children: [
                            { label: "Agent Tool", annotation: "spawn worker" },
                            { label: "JSON files in /tmp", annotation: "IPC" },
                            { label: "Lockfiles", annotation: "concurrency" },
                            { label: "tmux panes", annotation: "observability" },
                            { label: "GrowthBook", annotation: "permission to use features" },
                          ],
                        },
                        { label: "Context Window", annotation: "state tracking" },
                        { label: "Hope", annotation: "recovery strategy" },
                      ],
                    },
                  ],
                },
              ]}
            />
            <ArchitectureDiagram
              title="Engine-Based Orchestration"
              variant="orange"
              tree={[
                {
                  label: "Flow Definition",
                  annotation: "declarative",
                  children: [
                    {
                      label: "State Machine",
                      annotation: "Postgres-backed",
                      children: [
                        { label: "Claim / Report", annotation: "any worker, any machine" },
                        { label: "Event-Sourced Entities", annotation: "crash-proof" },
                        { label: "Gates", annotation: "conditional transitions" },
                        { label: "Artifacts", annotation: "versioned state" },
                      ],
                    },
                    {
                      label: "Learning Loop",
                      annotation: "evolves its own flows",
                      children: [
                        { label: "Next issue is cheaper than the last" },
                      ],
                    },
                  ],
                },
              ]}
            />
          </div>

          {/* Final copy */}
          <div className="max-w-3xl mx-auto text-center mt-20 space-y-6">
            <p className="text-xl md:text-2xl text-off-white/70 leading-relaxed">
              One of these is 500,000 lines of TypeScript built by a $60 billion company.
            </p>
            <p className="text-2xl md:text-3xl font-bold text-off-white">The other is an engine.</p>
            <div className="space-y-4 text-lg md:text-xl text-off-white/60 leading-relaxed mt-8">
              <p>
                They&apos;re reaching for the same thing. Autonomous agent coordination. Workers that claim tasks, do
                work, report back. State that survives crashes. Flows that learn.
              </p>
              <p>
                They&apos;re building it inside a chat client with JSON files and system prompts and feature flags named
                after birds.
              </p>
            </div>
            <p className="text-3xl md:text-4xl font-bold text-signal-orange mt-8">We built the engine.</p>
          </div>
        </section>
      </FadeIn>

      {/* Section 8: CTA */}
      <section className="py-24 md:py-32 flex flex-col items-center text-center px-6">
        <a
          href="/how-it-works"
          className="inline-block px-10 py-5 bg-signal-orange text-near-black font-semibold text-xl rounded hover:opacity-90 transition-opacity"
        >
          See the engine.
        </a>
        <div className="mt-8 flex flex-wrap justify-center gap-6 text-off-white/40 text-sm">
          <a href="/how-it-works" className="hover:text-signal-orange transition-colors">
            How it works
          </a>
          <a href="/the-real-cost" className="hover:text-signal-orange transition-colors">
            The real cost
          </a>
          <a href="/the-learning-loop" className="hover:text-signal-orange transition-colors">
            The learning loop
          </a>
        </div>
      </section>
    </>
  );
}
```

- [ ] **Step 2: Verify the page renders**

Run: `cd ~/platform && pnpm dev --filter @wopr-network/holyship-platform-ui`

Open `http://localhost:3000/why-not-prompts`. Verify:
- Hero section with "Why Not Prompts." in signal-orange
- Scroll down through all 8 sections
- Code snippets render in monospace with dim styling
- Punchlines are signal-orange
- ComparisonTimeline shows grey left / orange right
- Architecture diagrams render as trees
- CTA button at bottom links to `/how-it-works`
- Mobile responsive — code/critique stacks vertically

- [ ] **Step 3: Commit**

```bash
cd ~/platform
git add shells/holyship-platform-ui/src/app/\(marketing\)/why-not-prompts/page.tsx
git commit -m "feat(holyship-ui): add Why Not Prompts marketing page

Claude Code source leak analysis turned into a marketing page
comparing prompt-based vs engine-based agent orchestration."
```

---

### Task 6: Final check — biome + tsc

**Files:** None new — verification only.

- [ ] **Step 1: Run biome check**

```bash
cd ~/platform/shells/holyship-platform-ui && pnpm check
```

Expected: Clean — no lint or type errors.

- [ ] **Step 2: Fix any issues**

If biome reports import ordering or formatting issues, fix them. Common fixes:
- Import ordering: external packages first, then `@/` aliases
- Unused imports: remove them
- Type-only imports: use `import type` where needed

- [ ] **Step 3: Commit fixes if any**

```bash
cd ~/platform
git add shells/holyship-platform-ui/
git commit -m "fix(holyship-ui): lint and format fixes for why-not-prompts"
```
