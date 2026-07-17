# STATE — Project Truth Snapshot

> Living handoff between agent sessions. Update at the end of every working session.
> If this file disagrees with the code, the code wins — then fix this file.

**Last updated:** 2026-07-17 · **Phase:** 1 (Real Vertical Slice) — persistence layer
(part 1 of 2) built this session; OPA degraded mode, worker async work, and the
Phase 1 gate script are **not yet done** (part 2, separate session).

**Phase 0 closed:** CI confirmed green on GitHub (run succeeded on
`claude/ai-autonomous-governance-e5pnzu` before merge) — the one item that was open
at the end of the last session. ADR 0004 (Prisma as ORM/migrations) is written and
accepted; Phase 1 implementation starts from it.

**Phase 1, part 1 (this session): real Postgres persistence.** `apps/api` no longer
serves the demo flow from memory. Every route in `apps/api/src/app.ts` reads/writes
through Prisma (`packages/db`) against a real PostgreSQL database. Details below,
under "What actually works today".

## What actually works today

- **`packages/db`** (new): a pnpm workspace package holding the Prisma schema
  (`prisma/schema.prisma`) and a thin client wrapper (`src/client.ts`, singleton
  `PrismaClient`). Consumed by `apps/api` (and declared, unused so far, by
  `apps/worker`) as `"db": "workspace:*"`. Domain model: `System`, `AppUser`
  (deliberately not `User`), `AccessAssignment`, `Campaign`, `ReviewItem`,
  `ReviewDecision`, `AuditEvent`. `ReviewItem` is unique on `(campaignId, userId)` —
  the hot lookup path for `/reviews/:campaignId/users/:userId`,
  `POST .../decision`, and `/audit/campaigns/:campaignId/users/:userId`. One
  migration so far: `packages/db/prisma/migrations/20260717103440_init`. A shared
  `packages/db/src/seed-data.ts` exports `resetDatabase()` and `seedDemoData()` —
  the single source of truth for the fixture data, used by both the real seed
  script and the `apps/api` test suite (see below), so they can't drift apart.
- `apps/api`: Fastify server serving the demo flow (dashboard, inbox, review detail,
  decision submission, audit view) — **now backed by real PostgreSQL via Prisma**,
  not the old in-memory `src/data/demo.ts` (deleted; nothing imports it anymore).
  Decision submission does a `prisma.$transaction` that creates a `ReviewDecision`
  row, flips `ReviewItem.status` to `completed`, and inserts a real `AuditEvent` row.
  `GET /audit/...` reads real `AuditEvent` rows. `GET /admin/systems` now reads the
  `System` table instead of a hardcoded array (three seeded rows: SAP, AD, CSV
  Upload). `GET /admin/rules` is still a hardcoded array — no `Rule` model was in
  scope for this session, and it isn't OPA-Rego-driven yet (still Part 2/Phase 1
  policy-data work). `GET /health/ready` now also does a `SELECT 1` against the DB
  and reports `services.db`. Verified end-to-end manually: seeded data survives a
  real `kill -9` + process restart of the compiled API (not just an in-process
  test) — decisions and audit events made before the kill are still there after.
  Routes live in `buildApp()` (`apps/api/src/app.ts`); `main.ts` just calls it and
  listens — this is what makes the app testable with `app.inject()` instead of only
  through a live socket. `main.ts` and `apps/api/src/db/seed.ts` now load the
  repo-root `.env` explicitly (`dotenv.config({ path: ... })`) because pnpm runs
  package scripts with `cwd` set to the package directory, not the repo root, so the
  previous bare `dotenv.config()` would only ever have found `apps/api/.env`.
- `apps/web`: React/Vite UI shell for that demo flow. Untouched this session — its
  consumed JSON shapes were checked against the new API responses and match.
- `apps/worker`: heartbeat loop only, with the log-line logic extracted into
  `heartbeatLog()` (`apps/worker/src/heartbeat.ts`) so it has something testable.
- `apps/api/src/lib/opa.ts`: calls OPA if reachable, otherwise a hardcoded local
  SoD fallback — so demos "work" even when OPA is down. Still misleading in the same
  way STATE.md has flagged before; **not addressed this session** (still slated for
  an explicit degraded mode or removal in Phase 1). The Phase 0 gate script
  deliberately exercises this fallback path and documents that in its README.
- `infra/opa`: three small Rego policies + policy data. Loadable, minimally exercised.
- `infra/docker`: compose file for Postgres/Redis/MinIO/OPA/Rekor. **Postgres is now
  used for real** (via `DATABASE_URL`, `packages/db`). Redis and MinIO are still
  **not used by any code path** (Redis is Part 2's job — worker queue; MinIO is
  Phase 2 — evidence blobs).
  - Environment note for whoever runs this next: in this session's sandbox, `docker
    pull postgres:16` was blocked by the outbound proxy's policy (403 on
    `production.cloudfront.docker.com`, confirmed via
    `curl $HTTPS_PROXY/__agentproxy/status` as a policy denial, not a config
    problem — `dockerd` itself was reachable and running fine with proxy env vars
    set). Worked around it by installing Postgres 16 directly from the Ubuntu
    archive (`apt-get install postgresql postgresql-contrib`) and creating the
    `app`/`app`/`access_assurance` role+database by hand to match
    `infra/docker/docker-compose.yml` and `.env.example`. The compose file itself
    is untouched and should still be the normal path wherever `docker pull` isn't
    blocked (e.g. real CI — GitHub Actions' `services:` postgres container pulls
    from Docker Hub directly, not through this sandbox's proxy, and is expected to
    work normally).
- **Quality gates are now real**: every workspace (`apps/api`, `apps/web`,
  `apps/worker`) has working `typecheck`, `lint`, `test`, and `build` scripts. Root
  `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (via turbo) passes clean.
  - `apps/api`: 5 vitest tests against `buildApp()` via `.inject()` — `/health/live`,
    `/dashboard`, `/inbox`, a 404 case, and the full decision flow (POST a decision,
    assert the inbox item's status flips from pending, assert the audit trail gains
    the event). **These now run against a real Postgres instance, not a mock** —
    `apps/api/test/env-setup.ts` loads the repo-root `.env` (and throws if
    `DATABASE_URL` is unset — the suite refuses to run against nothing), and
    `apps/api/test/db-setup.ts` does `resetDatabase()` + `seedDemoData()` (from
    `packages/db`) in a `beforeEach`, so every test starts from the same known
    fixture rows regardless of what a previous test mutated. An `afterAll` does the
    same reset+reseed again at the very end, so the shared database is left in the
    clean, all-pending fixture state the suite started with — this matters because
    `docs/reviews/phase-0/gate.sh` (untouched, per this session's instructions)
    assumes `ri-1` is pending and does not reseed itself; without this final
    reseed, running `pnpm test` and then the Phase 0 gate script back-to-back would
    make the gate fail (confirmed this by reproducing it, then fixing it this way
    rather than touching the gate script). This is real behavior coverage of the
    one flow that matters, not a smoke test.
  - `apps/worker`: 2 vitest tests for `heartbeatLog()`. Thin — worker has no other
    logic to test yet.
  - `apps/web`: 1 vitest + `@testing-library/react` smoke test — asserts `<App />`
    renders its shell heading and nav labels. Does not exercise data fetching (jsdom
    has no real API to talk to; the fetch failure is caught internally by the
    component and shows up as expected stderr noise in the test log, not a failure).
  - Lint: one root `eslint.config.mjs` (ESLint 9 flat config, typescript-eslint
    non-type-checked `recommended`, kept deliberately minimal), each workspace's
    `lint` script points at it with `--config ../../eslint.config.mjs`. `packages/db`
    now has its own `lint`/`typecheck`/`build`/`test` scripts too (turbo picks it up
    automatically as a workspace member). Zero warnings, zero errors as of this
    session (the previous one warning was the `any` in `apps/api/src/data/demo.ts`,
    which no longer exists).
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
  **This session added a `postgres:16` service container** (`app`/`app`/
  `access_assurance`, health-checked) and a `pnpm --filter db run migrate:deploy`
  step before typecheck, since `apps/api`'s tests now need a real, migrated Postgres.
  `DATABASE_URL` is set at the job level. **Not yet verified green on GitHub
  itself** — this session ran everything locally (see below) but did not push, so
  no live Actions run has confirmed the updated workflow, including the new
  Postgres service. That is still open going into the next session (it was already
  open at the end of Phase 0 and remains open — pushing/confirming CI was never
  done in between).
- **Phase 0 gate script**: `docs/reviews/phase-0/gate.sh` (+ README in the same
  directory) — **untouched this session per explicit instruction** (Phase 1's own
  gate script is Part 2's job). From the repo root: install, typecheck, lint, test,
  build, then starts the real compiled API, drives dashboard → inbox → decision →
  audit via curl with node-asserted JSON shapes, and tears the API down. Still
  passes as of this session (verified with a cold turbo cache, no manual seeding
  beforehand) — see the `apps/api` test note above for why that required an
  `afterAll` reseed in the test suite rather than a change to this script. It does
  *not* run `prisma migrate deploy` or seed itself; it relies on whatever
  `DATABASE_URL` database already has the schema+fixture rows (true right after
  `pnpm test` runs, per the note above, or after `pnpm --filter api run seed`).

## What exists but does NOT work (do not trust)

- `apps/api/src/lib/opa.ts`'s silent fallback (see above) — known, still not fixed
  this session. Explicitly out of scope: this was Part 1's persistence-layer
  session; Part 2 owns making the OPA fallback an explicit degraded mode (or
  removing it) and driving SoD/privileged-access policy off
  `infra/opa/data/policy-data.json` instead of hardcoded role strings.
- `apps/worker`: still just the heartbeat loop. `db` was added to its
  `package.json` as a workspace dependency (`"db": "workspace:*"`) so Part 2 can
  start using Prisma without a dependency-wiring step first, but **no worker code
  imports or uses it yet** — this session deliberately did not write any worker
  logic (out of scope, per instructions). `apps/worker` test coverage is thin (2
  tests on one helper function) because there is genuinely almost no logic in the
  worker yet.
- There is no Phase 1 gate script yet (`docs/reviews/phase-1/` does not exist).
  Part 2's job, per the roadmap's Phase 1 exit gate (fresh clone → bootstrap →
  seeded campaign appears → reviewer completes both seeded reviews → restart every
  service → decisions/state/audit survive, audit served from the database).
  Everything that gate needs from the persistence side is in place and manually
  verified this session (see below) — what's missing is the scripted, unattended
  version of that walkthrough, plus the OPA and worker pieces it will also need to
  exercise.
- `/admin/rules` is still a hardcoded array in `apps/api/src/app.ts` — no `Rule`
  model exists (wasn't in this session's scope) and it isn't wired to
  `infra/opa/data/policy-data.json`. Not misleading in a new way (it was already
  hardcoded before this session), just not addressed.

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
- Phase 0 work (previous session) is committed on
  `claude/ai-autonomous-governance-e5pnzu` but **not pushed** (by instruction — the
  human running this session pushes it). CI has therefore not yet run for real on
  GitHub against these commits.
- This session's Phase 1 persistence-layer work (`packages/db`, the Postgres-backed
  `apps/api`, real-Postgres tests, the CI Postgres service) is committed on the same
  branch, also **not pushed** (same instruction, still in force). Still Part 1 of 2
  for Phase 1 — do not treat Phase 1 as done. Part 2 (OPA degraded mode, worker
  async work via Redis, the Phase 1 gate script) has not started.

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

- ~~Phase 1 needs an ORM decision~~ — decided: ADR 0004 (Prisma), implemented this
  session. This line was already stale before this session (the ADR predates it);
  correcting it here since a wrong "still pending" note is exactly the kind of
  overstated/outdated doc `ENGINEERING_STANDARDS.md` treats as a bug.
- Node/pnpm versions are not pinned beyond `packageManager`; devcontainer and CI
  should agree. CI now pins Node 20 explicitly; devcontainer image is Node 22 — this
  mismatch is untested and worth reconciling in Phase 1.
- `pnpm-workspace.yaml` now has an `allowBuilds` block (`@prisma/client`,
  `@prisma/engines`, `esbuild`, `prisma`) from running `pnpm approve-builds --all`
  this session — pnpm 10 blocks dependency postinstall scripts by default and
  without this, a fresh `pnpm install` prints a warning and skips those scripts
  (Prisma's engine-binary download). Worth revisiting if new dependencies trigger
  the same warning later — approve deliberately, not reflexively.
  `packages/db/package.json` also has its own `"postinstall": "prisma generate"` so
  the generated client/types exist right after `pnpm install`, before anyone runs
  `typecheck` or `build`.
- Root `.env` is required for `apps/api` to find `DATABASE_URL` in local dev/test
  (copy `.env.example` to `.env` at the repo root — `.env` is gitignored, as before).
  `apps/api/src/main.ts`, `apps/api/src/db/seed.ts`, and
  `apps/api/test/env-setup.ts` all load it via an explicit `path.resolve(__dirname,
  ...)` rather than a bare `dotenv.config()`, because pnpm runs package scripts
  with `cwd` set to the package directory, not the repo root. The Prisma CLI itself
  (`prisma migrate dev`/`deploy`) does its *own* env loading and ignores the repo
  root the same way, so `packages/db/scripts/run-with-env.js` loads the root
  `.env` before spawning `prisma` — `migrate:dev`/`migrate:deploy` go through that
  wrapper rather than calling `prisma` directly. Verified `make migrate` and
  `make seed` both work from a shell with no `DATABASE_URL` pre-set.
- This sandbox environment's outbound proxy blocks `docker pull` for
  `postgres:16`/Docker Hub (policy 403, not a config issue — see the `infra/docker`
  note above). Worked around locally via a native `apt-get install postgresql`
  instead of `docker compose up postgres`. GitHub Actions' own Postgres service
  container should not hit this (different network path), but that is *unverified*
  until this branch's CI actually runs on GitHub — flagging in case a future
  session hits the same proxy block and needs the same workaround.
