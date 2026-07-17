#!/usr/bin/env bash
# Phase 1 exit-gate script — "Real Vertical Slice".
#
# Runs, from a fresh-enough state, the sequence docs/governance/ROADMAP.md's
# Phase 1 exit gate describes: fresh clone -> bootstrap -> seeded campaign
# appears -> reviewer completes both seeded reviews -> restart every service
# -> decisions, state, and audit trail survive; audit trail is served from
# the database, not memory.
#
# Requires a reachable PostgreSQL (DATABASE_URL) and Redis (REDIS_URL) — see
# .env.example / infra/docker/docker-compose.yml. This script does not start
# either; it assumes they're already up (docker compose, or a native install
# — see docs/STATE.md's "Environment note" if docker pull is blocked by an
# outbound proxy policy, as it was in this project's own sandbox). It DOES
# start (and restart) the real compiled API and worker itself — those are
# the "services" the roadmap's "restart every service" refers to; Postgres
# and Redis are left running throughout, since the whole point is that
# *application* restarts don't lose data that's already durably stored.
#
# No OPA instance is started either. apps/api/src/lib/opa.ts's degraded mode
# (see docs/STATE.md and docs/decisions/) still evaluates the same SoD policy
# data locally when OPA is unreachable, so the demo flow below still produces
# a real (if degraded) policy flag for the FI Admin + AP Payments case — this
# script asserts on that honestly (policyResult.degraded / degradedReason and
# the audit description's "(degraded: ...)" suffix), not silently.
#
# This script always reseeds the database at the start (see step 1) — it
# does not assume any particular pre-existing DB state, so it's self-
# contained and re-runnable.
#
# Exit code 0 + "PASS" line on success. Any failure prints "FAIL: <reason>"
# and exits non-zero (with relevant log tails).

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$ROOT_DIR"

API_PORT="${API_PORT:-4400}"
BASE_URL="http://127.0.0.1:${API_PORT}"
API_PID=""
WORKER_PID=""
LOG_FILE="$(mktemp -t phase1-api-log.XXXXXX)"
WORKER_LOG_FILE="$(mktemp -t phase1-worker-log.XXXXXX)"
BODY_FILE="$(mktemp -t phase1-api-body.XXXXXX)"

kill_services() {
  if [ -n "$API_PID" ] && kill -0 "$API_PID" 2>/dev/null; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  API_PID=""
  if [ -n "$WORKER_PID" ] && kill -0 "$WORKER_PID" 2>/dev/null; then
    kill "$WORKER_PID" 2>/dev/null || true
    wait "$WORKER_PID" 2>/dev/null || true
  fi
  WORKER_PID=""
}

cleanup() {
  kill_services
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

# --- Poll helper: retries `request GET <path>` until check_js is true on the
# response body, or timeout_s elapses. Audit-event writing is real async work
# now (apps/worker consumes a Redis queue apps/api's decision route enqueues
# onto), so anything that depends on an audit event existing must poll for
# it rather than assume it's there immediately after the decision returns. ---
poll_get() {
  local description="$1"
  local path="$2"
  local check_js="$3"
  local timeout_s="${4:-3}"
  local max_ticks=$((timeout_s * 10))
  local tick=0

  while : ; do
    request GET "$path"
    if [ "$STATUS" = "200" ]; then
      if node -e "
        const fs = require('fs');
        const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
        process.exit((($check_js)) ? 0 : 1);
      " "$BODY_FILE" 2>/dev/null; then
        return 0
      fi
    fi
    tick=$((tick + 1))
    if [ "$tick" -ge "$max_ticks" ]; then
      fail "$description (timed out after ${timeout_s}s, last status $STATUS)"
    fi
    sleep 0.1
  done
}

start_services() {
  step "starting API on port $API_PORT"
  API_PORT="$API_PORT" node apps/api/dist/main.js >"$LOG_FILE" 2>&1 &
  API_PID=$!

  local ready=0
  for _ in $(seq 1 40); do
    if curl -sS -o /dev/null "$BASE_URL/health/live" 2>/dev/null; then
      ready=1
      break
    fi
    if ! kill -0 "$API_PID" 2>/dev/null; then
      fail "API process exited before becoming ready"
    fi
    sleep 0.25
  done
  [ "$ready" -eq 1 ] || fail "API did not respond on $BASE_URL/health/live within timeout"

  step "starting worker"
  node apps/worker/dist/main.js >"$WORKER_LOG_FILE" 2>&1 &
  WORKER_PID=$!
  sleep 0.5
  kill -0 "$WORKER_PID" 2>/dev/null || fail "worker process exited immediately after starting"
}

# --- 1. Install, generate, migrate, reseed -----------------------------------
# Always reset+reseed at the start (packages/db/src/seed-data.ts's
# resetDatabase()+seedDemoData(), via `pnpm --filter api run seed`) — this
# script must not assume any particular pre-existing DB state.

step "pnpm install"
pnpm install --frozen-lockfile || fail "pnpm install --frozen-lockfile failed"

step "pnpm --filter db run build (generates the Prisma client + compiles packages/db, needed before the reseed step below)"
pnpm --filter db run build || fail "pnpm --filter db run build failed"

step "pnpm --filter db run migrate:deploy"
pnpm --filter db run migrate:deploy || fail "pnpm --filter db run migrate:deploy failed"

step "pnpm --filter api run seed (reset + reseed so this script is self-contained regardless of prior state)"
pnpm --filter api run seed || fail "pnpm --filter api run seed failed"

# --- 2. Quality gates ---------------------------------------------------------

step "pnpm typecheck"
pnpm typecheck || fail "pnpm typecheck failed"

step "pnpm lint"
pnpm lint || fail "pnpm lint failed"

step "pnpm test"
pnpm test || fail "pnpm test failed"

step "pnpm build"
pnpm build || fail "pnpm build failed"

# --- 3. Start the real compiled API and worker --------------------------------

start_services

# --- 4. Seeded campaign appears; drive both seeded reviews to completion -----

step "GET /inbox (before any decision) — both seeded review items pending"
request GET /inbox
[ "$STATUS" = "200" ] || fail "/inbox returned status $STATUS"
assert_json "/inbox should list both ri-1 and ri-2 as pending" "
  Array.isArray(data.items) &&
  data.items.some((i) => i.id === 'ri-1' && i.status === 'pending') &&
  data.items.some((i) => i.id === 'ri-2' && i.status === 'pending')
"

step "POST /reviews/camp-1/users/user-1/decision (John Smith, FI Admin — real SoD policy flag expected)"
request POST /reviews/camp-1/users/user-1/decision '{"decision":"approve_all","comment":"phase-1 gate: SoD case"}'
[ "$STATUS" = "200" ] || fail "user-1 decision submission returned status $STATUS"
assert_json "user-1's decision should report ok + a non-empty SoD deny (John Smith has both FI Admin and AP Payments, per packages/db/src/seed-data.ts)" "
  data.ok === true &&
  data.decision === 'approve_all' &&
  Array.isArray(data.policyResult?.result?.deny) &&
  data.policyResult.result.deny.length > 0
"
# No OPA instance runs in this environment, so this should honestly report
# the degraded local fallback — not silently look like a real OPA call.
assert_json "user-1's policyResult should be honestly tagged degraded (no OPA instance is running in this gate)" "
  data.policyResult?.degraded === true &&
  typeof data.policyResult?.degradedReason === 'string' &&
  data.policyResult.degradedReason.length > 0
"

step "POST /reviews/camp-1/users/user-2/decision (Amy Ndlovu, Global Admin — privileged access)"
request POST /reviews/camp-1/users/user-2/decision '{"decision":"revoke_selected","comment":"phase-1 gate: privileged access case","selectedAssignmentIds":["asg-3"]}'
[ "$STATUS" = "200" ] || fail "user-2 decision submission returned status $STATUS"
assert_json "user-2's decision should report ok" "
  data.ok === true && data.decision === 'revoke_selected'
"

step "GET /inbox (after both decisions) — should be empty"
request GET /inbox
[ "$STATUS" = "200" ] || fail "/inbox (after decisions) returned status $STATUS"
assert_json "/inbox should be empty after both seeded reviews are completed" "
  Array.isArray(data.items) && data.items.length === 0
"

# --- 5. Audit trail — async (worker-consumed Redis queue), so poll ----------

step "GET /audit/campaigns/camp-1/users/user-1 (polling — async via the worker's Redis queue)"
poll_get \
  "user-1's audit trail never showed the decision event" \
  "/audit/campaigns/camp-1/users/user-1" \
  "Array.isArray(data.events) && data.events.some((e) => e.description.includes('Decision submitted: approve_all'))" \
  3
assert_json "user-1's audit event should legibly show both the policy flag and the degraded fallback (never let a degraded evaluation look identical to a real one)" "
  data.events.some((e) =>
    e.description.includes('Decision submitted: approve_all') &&
    e.description.includes('(policy flags present)') &&
    e.description.includes('(degraded:')
  )
"

step "GET /audit/campaigns/camp-1/users/user-2 (polling — async via the worker's Redis queue)"
poll_get \
  "user-2's audit trail never showed the decision event" \
  "/audit/campaigns/camp-1/users/user-2" \
  "Array.isArray(data.events) && data.events.some((e) => e.description.includes('Decision submitted: revoke_selected'))" \
  3

# --- 6. Restart every (application) service; Postgres/Redis keep running ----
# This is the actual point of the Phase 1 exit gate: application restarts
# must not lose data that's already durably stored. Kill both processes hard
# (not a graceful shutdown) to prove it's not in-flight in-memory state that
# happens to survive a clean exit.

step "kill -9 the API and worker processes"
[ -n "$API_PID" ] && kill -9 "$API_PID" 2>/dev/null
[ -n "$WORKER_PID" ] && kill -9 "$WORKER_PID" 2>/dev/null
wait "$API_PID" 2>/dev/null || true
wait "$WORKER_PID" 2>/dev/null || true
API_PID=""
WORKER_PID=""

step "restarting API and worker (Postgres/Redis were never touched)"
start_services

step "GET /inbox (after restart) — should still be empty"
request GET /inbox
[ "$STATUS" = "200" ] || fail "/inbox (after restart) returned status $STATUS"
assert_json "/inbox should still be empty after restart — decisions persisted, not held in memory" "
  Array.isArray(data.items) && data.items.length === 0
"

step "GET /audit/campaigns/camp-1/users/user-1 (after restart)"
request GET /audit/campaigns/camp-1/users/user-1
[ "$STATUS" = "200" ] || fail "user-1 audit trail (after restart) returned status $STATUS"
assert_json "user-1's decision event should still be in the audit trail after restart — served from Postgres, not memory" "
  data.events.some((e) => e.description.includes('Decision submitted: approve_all'))
"

step "GET /audit/campaigns/camp-1/users/user-2 (after restart)"
request GET /audit/campaigns/camp-1/users/user-2
[ "$STATUS" = "200" ] || fail "user-2 audit trail (after restart) returned status $STATUS"
assert_json "user-2's decision event should still be in the audit trail after restart — served from Postgres, not memory" "
  data.events.some((e) => e.description.includes('Decision submitted: revoke_selected'))
"

echo ""
echo "PASS: Phase 1 gate — install, migrate, reseed, typecheck, lint, test, build, both seeded reviews completed (real SoD policy flag + degraded-mode honesty), audit trail written asynchronously via the worker's Redis queue, and a hard restart of both the API and worker processes left decisions, inbox state, and the audit trail intact (served from Postgres, not memory)."
exit 0
