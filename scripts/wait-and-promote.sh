#!/bin/bash
# wait-and-promote.sh — Wait for staging to go green, then promote to production
# Usage: ./scripts/wait-and-promote.sh [product] [--dry-run]
#   product: paperclip|wopr|holyship|nemoclaw|all (default: all)
#   --dry-run: skip the actual promote

set -euo pipefail

PRODUCT="${1:-all}"
DRY_RUN="${2:-}"
REPO="wopr-network/platform"
POLL_INTERVAL=30
MAX_WAIT=1800  # 30 minutes

echo "⏳ Waiting for staging build to complete..."
echo "   Product: $PRODUCT"
echo "   Repo: $REPO"
echo "   Max wait: $((MAX_WAIT / 60)) minutes"
echo ""

ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
  STATUS=$(gh run list -R "$REPO" -w "Build & Deploy Staging" --limit 1 --json status,conclusion --jq '.[0]')
  CONCLUSION=$(echo "$STATUS" | jq -r '.conclusion // ""')
  STATE=$(echo "$STATUS" | jq -r '.status')

  if [ "$STATE" = "completed" ]; then
    if [ "$CONCLUSION" = "success" ]; then
      echo "✅ Staging build succeeded ($((ELAPSED))s)"
      break
    else
      echo "❌ Staging build failed: $CONCLUSION"
      exit 1
    fi
  fi

  printf "\r   %ds elapsed — staging: %s" "$ELAPSED" "$STATE"
  sleep "$POLL_INTERVAL"
  ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
  echo ""
  echo "❌ Timeout waiting for staging ($((MAX_WAIT / 60)) minutes)"
  exit 1
fi

echo ""

if [ "$DRY_RUN" = "--dry-run" ]; then
  echo "🏁 Dry run — skipping promote"
  exit 0
fi

echo "🚀 Promoting $PRODUCT to production..."
gh workflow run "Promote staging → production" -R "$REPO" -f product="$PRODUCT"

echo "⏳ Waiting for promote to complete..."
sleep 10  # Let the run register

ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
  STATUS=$(gh run list -R "$REPO" -w "Promote staging → production" --limit 1 --json status,conclusion --jq '.[0]')
  CONCLUSION=$(echo "$STATUS" | jq -r '.conclusion // ""')
  STATE=$(echo "$STATUS" | jq -r '.status')

  if [ "$STATE" = "completed" ]; then
    if [ "$CONCLUSION" = "success" ]; then
      echo "✅ Promote succeeded ($((ELAPSED))s)"
      echo ""
      echo "🎉 $PRODUCT is live in production"
      exit 0
    else
      echo "❌ Promote failed: $CONCLUSION"
      echo ""
      echo "Check: gh run view -R $REPO --log-failed"
      exit 1
    fi
  fi

  printf "\r   %ds elapsed — promote: %s" "$ELAPSED" "$STATE"
  sleep "$POLL_INTERVAL"
  ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

echo ""
echo "❌ Timeout waiting for promote ($((MAX_WAIT / 60)) minutes)"
exit 1
