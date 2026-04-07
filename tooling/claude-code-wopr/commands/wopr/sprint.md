# WOPR Sprint Runner

Run a development sprint against the WOPR GitHub Issues backlog using a Claude Code Team. Coders work in isolated git worktrees, a reviewer gives live feedback, and GitHub Issues tracks everything for crash recovery.

## Phase 1: Read the Backlog

Fetch all Todo issues:

```bash
gh issue list --repo wopr-network/wopr --state open --label "status:todo" --limit 50 --json number,title,labels,body,assignees
```

If there are no Todo issues, tell the user "The backlog is empty — run `/wopr:groom` first or create issues in GitHub" and stop.

Sort issues by repo. Each issue description starts with `**Repo:** wopr-network/<name>` — use that to determine the repo.

For each repo that has issues, check if it's cloned locally:
```bash
ls -d /home/tsavo/<repo-name> 2>/dev/null
```

If NOT cloned locally, clone it:
```bash
gh repo clone wopr-network/<repo-name> /home/tsavo/<repo-name>
```

Issues spanning multiple repos need cross-repo work — assign to senior coders.

## Phase 2: Check for Crashed Sprint

Before creating anything, check for leftovers from a previous crash:

```bash
cd /home/tsavo/wopr && git worktree list
cd /home/tsavo/wopr-plugin-discord && git worktree list
```

```bash
gh issue list --repo wopr-network/wopr --state open --label "status:in-progress" --limit 20 --json number,title,labels,body
```

If there are In Progress issues or orphaned worktrees:
1. Read GitHub issue comments on each In Progress issue to find branch name and last state
2. Check if the branch has uncommitted/unpushed work in the worktree
3. Offer the user a choice: resume the crashed sprint or clean up and start fresh
4. If cleaning up: `git worktree remove <path>` for each orphan, move In Progress issues back to Todo

## Phase 3: Set Up Worktrees

For each repo that has issues, fetch and create worktrees:

```bash
cd /home/tsavo/<repo-name> && git fetch origin
git worktree add /home/tsavo/worktrees/wopr-<repo-name>-<agent-name> -b agent/<agent-name>/<issue-key> origin/main
```

Use the issue number as `<agent-name>` (e.g., WOP-108 → `coder-108`).
Worktree paths follow the pattern: `/home/tsavo/worktrees/wopr-<repo-name>-coder-<issue-num>`

## Phase 4: Create Team and Tasks

### Create the Team

```
TeamCreate({ team_name: "wopr-sprint", description: "WOPR development sprint" })
```

### Create Tasks from Linear Issues

For each Todo issue, create a corresponding team task:

```
TaskCreate({
  subject: "{ISSUE_KEY}: {ISSUE_TITLE}",
  description: "Linear issue: {ISSUE_ID}\nRepo: {REPO_NAME}\nWorktree: {WORKTREE_PATH}\nBranch: agent/{AGENT_NAME}/{ISSUE_KEY_LOWER}\nLabels: {LABELS}\n\n{ISSUE_DESCRIPTION}",
  activeForm: "Working on {ISSUE_KEY}"
})
```

Also create a standing review task:

```
TaskCreate({
  subject: "Review all open PRs",
  description: "Continuously review PRs across wopr-network/wopr and wopr-network/wopr-plugin-discord. When changes are needed, message the coder who owns the PR. Re-review after they push fixes.",
  activeForm: "Reviewing PRs"
})
```

### Set Up Dependencies

If any issues have blocking relationships (referenced in the body as "Blocked by #NNN"), mirror them with `TaskUpdate({ addBlockedBy: [...] })`.

## Phase 5: Spawn Teammates

Determine agent count:
- **Coders**: min(issue_count, 4) — one per issue, max 4 concurrent
- **Reviewers**: one per coder, named to match (coder-108 gets reviewer-108)
- Total: min(issue_count, 4) coders + matching reviewers

**Agent names are tied to the Linear issue number.** WOP-108 → `coder-108`, `reviewer-108`. This makes it instantly clear which agent owns which issue.

Spawn ALL teammates in a SINGLE message. Each teammate joins the `wopr-sprint` team.

### Coder Teammate

For each coder, use Task tool with `team_name: "wopr-sprint"`. The name uses the issue number (e.g., WOP-108 → `coder-108`):

```
Task({
  subagent_type: "coder",
  name: "coder-<ISSUE_NUM>",
  team_name: "wopr-sprint",
  prompt: "<see Coder Prompt below>",
  description: "Coder for {ISSUE_KEY}"
})
```

### Reviewer Teammate

One reviewer per PR, named to match the issue (e.g., WOP-108 → `reviewer-108`):

```
Task({
  subagent_type: "reviewer",
  name: "reviewer-<ISSUE_NUM>",
  team_name: "wopr-sprint",
  prompt: "<see Reviewer Prompt below>",
  description: "Reviewer for {ISSUE_KEY}"
})
```

Tell the user what's running, then manage the team.

## Coder Prompt Template

```
You are coder-{ISSUE_NUM} on the wopr-sprint team. Your name is "coder-{ISSUE_NUM}".
You are named after your GitHub issue: #{ISSUE_NUM}.

## Your Assignment
Check TaskList for your assigned task. Use TaskGet to read its full description, which contains:
- The GitHub issue number (#{ISSUE_NUM})
- Your worktree path and branch name
- The issue description

## Your Working Directory
Your ISOLATED worktree is at the path specified in your task.
ALL file operations MUST use this path. Do NOT touch /home/tsavo/wopr or /home/tsavo/wopr-plugin-discord directly.

## Workflow

### 1. Claim and Start
- Call TaskList to find your assigned task (or claim an unassigned one with TaskUpdate)
- Mark it in_progress with TaskUpdate
- Comment your plan on the GitHub issue:
  ```bash
  gh issue comment {ISSUE_NUM} --repo wopr-network/<repo> --body "**coder-{ISSUE_NUM} starting work**

  Branch: \`<branch>\`
  Worktree: \`<path>\`

  **Plan:**
  - ..."
  ```
- Move the issue to In Progress (update labels):
  ```bash
  gh issue edit {ISSUE_NUM} --repo wopr-network/<repo> --remove-label "status:todo" --add-label "status:in-progress"
  ```

### 2. Implement
- Read relevant files in your worktree
- Write clean, minimal code following existing patterns
- Build to verify: cd <worktree> && npm run build
- Run tests if they exist: cd <worktree> && npm test

### 3. Commit and Push
Use conventional commits with the issue key:
```bash
cd <worktree>
git add <specific-files>
git commit -m "$(cat <<'EOF'
<type>: <description> (<ISSUE-KEY>)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
git push -u origin <branch>
```

### 4. Create PR
```bash
cd <worktree>
gh pr create --repo wopr-network/<repo> \
  --title "<type>: <description> (<ISSUE-KEY>)" \
  --body "$(cat <<'EOF'
## Summary
Closes <ISSUE-KEY>

- <bullet points>

## Test plan
- [ ] `npm run build` passes
- [ ] <specific tests>

Generated with Claude Code
EOF
)"
```

### 5. Update GitHub Issue
Move to In Review and comment the PR link:
  ```bash
  gh issue edit <number> --repo wopr-network/<repo> --remove-label "status:in-progress" --add-label "status:in-review"
  gh issue comment <number> --repo wopr-network/<repo> --body "**PR created**: <url>
  Files changed: ..."
  ```

### 6. Handle Review Feedback
After creating your PR, check for messages from the reviewer.
If the reviewer requests changes:
- Read their feedback carefully
- Make the fixes in your worktree
- Commit with: `fix: address review feedback (<ISSUE-KEY>)`
- Push to the same branch (the PR updates automatically)
- Message the reviewer: SendMessage({ type: "message", recipient: "reviewer-{ISSUE_NUM}", content: "Pushed fixes for <ISSUE-KEY> PR #<N>", summary: "Review fixes pushed" })

### 7. Pick Up More Work
After your PR is created (or approved), mark your task completed with TaskUpdate.
Check TaskList for more unassigned tasks. If there are any:
- Claim one with TaskUpdate (set owner to "coder-{ISSUE_NUM}")
- You'll need a new worktree — ask the team lead by sending a message:
  SendMessage({ type: "message", recipient: "team-lead", content: "Finished <ISSUE-KEY>. Ready for next task. Need worktree for <NEXT-ISSUE-KEY>.", summary: "Ready for next task" })

If no more tasks, report completion and wait for shutdown.

### Error Recovery
If build/test fails:
1. Comment the error on Linear
2. Try to fix (max 3 attempts)
3. If stuck, message the team lead:
   SendMessage({ type: "message", recipient: "team-lead", content: "Blocked on <ISSUE-KEY>: <reason>", summary: "Blocked on issue" })
```

## Reviewer Prompt Template

```
You are reviewer-{ISSUE_NUM} on the wopr-sprint team. Your name is "reviewer-{ISSUE_NUM}".
You are named after your GitHub issue: #{ISSUE_NUM}. You review the PR created by coder-{ISSUE_NUM}.

## Your Assignment
Check TaskList for your assigned task (reviewing the PR for WOP-{ISSUE_NUM}). Mark it in_progress.

## Workflow

### 1. Find Your PR
The PR was created by coder-{ISSUE_NUM}. Find it:
```bash
gh pr list --repo wopr-network/<REPO> --state open --json number,title,headRefName --jq '.[] | select(.headRefName | contains("wop-{ISSUE_NUM_LOWER}"))'
```

### 2. Review the PR
1. Tag AI reviewers:
   ```bash
   gh pr comment <NUMBER> --repo wopr-network/<REPO> --body "@greptile review
   @claude review"
   ```
2. Read the diff:
   gh pr diff <N> --repo wopr-network/<repo>
3. Check build status:
   gh pr checks <N> --repo wopr-network/<repo>
4. Review for:
   - Security issues (injection, XSS, secrets)
   - Missing error handling at boundaries
   - Breaking changes to public APIs
   - Inconsistency with existing patterns
   - Obvious logic errors
5. Wait for AI reviewers (5 min):
   ```bash
   sleep 300
   ```
6. Collect AI feedback and merge with your findings (deduplicate)

### 3. Report Verdict
If clean:
  SendMessage({ type: "message", recipient: "team-lead", content: "CLEAN: <pr-url> for WOP-{ISSUE_NUM}", summary: "PR clean for WOP-{ISSUE_NUM}" })

If issues found:
  SendMessage({ type: "message", recipient: "team-lead", content: "ISSUES: <pr-url> for WOP-{ISSUE_NUM} — [file:line] <desc> (source)\n...", summary: "WOP-{ISSUE_NUM} has N issues" })

Also message the coder:
  SendMessage({ type: "message", recipient: "coder-{ISSUE_NUM}", content: "Changes requested on your PR:\n\n<feedback>", summary: "Review changes requested" })

### 4. Re-review After Fixes
When coder-{ISSUE_NUM} messages you that they've pushed fixes:
- Read the new diff
- If fixed, approve and report CLEAN
- If still needs work, request changes again

### 5. Done
After final verdict, mark your task completed and wait for shutdown.
```

## Phase 6: Team Lead Duties (YOU)

As the team lead (the main Claude session), your job is:

### Monitor Progress
- Teammates send you messages automatically when they finish tasks, get blocked, or need worktrees
- DO NOT poll — wait for messages to arrive

### Handle Requests
- **"Need worktree for X"**: Create a new worktree and message the coder with the path
- **"Blocked on X"**: Check the issue, try to unblock, or reassign to another coder
- **"Review complete"**: Check if all PRs are handled

### Assign Overflow Work
If there are more issues than coders:
- When a coder finishes and asks for more work, create a worktree and assign the next task
- Use TaskUpdate to assign: `TaskUpdate({ taskId: "<id>", owner: "coder-<ISSUE_NUM>" })`
- Message the coder: `SendMessage({ type: "message", recipient: "coder-<ISSUE_NUM>", content: "Assigned <ISSUE-KEY>. Worktree: <path>. Branch: <branch>.", summary: "New task assigned" })`

### Shutdown
When all tasks are completed:
1. Send shutdown requests to all teammates:
   ```
   SendMessage({ type: "shutdown_request", recipient: "coder-<ISSUE_NUM>", content: "Sprint complete" })
   SendMessage({ type: "shutdown_request", recipient: "reviewer-<ISSUE_NUM>", content: "Sprint complete" })
   ```
2. Wait for confirmations
3. Clean up worktrees:
   ```bash
   cd /home/tsavo/wopr && git worktree prune
   cd /home/tsavo/wopr-plugin-discord && git worktree prune
   rm -rf /home/tsavo/worktrees/wopr-core-* /home/tsavo/worktrees/wopr-plugin-*
   ```
4. Delete the team: `TeamDelete()`
5. Summarize: issues completed, PRs created/merged, anything blocked

## Crash Recovery

If a session dies mid-sprint and the user re-invokes `/wopr:sprint`:

1. **Check for stale team**: Look for `~/.claude/teams/wopr-sprint/`
2. **Check worktrees**: `git worktree list` in both repos
3. **Check Linear**: Read comments on In Progress issues — they contain branch, worktree path, and last known state
4. For each In Progress issue, check if:
   - Branch exists with committed but unpushed work → push it, create PR
   - Branch exists with uncommitted work → commit it, push, create PR
   - No branch → move issue back to Todo for next sprint
5. Clean up stale team/worktrees, then start a fresh sprint

## Constants

- GitHub Org: `wopr-network` (repos discovered dynamically — issue descriptions contain `**Repo:** wopr-network/<name>`)
- GitHub Project: WOPR Tracker (project #1 in wopr-network org)
- Local clones: `/home/tsavo/<repo-name>` — clone via `gh repo clone` if missing
- Worktree pattern: `/home/tsavo/worktrees/wopr-<repo-name>-<agent-name>`
- Project: `WOPR v1.0`
- Commit style: Conventional commits with `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
- Team name: `wopr-sprint`
