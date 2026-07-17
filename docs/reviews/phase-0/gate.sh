#!/usr/bin/env bash
# Phase 0 exit-gate script — "Truth and Foundation".
#
# Runs, from a fresh clone, exactly the sequence a human reviewer would run by
# hand: install, the four quality gates (typecheck/lint/test/build), then
# starts the real compiled API and drives the demo flow described in
# docs/governance/ROADMAP.md (dashboard -> inbox -> decision -> audit view)
# with curl, asserting the JSON shapes with node.
#
# No docker/OPA is required: apps/api/src/lib/opa.ts falls back to a local
# hardcoded SoD check when OPA is unreachable (see docs/STATE.md — this
# fallback is an accepted, documented Phase 0 shortcut, not a bug).
#
# Exit code 0 + "PASS" line on success. Any failure prints "FAIL: <reason>"
# and exits non-zero.

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

API_PORT="${API_PORT:-4300}"
BASE_URL="http://127.0.0.1:${API_PORT}"
API_PID=""
LOG_FILE="$(mktemp -t phase0-api-log.XXXXXX)"
BODY_FILE="$(mktemp -t phase0-api-body.XXXXXX)"

cleanup() {
  if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  rm -f "$BODY_FILE"
}
trap cleanup EXIT

fail() {
  echo ""
  echo "FAIL: $1" >&2
  if [ -s "$LOG_FILE" ]; then
    echo "--- last 40 lines of API log ($LOG_FILE) ---" >&2
    tail -n 40 "$LOG_FILE" >&2
  fi
  exit 1
}

step() {
  echo ""
  echo "== $1 =="
}

# --- Request helper: sets STATUS and writes the response body to $BODY_FILE ---
request() {
  local method="$1"
  local path="$2"
  local payload="${3:-}"

  if [ -n "$payload" ]; then
    STATUS=$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
      -X "$method" "$BASE_URL$path" \
      -H 'Content-Type: application/json' \
      -d "$payload") || fail "curl $method $path failed to connect"
  else
    STATUS=$(curl -sS -o "$BODY_FILE" -w '%{http_code}' \
      -X "$method" "$BASE_URL$path") || fail "curl $method $path failed to connect"
  fi
}

# --- JSON assertion helper: runs a small node script against $BODY_FILE ---
assert_json() {
  local description="$1"
  local check_js="$2"

  node -e "
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const ok = (($check_js));
    if (!ok) {
      console.error('assertion failed');
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }
  " "$BODY_FILE" || fail "$description"
}

# 1. Install
step "pnpm install"
pnpm install --frozen-lockfile || fail "pnpm install --frozen-lockfile failed"

# 2. Quality gates
step "pnpm typecheck"
pnpm typecheck || fail "pnpm typecheck failed"

step "pnpm lint"
pnpm lint || fail "pnpm lint failed"

step "pnpm test"
pnpm test || fail "pnpm test failed"

step "pnpm build"
pnpm build || fail "pnpm build failed"

# 3. Start the real compiled API
step "starting API on port $API_PORT"
API_PORT="$API_PORT" node apps/api/dist/main.js >"$LOG_FILE" 2>&1 &
API_PID=$!

READY=0
for _ in $(seq 1 40); do
  if curl -sS -o /dev/null "$BASE_URL/health/live" 2>/dev/null; then
    READY=1
    break
  fi
  if ! kill -0 "$API_PID" 2>/dev/null; then
    fail "API process exited before becoming ready"
  fi
  sleep 0.25
done

[ "$READY" -eq 1 ] || fail "API did not respond on $BASE_URL/health/live within timeout"

# 4. Demo flow: dashboard -> inbox -> decision -> audit
step "GET /health/live"
request GET /health/live
[ "$STATUS" = "200" ] || fail "/health/live returned status $STATUS"
assert_json "/health/live body should be {status: ok}" "data.status === 'ok'"

step "GET /dashboard"
request GET /dashboard
[ "$STATUS" = "200" ] || fail "/dashboard returned status $STATUS"
assert_json "/dashboard should report numeric summary fields" "
  typeof data.activeCampaigns === 'number' &&
  typeof data.pendingReviews === 'number' &&
  typeof data.violationsDetected === 'number' &&
  typeof data.overdueTasks === 'number'
"

step "GET /inbox (before decision)"
request GET /inbox
[ "$STATUS" = "200" ] || fail "/inbox returned status $STATUS"
assert_json "/inbox should list ri-1 as pending" "
  Array.isArray(data.items) &&
  data.items.some((i) => i.id === 'ri-1' && i.status === 'pending')
"

step "POST /reviews/camp-1/users/user-1/decision"
request POST /reviews/camp-1/users/user-1/decision '{"decision":"approve_all","comment":"phase-0 gate check"}'
[ "$STATUS" = "200" ] || fail "decision submission returned status $STATUS"
assert_json "decision response should echo back ok + decision" "
  data.ok === true && data.decision === 'approve_all'
"

step "GET /inbox (after decision)"
request GET /inbox
[ "$STATUS" = "200" ] || fail "/inbox (after decision) returned status $STATUS"
assert_json "ri-1 should no longer be pending after the decision" "
  Array.isArray(data.items) &&
  !data.items.some((i) => i.id === 'ri-1')
"

step "GET /audit/campaigns/camp-1/users/user-1"
request GET /audit/campaigns/camp-1/users/user-1
[ "$STATUS" = "200" ] || fail "audit trail returned status $STATUS"
assert_json "audit trail should contain the decision event" "
  Array.isArray(data.events) &&
  data.events.some((e) => e.description.includes('Decision submitted: approve_all'))
"

echo ""
echo "PASS: Phase 0 gate — install, typecheck, lint, test, build, and the dashboard -> inbox -> decision -> audit demo flow all succeeded."
exit 0
