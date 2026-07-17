# Phase 0 exit gate — Truth and Foundation

**Script:** `docs/reviews/phase-0/gate.sh`

## What it proves

Per `docs/governance/ROADMAP.md`, Phase 0's exit gate is:

> On a fresh clone, a single documented command sequence installs deps,
> starts the demo stack, and serves the existing demo flow (dashboard →
> inbox → decision → audit view). CI is green on main. No document in the
> repo describes anything that does not exist.

`gate.sh` runs that sequence unattended, from the repo root:

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck`
3. `pnpm lint`
4. `pnpm test`
5. `pnpm build`
6. Starts the compiled API (`apps/api/dist/main.js`) in the background.
7. Drives the demo flow with `curl` and asserts JSON shapes with `node`:
   - `GET /health/live` → `{ status: "ok" }`
   - `GET /dashboard` → numeric summary fields
   - `GET /inbox` → `ri-1` present with `status: "pending"`
   - `POST /reviews/camp-1/users/user-1/decision` → `{ ok: true, decision: "approve_all" }`
   - `GET /inbox` again → `ri-1` no longer pending (the decision mutated in-memory state)
   - `GET /audit/campaigns/camp-1/users/user-1` → an event describing the decision
8. Kills the API process.

Any failed step prints `FAIL: <reason>` (plus the tail of the API log, if
relevant) and the script exits non-zero. Success prints a `PASS: ...` line
and exits 0.

## Running it

```bash
docs/reviews/phase-0/gate.sh
```

Requirements: Node 20+, pnpm (via `corepack enable`), `curl`. No Docker, no
OPA instance, no Postgres/Redis/MinIO — none of those are on the demo flow's
critical path yet (see "What actually works today" in `docs/STATE.md`).

## Known, documented limitation

`apps/api/src/lib/opa.ts` calls a local OPA instance if `OPA_URL` is
reachable, and otherwise falls back to a hardcoded local SoD check. This
gate does not start OPA, so it always exercises the fallback path. That is
intentional for Phase 0 (a real OPA integration test is Phase 1 work, once
OPA is evaluated for real per the roadmap) — it is not silently masked: it
is documented here and in `docs/STATE.md`.

## Re-running after Phase 0 closes

Per `ENGINEERING_STANDARDS.md`, this script must stay green after the phase
closes — it is a regression test, not a one-time ceremony. If a later change
breaks it, that is a bug in that change, not in this script.
