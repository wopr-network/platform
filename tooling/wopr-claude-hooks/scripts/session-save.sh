#!/bin/bash
# session-save.sh — Persist WOPR session context on Stop
# Writes git state for each active WOPR repo to ~/.wopr-memory.md
# Surfaced at next session start via CLAUDE.md instruction
set -uo pipefail

MEMORY_FILE="$HOME/.wopr-memory.md"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')

{
  echo "## Session: $TIMESTAMP"
  for REPO_PATH in "$HOME"/*/; do
    [ -d "$REPO_PATH/.git" ] || continue
    REPO=$(basename "$REPO_PATH")
    BRANCH=$(git -C "$REPO_PATH" branch --show-current 2>/dev/null) || continue
    [ -z "$BRANCH" ] && continue        # skip detached HEAD
    [ "$BRANCH" = "main" ] && continue  # skip if nothing in progress
    LAST=$(git -C "$REPO_PATH" log --oneline -1 2>/dev/null)
    DIRTY=$(git -C "$REPO_PATH" status --porcelain 2>/dev/null | wc -l | tr -d ' ')
    DIRTY_NOTE=""
    [ "$DIRTY" -gt 0 ] && DIRTY_NOTE=" (${DIRTY} uncommitted)"
    echo "- **$REPO** \`$BRANCH\`: $LAST$DIRTY_NOTE"
  done
  echo ""
} >> "$MEMORY_FILE"

# Keep only last 10 sessions (~150 lines)
if [ -f "$MEMORY_FILE" ]; then
  LINES=$(wc -l < "$MEMORY_FILE")
  if [ "$LINES" -gt 150 ]; then
    tail -120 "$MEMORY_FILE" > "${MEMORY_FILE}.tmp" && mv "${MEMORY_FILE}.tmp" "$MEMORY_FILE"
  fi
fi

exit 0
