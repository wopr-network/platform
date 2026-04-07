# WOPR PR Fix Runner

Tag all open PRs across `wopr-network` with AI code reviewers, wait for reviews, collect and triage feedback, then spawn a fix team to address all actionable issues.

## Arguments

Optional free-text to scope which repos or PRs to target.

Examples:
- `/wopr:fix-prs` — all open PRs across the entire org
- `/wopr:fix-prs wopr-plugin-discord only`
- `/wopr:fix-prs just PR #22 and #21`

## Phase 1: Discover Open PRs

Find all open PRs across the org:

```bash
for repo in $(gh repo list wopr-network --json name --jq '.[].name'); do
  prs=$(gh pr list --repo wopr-network/$repo --state open --json number,title,headRefName,author,createdAt 2>/dev/null)
  if [ "$prs" != "[]" ] && [ -n "$prs" ]; then
    echo "=== $repo ==="
    echo "$prs"
  fi
done
```

If no open PRs exist, tell the user "No open PRs found across wopr-network — nothing to fix" and stop.

Build a list of `{repo, number, title, branch}` for each PR.

Report: "Found **N** open PRs across **M** repos" with a table.

## Phase 2: Trigger AI Reviewers

For each open PR, trigger Greptile via MCP and tag other reviewers via comment **simultaneously**:

```
mcp__plugin_greptile_greptile__trigger_code_review({
  name: "wopr-network/<REPO>",
  remote: "github",
  prNumber: <NUMBER>
})
```

```bash
gh pr comment <NUMBER> --repo wopr-network/<REPO> --body "@claude review"
```

Record the `codeReviewId` from each trigger response — you'll need it to poll for completion.

Report: "Triggered Greptile review on N PRs"

## Phase 3: Poll Until Complete (No Blind Sleep)

For each PR, review the diff yourself **while Greptile processes** in parallel:

```bash
gh pr diff <NUMBER> --repo wopr-network/<REPO>
gh pr checks <NUMBER> --repo wopr-network/<REPO>
gh pr view <NUMBER> --repo wopr-network/<REPO>
```

Then poll each Greptile review until it finishes (max 10 minutes, check every 30s):

```
mcp__plugin_greptile_greptile__get_code_review({ codeReviewId: "<ID>" })
```

Stop polling when `status` is `COMPLETED`, `FAILED`, or `SKIPPED`. If a review never completes within 10 minutes, proceed without it and note that in the summary.

## Phase 4: Collect Review Feedback

**Greptile comments (via MCP — structured, includes `suggestion` blocks with exact replacement code):**
```
mcp__plugin_greptile_greptile__list_merge_request_comments({
  name: "wopr-network/<REPO>",
  remote: "github",
  defaultBranch: "main",
  prNumber: <NUMBER>,
  greptileGenerated: true
})
```

**Other AI reviewers (Claude/Copilot/CodeRabbit via gh api):**
```bash
gh api repos/wopr-network/<REPO>/pulls/<NUMBER>/comments \
  --jq '.[] | select(.user.login | test("copilot|coderabbit|claude"; "i")) | {user: .user.login, body: .body, path: .path, line: .line}' 2>/dev/null

gh api repos/wopr-network/<REPO>/pulls/<NUMBER>/reviews \
  --jq '.[] | select(.user.login | test("copilot|coderabbit|claude"; "i")) | {user: .user.login, state: .state, body: .body}' 2>/dev/null

gh api repos/wopr-network/<REPO>/issues/<NUMBER>/comments \
  --jq '.[] | select(.user.login | test("copilot|coderabbit|claude"; "i")) | {user: .user.login, body: .body}' 2>/dev/null
```

Combine your own diff review findings with all AI reviewer findings. Deduplicate — if you and an AI flagged the same issue, keep it once.

## Phase 5: Triage Feedback

Categorize all review feedback by severity and actionability:

### Critical (must fix)
- Security issues: token leaks, injection, path traversal, missing auth
- Data loss: race conditions, missing validation, delete-before-use
- Correctness: logic bugs, regex errors, wrong types

### Important (should fix)
- Error handling: swallowed errors, missing try/catch at boundaries
- API contracts: missing validation, wrong status codes
- Consistency: pattern violations, naming inconsistencies

### Informational (skip unless trivial)
- Style suggestions already handled by linters
- "Consider" or "might want to" suggestions
- Documentation improvements
- Performance suggestions without evidence

**Drop** anything informational unless the fix is a one-liner. Focus on critical and important.

Report the triage to the user as a summary table before proceeding:
```
PR #N (repo): X critical, Y important, Z skipped
  - [critical] <description>
  - [important] <description>
```

## Phase 6: Set Up Worktrees

For each repo that has PRs with actionable feedback, check out the PR branch into a worktree:

```bash
cd /home/tsavo/<REPO>
git fetch origin
git worktree add /tmp/fix-<REPO>-<PURPOSE> <PR_BRANCH>
```

Where `<PURPOSE>` groups PRs by fixer assignment (e.g., `security`, `discord`, `plugins`).

If the repo isn't cloned locally:
```bash
gh repo clone wopr-network/<REPO> /home/tsavo/<REPO>
cd /home/tsavo/<REPO>
git fetch origin
git worktree add /tmp/fix-<REPO>-<PURPOSE> <PR_BRANCH>
```

## Phase 7: Create Fix Team

### Determine Team Size

**Agent names are tied to the Linear issue number from the PR.** Extract the WOP-NNN from the PR title/branch (e.g., `WOP-108` → `fixer-108`). If a PR has no WOP issue, use the PR number prefixed with the repo short name (e.g., `fixer-discord-30`).

Group PRs into fix tasks by affinity:
- Same repo PRs → same fixer (unless > 3 PRs)
- Security-critical PRs → dedicated fixer
- Max 4 fixers (diminishing returns beyond that)

```
TeamCreate({ team_name: "wopr-fix", description: "Fix AI review feedback on open PRs" })
```

### Create Tasks

For each fixer group, create a task with ALL the details:

```
TaskCreate({
  subject: "Fix review feedback: <REPO> PRs #X, #Y",
  description: "Worktree: <PATH>\nBranch: <BRANCH>\n\n## PR #X: <title>\n\n### Critical\n- <issue + file:line + fix approach>\n\n### Important\n- <issue + file:line + fix approach>\n\n## PR #Y: ...",
  activeForm: "Fixing <REPO> PRs"
})
```

**CRITICAL**: Each task description must include:
1. The exact worktree path and branch for each PR
2. Every actionable issue with file path, line number, and suggested fix
3. Clear distinction between critical (must) and important (should)

### Spawn Fixers

Spawn ALL fixers in a SINGLE message, each with `run_in_background: true`:

```
Task({
  subagent_type: "coder",
  name: "fixer-<ISSUE_NUM>",
  team_name: "wopr-fix",
  prompt: "<see Fixer Prompt below>",
  description: "Fix <REPO> PRs",
  run_in_background: true
})
```

## Fixer Prompt Template

```
You are fixer-{ISSUE_NUM} on the wopr-fix team. Your name is "fixer-{ISSUE_NUM}".

## Your Assignment
Check TaskList for your assigned task. Use TaskGet to read its full description, which contains:
- Worktree paths and branch names for each PR
- Every issue to fix with file paths and line numbers
- Priority: critical fixes are mandatory, important fixes are strongly recommended

## Workflow

### 1. Claim and Start
- Call TaskList, find your task, mark it in_progress with TaskUpdate

### 2. Fix Each PR

For each PR in your task:

1. cd to the worktree path
2. Read the files mentioned in the review feedback
3. Make the fixes — minimal, targeted changes only
4. Verify the fix compiles:
   ```bash
   cd <worktree> && npx tsc --noEmit 2>&1 | head -20
   ```
5. Run tests if they exist:
   ```bash
   cd <worktree> && npm test 2>&1 | tail -20
   ```
6. Commit with conventional commit style:
   ```bash
   cd <worktree>
   git add <specific-files>
   git commit -m "$(cat <<'EOF'
   fix: address review feedback (<PR-DESCRIPTION>)

   Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
   EOF
   )"
   ```
7. Push to the existing PR branch:
   ```bash
   git push origin <branch>
   ```

### 3. Report Results
Message the team lead with what was fixed:
  SendMessage({ type: "message", recipient: "team-lead", content: "Fixed N issues across M PRs:\n- PR #X: <what was fixed>\n- PR #Y: <what was fixed>", summary: "Fixed N issues across M PRs" })

Mark your task completed with TaskUpdate.

### Error Recovery
If build/test fails after a fix:
1. Try to fix the build error (max 3 attempts)
2. If stuck, revert the problematic change: `git checkout -- <file>`
3. Report what couldn't be fixed to the team lead
```

## Phase 8: Monitor and Shutdown

As team lead:

### Wait for Fixers
- Messages arrive automatically when fixers complete
- DO NOT poll — wait for results

### Handle Issues
- If a fixer reports build failures, help diagnose
- If a fixer is stuck, provide guidance or reassign

### Shutdown When Done
1. Send shutdown requests to all fixers:
   ```
   SendMessage({ type: "shutdown_request", recipient: "fixer-<ISSUE_NUM>", content: "Fixes complete" })
   ```
2. Wait for confirmations
3. Clean up worktrees:
   ```bash
   for repo in /home/tsavo/wopr /home/tsavo/wopr-plugin-*; do
     [ -d "$repo" ] && cd "$repo" && git worktree prune
   done
   rm -rf /tmp/fix-*
   ```
4. Delete the team: `TeamDelete()`

## Phase 9: Summary Report

```
PR Fix Summary
--------------
PRs reviewed:     N across M repos
Issues found:     X critical, Y important, Z skipped
Issues fixed:     A of B actionable
Fixers spawned:   N

Results by PR:
  PR #X (repo): N fixes pushed
    - [critical] <what was fixed>
    - [important] <what was fixed>
  ...

PRs with no issues: <list>
Unfixed issues:     <list with reasons>
```

## Constants

- Org: `wopr-network` (discovered dynamically via `gh repo list`)
- Local clones: `/home/tsavo/<repo-name>`
- Worktree pattern: `/tmp/fix-<repo-name>-<purpose>`
- AI reviewers: Greptile (MCP trigger), @claude (gh comment)
- Review wait: poll via MCP `get_code_review` until COMPLETED/FAILED/SKIPPED, max 10 minutes
- Max fixers: 4
- Team name: `wopr-fix`
- Commit style: Conventional commits with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
