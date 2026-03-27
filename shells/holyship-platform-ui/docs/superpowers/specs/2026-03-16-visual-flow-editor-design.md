# Visual Flow Editor Design

## Overview

The flow definition lives in the customer's repo as `.holyship/flow.yaml`. Git is the versioning system — history, rollback, blame all come for free. The visual flow editor lets humans see and modify the flow through conversation. All changes create PRs.

## Core Principles

1. **The flow is in the repo.** `.holyship/flow.yaml` is the sole source of truth. No DB cache. Read from GitHub when needed.
2. **You talk to it.** No drag-and-drop, no forms. Describe what you want in natural language. The AI proposes changes.
3. **Everything is a PR.** Human edits and agent learning both produce PRs. Same review process as code.
4. **The flow improves itself.** Learning is implicit — every agent gets a "what did you learn?" prompt after signaling done, before container teardown. Updates `.holyship/knowledge.md` and `.holyship/ship.log` as the last commit in the PR. No learning state in the flow.

## Flow File Format

`.holyship/flow.yaml` is the pipeline graph — states, gates, transitions. It says WHAT the pipeline does, not HOW. **No prompt templates live in this file.** Prompt templates are in Holy Ship's database, looked up by `agentRole`, and hydrated with repo knowledge at runtime.

Shape matches the existing `DesignedFlow` type:

```yaml
flow:
  name: engineering
  description: "Full CI pipeline for acme/api"
  initialState: spec

states:
  - name: spec
    agentRole: architect
    modelTier: opus
  - name: code
    agentRole: coder
    modelTier: sonnet
  - name: review
    agentRole: reviewer
    modelTier: sonnet

gates:
  - name: spec-posted
    type: ci
    primitiveOp: label_exists
  - name: ci-green
    type: ci
    primitiveOp: checks_pass

transitions:
  - fromState: spec
    toState: code
    trigger: spec_ready
  - fromState: code
    toState: review
    trigger: code_ready

gateWiring:
  spec-posted:
    fromState: spec
    trigger: spec_ready
  ci-green:
    fromState: code
    trigger: code_ready

notes: "Generated from repo analysis. Customized for TypeScript + vitest + GitHub Actions."
```

## Two Evolution Paths

### Agent learning (automatic)

Every agent gets a learning prompt after signaling done, before container teardown. Same session, full context still hot. The agent updates `.holyship/knowledge.md` (conventions, gotchas) and appends to `.holyship/ship.log` (what happened). These are the last commit(s) in the PR.

The flow graph itself can also evolve — if the agent determines the pipeline should change, it updates `.holyship/flow.yaml` in the same PR.

This is out of scope for this build (requires runner lifecycle changes) but the file format and UI are designed to support it.

### Human conversation (intentional)

The Analyze tab shows the flow. The human describes changes in natural language. A single LLM call with a sophisticated prompt proposes updates. "Apply" creates a PR.

## Backend

### Endpoints

Three new routes on the holyship API, scoped to a repo:

**`GET /repos/:owner/:repo/flow`**
- Reads `.holyship/flow.yaml` from the repo via GitHub API (no DB cache)
- Returns `{ yaml: string, flow: DesignedFlow, sha: string }` where sha is the file's blob SHA (for optimistic concurrency)
- 404 if file doesn't exist (flow not yet initialized)

**`POST /repos/:owner/:repo/flow/edit`**
- Body: `{ message: string, currentYaml: string }` — `currentYaml` may be empty string if no flow exists yet (AI generates from scratch using repo config)
- Single LLM call with `renderFlowEditPrompt(currentYaml, message, repoConfig)`
- Parses response with `parseFlowEditOutput()`
- Returns `{ updatedYaml: string, updatedFlow: DesignedFlow, explanation: string, diff: string[] }`
- Stateless — full YAML sent each request. No conversation history in the prompt. The UI accumulates changes by sending `pendingYaml` as `currentYaml` on subsequent messages. The LLM sees only the current state, not how it got there.
- Model: sonnet (fast enough for single-file edits, cheaper than opus)
- Timeout: 60s on the backend LLM call. Frontend shows spinner with "Thinking..." state.
- If LLM returns unparseable output: 422 with error message. Frontend shows "Couldn't understand the response — try rephrasing."

**`POST /repos/:owner/:repo/flow/apply`**
- Body: `{ yaml: string, commitMessage: string, baseSha: string }`
- `baseSha` is the blob SHA from the GET response — if the file has changed since, the GitHub API content update will fail (optimistic concurrency)
- Creates branch `holyship/flow-update-<unix-epoch>`
- Commits updated `.holyship/flow.yaml`
- Opens PR against default branch
- Returns `{ prUrl: string, prNumber: number, branch: string }`
- Auth: uses the GitHub App installation token for the repo (same as all other GitHub API calls in holyship)

### Flow Edit Prompt

Same render/parse pattern as existing prompt files in the holyship backend (`~/holyship/src/flows/audit-prompt.ts`, `flow-design-prompt.ts`). New file: `src/flows/flow-edit-prompt.ts`.

- `renderFlowEditPrompt(currentYaml, userMessage, repoConfig)` — builds the prompt
- `parseFlowEditOutput(raw)` — parses the LLM response

The prompt:
- Receives the current flow YAML, the user's change request, and the repo config for context
- Understands the flow schema (states, gates, transitions, gateWiring)
- Understands what each field means (agentRole, modelTier, primitiveOp, etc.)
- **Only modifies the graph** — states, gates, transitions, agentRole, modelTier. Never generates prompt templates (those are in the DB, invisible to the customer)
- Returns the complete updated YAML (not a patch — full file)
- Returns an explanation of what changed and why
- Returns a structured diff (list of changes in `+`/`~`/`-` format)

Output format:
```
UPDATED_YAML:
<complete yaml>
END_YAML
EXPLANATION: <what changed and why>
CHANGES:
+ added state: lint (linter, haiku) after spec
~ changed review modelTier: sonnet → opus
END_CHANGES
```

### No agent dispatch

This is a single LLM call, not an agent flow. No runner provisioning, no SSE parsing. The holyship API makes one call to the AI provider with the prompt and parses the response directly. New file: `src/flows/flow-edit-service.ts`. Routes: `src/routes/flow-editor.ts`, mounted at `/repos/:owner/:repo/flow`.

## Frontend

### Location

The flow editor lives in the **Analyze tab** of the repo detail page (`/dashboard/:owner/:repo/analyze`). It replaces the current read-only `flow-diagram.tsx` section with an interactive version.

### Components

**`flow-editor.tsx`** — Container component. Manages state: current YAML, pending YAML, messages, loading states. Coordinates the sub-components.

**`flow-view-tabs.tsx`** — Visual/Text tab switcher.

**`flow-diagram.tsx`** — Enhanced version of the existing component. Takes optional `pendingFlow: DesignedFlow` prop. When provided, diffs against `flow` to highlight added states (green border pulse), modified states (amber), removed states (red strikethrough). Without `pendingFlow`, renders identically to current.

**`flow-yaml-view.tsx`** — Syntax-highlighted YAML display. Always available (both with and without pending changes). When pending changes exist, shows inline diff with green/amber/red highlighting and left-border markers.

**`flow-chat.tsx`** — Conversation interface. Text input + send button. Message history (user messages and AI responses). AI responses show the explanation text and changes as a monospace diff block (`+`/`~`/`-` prefixed lines).

**`flow-action-bar.tsx`** — Appears when changes are pending. Shows change count, Discard button, "Apply → Create PR" button. After applying, shows link to the created PR.

### State Management

All local state in `flow-editor.tsx`:

```
currentYaml: string | null     — from GET /flow
currentFlow: DesignedFlow | null
currentSha: string | null      — blob SHA for optimistic concurrency
pendingYaml: string | null     — from POST /flow/edit
pendingFlow: DesignedFlow | null
messages: Array<{ role: 'user' | 'ai', text: string, changes?: string[] }>
sending: boolean               — LLM call in progress
applying: boolean              — PR creation in progress
appliedPr: { url: string, number: number } | null
```

### Interaction Flow

1. Page loads → `GET /flow` → renders diagram + YAML in Visual tab
2. User types message → `POST /flow/edit` with message + currentYaml
3. Response arrives → pendingYaml set → diagram highlights changes, YAML tab shows diff, action bar appears
4. User can continue chatting (each message sends pendingYaml as the current, accumulating changes)
5. User clicks "Apply → Create PR" → `POST /flow/apply` → PR created → link shown
6. User clicks "Discard" → pendingYaml cleared, back to current state

### No flow state

If `.holyship/flow.yaml` doesn't exist yet (GET returns 404), the editor shows: "No flow configured. Run analysis to generate one, or describe what you want below." The conversation still works — sends empty string as `currentYaml`, and the AI generates a flow from scratch using the repo config + user's description.

### Integration with Analyze page

`flow-editor.tsx` replaces the current flow section in `analyze/page.tsx`. The parent page passes `owner`, `repo`, and `config: RepoConfig` as props. The editor fetches its own flow data via `GET /flow` and manages all flow-related state internally.

## Scope

### In scope
- GET /flow endpoint (read from repo via GitHub API)
- POST /flow/edit endpoint (single LLM call + parse)
- POST /flow/apply endpoint (create branch + commit + PR)
- Flow edit prompt + parser
- Visual tab (enhanced flow-diagram with change highlighting)
- Text tab (syntax-highlighted YAML with diff view)
- Conversation UI
- Action bar (discard / apply → PR)
- holyship-client.ts methods for all three endpoints

### Out of scope
- Agent self-improvement step (flow engine work, separate project)
- Initial flow bootstrap during interrogation (already exists differently)
- Flow validation / simulation
- Conflict resolution (two PRs editing flow simultaneously)
- Flow version history browser
- Conversation persistence (messages are ephemeral to the session)
