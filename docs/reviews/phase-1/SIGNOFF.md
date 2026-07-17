# Phase 1 gate sign-off — Real Vertical Slice

Signed off: 2026-07-17, by the orchestrating session, per `docs/governance/
OPERATING_MODEL.md` ("declaring a phase gate passed" is an agent decision, but never
delegated to a subagent — see `CLAUDE.md`'s model-tiering policy). This is the gate
review pack referenced there: the reproduction script, expected outcome, and this
summary of what was built, what was cut, and what is known to be weak.

## Gate criterion (docs/governance/ROADMAP.md, Phase 1)

> Fresh clone → bootstrap → seeded campaign appears → reviewer completes both seeded
> reviews → restart every service → decisions, state, and audit trail survive; audit
> trail is served from the database, not memory.

**Reproduce with:** `docs/reviews/phase-1/gate.sh` (see its README for exactly what
it does). Also re-run `docs/reviews/phase-0/gate.sh` — it must stay green as a
regression test per `ENGINEERING_STANDARDS.md`, and now also proves the async
audit-event path via the worker's Redis queue.

**Verdict: PASS.** Both gate scripts were run to completion by the orchestrating
session (not just reported by a delegated agent) against a real Postgres and Redis,
including a hard `kill -9` of both the API and worker processes mid-flow and a
restart, with decisions, inbox state, and the audit trail confirmed intact afterward
— all served from PostgreSQL, not the old in-memory demo data. CI is confirmed green
on GitHub Actions for the final commit on this branch (not just locally), closing the
"CI is green" item Phase 0 had left open.

## What was built

- **Real persistence** (`packages/db`, Prisma): `System`, `AppUser`,
  `AccessAssignment`, `Campaign`, `ReviewItem`, `ReviewDecision`, `AuditEvent` — every
  API route reads/writes Postgres, replacing the deleted in-memory `demo.ts`.
- **Honest policy evaluation**: `apps/api/src/lib/opa.ts` no longer silently
  substitutes a hardcoded local check when OPA is unreachable. Every result is
  tagged `degraded: false` (real OPA) or `degraded: true` + a reason (local
  fallback), and a degraded decision's audit-trail entry says so explicitly. The
  Rego policies (`infra/opa/policies/*.rego`) read role pairs/privileged roles from
  `infra/opa/data/policy-data.json` instead of hardcoded literals.
- **Real async work**: `apps/worker` consumes a Redis-backed queue
  (`packages/queue`) to write `AuditEvent` rows — the API's decision route now only
  enqueues a job; the worker is the sole writer. Proven to survive a hard restart of
  both processes with Postgres/Redis left running.
- **Quality gates + CI**: `pnpm typecheck/lint/test/build` cover the new persistence,
  policy, and queue code (tests run against real Postgres/Redis, not mocks, per
  ADR 0004/`ENGINEERING_STANDARDS.md`). `.github/workflows/ci.yml` runs both a
  Postgres and a Redis service container.
- **ADR 0004**: Prisma as the ORM/migration tool, written and accepted before
  implementation.

## What was cut / deferred (not a regression — never in Phase 1's scope)

- Campaign management, multi-campaign UI, deadlines/overdue tracking — Phase 3.
- Authentication/authorization — Phase 3.
- `/admin/rules` remains a hardcoded array (not backed by a `Rule` model or
  `policy-data.json`) — not part of the roadmap's Phase 1 work items.
- MinIO and a live OPA server are still not exercised by any code path — Phase 2
  (evidence blobs) and an open follow-up (below), respectively.

## Known to be weak / carried into Phase 2

1. **The rewritten `.rego` files are unverified against a live OPA server.** This
   sandbox's outbound network policy blocked both `docker pull
   openpolicyagent/opa` and downloading a static OPA binary from GitHub Releases.
   The Rego was hand-reviewed against the language spec and is exercised
   thoroughly at the *degraded-fallback* level (which reads the same
   `policy-data.json`), but the non-degraded path (`opa.ts`'s `degraded: false`
   branch) is only unit-tested with a mocked `fetch`, not against a real OPA
   evaluation. First environment with unblocked registry/release access should
   confirm `data.access.sod` / `data.access.privileged` actually parse and
   evaluate as intended.
2. **`GET /health/ready` checks Postgres only, not Redis.** A Redis outage would
   make decision submission "succeed" (durably persisted) while silently queueing
   nothing for the worker — logged server-side (`app.log.error`) but not visible
   in the health check or to a caller. Small, worth fixing early in Phase 2.
3. **Dashboard's `violationsDetected` duplicates `pendingReviews`** (both count
   pending review items) — cosmetically fine for now but not a distinct signal;
   revisit once real violation detection has its own model.
4. One environment-specific finding worth carrying forward: Turborepo 2.x strips
   undeclared environment variables from task child processes. This is now fixed
   (`turbo.json`'s `globalEnv`), but it's a reminder to verify new env vars this
   project introduces (e.g. Phase 2's signing key path) are added there too, and to
   test CI behavior without relying on a local `.env` file masking gaps.

## Verification trail

- Local: `pnpm install`, `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
  (from a `dist/`-deleted state, and again with no `.env` file present, matching
  CI's actual environment), `docs/reviews/phase-0/gate.sh`, `docs/reviews/phase-1/
  gate.sh` — all pass.
- GitHub Actions: run succeeded on this branch's final commit
  (`.github/workflows/ci.yml`, `typecheck, lint, test, build` job), with real
  Postgres and Redis service containers.
