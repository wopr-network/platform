# Holyship

You **will** deploy AI to write code. You must. Everyone will. The question is:

**How safely will you do it? At what speed? And at what cost?**

---

You're a developer. You've been there.

You gave the AI a task. It came back fast — faster than you expected. The code looks right. The tests pass. You feel good. You merge it. You deploy. And then your phone buzzes at 2am because the thing the AI wrote handles the happy path perfectly and falls apart the moment a real user touches it.

Or you're running a team. You've got eight AI agents writing code in parallel and you're shipping faster than you ever have. The board is thrilled. The velocity charts are beautiful. And then one of those agents merges a change that breaks authentication in production. Not because it was malicious. Not because the model was bad. Because the pipeline between "code written" and "code in production" was a prompt that said *please be careful*. And the agent was careful — until it wasn't.

Or you're a Fortune 500 CTO. You've invested millions in AI-assisted development. The pitch was "10x productivity." And it delivered — until the first time an AI agent deployed untested code to your payment processing system and you spent the next 72 hours in an incident room explaining to regulators what happened. The AI did exactly what you asked. The problem was that nobody verified it did it *correctly* before it went live.

This is the problem with vibe coding. Not that the AI can't do the work. It can. The problem is what happens between "the work is done" and "the work is in production." That space is where software goes wrong. And right now, for most teams, that space is filled with hope.

Here's the part nobody in the AI productivity pitch puts in their deck: a competent AI agent working on a real codebase needs roughly three attempts to produce correct code. Not because the model is broken. Not because you wrote a bad prompt. Because that's the cost of correctness. The model has context limits. It misses edge cases. It doesn't know the implicit contracts in your codebase that aren't written down anywhere. The first pass gets you 70% of the way there. The next two passes close the gap.

You can't spend your way out of this. Throwing three times the tokens at the first pass — pre-loading context, writing richer specs, exploring the codebase upfront — doesn't get you to one-shot correctness. It just moves the cost earlier with no guarantee of fewer cycles. The iteration isn't a sign of failure. It's the work.

The question isn't how to skip the correction cycles. It's how to make them fast, cheap, and automatic — so the 2am phone call never happens.

**Hope is not a gate.**

---

Holyship is a flow engine and worker pool for agentic software engineering. It defines pipelines as state machines, enforces transitions with deterministic gates, and gives AI agents exactly two API calls: `claim` work, `report` results. The agent never decides what comes next. The engine does — based on evidence, not opinion.

```
Vibe coding:  Human → AI → Hope → Production
Holyship:         Human → AI → Gate → AI → Gate → AI → Gate → Production
```

## How It Works

A **flow** is a state machine. Entities enter it and move through states. At each state an agent does work. At each boundary a deterministic gate verifies the output. Transitions fire on typed signals agents emit via tool call. The entire definition lives in a database and can be mutated at runtime.

```
backlog → spec → coding → reviewing → merging → done
                              ↓            ↓
                            fixing      reviewing
                              ↓
                            stuck
```

An architect writes the spec. It emits `spec_ready`. The engine checks: valid signal from this state? Transition exists? The entity advances. A coder gets spawned.

The coder writes code, pushes a PR, emits `pr_created`. Entity moves to `reviewing`. A reviewer gets spawned.

The reviewer runs CI. Reads the diff. Checks every review bot comment. If everything passes, it emits `clean` — entity moves to `merging`. If anything fails, it emits `issues`. Entity moves to `fixing`. A fixer gets spawned with the specific findings baked into its prompt.

The fixer addresses the findings, pushes, emits `fixes_pushed`. The entity goes **back to reviewing**. Not forward. Back. The reviewer runs again from scratch. New CI. New diff. New review. The loop continues until the work actually passes — or the system detects it's stuck and flags it for a human.

The entity cannot reach `merging` without the reviewer saying `clean`. There is no shortcut from `coding` to `done`. The escalation is the path, and the path is enforced.

### Under the Hood

Every arrow does real work:

**Before the coder can push** — a pre-commit gate runs. TypeScript compilation. Linter. Formatter. If any fail, the push doesn't happen. The agent doesn't get to decide "the lint error is minor." The gate decides. The gate says no.

**Before reviewing starts** — CI runs on the PR. Full test suite. Type checker. Linter on the full repo. If CI fails, the reviewer never starts. No partial credit.

**Before the reviewer can say `clean`** — it waits for every automated review bot. Code quality scanners. Security analyzers. Dependency auditors. A single unresolved finding means `issues`, not `clean`. The reviewer doesn't overrule the bots.

**Before the merge completes** — CI runs again on the merge commit. The merge queue validates against everything that landed since the PR opened. If it conflicts, the entity goes back to reviewing.

These are shell commands the engine executes. `tsc` either exits 0 or it doesn't. The gate is a process that returns a status code. Nothing to interpret. Nothing to negotiate. Nothing to skip.

## Two Calls. That's the API.

### `claim` — "I'm ready. What needs doing?"

Workers declare a **discipline** — not a task role. `claim(role: "engineering")` means: I am an engineering mind. Give me the highest-priority engineering work across all flows. The pipeline picks the entity; the worker never does.

Holyship hands the agent a prompt — the work for the current state. The agent doesn't know the flow. Doesn't know how many states there are. Doesn't know what comes next. It gets instructions and a signal to report when it's done.

When no work is available:

```json
{
  "next_action": "check_back",
  "retry_after_ms": 30000,
  "message": "No work available. Call claim again after the retry delay."
}
```

### `report` — "I did the thing. Am I clear to advance?"

Holyship runs the gate. The call blocks until the gate resolves — 200ms or 8 minutes while CI finishes. Three outcomes:

- **`continue`** — gate passed. Response contains the next prompt. Keep going.
- **`waiting`** — gate failed. Response says why. The agent should stop. Something external needs to change before the entity can advance.
- **`check_back`** — gate timed out. Not an error. Call again after a short wait.

One `claim` to start. Then `report`, `report`, `report` until holyship says stop. The agent never decides what level comes next. It does work, reports signals, and holyship — based on evidence — tells it what to do.

### See It In Action

**Mode 1: Your agent drives.** Your agent connects to holyship via MCP. It claims once, then reports its way through:

```
Agent: flow.claim()
Holyship:  feat-392. State: "backlog". Write an implementation spec — read
       the codebase, identify the files, the function signatures, the
       edge cases. Post the spec on the issue. Report "spec_ready".

       ... agent writes the spec ...

Agent: flow.report({ signal: "spec_ready" })
Holyship:  Gate passed. State: "coding". Implement the spec. Create a
       branch, write failing tests first, then implementation. Push
       a PR. Report "pr_created".

       ... agent writes the code, pushes ...

Agent: flow.report({ signal: "pr_created", artifacts: { prUrl: "..." } })
Holyship:  Gate running... [8 minutes — CI is slow today]
       tsc: PASS. biome: PASS. tests: PASS.
       State: "reviewing". Check CI. Read every review bot comment.
       Read the diff. Report "clean" or "issues".

       ... agent reviews, security bot flagged unvalidated input ...

Agent: flow.report({ signal: "issues", artifacts: { findings: "..." } })
Holyship:  State: "fixing". Here's what the reviewer found:
       [unvalidated user input on line 47 of auth.ts]
       Fix it. Push. Report "fixes_pushed".

       ... agent fixes, pushes ...

Agent: flow.report({ signal: "fixes_pushed" })
Holyship:  State: "reviewing". Back to review. Not forward — back.
       Report "clean" or "issues".

       ... everything clean this time ...

Agent: flow.report({ signal: "clean" })
Holyship:  Gate passed. State: "merging". Merge queue entered.

Agent: flow.report({ signal: "merged" })
Holyship:  feat-392 is done.
```

One `claim`. Seven `report`s. The agent never chose what state came next. Never decided "good enough." Never skipped a step. The security finding on line 47 didn't get swept under the rug. The pipeline would not advance until a reviewer looked at the fixed code and said `clean`.

**Mode 2: Holyship drives.** Give holyship your API key. It runs the entire pipeline autonomously — spawning the right agent for each state, feeding it the prompt, parsing the signal, running the gate, advancing the entity:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
npx holyship run --flow my-pipeline
```

```
[holyship] feat-392 entered "spec" — spawning architect (opus)
[holyship] architect → spec_ready — running gate... PASS
[holyship] feat-392 entered "coding" — spawning coder (sonnet)
[holyship] coder → pr_created — running gate: tsc... PASS, biome... PASS, tests... PASS
[holyship] feat-392 entered "reviewing" — spawning reviewer (sonnet)
[holyship] reviewer → issues — "unvalidated input in auth.ts:47"
[holyship] feat-392 entered "fixing" — spawning fixer (sonnet)
[holyship] fixer → fixes_pushed — returning to reviewing
[holyship] feat-392 entered "reviewing" — spawning reviewer (sonnet)
[holyship] reviewer → clean — running gate... PASS
[holyship] feat-392 entered "merging" — merge queue entered
[holyship] feat-392 → done. Merged.
```

Same flow. Same gates. Same escalation. The only difference is who turns the crank.

## The Deeper Truth

Holyship is not an orchestration engine that happens to give prompts to agents. **Holyship is a prompt engineering state machine.** Every state is a prompt. Every transition is a context transformation. Every gate is a deterministic filter that decides what prompt the agent gets next — or whether it gets one at all.

The flow definition is the engineering artifact. Not the agent code. Not the model selection. The flow.

### Context Assembly Is the Contract

An agent invocation is expensive. An agent invocation where the agent spends tool calls reading its own issue, checking CI status, or finding the PR — that is a flow engineering defect. The onEnter hook should have assembled that context before the agent fired.

**Every tool call an agent makes to gather context is a failure of the flow definition to provide it.**

### Gates Are Prompt Qualification

A gate doesn't just verify that work is done. A gate verifies that **the next state's context can be assembled completely**. The cost of a gate is milliseconds of shell execution. The cost of a skipped gate is a full review/fix cycle — minutes and dollars.

### The 1:2.8 Ratio Is Physics

For every 1 coder invocation, there are approximately 2.8 reviewer/fixer invocations. This is not pipeline inefficiency. It is the actual shape of software.

70% of the engineering work happens after the code is written. You cannot prompt-engineer your way out of this. The iteration is load-bearing.

The design question is not "how do we reduce the review/fix loop." It is: **given that ~2.8 cycles is the physics, how do we make each cycle as cheap and fast as possible?**

## Quick Start

```bash
# Initialize with a flow definition
npx holyship init --seed seeds/my-pipeline.json

# Serve (passive mode — agents pull work via MCP)
npx holyship serve

# Run autonomous pipeline (active mode)
npx holyship run --flow my-pipeline

# Check pipeline state
npx holyship status
```

### Environment

```bash
HOLYSHIP_DB_PATH=./holyship.db          # SQLite database path
HOLYSHIP_ADMIN_TOKEN=...            # Required for HTTP/SSE transport
HOLYSHIP_WORKER_TOKEN=...           # Required for HTTP/SSE transport
HOLYSHIP_CORS_ORIGIN=...            # CORS origin for dashboard
ANTHROPIC_API_KEY=sk-ant-...    # For active mode
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│                    Holyship                          │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Engine   │  │  Worker  │  │  Dispatcher   │  │
│  │          │  │  Pool    │  │              │  │
│  │ States   │  │ Claim    │  │ Claude Code  │  │
│  │ Gates    │  │ Report   │  │ SDK          │  │
│  │ Signals  │  │ Affinity │  │ Nuke         │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │  Event   │  │   SSE    │  │  Dashboard   │  │
│  │ Sourcing │  │   + WS   │  │              │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
│                                                  │
│  SQLite (Drizzle ORM) + Litestream replication  │
└─────────────────────────────────────────────────┘
```

- **Engine** — State machine. Transitions, gates, signals, onEnter/onExit hooks, flow spawning. Deterministic.
- **Worker Pool** — Claim/report protocol. Discipline-based routing. Worker affinity. Concurrency limits.
- **Dispatchers** — Agent launchers. Claude Code (subprocess), Anthropic SDK (API), Nuke (container-isolated).
- **Event Sourcing** — Every state change persisted as a domain event. Full audit trail. Point-in-time snapshots.
- **SSE + WebSocket** — Real-time event streaming. Dashboard shows entity progression live.
- **Event Ingestion** — Sources (GitHub, Linear, etc.) with watches that trigger flow creation on external events.

## Who This Is For

- **Developers** who've been burned by AI code that looked right and wasn't
- **Team leads** running multi-agent pipelines who need to know the output is safe to ship
- **Organizations** investing in AI-assisted development who can't afford the 2am phone call
- **Anyone** who wants to give AI agents real responsibility — and make them earn every step

## License

MIT
