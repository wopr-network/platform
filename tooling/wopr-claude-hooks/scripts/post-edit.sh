#!/bin/bash
# post-edit.sh — Auto-format + type-check after every Edit/Write
# Works across all WOPR repos regardless of tooling
set -euo pipefail

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only process TypeScript/JavaScript files
case "$FILE_PATH" in
  *.ts|*.tsx|*.js|*.jsx|*.mjs|*.mts) ;;
  *) exit 0 ;;
esac

# Detect package manager
if [ -f "bun.lockb" ]; then
  PM="bun"
elif [ -f "pnpm-lock.yaml" ]; then
  PM="pnpm"
elif [ -f "yarn.lock" ]; then
  PM="yarn"
else
  PM="npm"
fi
RUN="$PM run"

# --- Biome: auto-fix the edited file ---
if [ -f "biome.json" ] || [ -f "biome.jsonc" ]; then
  # Prefer lint:fix script if it exists, else call biome directly
  if jq -e '.scripts["lint:fix"]' package.json >/dev/null 2>&1; then
    $RUN lint:fix -- "$FILE_PATH" 2>&1 | tail -3 || true
  else
    npx biome check --fix "$FILE_PATH" 2>&1 | tail -3 || true
  fi
fi

# --- TypeScript: type-check the project ---
TSC_OUTPUT=$(npx tsc --noEmit 2>&1) || {
  echo "$TSC_OUTPUT" >&2
  exit 2
}

exit 0
