# WOPR Status Check

Quick overview of WOPR project state across GitHub Issues and PRs for the entire `wopr-network` org.

## Steps

### 1. Backlog

```bash
gh issue list --repo wopr-network/wopr --state open --label "status:todo" --limit 50 --json number,title
```

Report: "**Backlog:** X issues in Todo"

### 2. In-Progress Work

```bash
gh issue list --repo wopr-network/wopr --state open --label "status:in-progress" --limit 50 --json number,title,assignees
```

Report: "**In Progress:** X issues" — list each with assignee and last comment date.

### 3. In-Review Work

```bash
gh issue list --repo wopr-network/wopr --state open --label "status:in-review" --limit 50 --json number,title
```

Report: "**In Review:** X issues"

### 4. Open PRs Across the Org

Discover all repos dynamically and check for open PRs:

```bash
for repo in $(gh repo list wopr-network --json name --jq '.[].name'); do
  prs=$(gh pr list --repo wopr-network/$repo --state open --json number,title,author,createdAt,headRefName 2>/dev/null)
  if [ "$prs" != "[]" ] && [ -n "$prs" ]; then
    echo "=== $repo ==="
    echo "$prs"
  fi
done
```

Report: "**Open PRs:** X total across Y repos" — list each with repo, title, and age.

### 5. Project Progress

```bash
gh project item-list 1 --owner wopr-network --format json --limit 200
```

Report project item counts by status.

### 6. Leftover Worktrees

Check all locally cloned repos for orphaned worktrees:

```bash
for dir in /home/tsavo/wopr /home/tsavo/wopr-plugin-* /home/tsavo/wopr-claude-* /home/tsavo/wopr-skills; do
  if [ -d "$dir/.git" ] || [ -f "$dir/.git" ]; then
    worktrees=$(cd "$dir" && git worktree list 2>/dev/null | grep -v "$(pwd)" | grep -v "bare")
    if [ -n "$worktrees" ]; then
      echo "=== $(basename $dir) ==="
      echo "$worktrees"
    fi
  fi
done
```

If extra worktrees exist, warn: "Orphaned worktrees detected — run cleanup or `/wopr:sprint` will handle them."

### 7. Summary Table

Format the output as:

```
WOPR Status
-----------
Backlog:      X issues
In Progress:  X issues
In Review:    X issues / Y PRs open
Milestones:   X/Y complete
Worktrees:    clean / X orphaned
Repos:        X total (Y cloned locally)
```

## Constants

- GitHub Org: `wopr-network` (discovered dynamically via `gh repo list`)
- GitHub Project: WOPR Tracker (project #1 in wopr-network org)
- Local clones: `/home/tsavo/<repo-name>`
