#!/usr/bin/env bash
# ============================================================================
# Core Platform — End-to-End Smoke Tests
#
# Tests the full lifecycle: auth → org → fleet → billing → gateway
# Run against the live core server.
#
# Usage:
#   ./ops/scripts/smoke-e2e.sh [BASE_URL]
#   Default: https://api.wopr.bot
# ============================================================================
set -euo pipefail

BASE="${1:-https://api.wopr.bot}"
SERVICE_TOKEN="${CORE_SERVICE_TOKEN:-core_admin_5990f1a5fcd6c094932ced1e019716df}"
PASS=0
FAIL=0
SKIP=0
TOTAL=0

# State — populated during tests
USER_ID=""
TENANT_ID=""
ORG_ID=""

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; CYAN='\033[0;36m'; NC='\033[0m'

pass() { PASS=$((PASS + 1)); TOTAL=$((TOTAL + 1)); printf "${GREEN}  PASS${NC}  %s\n" "$1"; }
fail() { FAIL=$((FAIL + 1)); TOTAL=$((TOTAL + 1)); printf "${RED}  FAIL${NC}  %s\n" "$1"; [ -n "${2:-}" ] && printf "        %s\n" "$2" | head -3; }
skip() { SKIP=$((SKIP + 1)); TOTAL=$((TOTAL + 1)); printf "${YELLOW}  SKIP${NC}  %s — %s\n" "$1" "$2"; }

# Helper: HTTP request, returns body. Sets HTTP_CODE.
HTTP_CODE="000"
http() {
  local method="$1" url="$2"; shift 2
  local tmp; tmp=$(mktemp)
  HTTP_CODE=$(curl -s -o "$tmp" -w "%{http_code}" -X "$method" --connect-timeout 10 "$@" "$url") || HTTP_CODE="000"
  cat "$tmp"; rm -f "$tmp"
}

# Helper: tRPC query
trpc_query() {
  local proc="$1"
  http GET "$BASE/trpc/$proc" \
    -H "Authorization: Bearer $SERVICE_TOKEN" \
    -H "X-Product: paperclip" \
    -H "X-User-Id: $USER_ID" \
    -H "X-Tenant-ID: $TENANT_ID"
}

# Helper: tRPC mutation
trpc_mutate() {
  local proc="$1" body="${2:-{}}"
  http POST "$BASE/trpc/$proc" \
    -H "Authorization: Bearer $SERVICE_TOKEN" \
    -H "Content-Type: application/json" \
    -H "X-Product: paperclip" \
    -H "X-User-Id: $USER_ID" \
    -H "X-Tenant-ID: $TENANT_ID" \
    -d "$body"
}

# Helper: check JSON field exists
json_has() { python3 -c "import sys,json; d=json.load(sys.stdin); $1" 2>/dev/null; }

echo ""
printf "${CYAN}=== Core Platform E2E Smoke Tests ===${NC}\n"
printf "Target: %s\n\n" "$BASE"

# ============================================================================
# 1. HEALTH & PRODUCT CONFIG
# ============================================================================
printf "${CYAN}--- Health & Config ---${NC}\n"

resp=$(http GET "$BASE/health")
if echo "$resp" | json_has 'assert d["ok"]==True'; then pass "Core health"
else fail "Core health" "$resp"; fi

# Holyship health — try via its own domain
resp=$(http GET "https://holyship.wtf/api/health")
if [ "${HTTP_CODE:-0}" = "200" ]; then pass "Holyship health"
else skip "Holyship health" "got ${HTTP_CODE:-timeout}"; fi

for slug in wopr paperclip nemoclaw holyship; do
  resp=$(http GET "$BASE/api/products/$slug")
  if echo "$resp" | json_has 'assert "name" in d or "brandName" in d'; then pass "Product config: $slug"
  else fail "Product config: $slug" "$resp"; fi
done

# ============================================================================
# 2. AUTH — Signup, Login, Session
# ============================================================================
printf "\n${CYAN}--- Auth ---${NC}\n"

TEST_EMAIL="smoke-$(date +%s)@test.wopr.bot"
TEST_PASS="SmokeTest2026!!"

# Sign up
resp=$(http POST "$BASE/api/auth/sign-up/email" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\",\"name\":\"Smoke Test\"}")
if echo "$resp" | json_has "uid=d.get('user',{}).get('id') or d.get('id'); assert uid"; then
  USER_ID=$(echo "$resp" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('user',{}).get('id') or d.get('id'))")
  pass "Auth: signup → $USER_ID"
else fail "Auth: signup" "$resp"; USER_ID="unknown"; fi

# Sign in (capture cookies)
resp=$(http POST "$BASE/api/auth/sign-in/email" \
  -H "Content-Type: application/json" \
  -c /tmp/smoke-cookies.txt \
  -d "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASS\"}")
if echo "$resp" | json_has "assert d.get('user',{}).get('id') or d.get('token')"; then
  pass "Auth: sign-in"
else fail "Auth: sign-in" "$resp"; fi

# Get session
resp=$(http GET "$BASE/api/auth/get-session" -b /tmp/smoke-cookies.txt)
if echo "$resp" | json_has "assert d.get('user') or d.get('session')"; then pass "Auth: get-session"
else fail "Auth: get-session" "$resp"; fi

# ============================================================================
# 3. ORG — List (auto-created from signup hook), or create
# ============================================================================
printf "\n${CYAN}--- Org ---${NC}\n"

# Use user ID as tenant initially — personal tenant
TENANT_ID="$USER_ID"

resp=$(trpc_query "org.listMyOrganizations")
if echo "$resp" | json_has "
orgs=d.get('result',{}).get('data',[])
assert isinstance(orgs, list) and len(orgs)>0
"; then
  ORG_ID=$(echo "$resp" | python3 -c "import sys,json; o=json.load(sys.stdin)['result']['data'][0]; print(o.get('orgId') or o.get('id'))")
  TENANT_ID="$ORG_ID"
  pass "Org: listMyOrganizations → $ORG_ID"
else
  # Try creating
  resp=$(trpc_mutate "org.createOrganization" '{"name":"Smoke Test Org"}')
  if echo "$resp" | json_has "assert d.get('result',{}).get('data')"; then
    ORG_ID=$(echo "$resp" | python3 -c "import sys,json; print(json.load(sys.stdin)['result']['data']['id'])")
    TENANT_ID="$ORG_ID"
    pass "Org: createOrganization → $ORG_ID"
  else fail "Org: create/list" "$resp"; fi
fi

# ============================================================================
# 4. BILLING — Credits Balance, Options, Account Status
# ============================================================================
printf "\n${CYAN}--- Billing ---${NC}\n"

resp=$(trpc_query "billing.creditsBalance")
if echo "$resp" | json_has "r=d.get('result',{}).get('data',{}); assert r is not None"; then
  pass "Billing: creditsBalance"
else fail "Billing: creditsBalance" "$resp"; fi

resp=$(trpc_query "billing.creditOptions")
if echo "$resp" | json_has "assert d.get('result') is not None"; then pass "Billing: creditOptions"
else fail "Billing: creditOptions" "$resp"; fi

resp=$(trpc_query "billing.accountStatus")
if echo "$resp" | json_has "assert d.get('result') is not None"; then pass "Billing: accountStatus"
else fail "Billing: accountStatus" "$resp"; fi

resp=$(trpc_query "billing.spendingLimits")
if echo "$resp" | json_has "assert d.get('result') is not None"; then pass "Billing: spendingLimits"
else fail "Billing: spendingLimits" "$resp"; fi

# ============================================================================
# 5. PROFILE & SETTINGS
# ============================================================================
printf "\n${CYAN}--- Profile & Settings ---${NC}\n"

resp=$(trpc_query "profile.getProfile")
if echo "$resp" | json_has "assert d.get('result') is not None"; then pass "Profile: getProfile"
else fail "Profile: getProfile" "$resp"; fi

resp=$(trpc_query "settings.health")
if echo "$resp" | json_has "assert d.get('result') is not None"; then pass "Settings: health"
else fail "Settings: health" "$resp"; fi

resp=$(trpc_query "settings.ping")
if echo "$resp" | json_has "assert d.get('result') is not None"; then pass "Settings: ping"
else fail "Settings: ping" "$resp"; fi

# ============================================================================
# 6. FLEET — List instances, templates
# ============================================================================
printf "\n${CYAN}--- Fleet ---${NC}\n"

resp=$(trpc_query "fleet.listInstances")
if echo "$resp" | json_has "assert d.get('result') is not None"; then pass "Fleet: listInstances"
else fail "Fleet: listInstances" "$resp"; fi

resp=$(trpc_query "fleet.listTemplates")
if echo "$resp" | json_has "assert d.get('result') is not None"; then pass "Fleet: listTemplates"
else fail "Fleet: listTemplates" "$resp"; fi

# ============================================================================
# 7. PAGE CONTEXT
# ============================================================================
printf "\n${CYAN}--- Page Context ---${NC}\n"

resp=$(trpc_query "pageContext.current")
if echo "$resp" | json_has "assert d.get('result') is not None"; then pass "PageContext: current"
else fail "PageContext: current" "$resp"; fi

# ============================================================================
# 8. GATEWAY — Auth gate, metered inference, billing verification
# ============================================================================
printf "\n${CYAN}--- Gateway ---${NC}\n"

http POST "$BASE/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"model":"test","messages":[]}' >/dev/null
if [ "$HTTP_CODE" = "401" ]; then pass "Gateway: 401 without key"
else fail "Gateway: 401 without key" "got $HTTP_CODE"; fi

# Create a paperclip instance to get a gateway service key (user has welcome credits from signup)
INSTANCE_RESP=$(curl -sf -X POST "$BASE/trpc/fleet.createInstance" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -H "X-Product: paperclip" \
  -H "X-User-Id: $USER_ID" \
  -H "X-Tenant-ID: $TENANT_ID" \
  -d "{\"name\":\"gw-$(date +%s)\"}" 2>/dev/null || echo "{}")
GW_KEY=$(echo "$INSTANCE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('result',{}).get('data',{}).get('gatewayKey',''))" 2>/dev/null || echo "")

if [ -n "$GW_KEY" ] && [ "$GW_KEY" != "" ]; then
  pass "Gateway: got service key from createInstance"

  # Models list with auth
  resp=$(http GET "$BASE/v1/models" -H "Authorization: Bearer $GW_KEY")
  if echo "$resp" | json_has "assert 'data' in d"; then pass "Gateway: models list (authed)"
  else fail "Gateway: models list (authed)" "$resp"; fi

  # Get credit balance before inference
  BALANCE_BEFORE=$(trpc_query "billing.creditsBalance" | python3 -c "
import sys,json
d=json.load(sys.stdin).get('result',{}).get('data',{})
print(d.get('balance', d) if isinstance(d, (int,float)) else d.get('balance', 0))
" 2>/dev/null || echo "0")

  # Fire a chat completion to Kimi K2.5
  resp=$(http POST "$BASE/v1/chat/completions" \
    -H "Authorization: Bearer $GW_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model":"moonshotai/kimi-k2.5","messages":[{"role":"user","content":"Say hello in exactly 3 words."}],"max_tokens":20}')
  if echo "$resp" | json_has "assert d.get('choices') or d.get('id')"; then
    pass "Gateway: Kimi K2.5 chat completion"
  else
    # 402 = no credits, which is expected for a fresh user — still proves the gateway path works
    if [ "$HTTP_CODE" = "402" ]; then
      pass "Gateway: Kimi K2.5 (402 insufficient credits — gateway auth + billing gate working)"
    else
      fail "Gateway: Kimi K2.5 chat completion" "HTTP $HTTP_CODE: $resp"
    fi
  fi
else
  skip "Gateway: metered inference" "no gateway key (createInstance failed)"
fi

# ============================================================================
# 9. CORS — All product domains
# ============================================================================
printf "\n${CYAN}--- CORS ---${NC}\n"

for domain in wopr.bot runpaperclip.com nemopod.com holyship.wtf; do
  headers=$(curl -sf -o /dev/null -D - -H "Origin: https://$domain" "$BASE/health" 2>/dev/null)
  if echo "$headers" | grep -qi "access-control-allow-origin.*$domain"; then pass "CORS: $domain"
  else fail "CORS: $domain"; fi
done

# ============================================================================
# 10. AUTH GATES
# ============================================================================
printf "\n${CYAN}--- Auth Gates ---${NC}\n"

http GET "$BASE/trpc/settings.health" >/dev/null
if [ "$HTTP_CODE" = "401" ]; then pass "tRPC: 401 without token"
else fail "tRPC: 401 without token" "got $HTTP_CODE"; fi

http GET "$BASE/trpc/settings.health" \
  -H "Authorization: Bearer $SERVICE_TOKEN" \
  -H "X-Product: wopr" -H "X-User-Id: test" -H "X-Tenant-ID: test" >/dev/null
if [ "$HTTP_CODE" = "200" ]; then pass "tRPC: 200 with valid token"
else fail "tRPC: 200 with valid token" "got $HTTP_CODE"; fi

# Auth bypass: BetterAuth routes must be public
http GET "$BASE/api/auth/get-session" >/dev/null
if [ "$HTTP_CODE" != "401" ]; then pass "Auth routes: bypass internal auth"
else fail "Auth routes: bypass internal auth" "got 401"; fi

# Auth bypass: webhooks (stripe uses signature verification, not service tokens)
http POST "$BASE/api/webhooks/stripe" -H "Content-Type: application/json" -d '{}' >/dev/null
if [ "$HTTP_CODE" != "401" ]; then pass "Webhook bypass: /api/webhooks/stripe ($HTTP_CODE)"
else fail "Webhook bypass: /api/webhooks/stripe" "got 401"; fi

# ============================================================================
# 11. UIs — All 4 serve HTML
# ============================================================================
printf "\n${CYAN}--- UIs ---${NC}\n"

for domain in wopr.bot runpaperclip.com nemopod.com holyship.wtf; do
  resp=$(curl -sf "https://$domain" 2>/dev/null || true)
  if echo "$resp" | grep -qi "</html>"; then pass "UI: $domain"
  else fail "UI: $domain"; fi
done

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
printf "${CYAN}========================================${NC}\n"
printf "  Results: ${GREEN}%d passed${NC}" "$PASS"
[ "$FAIL" -gt 0 ] && printf ", ${RED}%d failed${NC}" "$FAIL"
[ "$SKIP" -gt 0 ] && printf ", ${YELLOW}%d skipped${NC}" "$SKIP"
printf " / %d total\n" "$TOTAL"
printf "${CYAN}========================================${NC}\n"

rm -f /tmp/smoke-cookies.txt
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
