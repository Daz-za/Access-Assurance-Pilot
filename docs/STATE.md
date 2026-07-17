# STATE — Project Truth Snapshot

> Living handoff between agent sessions. Update at the end of every working session.
> If this file disagrees with the code, the code wins — then fix this file.

**Last updated:** 2026-07-17 · **Phase:** 0 (Truth and Foundation) — exit gate passing

## What actually works today

- `apps/api`: Fastify server serving the demo flow (dashboard, inbox, review detail,
  decision submission, audit view) from **hardcoded in-memory data**
  (`src/data/demo.ts`). Decisions mutate memory only; everything resets on restart.
  Routes now live in `buildApp()` (`apps/api/src/app.ts`); `main.ts` just calls it and
  listens — this is what makes the app testable with `app.inject()` instead of only
  through a live socket.
- `apps/web`: React/Vite UI shell for that demo flow.
- `apps/worker`: heartbeat loop only, with the log-line logic extracted into
  `heartbeatLog()` (`apps/worker/src/heartbeat.ts`) so it has something testable.
- `apps/api/src/lib/opa.ts`: calls OPA if reachable, otherwise a hardcoded local
  SoD fallback — so demos "work" even when OPA is down. Still misleading in the same
  way STATE.md has flagged before; **not addressed this session** (still slated for
  an explicit degraded mode or removal in Phase 1). The Phase 0 gate script
  deliberately exercises this fallback path and documents that in its README.
- `infra/opa`: three small Rego policies + policy data. Loadable, minimally exercised.
- `infra/docker`: compose file for Postgres/Redis/MinIO/OPA/Rekor. Postgres, Redis,
  and MinIO are **not used by any code path** yet.
- **Quality gates are now real**: every workspace (`apps/api`, `apps/web`,
  `apps/worker`) has working `typecheck`, `lint`, `test`, and `build` scripts. Root
  `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (via turbo) passes clean.
  - `apps/api`: 5 vitest tests against `buildApp()` via `.inject()` — `/health/live`,
    `/dashboard`, `/inbox`, a 404 case, and the full decision flow (POST a decision,
    assert the inbox item's status flips from pending, assert the audit trail gains
    the event). This is real behavior coverage of the one flow that matters, not a
    smoke test.
  - `apps/worker`: 2 vitest tests for `heartbeatLog()`. Thin — worker has no other
    logic to test yet.
  - `apps/web`: 1 vitest + `@testing-library/react` smoke test — asserts `<App />`
    renders its shell heading and nav labels. Does not exercise data fetching (jsdom
    has no real API to talk to; the fetch failure is caught internally by the
    component and shows up as expected stderr noise in the test log, not a failure).
  - Lint: one root `eslint.config.mjs` (ESLint 9 flat config, typescript-eslint
    non-type-checked `recommended`, kept deliberately minimal), each workspace's
    `lint` script points at it with `--config ../../eslint.config.mjs`. Currently one
    warning (pre-existing `any` in `apps/api/src/data/demo.ts`), zero errors.
  - Fixed along the way: `apps/api` and `apps/worker` were compiling to ESM
    (`module: "ESNext"`) inherited from `tsconfig.base.json`. `tsc` never complained,
    but `node dist/main.js` crashed with `ERR_MODULE_NOT_FOUND` — nothing had ever
    actually run the compiled build before this session. Switched both to
    `module: "CommonJS"` / `moduleResolution: "Node10"`, verified by running the
    compiled API directly and hitting `/health/live`.
- **CI**: `.github/workflows/ci.yml` runs on push and pull_request — checkout, Node
  20 + corepack pnpm, `pnpm install --frozen-lockfile`, then typecheck/lint/test/build.
  `pnpm-lock.yaml` is now committed (it was in `.gitignore` before, which would have
  made `--frozen-lockfile` impossible in CI — fixed).
  **Not yet verified green on GitHub itself** — this session ran everything locally
  (see below) but did not push, so no live Actions run has confirmed it. That is the
  one Phase 0 exit-gate item still open going into the next session.
- **Phase 0 gate script**: `docs/reviews/phase-0/gate.sh` (+ README in the same
  directory). From the repo root: install, typecheck, lint, test, build, then starts
  the real compiled API, drives dashboard → inbox → decision → audit via curl with
  node-asserted JSON shapes, and tears the API down. Exits non-zero with a clear
  `FAIL: <reason>` on any failure, prints `PASS: ...` on success. Verified both paths
  this session (ran it clean, then deliberately broke one assertion to confirm it
  fails loudly and still cleans up, then reverted).

## What exists but does NOT work (do not trust)

- `apps/api/src/db/seed.ts`: still a stub (no database exists yet to seed). It now
  prints `"db:seed is not implemented yet (Phase 1) — no database exists to seed."`
  instead of the previous false `"Demo seed complete."` claim.
- `apps/api/src/lib/opa.ts`'s silent fallback (see above) — known, not fixed.
- No persistence anywhere; every service is memory-only or a heartbeat.
- `apps/worker` test coverage is thin (2 tests on one helper function) because there
  is genuinely almost no logic in the worker yet.

## Removed this session (Phase 0 dead-code cleanup)

- `apps/api/src/modules/**` and `apps/worker/src/modules/**` (audit, dashboard,
  evidence, integrity, reviews service files) — every one of them imported a Prisma
  client from `lib/db`, which does not exist anywhere in the repo, and none were
  imported from `apps/api/src/main.ts` or `apps/worker/src/main.ts` (confirmed by
  grep before deleting). Dead scaffolding, per `ENGINEERING_STANDARDS.md`.
- `apps/api/src/lib/rekor.ts`, `apps/api/src/lib/storage.ts`,
  `apps/api/src/lib/canonicalize.ts` — same story: unreachable from any entrypoint,
  and `rekor.ts` used `axios`, which was never even a declared dependency (further
  proof this code had never run).
- `Makefile` targets `k8s-render` (referenced nonexistent `infra/k8s`), `rekor-verify`
  (empty stub), and `migrate` (called a `db:migrate` script that does not exist —
  `apps/api/package.json` only has `migrate`, itself an echo stub). `seed` was also
  broken (called `db:seed`, but the real script is named `seed`) — fixed rather than
  removed, since the underlying script is honest now.

## In flight

- Governance reboot (previous commits): CLAUDE.md, charter, operating model, roadmap,
  engineering standards, ADRs 0001–0003, honest README/architecture docs.
- This session's Phase 0 work is committed on
  `claude/ai-autonomous-governance-e5pnzu` but **not pushed** (by instruction — the
  human running this session pushes it). CI has therefore not yet run for real on
  GitHub against these commits.

## Next session should

1. Push this branch, open/merge the PR, and confirm `.github/workflows/ci.yml`
   actually goes green on GitHub — this session verified everything locally but a
   real CI run is the only thing that closes the roadmap's "CI is green on main"
   exit-gate item.
2. Start Phase 1: pick an ORM (ADR pending, see below), stand up real Postgres
   persistence, and remove or replace the OPA local fallback with an explicit
   degraded mode.
3. Consider whether `apps/worker` needs anything beyond the heartbeat before Phase 1
   async work (snapshot capture, audit event writing) lands — right now there's
   nothing there to build on.

## Known risks / open questions

- Phase 1 needs an ORM decision (ADR pending): Prisma vs. plain SQL/kysely.
- Node/pnpm versions are not pinned beyond `packageManager`; devcontainer and CI
  should agree. CI now pins Node 20 explicitly; devcontainer image is Node 22 — this
  mismatch is untested and worth reconciling in Phase 1.
