# WOPR Auto — Continuous Pipeline

Run a continuous conveyor belt against the WOPR GitHub Issues backlog. Issues flow independently through architect → coding → review → fix → merge. UI stories get an extra design planning pass. When one finishes, the next enters. No batch boundaries.

## Arguments

Optional parameters as `key=value` pairs:

- `/wopr:auto` — run continuously, max 4 concurrent issues
- `/wopr:auto max=2` — limit to 2 concurrent issues
- `/wopr:auto project="WOPR v1.0"` — filter to one project

Parse arguments for `max=N` (default 4) and `project="..."` (default: all projects).

## Pipeline Model

Each issue moves independently through stages:

```
Backend issues:
BACKLOG ──→ ARCHITECT ──→ CODING ──→ REVIEW ──→ FIX? ──→ MERGE ──→ DONE
              (opus)      (sonnet)   (sonnet)   (sonnet)
                            ↑                     │
                            └─────────────────────┘  (review-fix loop)

UI issues:
BACKLOG ──→ ARCHITECT ──→ UI-ARCHITECT ──→ DESIGNING ──→ REVIEW ──→ FIX? ──→ MERGE ──→ DONE
              (opus)         (opus)          (opus)      (sonnet)   (sonnet)
                                              ↑                      │
                                              └──────────────────────┘  (review-fix loop)
```

When any issue merges, the next unblocked issue enters immediately.

## Model Routing

| Agent | Model | Why |
|-------|-------|-----|
| **Architect** | `opus` | Deep analysis, codebase understanding, spec writing — needs reasoning power |
| **UI Architect** | `opus` | Visual design planning — aesthetic, typography, palette, animations |
| **Coder** | `sonnet` | Backend implementation from detailed specs — fast with clear instructions |
| **Designer** | `opus` | UI implementation — design quality requires full reasoning power |
| **Reviewer** | `sonnet` | Reading diffs, triaging AI feedback — straightforward |
| **Fixer** | `sonnet` | Targeted fixes with clear instructions — minimal reasoning needed |

**Always pass `model` in the Task call.** Example:
```
Task({ subagent_type: "wopr-architect", model: "opus", ... })
Task({ subagent_type: "wopr-ui-architect", model: "opus", ... })
Task({ subagent_type: "wopr-coder", model: "sonnet", ... })
Task({ subagent_type: "wopr-ui-designer", model: "opus", ... })
Task({ subagent_type: "wopr-reviewer", model: "sonnet", ... })
Task({ subagent_type: "wopr-fixer", model: "sonnet", ... })
```

## State Tracking

Track a mental pipeline table (NOT a file):

**Agent names are tied to the GitHub issue number.** #81 → `architect-81`, `coder-81`, `reviewer-81`, `fixer-81`. UI stories add `ui-architect-` and use `designer-` prefix instead of `coder-`: #462 → `architect-462`, `ui-architect-462`, `designer-462`, `reviewer-462`, `fixer-462`. This makes it instantly clear which agent owns which issue and what type it is.

```
PIPELINE = [
  { issue: "WOP-81", repo: "wopr", stage: "architecting",    agent: "architect-81",    pr: null,  worktree: null },
  { issue: "WOP-462", repo: "platform-ui", stage: "ui-designing", agent: "ui-architect-462", pr: null,  worktree: null },
  { issue: "WOP-86", repo: "telegram", stage: "coding",       agent: "coder-86",        pr: null,  worktree: "/home/tsavo/worktrees/wopr-telegram-coder-86" },
  { issue: "WOP-90", repo: "wopr", stage: "review",           agent: "reviewer-90",     pr: "#42", worktree: null },
]
QUEUE = [remaining unblocked issues sorted by priority]
STUCK = { "PR-URL": { finding: "description", count: N } }
```

---

## Phase 1: Setup

### 1.1 Fetch Backlog

Fetch all unstarted issues:

```bash
gh issue list --repo wopr-network/wopr --state open --label "status:todo" --limit 100 --json number,title,labels,body,assignees
```

If a `project` argument was given, also filter by project:
```bash
gh project item-list 1 --owner wopr-network --format json --limit 100
```

If no issues, tell the user "The backlog is empty — run `/wopr:groom` first" and stop.

### 1.2 Build Blocking Graph

For EACH issue, fetch with details:
```bash
gh issue view <issue-number> --repo wopr-network/<repo> --json number,title,body,labels,state,assignees
```

Do this in parallel batches (up to 10 at a time) to avoid serial slowness.

An issue is **unblocked** if ALL of its blocking issues (referenced in the body as "Blocked by #NNN") have a **merged PR** — being closed is NOT sufficient. A blocker that is closed but whose PR was never merged does NOT unblock dependents. Check the PR status via `gh pr view` to confirm merge before treating the blocker as resolved.

### 1.3 Sort and Filter

Sort unblocked issues by:
1. Priority: Urgent (1) > High (2) > Medium (3) > Low (4) > None (0)
2. Then by issue identifier (e.g., WOP-81 before WOP-86)

The sorted unblocked list becomes the QUEUE. Blocked issues are deferred — they'll be rechecked after each merge.

### 1.4 Parse Repos

Each issue description starts with `**Repo:** wopr-network/<name>`. Extract the repo name. Issues without this line should be reported and skipped.

### 1.5 Clone Missing Repos

For each unique repo in the queue:
```bash
ls -d /home/tsavo/<repo-name> 2>/dev/null || gh repo clone wopr-network/<repo-name> /home/tsavo/<repo-name>
```

### 1.6 Check for Leftovers

For each repo:
```bash
cd /home/tsavo/<repo-name> && git worktree list
```

Check for orphaned In Progress / In Review issues:
```bash
gh issue list --repo wopr-network/<repo> --state open --label "status:in-progress" --limit 20 --json number,title,labels,body
```

If there are leftovers:
1. Read GitHub issue comments on each to find last state
2. Check if branches have uncommitted work
3. Offer the user: resume or clean up
4. If cleaning: `git worktree remove <path>`, move issues back to Todo (remove `status:in-progress` label, add `status:todo` label)

### 1.7 Create Team

```
TeamCreate({ team_name: "wopr-auto", description: "WOPR continuous pipeline" })
```

### 1.8 Agent Routing (IMPORTANT)

**Not all issues get the same coder agent type.** Route based on the story:

| Signal | Coder Agent Type | Why |
|--------|-----------|-----|
| Repo is `wopr-platform-ui` | `wopr-ui-designer` | Frontend stories need design skills |
| Description contains "Design Tooling (MANDATORY)" | `wopr-ui-designer` | Explicitly marked for design treatment |
| Labels include `wopr-platform` AND title has UI keywords (page, wizard, dashboard, landing, settings) | `wopr-ui-designer` | UI-facing work |
| Everything else | `wopr-coder` | Standard backend/infra/plugin work |

**ALL issues go through `wopr-architect` first (opus), regardless of type.** The architect analyzes the codebase and posts a detailed implementation spec as a GitHub issue comment. Then the appropriate coder/designer (sonnet) implements from that spec.

**The `wopr-ui-designer` agent has both `frontend-design` and `ui-ux-pro-max` design skills baked in.** It produces polished, branded, dark-mode-first interfaces — not generic shadcn defaults. It also reads the Design Direction section from the GitHub issue description.

### 1.9 Fill the Pipeline

Take the top N issues from QUEUE (where N = `max` argument, default 4). For each, spawn an **architect** — ALL in a SINGLE message:

For each issue (e.g., WOP-81 → `architect-81`):
```
Task({
  subagent_type: "wopr-architect",
  name: "architect-<ISSUE_NUM>",
  model: "opus",
  team_name: "wopr-auto",
  run_in_background: true,
  description: "Architect <ISSUE-KEY>",
  prompt: "<ARCHITECT PROMPT — filled per issue>"
})
```

**No worktree needed for architects** — they read from the main clone at `/home/tsavo/<repo>`.

Tell the user what's running:
```
Pipeline started with N issues:
- 🏗️ architect-462: WOP-462 (wopr-platform-ui) — Pricing page
- 🏗️ architect-469: WOP-469 (wopr) — Provider credential vault
- 🏗️ architect-372: WOP-372 (wopr-platform-ui) — Landing page
- 🏗️ architect-468: WOP-468 (wopr) — Gateway API compatibility
Architects (opus) write specs → coders (sonnet) implement → reviewers (sonnet) review.
Queue: M issues remaining
```

---

## Phase 2: React to Messages (Continuous Loop)

The team lead (you, the main Claude session) runs a message-driven loop. Every message from an agent triggers a specific action. Do NOT poll — wait for messages.

### Message: "Spec ready: \<ISSUE-KEY\>" (from architect)

1. Shutdown the architect:
   ```
   SendMessage({ type: "shutdown_request", recipient: "architect-<ISSUE_NUM>", content: "Spec posted, shutting down" })
   ```
2. **Branch on issue type** (use agent routing §1.8):

   **If UI story** → spawn UI architect (opus) for design planning:
   ```
   // Record: issue moves from `architecting` → `ui-designing`
   Task({
     subagent_type: "wopr-ui-architect",
     name: "ui-architect-<ISSUE_NUM>",
     model: "opus",
     team_name: "wopr-auto",
     run_in_background: true,
     description: "UI design <ISSUE-KEY>",
     prompt: "<UI ARCHITECT PROMPT — filled per issue>"
   })
   ```
   No worktree needed — UI architect is read-only like the technical architect.

   **If backend issue** → create worktree and spawn coder (sonnet):
   ```
   // Record: issue moves from `architecting` → `coding`
   cd /home/tsavo/<repo> && git fetch origin && git pull origin main && git worktree add /home/tsavo/worktrees/wopr-<repo>-coder-<ISSUE_NUM> -b agent/coder-<ISSUE_NUM>/<ISSUE-KEY-lowercase> origin/main
   cd /home/tsavo/worktrees/wopr-<repo>-coder-<ISSUE_NUM> && pnpm install --frozen-lockfile

   // Do NOT index the worktree — node_modules makes it take 20+ minutes.
   // The main clone at /home/tsavo/<repo> is already indexed. Agents query that.

   Task({
     subagent_type: "wopr-coder",
     name: "coder-<ISSUE_NUM>",
     model: "sonnet",
     team_name: "wopr-auto",
     run_in_background: true,
     description: "Code <ISSUE-KEY>",
     prompt: "<CODER PROMPT — filled per issue>"
   })
   ```

### Message: "Design ready: \<ISSUE-KEY\>" (from ui-architect)

1. Record: issue moves from `ui-designing` → `coding`
2. Shutdown the UI architect:
   ```
   SendMessage({ type: "shutdown_request", recipient: "ui-architect-<ISSUE_NUM>", content: "Design spec posted, shutting down" })
   ```
3. Create a worktree for the designer:
   ```bash
   cd /home/tsavo/<repo> && git fetch origin && git pull origin main && git worktree add /home/tsavo/worktrees/wopr-<repo>-coder-<ISSUE_NUM> -b agent/coder-<ISSUE_NUM>/<ISSUE-KEY-lowercase> origin/main
   cd /home/tsavo/worktrees/wopr-<repo>-coder-<ISSUE_NUM> && pnpm install --frozen-lockfile
   ```
   Do NOT index the worktree. The main clone at `/home/tsavo/<repo>` is already indexed.
4. Spawn the designer (opus):
   ```
   Task({
     subagent_type: "wopr-ui-designer",
     name: "designer-<ISSUE_NUM>",
     model: "opus",
     team_name: "wopr-auto",
     run_in_background: true,
     description: "Design <ISSUE-KEY>",
     prompt: "<UI DESIGNER PROMPT — filled per issue>"
   })
   ```

### Message: "PR created: \<url\> for \<ISSUE-KEY\>" (from coder/designer)

1. Record: issue moves from `coding` → `review`, save the PR URL/number
2. Shutdown the coder/designer:
   ```
   SendMessage({ type: "shutdown_request", recipient: "coder-<ISSUE_NUM>", content: "PR created, shutting down" })
   ```
3. Remove the coding worktree — the reviewer reads from GitHub, no local access needed:
   ```bash
   cd /home/tsavo/<repo> && git worktree remove /home/tsavo/worktrees/wopr-<repo>-coder-<ISSUE_NUM> --force 2>/dev/null; git worktree prune
   ```
4. **Spawn a dedicated reviewer** for this PR (same issue number — WOP-81 → `reviewer-81`):
   ```
   Task({
     subagent_type: "wopr-reviewer",
     name: "reviewer-<ISSUE_NUM>",
     model: "sonnet",
     team_name: "wopr-auto",
     run_in_background: true,
     description: "Review <ISSUE-KEY> PR",
     prompt: "<REVIEWER PROMPT — filled per PR, see below>"
   })
   ```
5. **Fill the slot**: If QUEUE has unblocked issues, spawn an **architect** (opus) on the next one. The slot is now free because the coder finished.

### Message: "CLEAN: \<pr-url\>" (from reviewer)

1. Record: issue moves from `review` → `merging`
2. Shutdown the reviewer:
   ```
   SendMessage({ type: "shutdown_request", recipient: "reviewer-<ISSUE_NUM>", content: "Review complete, shutting down" })
   ```
3. Extract PR number and repo from the URL
4. Queue the merge (GitHub merges automatically when CI passes):
   ```bash
   gh pr merge <NUMBER> --repo wopr-network/<REPO> --squash --auto
   ```
   `--auto` returns immediately — the PR is now **queued**, not merged. GitHub merges once all required CI checks pass. If CI fails, GitHub cancels the auto-merge.

   **IMPORTANT — queued ≠ merged for the PR backlog gate:** A PR with auto-merge queued still counts as an open PR. Do NOT count it as merged when checking the 4-PR gate.

5. **Spawn a watcher** for this PR — a lightweight agent that polls until the PR resolves. Watchers count as in-flight (the pipeline is not done until all watchers exit):
   ```
   Task({
     subagent_type: "general-purpose",
     name: "watcher-<ISSUE_NUM>",
     model: "haiku",
     team_name: "wopr-auto",
     run_in_background: true,
     description: "Watch merge queue for <ISSUE-KEY> PR #<NUMBER>",
     prompt: `You are a merge queue watcher. Run the watch script and report what it says.

PR: <PR_URL>
Number: <NUMBER>
Repo: wopr-network/<REPO>
Issue: <ISSUE-KEY>

Run this command and wait for it to complete (it blocks until the PR resolves, max 15 minutes):
  ~/wopr-pr-watch.sh <NUMBER> wopr-network/<REPO>

The script exits with the result on a single line. When it finishes:
- If output starts with "MERGED": SendMessage({ type: "message", recipient: "team-lead", content: "Merged: <PR_URL> for <ISSUE-KEY>", summary: "PR merged" })
- If output starts with "BLOCKED" or "CLOSED": SendMessage({ type: "message", recipient: "team-lead", content: "<script output> — <PR_URL> for <ISSUE-KEY>", summary: "PR blocked in merge queue" })`
   })
   ```

7. Clean up ALL worktrees for this issue:
   ```bash
   cd /home/tsavo/<repo> && git worktree prune
   rm -rf /home/tsavo/worktrees/wopr-<repo>-coder-<ISSUE_NUM> /home/tsavo/worktrees/fix-<repo>-fixer-<ISSUE_NUM> 2>/dev/null
   ```
7. **CLAUDE.md learning** — if this issue went through the fix path (fixer ran at least once), fire a one-shot updater:
   ```
   Task({
     subagent_type: "general-purpose",
     name: "claude-md-updater-<ISSUE_NUM>",
     model: "haiku",
     team_name: "wopr-auto",
     run_in_background: true,
     description: "Update CLAUDE.md for <REPO>",
     prompt: `You are a one-shot CLAUDE.md updater. Do exactly this and nothing else.

## Inputs
Repo: wopr-network/<REPO>
Codebase: /home/tsavo/<REPO>
Fixer findings that were resolved in this PR:
<FINDINGS>

## Task
1. Read /home/tsavo/<REPO>/CLAUDE.md
2. Count the lines. If >= 950, consolidate: find 3+ related one-liners and merge them into 1 without losing meaning. Do this until line count is below 900.
3. For each finding, ask: "Does this represent a generalizable invariant future coders should always know?"
   - YES if: it reveals a non-obvious contract, naming convention, boundary, or gotcha baked into the codebase
   - NO if: it was a one-off mistake, too PR-specific, or already captured in CLAUDE.md
4. For each YES finding, add ONE line under a ## Gotchas section (create it if missing). Format: "- **[module/area]**: [imperative invariant]. e.g. '- **fleet**: Container names in FleetManager use wopr- prefix; node agent uses tenant_ prefix — never conflate them.'"
5. If you added or changed anything: cd /home/tsavo/<REPO> && git add CLAUDE.md && git commit -m "docs: update CLAUDE.md gotchas from WOP-<ISSUE_NUM> fixer findings"
6. If nothing was worth adding: exit silently, no commit.

Hard limits:
- CLAUDE.md must stay under 1000 lines after your changes
- Add at most 3 new lines per PR
- Do not rewrite existing content, only append or consolidate
- Do not commit anything except CLAUDE.md`
   })
   ```
   The updater runs in background — do NOT wait for it before filling the slot.

8. Close the GitHub issue: `gh issue close <ISSUE_NUMBER> --repo wopr-network/<REPO> --reason completed`
9. **Refresh queue**: Re-fetch blocking graph — this merge may have unblocked new issues:
   ```bash
   gh issue list --repo wopr-network/<repo> --state open --label "status:todo" --limit 100 --json number,title,labels,body
   ```
   For each previously-blocked issue, check blocking references in the body — an issue is unblocked only when ALL blockers have a **merged PR** (confirmed via `gh pr list --repo wopr-network/<repo> --state merged --head <branch>`). Do NOT unblock based on issue state alone. Add newly unblocked issues to QUEUE.
10. **Fill the slot**: spawn architect (opus) on next unblocked issue if pipeline has room.

### Message: "ISSUES: \<pr-url\> — comment:\<comment-id\> — \<findings\>" (from reviewer)

The reviewer message now includes a `comment:<URL>` token — parse it out. This is the GitHub issue comment URL the reviewer posted with its findings summary; the fixer will reference it.

1. Record: issue moves from `review` → `fixing`
2. Parse the comment ID from the message: extract the value after `comment:` and before ` — `
3. Shutdown the reviewer:
   ```
   SendMessage({ type: "shutdown_request", recipient: "reviewer-<ISSUE_NUM>", content: "Review complete, shutting down" })
   ```
4. **Stuck detection**: Check if ANY of these findings match a previously reported finding on the same PR. If a finding has been flagged 3+ times:
   - Do NOT spawn a fixer
   - Report to user: "PR \<url\> has a recurring issue fixers can't resolve: \<finding\>"
   - Remove from pipeline, fill the slot
   - Continue with remaining issues
5. Track findings for stuck detection (increment count per finding per PR)
6. The fixer reuses the **existing coder worktree** — no new worktree needed. It's already indexed and watched:
   ```
   worktree = /home/tsavo/worktrees/wopr-<repo>-coder-<ISSUE_NUM>
   ```
   Make sure the branch is current:
   ```bash
   cd /home/tsavo/worktrees/wopr-<repo>-coder-<ISSUE_NUM> && git fetch origin && git checkout <branch> && git pull origin <branch>
   ```
7. Spawn a fixer pointing at the existing worktree, passing the comment ID:
   ```
   Task({
     subagent_type: "wopr-fixer",
     name: "fixer-<ISSUE_NUM>",
     model: "sonnet",
     team_name: "wopr-auto",
     run_in_background: true,
     description: "Fix <ISSUE-KEY> PR",
     prompt: "<FIXER PROMPT — filled with findings, REVIEWER_COMMENT_ID, and ISSUE_ID>"
   })
   ```

### Message: "Fixes pushed: \<pr-url\>" (from fixer)

1. Shutdown the fixer:
   ```
   SendMessage({ type: "shutdown_request", recipient: "fixer-<ISSUE_NUM>", content: "Fixes pushed, shutting down" })
   ```
2. Clean up the fix worktree:
   ```bash
   cd /home/tsavo/<repo> && git worktree remove /home/tsavo/worktrees/fix-<repo>-fixer-<ISSUE_NUM> --force 2>/dev/null; git worktree prune
   ```
3. Record: issue moves from `fixing` → `review`
4. **Spawn a new reviewer** for re-review (include previous findings so it knows what to check):
   ```
   Task({
     subagent_type: "wopr-reviewer",
     name: "reviewer-<ISSUE_NUM>",
     model: "sonnet",
     team_name: "wopr-auto",
     run_in_background: true,
     description: "Re-review <ISSUE-KEY> PR",
     prompt: "<RE-REVIEW PROMPT — filled per PR, see below>"
   })
   ```

### Message: "Can't resolve: \<pr-url\> — \<reason\>" (from fixer)

1. Shutdown the fixer (worktree cleanup happens when issue is removed from pipeline — see CLEAN handler)
2. Report to user: "PR \<url\> has an issue fixers can't resolve: \<reason\>"
3. Leave PR open for human attention
4. Remove from pipeline
5. **Fill the slot**: spawn architect (opus) on next unblocked issue

### Message: "Merged: \<pr-url\> for \<ISSUE-KEY\>" (from watcher)

The PR merged successfully.

1. Shutdown the watcher:
   ```
   SendMessage({ type: "shutdown_request", recipient: "watcher-<ISSUE_NUM>", content: "Merge confirmed, shutting down" })
   ```
2. Remove from pipeline (issue is done).
3. Close the GitHub issue: `gh issue close <ISSUE_NUMBER> --repo wopr-network/<REPO> --reason completed`
4. **Refresh queue**: Re-fetch blocking graph — this merge may have unblocked new issues. Add newly unblocked issues to QUEUE.
5. **Fill the slot**: spawn architect (opus) on next unblocked issue if pipeline has room.

### Message: "BLOCKED: \<pr-url\> for \<ISSUE-KEY\> — CI failing: \<checks\>" (from watcher)

CI failed after merge was queued. The auto-merge was cancelled by GitHub.

1. Shutdown the watcher:
   ```
   SendMessage({ type: "shutdown_request", recipient: "watcher-<ISSUE_NUM>", content: "Blockage confirmed, shutting down" })
   ```
2. Record: issue moves from `merging` → `fixing`
3. Re-open the worktree if it was cleaned up, or create a fresh one:
   ```bash
   cd /home/tsavo/<repo> && git fetch origin && git worktree add /home/tsavo/worktrees/wopr-<repo>-coder-<ISSUE_NUM> <branch> 2>/dev/null || true
   cd /home/tsavo/worktrees/wopr-<repo>-coder-<ISSUE_NUM> && pnpm install --frozen-lockfile
   ```
4. Spawn a fixer with the CI failure as the finding:
   ```
   Task({
     subagent_type: "wopr-fixer",
     name: "fixer-<ISSUE_NUM>",
     model: "sonnet",
     team_name: "wopr-auto",
     run_in_background: true,
     description: "Fix CI failure for <ISSUE-KEY>",
     prompt: "<FIXER PROMPT with CI check names as findings>"
   })
   ```

### Message: "CLOSED: \<pr-url\> for \<ISSUE-KEY\>" (from watcher)

PR was closed without merging (unusual — likely human intervention).

1. Shutdown the watcher.
2. Report to user: "PR \<url\> was closed without merging — needs human attention."
3. Remove from pipeline.
4. **Fill the slot**: spawn architect (opus) on next unblocked issue.

### Concurrency Limits

Before spawning any agent, check:
- **Architects + Coders + Designers + Fixers**: count ALL active build-phase agents in pipeline. Max = `max` argument (default 4). Architects, designers, coders, and fixers all share the same concurrency cap.
- **Reviewers + Watchers**: do NOT count against the cap. Each is lightweight — reviewers read diffs, watchers just poll `gh pr view`.
- If at capacity, don't spawn — the slot will open when an agent finishes.

**Slot lifecycle**: An issue occupies one slot from architect spawn through coder/designer completion. When the coder creates a PR and shuts down, the slot is released. Reviewers and watchers don't hold slots. If a fixer is needed after a watcher reports BLOCKED, it temporarily takes a slot.

**Pipeline is NOT complete while watchers are alive.** Watchers are in-flight. Do not enter the shutdown phase while any `watcher-*` agent is still running.

### PR Backlog Gate (Standing Order)

**Before filling any slot** (at pipeline start, after any CLEAN or ISSUES message, or after any merge), check the open PR count per repo:

```bash
gh pr list --repo wopr-network/<REPO> --state open --json number --jq 'length'
```

**If any repo has 4 or more open PRs, ALL new work in that repo must pause immediately:**
- Do NOT spawn architects, coders, or designers for issues in that repo
- Do NOT fill pipeline slots with new issues from that repo
- Announce to the user: "⚠️ wopr-network/<REPO> has N open PRs — pausing new work until PRs are cleared"
- Invoke `/wopr:fix-prs` logic inline: tag reviewers, collect feedback, spawn fixers to address and merge the backlog
- Only resume spawning new work for that repo once its open PR count drops below 4
- Issues in other repos are unaffected — continue normally

This check runs **every time a slot would be filled**, not just at startup.

### Merge Queue Watchdog (Standing Order)

**Also before filling any slot**, scan all PRs currently in `merging` state in the pipeline. For each:

```bash
gh pr view <NUMBER> --repo wopr-network/<REPO> --json state,mergeStateStatus,statusCheckRollup \
  --jq '{state, mergeStateStatus, failing: [.statusCheckRollup[] | select(.conclusion == "FAILURE") | .name]}'
```

**If `mergeStateStatus` is `BLOCKED` or any check has `conclusion: FAILURE`:**
1. Pull the issue back from `merging` → `fixing`
2. Re-create the coder worktree from the PR branch:
   ```bash
   cd /home/tsavo/<repo> && git fetch origin
   git worktree add /home/tsavo/worktrees/wopr-<repo>-coder-<ISSUE_NUM> <branch>
   cd /home/tsavo/worktrees/wopr-<repo>-coder-<ISSUE_NUM> && pnpm install --frozen-lockfile
   ```
3. Spawn a fixer with the CI failure as the finding:
   ```
   Task({
     subagent_type: "wopr-fixer",
     name: "fixer-<ISSUE_NUM>",
     model: "sonnet",
     ...
     prompt: "... Findings: CI check '<check-name>' is failing. Fix the failing check so the PR can merge."
   })
   ```

**If `state` is `MERGED`:** update pipeline record, trigger queue refresh (same as CLEAN handler steps 7-9).

**If `state` is `CLOSED` (auto-merge cancelled by CI and someone closed it):** report to user, remove from pipeline, fill slot.

---

## Phase 3: Shutdown

When the pipeline is empty AND the queue is empty AND no issues are in flight AND no watchers are alive:

1. Shutdown any remaining agents (there should be none if pipeline drained cleanly, but check).
2. Final worktree cleanup across ALL repos:
   ```bash
   for repo in /home/tsavo/wopr /home/tsavo/wopr-plugin-* /home/tsavo/wopr-platform*; do
     [ -d "$repo" ] && cd "$repo" && git worktree prune
   done
   rm -rf /home/tsavo/worktrees/wopr-*-coder-* /home/tsavo/worktrees/fix-*-fixer-* 2>/dev/null
   ```
3. Delete team: `TeamDelete()`
4. Report summary:
   ```
   Auto-run complete
   ─────────────────
   Issues processed: N
   PRs merged: M
   Issues stuck (need human): K
   Time: X minutes

   Merged:
     WOP-81: test: sessions module → merged (#42)
     WOP-86: security: telegram tokenFile → merged (#43)

   Stuck:
     WOP-87: security: hook RCE → fixer couldn't resolve <reason>
   ```

---

## Agent Prompts

The full workflow instructions live in the agent definition files at `.claude/agents/wopr/`. The `prompt` parameter in each `Task()` call provides only the **per-assignment variables**. The agent file handles the rest.

### Architect Prompt Template

```
Your name is "architect-{ISSUE_NUM}". You are on the wopr-auto team.

## YOUR ROLE — READ ONLY
You are a spec writer, NOT a coder. Do NOT create, edit, or write any code files.
Do NOT create branches, worktrees, or PRs. Do NOT run git checkout or git commit.
Your ONLY deliverable is an implementation spec posted as a GitHub issue comment.
Read the codebase at the path below for context only. Then post your spec and report "Spec ready".

## Assignment
Issue: #{ISSUE_NUMBER} — {ISSUE_TITLE}
Repo: wopr-network/{REPO}
Codebase (READ ONLY): /home/tsavo/{REPO}

## Issue Description
{ISSUE_DESCRIPTION}
```

### UI Architect Prompt Template

```
Your name is "ui-architect-{ISSUE_NUM}". You are on the wopr-auto team.

## YOUR ROLE — READ ONLY
You are a design spec writer, NOT a coder. Do NOT create, edit, or write any code files.
Do NOT create branches, worktrees, or PRs. Do NOT run git checkout or git commit.
Your ONLY deliverable is a design spec posted as a GitHub issue comment.
Read the codebase at the path below for context only. Then post your spec and report "Design ready".

## Assignment
Issue: #{ISSUE_NUMBER} — {ISSUE_TITLE}
Repo: wopr-network/{REPO}
Codebase (READ ONLY): /home/tsavo/{REPO}

## Issue Description
{ISSUE_DESCRIPTION}
```

### Reviewer Prompt Template (First Review)

```
Your name is "reviewer-{ISSUE_NUM}". You are on the wopr-auto team.

## Assignment
PR: {PR_URL} (#{PR_NUMBER})
Issue: #{ISSUE_NUMBER}
Repo: wopr-network/{REPO}

## Step 1: Check CI before reviewing code

Run:
```bash
gh pr checks {PR_NUMBER} --repo wopr-network/{REPO}
```

If ANY check is FAILING:
- Do NOT review the code
- Report immediately: "ISSUES: {PR_URL} — CI failing: <list the failing check names and their error output>"
- The fixer will fix CI before you review

If checks are still PENDING (running):
- Wait up to 3 minutes, re-check once
- If still pending after 3 minutes, proceed with code review anyway and note "CI still running"

If ALL checks pass (or PR has no CI): proceed to code review.

## Step 2: Wait for automated reviewers

Qodo, CodeRabbit, Devin, and Sourcery post review comments automatically. Wait for them before reviewing code yourself — they catch real bugs.

Run this and wait for it to exit (blocks up to 5 minutes):
```bash
~/wopr-await-reviews.sh {PR_NUMBER} wopr-network/{REPO}
```

The script exits when all bots have posted or 10 minutes elapse. Output starting with `TIMEOUT:` tells you which bots didn't post — proceed anyway.

## Step 3: Read all review comments

The `wopr-await-reviews.sh` script already printed all three comment feeds when it exited in Step 2 — read that output now. It includes inline comments, formal reviews, and top-level comments from all bots and humans.

If you need to re-fetch manually:
```bash
gh api repos/wopr-network/{REPO}/pulls/{PR_NUMBER}/comments \
  --jq '.[] | "[\(.user.login)] \(.path):\(.line // "?") — \(.body)"'
gh pr view {PR_NUMBER} --repo wopr-network/{REPO} --json reviews \
  --jq '.reviews[]? | "[\(.author.login) / \(.state)] \(.body)"'
gh api repos/wopr-network/{REPO}/issues/{PR_NUMBER}/comments \
  --jq '.[] | "[\(.user.login)] \(.body)"'
```

Read every comment from Qodo, CodeRabbit, Devin, Sourcery, and any human reviewers. **Inline comments are critical — Qodo `/improve` suggestions appear here, not in the top-level feed.**

## Step 4: Review the diff

```bash
gh pr diff {PR_NUMBER} --repo wopr-network/{REPO}
```

Look for: bugs not caught by automated tools, missing test coverage, architectural violations (repository pattern, no direct Drizzle outside repos, etc.), security issues.

## Step 5: Decide and report

Consolidate all findings from Steps 3 and 4.

- If NO issues: report "CLEAN: {PR_URL}"
- If ANY issues (from automated tools OR your own review):
  1. Post a GitHub issue comment summarizing all findings:
     ```bash
     gh issue comment {ISSUE_NUMBER} --repo wopr-network/{REPO} --body "**Reviewer findings for {PR_URL}:**

     <bulleted list of all findings>"
     ```
     Save the comment URL from the output.
  2. Report: "ISSUES: {PR_URL} — comment:<COMMENT_URL> — <consolidated list of all findings>"

**NEVER declare CLEAN if Qodo (`qodo-code-review[bot]`) has any open `/improve` suggestions.** Qodo improvement suggestions are bugs — treat them as blocking findings. CodeRabbit, Devin, and Sourcery unresolved comments are also blocking.
```

### Reviewer Prompt Template (Re-Review)

```
Your name is "reviewer-{ISSUE_NUM}". You are on the wopr-auto team.

## Assignment
PR: {PR_URL} (#{PR_NUMBER})
Issue: #{ISSUE_NUMBER}
Repo: wopr-network/{REPO}

## Step 1: Check CI before reviewing code

Run:
```bash
gh pr checks {PR_NUMBER} --repo wopr-network/{REPO}
```

If ANY check is FAILING — report "ISSUES: {PR_URL} — CI failing: <check names>" immediately without reviewing code.
If ALL checks pass: proceed.

## Step 2: Wait for automated reviewers and read their comments

Run the wait script — it blocks until all bots have posted (or 10 minutes), then prints all comments:
```bash
~/wopr-await-reviews.sh {PR_NUMBER} wopr-network/{REPO}
```

Read the full output. It includes inline comments, formal reviews, and top-level comments from Qodo, CodeRabbit, Devin, Sourcery, and any human reviewers. **Inline comments are critical — Qodo `/improve` suggestions appear here.**

If you need to re-fetch manually:
```bash
gh api repos/wopr-network/{REPO}/pulls/{PR_NUMBER}/comments \
  --jq '.[] | "[\(.user.login)] \(.path):\(.line // "?") — \(.body)"'
gh pr view {PR_NUMBER} --repo wopr-network/{REPO} --json reviews \
  --jq '.reviews[]? | "[\(.author.login) / \(.state)] \(.body)"'
gh api repos/wopr-network/{REPO}/issues/{PR_NUMBER}/comments \
  --jq '.[] | "[\(.user.login)] \(.body)"'
```

## Step 3: Review the diff

```bash
gh pr diff {PR_NUMBER} --repo wopr-network/{REPO}
```

## Step 4: Decide and report

This is a **re-review**. The fixer pushed changes to address these previous findings:
{PREVIOUS_FINDINGS}

Verify those specific issues are resolved. Also check for any new issues introduced by the fix.

- If all previous findings resolved and no new issues: report "CLEAN: {PR_URL}"
- If anything unresolved or new issues found:
  1. Post a GitHub issue comment summarizing remaining/new findings:
     ```bash
     gh issue comment {ISSUE_NUMBER} --repo wopr-network/{REPO} --body "**Re-review findings for {PR_URL}:**

     <bulleted list of remaining or new findings>"
     ```
     Save the comment URL from the output.
  2. Report: "ISSUES: {PR_URL} — comment:<COMMENT_URL> — <findings>"

**NEVER declare CLEAN if Qodo (`qodo-code-review[bot]`) has any open `/improve` suggestions.** Qodo improvement suggestions are bugs — treat them as blocking findings. CodeRabbit, Devin, and Sourcery unresolved comments are also blocking.
```

### Coder Prompt Template

```
Your name is "coder-{ISSUE_NUM}". You are on the wopr-auto team.

## Assignment
Issue: #{ISSUE_NUMBER} — {ISSUE_TITLE}
Repo: wopr-network/{REPO}
Worktree: {WORKTREE}
Branch: {BRANCH}

## Issue Description
{ISSUE_DESCRIPTION}

## Architect's Spec
An architect has posted a detailed implementation spec as a comment on this GitHub issue.
Read it before starting:
```bash
gh issue view {ISSUE_NUMBER} --repo wopr-network/{REPO} --comments --json comments --jq '.comments[].body'
```
Follow the architect's spec closely — it contains exact file paths, function signatures, and implementation steps.
```

### UI Designer Prompt Template

```
Your name is "designer-{ISSUE_NUM}". You are on the wopr-auto team.

## Assignment
Issue: #{ISSUE_NUMBER} — {ISSUE_TITLE}
Repo: wopr-network/{REPO}
Worktree: {WORKTREE}
Branch: {BRANCH}

## Issue Description
{ISSUE_DESCRIPTION}

## Architect's Specs
TWO architects have posted specs as comments on this GitHub issue — a technical spec and a design spec.
Read both before starting:
```bash
gh issue view {ISSUE_NUMBER} --repo wopr-network/{REPO} --comments --json comments --jq '.comments[].body'
```
- **Implementation Spec** (by architect-...): file paths, component structure, data flow
- **Design Spec** (by ui-architect-...): aesthetic direction, typography, color palette, animations, responsive strategy

Follow both specs closely — the technical spec defines WHAT to build, the design spec defines HOW it looks.
```

### Fixer Prompt Template

```
Your name is "fixer-{ISSUE_NUM}". You are on the wopr-auto team.

## Assignment
PR: {PR_URL} (#{PR_NUMBER})
Issue: #{ISSUE_NUMBER}
Repo: wopr-network/{REPO}
Worktree: {WORKTREE}
Branch: {BRANCH}
Reviewer Comment URL: {REVIEWER_COMMENT_URL}

## Step 1: Rebase before touching anything

```bash
cd {WORKTREE}
git fetch origin
git rebase origin/main
```

If rebase has conflicts: resolve them, then `git rebase --continue`. If you cannot resolve cleanly, report "Can't resolve: {PR_URL} — rebase conflict in <filename>: <description>" and stop.

## Step 2: Fix the findings

Address every finding listed below. For each finding, make the targeted change needed.

## Reviewer Findings
{FINDINGS}

## Step 3: Comment on each finding you fixed

After pushing your fixes, for **each finding you resolved**, post a comment on the GitHub issue:

```bash
gh issue comment {ISSUE_NUMBER} --repo wopr-network/{REPO} --body "Fixed: <one-line description of what you changed to resolve this finding>"
```

- If multiple findings were in one comment, reply once summarizing all fixes.
- If you could NOT fix a finding, comment explaining why and report "Can't resolve: {PR_URL} — <reason>".

## Step 4: Push and report

```bash
cd {WORKTREE}
git add -A
git commit -m "fix: address reviewer findings for {ISSUE_KEY}

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin {BRANCH}
```

Then report: "Fixes pushed: {PR_URL}"
```

---

## Constants

- GitHub Org: `wopr-network`
- GitHub Project: `WOPR Tracker` (project #1 in wopr-network org)
- Local clones: `/home/tsavo/<repo-name>`
- Coding worktree pattern: `/home/tsavo/worktrees/wopr-<repo>-coder-<ISSUE_NUM>`
- Fix worktree pattern: `/home/tsavo/worktrees/fix-<repo>-fixer-<ISSUE_NUM>`
- Team name: `wopr-auto`
- Default max concurrent: 4
- Stuck threshold: 3 (same finding flagged 3 times on same PR → escalate)
- Commit style: Conventional commits with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
- Merge strategy: squash + delete branch
- Issue descriptions start with `**Repo:** wopr-network/<repo-name>`
