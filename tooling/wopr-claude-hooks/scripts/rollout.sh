#!/bin/bash
# rollout.sh — Deploy wopr-claude-hooks plugin + biome to all wopr-network repos
# Detects missing tooling (biome, check scripts, .claude config) and adds it
set -uo pipefail

ORG="wopr-network"
PLUGIN_REPO="wopr-network/wopr-claude-hooks"
WORK_DIR="/tmp/wopr-rollout"
BIOME_VERSION="2.3.14"

mkdir -p "$WORK_DIR"

# Get all repos (skip the plugin repo itself and wopr-skills which has no package.json)
REPOS=$(gh repo list "$ORG" --json name --jq '.[].name' --limit 50 | grep -v "^wopr-claude-hooks$")

for REPO in $REPOS; do
  echo ""
  echo "============================================"
  echo "  $ORG/$REPO"
  echo "============================================"

  # Check if it has a package.json (skip non-TS repos)
  PKG=$(gh api "repos/$ORG/$REPO/contents/package.json" --jq '.content' 2>/dev/null | base64 -d 2>/dev/null) || {
    echo "  SKIP: no package.json"
    continue
  }

  # Check if TypeScript repo
  HAS_TS=$(echo "$PKG" | jq -r '.devDependencies.typescript // empty')
  if [ -z "$HAS_TS" ]; then
    echo "  SKIP: no typescript in devDependencies"
    continue
  fi

  CHANGES=()
  FILES_TO_PUSH=()

  # --- Detect biome ---
  HAS_BIOME=$(echo "$PKG" | jq -r '.devDependencies["@biomejs/biome"] // empty')
  HAS_BIOME_JSON=$(gh api "repos/$ORG/$REPO/contents/biome.json" --jq '.name' 2>/dev/null || echo "")

  if [ -z "$HAS_BIOME" ]; then
    echo "  ADD: @biomejs/biome to devDependencies"
    PKG=$(echo "$PKG" | jq --arg v "^$BIOME_VERSION" '.devDependencies["@biomejs/biome"] = $v')
    CHANGES+=("add @biomejs/biome")
  fi

  if [ -z "$HAS_BIOME_JSON" ]; then
    echo "  ADD: biome.json"
    CHANGES+=("add biome.json")
  fi

  # --- Detect missing scripts ---
  SCRIPTS=$(echo "$PKG" | jq -r '.scripts // {} | keys[]')

  if ! echo "$SCRIPTS" | grep -qx "lint"; then
    echo "  ADD: lint script"
    PKG=$(echo "$PKG" | jq '.scripts.lint = "biome check src/"')
    CHANGES+=("add lint script")
  fi

  if ! echo "$SCRIPTS" | grep -qx "lint:fix"; then
    echo "  ADD: lint:fix script"
    PKG=$(echo "$PKG" | jq '.scripts["lint:fix"] = "biome check --fix src/"')
    CHANGES+=("add lint:fix script")
  fi

  if ! echo "$SCRIPTS" | grep -qx "format"; then
    echo "  ADD: format script"
    PKG=$(echo "$PKG" | jq '.scripts.format = "biome format --write src/"')
    CHANGES+=("add format script")
  fi

  if ! echo "$SCRIPTS" | grep -qx "check"; then
    echo "  ADD: check script"
    PKG=$(echo "$PKG" | jq '.scripts.check = "biome check src/ && tsc --noEmit"')
    CHANGES+=("add check script")
  fi

  # --- Detect .claude/settings.json with plugin ---
  HAS_CLAUDE_SETTINGS=$(gh api "repos/$ORG/$REPO/contents/.claude/settings.json" --jq '.content' 2>/dev/null | base64 -d 2>/dev/null || echo "")

  NEEDS_PLUGIN=true
  if [ -n "$HAS_CLAUDE_SETTINGS" ]; then
    if echo "$HAS_CLAUDE_SETTINGS" | jq -e '.enabledPlugins[]? | select(. == "wopr-hooks")' >/dev/null 2>&1; then
      NEEDS_PLUGIN=false
      echo "  OK: plugin already enabled"
    fi
  fi

  if $NEEDS_PLUGIN; then
    echo "  ADD: .claude/settings.json with plugin marketplace"
    CHANGES+=("add claude hooks plugin config")
  fi

  # --- Skip if nothing to do ---
  if [ ${#CHANGES[@]} -eq 0 ]; then
    echo "  SKIP: everything already in place"
    continue
  fi

  echo ""
  echo "  Changes to apply: ${CHANGES[*]}"
  echo ""

  # --- Build the files list for gh api ---
  # We'll create a branch + PR for each repo
  BRANCH="chore/add-claude-hooks"

  # Get default branch
  DEFAULT_BRANCH=$(gh api "repos/$ORG/$REPO" --jq '.default_branch')

  # Get latest SHA
  BASE_SHA=$(gh api "repos/$ORG/$REPO/git/ref/heads/$DEFAULT_BRANCH" --jq '.object.sha')

  # Create branch
  gh api "repos/$ORG/$REPO/git/refs" \
    --method POST \
    -f "ref=refs/heads/$BRANCH" \
    -f "sha=$BASE_SHA" 2>/dev/null || {
    # Branch might already exist, update it
    gh api "repos/$ORG/$REPO/git/refs/heads/$BRANCH" \
      --method PATCH \
      -f "sha=$BASE_SHA" -f "force=true" 2>/dev/null || true
  }

  # Push package.json if changed
  if echo "${CHANGES[*]}" | grep -qE "biome|lint|format|check|script"; then
    FORMATTED_PKG=$(echo "$PKG" | jq -S '.')
    PKG_SHA=$(gh api "repos/$ORG/$REPO/contents/package.json" --jq '.sha' 2>/dev/null)
    gh api "repos/$ORG/$REPO/contents/package.json" \
      --method PUT \
      -f "message=chore: add biome + quality scripts" \
      -f "content=$(echo "$FORMATTED_PKG" | base64 -w 0)" \
      -f "branch=$BRANCH" \
      -f "sha=$PKG_SHA" >/dev/null 2>&1
    echo "  PUSHED: package.json"
  fi

  # Push biome.json if missing
  if echo "${CHANGES[*]}" | grep -q "biome.json"; then
    BIOME_JSON=$(cat <<'BIOME_EOF'
{
  "$schema": "https://biomejs.dev/schemas/2.3.14/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "includes": ["src/**/*.ts", "!!**/dist", "!!**/node_modules"]
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 120
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "correctness": {
        "noUnusedVariables": "warn",
        "noUnusedImports": "warn"
      },
      "suspicious": {
        "noExplicitAny": "off"
      },
      "style": {
        "noNonNullAssertion": "off",
        "useConst": "warn"
      }
    }
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "double",
      "semicolons": "always",
      "trailingCommas": "all"
    }
  },
  "assist": {
    "enabled": true,
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  }
}
BIOME_EOF
)
    gh api "repos/$ORG/$REPO/contents/biome.json" \
      --method PUT \
      -f "message=chore: add biome.json config" \
      -f "content=$(echo "$BIOME_JSON" | base64 -w 0)" \
      -f "branch=$BRANCH" >/dev/null 2>&1
    echo "  PUSHED: biome.json"
  fi

  # Push .claude/settings.json with marketplace + enabled plugin
  if $NEEDS_PLUGIN; then
    CLAUDE_SETTINGS=$(cat <<'CLAUDE_EOF'
{
  "pluginMarketplaces": [
    {
      "name": "wopr-marketplace",
      "source": "https://github.com/wopr-network/wopr-claude-hooks"
    }
  ],
  "enabledPlugins": ["wopr-hooks@wopr-marketplace"]
}
CLAUDE_EOF
)
    # Check if .claude dir exists
    EXISTING_SHA=$(gh api "repos/$ORG/$REPO/contents/.claude/settings.json" --jq '.sha' 2>/dev/null || echo "")
    if [ -n "$EXISTING_SHA" ]; then
      gh api "repos/$ORG/$REPO/contents/.claude/settings.json" \
        --method PUT \
        -f "message=chore: enable wopr-hooks claude plugin" \
        -f "content=$(echo "$CLAUDE_SETTINGS" | base64 -w 0)" \
        -f "branch=$BRANCH" \
        -f "sha=$EXISTING_SHA" >/dev/null 2>&1
    else
      gh api "repos/$ORG/$REPO/contents/.claude/settings.json" \
        --method PUT \
        -f "message=chore: enable wopr-hooks claude plugin" \
        -f "content=$(echo "$CLAUDE_SETTINGS" | base64 -w 0)" \
        -f "branch=$BRANCH" >/dev/null 2>&1
    fi
    echo "  PUSHED: .claude/settings.json"
  fi

  # Create PR
  PR_URL=$(gh pr create \
    --repo "$ORG/$REPO" \
    --base "$DEFAULT_BRANCH" \
    --head "$BRANCH" \
    --title "chore: add Claude Code quality hooks + biome" \
    --body "$(cat <<'PR_EOF'
## Summary

- Adds shared Claude Code quality hooks via [wopr-claude-hooks](https://github.com/wopr-network/wopr-claude-hooks) plugin
- Adds `@biomejs/biome` for linting + formatting (if missing)
- Adds `biome.json` config (if missing)
- Adds `lint`, `lint:fix`, `format`, `check` scripts (if missing)

## What the hooks do

| Hook | Trigger | Action |
|------|---------|--------|
| PostToolUse | Every `Edit`/`Write` on `.ts` files | Auto-format with biome, type-check with tsc |
| PreToolUse | Any `git commit` command | Block commit if biome or tsc fail |

## How to use

The plugin activates automatically when Claude Code detects `.claude/settings.json`. No manual setup needed.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
PR_EOF
)" 2>&1) || {
    echo "  PR already exists or failed"
    PR_URL=$(gh pr view --repo "$ORG/$REPO" "$BRANCH" --json url --jq '.url' 2>/dev/null || echo "unknown")
  }

  echo "  PR: $PR_URL"
  echo ""
done

echo ""
echo "Done! Review PRs at: https://github.com/orgs/$ORG/pulls"
