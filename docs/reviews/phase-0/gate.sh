#!/usr/bin/env bash
# Phase 0 exit-gate script — "Truth and Foundation".
#
# Runs, from a fresh clone, exactly the sequence a human reviewer would run by
# hand: install, reseed the database, the four quality gates
# (typecheck/lint/test/build), then starts the real compiled API and drives
# the demo flow described in docs/governance/ROADMAP.md (dashboard -> inbox
# -> decision -> audit view) with curl, asserting the JSON shapes with node.
#
# No docker/OPA is required: apps/api/src/lib/opa.ts falls back to an
# explicit, honestly-tagged degraded mode when OPA is unreachable (see
# docs/STATE.md and docs/reviews/phase-1/ — this fallback is a documented,
# intentional path, not a bug; this script does not assert on the
# degraded/policy-flag fields itself — docs/reviews/phase-1/gate.sh does).
#
# A reachable, migrated PostgreSQL database is required, though (Phase 1's
# persistence layer means the demo flow is no longer served from memory —
# every fresh process start no longer resets to the seed state for free, so
# this script reseeds itself below rather than assuming any prior state).
#
# Exit code 0 + "PASS" line on success. Any failure prints "FAIL: <reason>"
# and exits non-zero.

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

API_PORT="${API_PORT:-4300}"
BASE_URL="http://127.0.0.1:${API_PORT}"
API_PID=""
WORKER_PID=""
LOG_FILE="$(mktemp -t phase0-api-log.XXXXXX)"
WORKER_LOG_FILE="$(mktemp -t phase0-worker-log.XXXXXX)"
BODY_FILE="$(mktemp -t phase0-api-body.XXXXXX)"

cleanup() {
  if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  if [ -n "$WORKER_PID" ] && kill -0 "$WORKER_PID" 2>/dev/null; then
    kill "$WORKER_PID" 2>/dev/null || true
    wait "$WORKER_PID" 2>/dev/null || true
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
  if [ -s "$WORKER_LOG_FILE" ]; then
    echo "--- last 40 lines of worker log ($WORKER_LOG_FILE) ---" >&2
    tail -n 40 "$WORKER_LOG_FILE" >&2
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

# 1b. Migrate + reseed. Phase 1's persistence layer means the demo flow is
# served from a real Postgres database, not memory — every fresh process
# start no longer resets to the seed state for free, so (unlike Phase 0) this
# script cannot assume ri-1 is pending just because a process just started.
# Build packages/db explicitly first: apps/api/src/db/seed.ts (run via tsx)
# resolves the "db" workspace package the same way `tsc`/node do, through its
# package.json "main"/"types" fields pointing at packages/db/dist — which
# only exists after a build, and this reseed step deliberately runs before
# the "pnpm build" quality gate below.
step "pnpm --filter db run build (needed for the reseed step below)"
pnpm --filter db run build || fail "pnpm --filter db run build failed"

step "pnpm --filter db run migrate:deploy"
pnpm --filter db run migrate:deploy || fail "pnpm --filter db run migrate:deploy failed"

step "pnpm --filter api run seed (reseed so this script is self-contained regardless of prior state)"
pnpm --filter api run seed || fail "pnpm --filter api run seed failed"

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

# 3b. Start the real compiled worker too. Phase 1 part 2 made audit-event
# writing real async work: apps/api's decision route enqueues onto Redis and
# only apps/worker actually calls prisma.auditEvent.create(...). Without a
# worker running, the audit-trail step below would never pass — not because
# the gate script is wrong, but because that's genuinely how the system
# behaves now. (Requires REDIS_URL to be reachable — same posture as
# DATABASE_URL above; this script doesn't start Redis/Postgres themselves.)
step "starting worker"
node apps/worker/dist/main.js >"$WORKER_LOG_FILE" 2>&1 &
WORKER_PID=$!
sleep 0.5
kill -0 "$WORKER_PID" 2>/dev/null || fail "worker process exited immediately after starting"

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

step "GET /audit/campaigns/camp-1/users/user-1 (polling — audit-event writing is async via the worker's Redis queue)"
AUDIT_OK=0
for _ in $(seq 1 40); do
  request GET /audit/campaigns/camp-1/users/user-1
  if [ "$STATUS" = "200" ]; then
    if node -e "
      const fs = require('fs');
      const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
      process.exit(
        Array.isArray(data.events) &&
        data.events.some((e) => e.description.includes('Decision submitted: approve_all'))
          ? 0 : 1
      );
    " "$BODY_FILE"; then
      AUDIT_OK=1
      break
    fi
  fi
  if ! kill -0 "$WORKER_PID" 2>/dev/null; then
    fail "worker process exited while waiting for the audit event to appear"
  fi
  sleep 0.1
done
[ "$AUDIT_OK" -eq 1 ] || fail "audit trail never showed the decision event within ~4s (worker Redis queue consumer)"
assert_json "audit trail should contain the decision event" "
  Array.isArray(data.events) &&
  data.events.some((e) => e.description.includes('Decision submitted: approve_all'))
"

echo ""
echo "PASS: Phase 0 gate — install, typecheck, lint, test, build, and the dashboard -> inbox -> decision -> audit demo flow all succeeded."
exit 0
