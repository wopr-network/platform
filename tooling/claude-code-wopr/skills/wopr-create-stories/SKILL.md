---
name: "wopr-create-stories"
description: "Create GitHub issues for the WOPR project fully wired in a single pass — correct labels (status:todo), priority, project assignment, and blocking graph all set atomically. Use whenever writing new GitHub issues for WOPR, grooming the backlog, or capturing stories from a design discussion. NEVER create stories without invoking this skill first."
---

# WOPR Story Creator

You are writing GitHub issues for the WOPR project. Every story must be **complete on creation** — no follow-up passes to add labels or wire blocking relationships.

## The Rule

**One pass. Everything set. Story is immediately workable.**

If you find yourself editing an issue a second time to fix its labels or blocking — you violated this skill. Start over.

## Required Fields (Every Story)

```
title       — imperative verb phrase: "feat: ...", "fix: ...", "security: ...", "refactor: ..."
repo        — the appropriate repo in wopr-network (e.g., wopr-network/wopr)
labels      — at minimum: "status:todo" + one domain label (see label list below)
body        — starts with "**Repo:** wopr-network/<repo-name>" on line 1
```

## The Creation Pattern

Use `gh issue create` via Bash tool, ONCE per story with ALL fields:

```bash
gh issue create --repo wopr-network/<repo> \
  --title "<type>: <description>" \
  --label "status:todo" --label "<domain>" --label "<type>" \
  --body "**Repo:** wopr-network/<repo>

<full spec>"
```

Then add to the WOPR Tracker project:
```bash
gh project item-add 1 --owner wopr-network --url <ISSUE_URL>
```

## Blocking Graph Rules

- Express blocking relationships in issue body text: "Blocked by #NNN" or "Blocks #NNN"
- Create stories in dependency order (blockers first) so issue numbers are available
- Never leave a story unblocked when it has a real dependency
- **This applies to EXISTING stories too** — new stories must reference existing backlog issues

### Step 0: Find Existing Related Issues BEFORE Creating

Before creating any story, search for issues it should be connected to:

```bash
# Find stories in the same domain that might block or be blocked:
gh issue list --repo wopr-network/wopr --state open --label "<feature-area>" --limit 20 --json number,title

# Find a specific issue by name:
gh search issues "<known issue name>" --repo wopr-network/wopr --limit 5 --json number,title,state
```

Ask yourself for each new story:
- **Does this new story block any existing backlog issue?** → mention "Blocks #NNN" in the body
- **Does any existing issue block this new story?** → mention "Blocked by #NNN" in the body

### Example: New story that blocks an existing backlog issue

```bash
# Step 1: Create new story referencing the blocked issue
gh issue create --repo wopr-network/wopr \
  --title "security: detection layer" \
  --label "status:todo" --label "security" \
  --body "**Repo:** wopr-network/wopr

Blocks #999

<spec>"

# Step 2: Add to project
gh project item-add 1 --owner wopr-network --url <ISSUE_URL>
```

### Example: 3-story chain (new stories only)

```bash
# Step 1: Create the root (no blocked-by)
# → returns issue #1001

# Step 2+3: Create dependents referencing the root
gh issue create --repo wopr-network/wopr \
  --title "security: velocity cap" \
  --label "status:todo" --label "security" \
  --body "**Repo:** wopr-network/wopr

Blocked by #1001

<spec>"
```

## Labels

### Domain Labels (pick one)
- `wopr-platform` — platform backend (Hono, Drizzle, Postgres)
- `wopr-platform-ui` — dashboard UI (Next.js, shadcn)
- `platform-ui` — alias for UI stories
- `wopr-core` — core WOPR engine
- `plugin-discord` — Discord plugin

### Type Labels (pick one)
- `Feature` — new functionality
- `Bug` — defect fix
- `refactor` — code quality, no behavior change
- `security` — security fix or hardening
- `testing` — test coverage
- `tech-debt` — architectural cleanup
- `monetization` — billing, credits, payments
- `devops` — CI/CD, infrastructure

### Combining Labels
Most stories take one domain + one type:
```
labels: ["wopr-platform", "security"]
labels: ["platform-ui", "Feature"]
labels: ["monetization", "wopr-platform", "Feature"]  // billing stories often get 3
```

## Milestones (WOPR v1.0)

| Milestone | What belongs here |
|-----------|-------------------|
| `Test Coverage` | test suites, coverage gaps, vitest additions |
| `Security & Error Handling` | security stories, error handling, validation |
| `Code Quality` | refactors, tech debt, monolith splits |
| `Feature Completion` | remaining product features |
| `Admin Platform` | admin UI, ops tooling |
| `Onboarding & Payments` | payment flows, onboarding UX |
| `End-to-End Integration` | integration work, E2E tests |
| `Candy Store UX` | UI polish, design stories |

If unsure, omit `milestone` rather than guess wrong.

## Priorities

| Priority | When |
|----------|------|
| Urgent (1) | Security vulnerabilities, data loss, revenue-blocking bugs |
| High (2) | Important features, significant bugs, blocking other stories |
| Normal (3) | Standard backlog work |
| Low (4) | Nice-to-have, cleanup, won't block anything |

## Pre-Creation Checklist

Before calling `gh issue create`, confirm:

- [ ] Searched existing backlog for related issues to wire blocking relationships
- [ ] `--label "status:todo"` is in the call
- [ ] `--body` starts with `**Repo:** wopr-network/<repo>`
- [ ] At least one domain label is set
- [ ] New→new blocking wired via "Blocked by #NNN" in body (if multiple new stories)
- [ ] New→existing blocking wired via "Blocked by #NNN" in body
- [ ] Issue added to WOPR Tracker project after creation

## Anti-Patterns (NEVER DO)

```
--- Create story --- then separately add labels
--- Create story --- then separately wire blocking
--- Leave "status:todo" label off
--- Create all stories then wire blocking in a second pass
--- Write body without the **Repo:** header
--- Skip the pre-creation backlog search --- always look for existing issues to wire against
```

## Parallel Creation

When creating multiple independent stories, call `gh issue create` for all of them in a **single message** (parallel Bash calls). For dependent stories, create in order (blockers first, dependents after with "Blocked by #NNN" in body).

## After Creation

Report the created stories in a table:

```
| Issue | Title | Priority | Blocked by |
|-------|-------|----------|------------|
| WOP-1061 | security: self-referral detection | Urgent | — |
| WOP-1062 | security: velocity cap | Urgent | WOP-1061 |
| WOP-1063 | security: ops dashboard | High | WOP-1061 |
```

Then stop. Do not do a follow-up pass to "check" or "fix" anything — if the table is correct, the stories are correct.
