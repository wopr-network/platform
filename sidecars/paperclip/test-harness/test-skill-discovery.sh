#!/bin/bash
set -e

echo "============================================"
echo "OpenCode Skill Discovery Test Harness"
echo "============================================"
echo ""
echo "OpenCode version: $(opencode --version 2>/dev/null || echo 'unknown')"
echo "HOME=$HOME"
echo "XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-<unset>}"
echo ""

# Show opencode paths
echo "=== opencode debug paths ==="
opencode debug paths 2>&1 || true
echo ""

SKILL_SRC=/skills/test-skill
CWD=/data/test-project

# Clean slate
rm -rf "$CWD" "$HOME/.claude" "$HOME/.config" "$HOME/.opencode"
mkdir -p "$CWD"

run_test() {
  local label="$1"
  echo ""
  echo "--------------------------------------------"
  echo "TEST: $label"
  echo "--------------------------------------------"
  cd "$CWD"
  local result
  result=$(opencode debug skill 2>&1) || true
  local count
  count=$(echo "$result" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null || echo "$result" | grep -c '"name"' || echo "0")
  if [ "$count" -gt "0" ]; then
    echo "  PASS - Found $count skill(s)"
    echo "$result" | python3 -c "import sys,json; [print(f'    - {s[\"name\"]} @ {s[\"location\"]}') for s in json.load(sys.stdin)]" 2>/dev/null || echo "  $result" | head -5
  else
    echo "  FAIL - No skills found"
  fi
}

cleanup() {
  rm -rf "$CWD" "$HOME/.claude" "$HOME/.config" "$HOME/.opencode"
  mkdir -p "$CWD"
}

# ================================================================
# TEST 1: Baseline - no skills anywhere
# ================================================================
cleanup
cd "$CWD" && git init --quiet
run_test "Baseline (no skills anywhere)"

# ================================================================
# TEST 2: Skills in HOME/.claude/skills/ (symlink) — no git in CWD
# ================================================================
cleanup
mkdir -p "$HOME/.claude/skills"
ln -s "$SKILL_SRC" "$HOME/.claude/skills/test-skill"
run_test "HOME/.claude/skills/ (symlink, NO git init in CWD)"

# ================================================================
# TEST 3: Skills in HOME/.claude/skills/ (symlink) — WITH git in CWD
# ================================================================
cleanup
mkdir -p "$HOME/.claude/skills"
ln -s "$SKILL_SRC" "$HOME/.claude/skills/test-skill"
cd "$CWD" && git init --quiet
run_test "HOME/.claude/skills/ (symlink, WITH git init in CWD)"

# ================================================================
# TEST 4: Skills in HOME/.claude/skills/ (copy, not symlink) — WITH git
# ================================================================
cleanup
mkdir -p "$HOME/.claude/skills"
cp -r "$SKILL_SRC" "$HOME/.claude/skills/test-skill"
cd "$CWD" && git init --quiet
run_test "HOME/.claude/skills/ (copy, WITH git init in CWD)"

# ================================================================
# TEST 5: Skills in CWD/.claude/skills/ (copy) — WITH git
# ================================================================
cleanup
cd "$CWD" && git init --quiet
mkdir -p "$CWD/.claude/skills"
cp -r "$SKILL_SRC" "$CWD/.claude/skills/test-skill"
run_test "CWD/.claude/skills/ (copy, WITH git init)"

# ================================================================
# TEST 6: Skills in CWD/.opencode/skills/ (copy) — WITH git
# ================================================================
cleanup
cd "$CWD" && git init --quiet
mkdir -p "$CWD/.opencode/skills"
cp -r "$SKILL_SRC" "$CWD/.opencode/skills/test-skill"
run_test "CWD/.opencode/skills/ (copy, WITH git init)"

# ================================================================
# TEST 7: XDG_CONFIG_HOME/opencode/skills/ (copy)
# ================================================================
cleanup
cd "$CWD" && git init --quiet
export XDG_CONFIG_HOME=/tmp/xdg-test
mkdir -p "$XDG_CONFIG_HOME/opencode/skills"
cp -r "$SKILL_SRC" "$XDG_CONFIG_HOME/opencode/skills/test-skill"
echo "  XDG_CONFIG_HOME=$XDG_CONFIG_HOME"
run_test "XDG_CONFIG_HOME/opencode/skills/ (copy)"
unset XDG_CONFIG_HOME

# ================================================================
# TEST 8: XDG_CONFIG_HOME/claude/skills/ (copy)
# ================================================================
cleanup
cd "$CWD" && git init --quiet
export XDG_CONFIG_HOME=/tmp/xdg-test2
mkdir -p "$XDG_CONFIG_HOME/claude/skills"
cp -r "$SKILL_SRC" "$XDG_CONFIG_HOME/claude/skills/test-skill"
echo "  XDG_CONFIG_HOME=$XDG_CONFIG_HOME"
run_test "XDG_CONFIG_HOME/claude/skills/ (copy)"
unset XDG_CONFIG_HOME

# ================================================================
# TEST 9: HOME/.claude/skills/ (symlink) + XDG_CONFIG_HOME set (conflict)
# ================================================================
cleanup
cd "$CWD" && git init --quiet
mkdir -p "$HOME/.claude/skills"
ln -s "$SKILL_SRC" "$HOME/.claude/skills/test-skill"
export XDG_CONFIG_HOME=/tmp/xdg-test3
mkdir -p "$XDG_CONFIG_HOME/opencode"
echo '{}' > "$XDG_CONFIG_HOME/opencode/opencode.json"
echo "  XDG_CONFIG_HOME=$XDG_CONFIG_HOME (no skills here, only config)"
run_test "HOME/.claude/skills/ (symlink) + XDG override (no skills in XDG)"
unset XDG_CONFIG_HOME

# ================================================================
# TEST 10: CWD/.claude/skills/ (symlink) — WITH git
# ================================================================
cleanup
cd "$CWD" && git init --quiet
mkdir -p "$CWD/.claude/skills"
ln -s "$SKILL_SRC" "$CWD/.claude/skills/test-skill"
run_test "CWD/.claude/skills/ (symlink, WITH git init)"

# ================================================================
# TEST 11: CWD parent has .claude/skills/ (walk-up test)
# ================================================================
cleanup
mkdir -p "$HOME/.claude/skills"
cp -r "$SKILL_SRC" "$HOME/.claude/skills/test-skill"
mkdir -p "$CWD/subdir"
cd "$CWD" && git init --quiet
cd "$CWD/subdir"
run_test "Parent walk-up: skills in HOME/.claude/skills/, CWD=subdir of git repo"

# ================================================================
# TEST 12: Both CWD/.claude/skills/ AND HOME/.claude/skills/
# ================================================================
cleanup
cd "$CWD" && git init --quiet
mkdir -p "$HOME/.claude/skills"
cp -r "$SKILL_SRC" "$HOME/.claude/skills/test-skill"
mkdir -p "$CWD/.claude/skills"
cp -r "$SKILL_SRC" "$CWD/.claude/skills/test-skill"
run_test "BOTH HOME + CWD .claude/skills/ (copy)"

echo ""
echo "============================================"
echo "All tests complete"
echo "============================================"
