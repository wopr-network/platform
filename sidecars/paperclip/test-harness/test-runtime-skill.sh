#!/bin/bash
set -e

echo "============================================"
echo "OpenCode RUNTIME Skill Discovery Test"
echo "============================================"
echo ""
echo "OpenCode version: $(opencode --version 2>/dev/null || echo 'unknown')"
echo ""

SKILL_SRC=/skills/test-skill
CWD=/data/test-project

cleanup() {
  rm -rf "$CWD" "$HOME/.claude" "$HOME/.config" "$HOME/.opencode" /tmp/xdg-*
  mkdir -p "$CWD"
}

# ================================================================
# Replicate EXACT production env:
# - HOME=/data
# - XDG_CONFIG_HOME=<temp dir> (like prepareOpenCodeRuntimeConfig)
# - OPENCODE_DISABLE_PROJECT_CONFIG=true
# - CWD has git init
# - Skills symlinked to HOME/.claude/skills/
# - Skills copied to XDG_CONFIG_HOME/opencode/skills/
# - Skills copied to CWD/.opencode/skills/
# ================================================================
cleanup
cd "$CWD" && git init --quiet

# Create XDG temp dir (like prepareOpenCodeRuntimeConfig)
XDG_DIR=$(mktemp -d /tmp/xdg-opencode-XXXXXX)
mkdir -p "$XDG_DIR/opencode"
echo '{"permission":{"external_directory":"allow"}}' > "$XDG_DIR/opencode/opencode.json"

# Inject skills in all 3 locations (like execute.ts does)
# 1. HOME/.claude/skills/ (symlink)
mkdir -p "$HOME/.claude/skills"
ln -s "$SKILL_SRC" "$HOME/.claude/skills/test-skill"

# 2. XDG_CONFIG_HOME/opencode/skills/ (copy)
mkdir -p "$XDG_DIR/opencode/skills"
cp -r "$SKILL_SRC" "$XDG_DIR/opencode/skills/test-skill"

# 3. CWD/.opencode/skills/ (copy)
mkdir -p "$CWD/.opencode/skills"
cp -r "$SKILL_SRC" "$CWD/.opencode/skills/test-skill"

echo "--- Skill locations ---"
echo "HOME/.claude/skills/test-skill:"
ls -la "$HOME/.claude/skills/test-skill/SKILL.md" 2>&1 || echo "  MISSING"
echo "XDG/opencode/skills/test-skill:"
ls -la "$XDG_DIR/opencode/skills/test-skill/SKILL.md" 2>&1 || echo "  MISSING"
echo "CWD/.opencode/skills/test-skill:"
ls -la "$CWD/.opencode/skills/test-skill/SKILL.md" 2>&1 || echo "  MISSING"
echo ""

# ================================================================
# TEST A: debug skill WITHOUT production env overrides
# ================================================================
echo "=== TEST A: debug skill (no overrides) ==="
cd "$CWD"
result=$(opencode debug skill 2>&1)
count=$(echo "$result" | grep -c '"name"' || echo "0")
echo "  Found: $count skill(s)"
echo ""

# ================================================================
# TEST B: debug skill WITH XDG_CONFIG_HOME override
# ================================================================
echo "=== TEST B: debug skill (XDG_CONFIG_HOME=$XDG_DIR) ==="
cd "$CWD"
result=$(XDG_CONFIG_HOME="$XDG_DIR" opencode debug skill 2>&1)
count=$(echo "$result" | grep -c '"name"' || echo "0")
echo "  Found: $count skill(s)"
echo ""

# ================================================================
# TEST C: debug skill WITH XDG + OPENCODE_DISABLE_PROJECT_CONFIG
# ================================================================
echo "=== TEST C: debug skill (XDG + DISABLE_PROJECT_CONFIG=true) ==="
cd "$CWD"
result=$(XDG_CONFIG_HOME="$XDG_DIR" OPENCODE_DISABLE_PROJECT_CONFIG=true opencode debug skill 2>&1)
count=$(echo "$result" | grep -c '"name"' || echo "0")
echo "  Found: $count skill(s)"
echo ""

# ================================================================
# TEST D: debug paths with production env
# ================================================================
echo "=== TEST D: debug paths (production env) ==="
cd "$CWD"
XDG_CONFIG_HOME="$XDG_DIR" OPENCODE_DISABLE_PROJECT_CONFIG=true opencode debug paths 2>&1
echo ""

# ================================================================
# TEST E: Actual 'opencode run' with skill invocation
# This will fail without API key but the skill discovery error
# message will tell us if skills were found before the API call
# ================================================================
echo "=== TEST E: opencode run --format json (production env, no API key) ==="
cd "$CWD"
result=$(echo "Use the skill tool to invoke test-skill" | XDG_CONFIG_HOME="$XDG_DIR" OPENCODE_DISABLE_PROJECT_CONFIG=true timeout 15 opencode run --format json 2>&1) || true
echo "$result" | tail -30
echo ""

# ================================================================
# TEST F: Same but with ONLY CWD/.opencode/skills (no HOME skills)
# ================================================================
echo "=== TEST F: run with ONLY CWD/.opencode/skills ==="
rm -rf "$HOME/.claude/skills"
rm -rf "$XDG_DIR/opencode/skills"
cd "$CWD"
result=$(echo "Use the skill tool to invoke test-skill" | XDG_CONFIG_HOME="$XDG_DIR" OPENCODE_DISABLE_PROJECT_CONFIG=true timeout 15 opencode run --format json 2>&1) || true
echo "$result" | tail -30
echo ""

# ================================================================
# TEST G: run with ONLY HOME/.claude/skills (no CWD or XDG skills)
# ================================================================
echo "=== TEST G: run with ONLY HOME/.claude/skills ==="
rm -rf "$CWD/.opencode/skills"
mkdir -p "$HOME/.claude/skills"
ln -s "$SKILL_SRC" "$HOME/.claude/skills/test-skill"
cd "$CWD"
result=$(echo "Use the skill tool to invoke test-skill" | XDG_CONFIG_HOME="$XDG_DIR" OPENCODE_DISABLE_PROJECT_CONFIG=true timeout 15 opencode run --format json 2>&1) || true
echo "$result" | tail -30
echo ""

echo "============================================"
echo "Runtime tests complete"
echo "============================================"
