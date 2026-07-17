# Phase 1 exit gate — Real Vertical Slice

**Script:** `docs/reviews/phase-1/gate.sh`

## What it proves

Per `docs/governance/ROADMAP.md`, Phase 1's exit gate is:

> Fresh clone → bootstrap → seeded campaign appears → reviewer completes
> both seeded reviews → restart every service → decisions, state, and audit
> trail survive; audit trail is served from the database, not memory.

`gate.sh` runs that sequence unattended, from the repo root:

1. `pnpm install --frozen-lockfile`
2. `pnpm --filter db run build` (compiles `packages/db`, needed before the
   reseed step below can resolve the `db` workspace package) and
   `pnpm --filter db run migrate:deploy`.
3. `pnpm --filter api run seed` — **always resets and reseeds** the database
   (via `packages/db/src/seed-data.ts`'s `resetDatabase()` +
   `seedDemoData()`). The script does not assume any particular
   pre-existing database state; this is what makes it self-contained and
   re-runnable, unlike relying on whatever a previous manual run left behind.
4. The four quality gates: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.
5. Starts the real compiled API (`apps/api/dist/main.js`) **and** the real
   compiled worker (`apps/worker/dist/main.js`) — both are required now:
   audit-event writing is real async work (Phase 1 part 2), the API's
   decision route only enqueues a job onto Redis, and the worker is the only
   thing that actually writes the `AuditEvent` row.
6. Drives both seeded review items to completion via curl:
   - `camp-1/user-1` (John Smith, `FI Admin` + `AP Payments` — a real,
     data-driven SoD policy flag: `policyResult.result.deny` is asserted
     non-empty).
   - `camp-1/user-2` (Amy Ndlovu, `Global Admin` — privileged access).
   - Confirms `/inbox` is empty after both.
7. Polls (bounded, ~3s) `GET /audit/campaigns/:campaignId/users/:userId` for
   each decision's audit event — this is genuinely asynchronous now, so the
   script does not assume it's there immediately after the decision response
   returns.
8. `kill -9`s both the API and worker processes (a hard kill, not a graceful
   shutdown — proving it isn't in-flight in-memory state that happens to
   survive a clean exit), then restarts both. **Postgres and Redis are never
   touched** — the whole point of this gate is that *application* restarts
   don't lose data that's already durably stored there.
9. Re-fetches both users' audit trails and `/inbox` after the restart and
   confirms the decisions, and the empty inbox, are still there — proving
   persistence is real, not in-memory.
10. Clean teardown (kills anything it started) on both the success and
    failure paths, via the same trap-based cleanup pattern as
    `docs/reviews/phase-0/gate.sh`.

Any failed step prints `FAIL: <reason>` (plus the tail of the API/worker
logs) and the script exits non-zero. Success prints a `PASS: ...` line and
exits 0.

## Running it

```bash
docs/reviews/phase-1/gate.sh
```

Requirements: Node 20+, pnpm (via `corepack enable`), `curl`, a reachable
PostgreSQL at `DATABASE_URL` and Redis at `REDIS_URL` (see `.env.example` —
`infra/docker/docker-compose.yml` starts both; see
[docs/STATE.md](../../STATE.md)'s "Environment note" if `docker pull` is
blocked by an outbound proxy policy, as it was in this project's own
sandbox — a native `apt-get install postgresql redis-server` works too).
No Docker and no OPA instance are otherwise required.

## Known, documented limitations

- **OPA is not started.** `apps/api/src/lib/opa.ts`'s degraded mode still
  evaluates the same SoD policy data (`infra/opa/data/policy-data.json`)
  locally when OPA is unreachable, so this gate still exercises a real,
  data-driven SoD detection for `user-1` — just via the degraded fallback,
  not a live OPA call. The gate asserts on this honestly:
  `policyResult.degraded === true`, a non-empty `degradedReason`, and the
  stored audit event's description containing both `(policy flags present)`
  and `(degraded: ...)`. A real-OPA-reachable run is covered instead at the
  unit level, in `apps/api/test/opa.test.ts` (mocked `fetch`), since standing
  up a live OPA instance in this sandbox was blocked the same way Docker Hub
  pulls were (see `docs/STATE.md`).
- This gate does not start Postgres, Redis, or OPA itself — only the
  application processes (API, worker). Bringing up infra is a separate,
  already-documented step (`make infra-up` / `docker compose`, or the native
  install workaround).

## Re-running after Phase 1 closes

Per `ENGINEERING_STANDARDS.md`, this script must stay green after the phase
closes — it is a regression test, not a one-time ceremony. If a later change
breaks it, that is a bug in that change, not in this script.
