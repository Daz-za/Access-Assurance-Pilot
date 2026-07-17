# STATE — Project Truth Snapshot

> Living handoff between agent sessions. Update at the end of every working session.
> If this file disagrees with the code, the code wins — then fix this file.

**Last updated:** 2026-07-17 · **Phase:** 1 (Real Vertical Slice) — both parts of the
roadmap's implementation work are now built and verified locally: part 1 (Postgres
persistence) and part 2 (OPA degraded mode + data-driven Rego, worker async work over
Redis, the Phase 1 exit-gate script). **This does not mean the Phase 1 roadmap gate is
declared passed** — per `CLAUDE.md`'s model-tiering policy, a delegated session does
not sign off a phase gate; that is the orchestrating session's call, after its own
independent re-verification (same as Part 1).

**Phase 0 closed:** CI confirmed green on GitHub (run succeeded on
`claude/ai-autonomous-governance-e5pnzu` before merge) — the one item that was open
at the end of the last session. ADR 0004 (Prisma as ORM/migrations) is written and
accepted; Phase 1 implementation starts from it.

**Phase 1, part 1 (earlier session): real Postgres persistence.** `apps/api` no longer
serves the demo flow from memory. Every route in `apps/api/src/app.ts` reads/writes
through Prisma (`packages/db`) against a real PostgreSQL database. Details below,
under "What actually works today".

**Phase 1, part 2 (this session): OPA degraded mode, worker async work, Phase 1 gate
script.** Summary (full detail in "What actually works today" below):
- `apps/api/src/lib/opa.ts`'s OPA fallback is no longer silent or identical-looking to
  a real evaluation: every result is now tagged `degraded: false` (OPA reachable) or
  `degraded: true` + a `degradedReason` string (OPA unreachable, or a non-2xx
  response). The degraded fallback reads the same `sodPairs` data
  (`infra/opa/data/policy-data.json`) the real policy uses, instead of a hardcoded
  literal, so it can't silently drift from the real policy. `infra/opa/policies/
  sod.rego` and `privileged.rego` were rewritten to read `data.tenants.default.
  sodPairs` / `data.tenants.default.privilegedRoles` instead of hardcoded role-name
  literals.
- A new `packages/queue` workspace package (thin `ioredis`-based list queue —
  `LPUSH`/`BRPOP`, not BullMQ; see the package's own header comment for the reversible
  implementation-choice rationale) is the shared contract between `apps/api` (producer:
  the decision route enqueues an audit-event job instead of writing the row itself) and
  `apps/worker` (consumer: the *only* thing that now calls `prisma.auditEvent.create`).
- `docs/reviews/phase-1/gate.sh` (+ README) is new: fresh-enough state -> install ->
  migrate -> reseed -> four quality gates -> start the real compiled API and worker ->
  drive both seeded reviews to completion (asserting a real, data-driven SoD flag for
  user-1 and an honest degraded-mode tag on its `policyResult`) -> poll for both audit
  events (now async) -> hard-kill and restart both processes (Postgres/Redis untouched)
  -> confirm the inbox and both audit trails survived. Passes locally (see the
  Verification note at the end of this section).
- `docs/reviews/phase-0/gate.sh` was fixed: it now reseeds itself at the start (it
  previously assumed `ri-1` was pending and never reseeded, which stopped being safe
  once Part 1 made the demo flow Postgres-backed instead of in-memory), and now also
  starts the compiled worker and polls for the audit event, since audit-event writing
  is asynchronous as of this session. Its header comment is corrected: OPA/Docker are
  still not required, but a reachable, migrated Postgres now is.
- A real, pre-existing gap surfaced and fixed along the way: `turbo.json`'s
  `typecheck`/`test` tasks had no `dependsOn: ["^build"]`, so on a truly fresh clone (no
  `packages/db/dist`, which is gitignored) `pnpm typecheck` and `pnpm test` would fail
  with `Cannot find module 'db'` — nothing had actually forced `packages/db` (or now
  `packages/queue`) to build before a dependent package's typecheck/test ran. This
  predates this session (Part 1's `packages/db` had the same latent issue; it likely
  went unnoticed because a locally-built `dist/` was already present whenever it was
  tested by hand). Fixed by adding `"dependsOn": ["^build"]` to both tasks in
  `turbo.json`. Verified by deleting every workspace's `dist/` and re-running `pnpm
  typecheck && pnpm lint && pnpm test && pnpm build` as one chained command from that
  state — turbo now builds `db`/`queue` first as a side effect, and the chain passes.
- A real, pre-existing gap in the seed data was also fixed: `packages/db/src/
  seed-data.ts`'s `asg-1` gave user-1 the `FI Admin` role and a *message* describing an
  "SoD violation: FI Admin + AP Payments", but never actually assigned user-1 the `AP
  Payments` role — so `evaluateSodPolicy` could never produce a real, non-empty `deny`
  for user-1, via OPA or the fallback, regardless of this session's changes. Added
  `asg-4` (user-1, `AP Payments`, `sys-1`) so the seeded SoD case is real, not cosmetic.
  This is additive seed data only — no schema change.

**Verification this session:** `pnpm install`, `pnpm typecheck && pnpm lint && pnpm
test && pnpm build` (chained, from a `dist/`-deleted state), `docs/reviews/phase-0/
gate.sh`, and `docs/reviews/phase-1/gate.sh` all run and pass locally, against a real
Postgres (native `apt-get install postgresql`, same workaround Part 1 used — see the
`infra/docker` note below) and a real Redis (native `apt-get install redis-server`,
same reasoning).

**Orchestrating-session fix (after Part 2, before sign-off):** pushing Part 1 and Part
2 to GitHub surfaced a real CI-only bug neither local run caught: `apps/api`'s and
`apps/worker`'s test suites failed on GitHub Actions with `DATABASE_URL is not set` /
`REDIS_URL is not set`, even though the workflow's job-level `env:` block sets both.
Root cause: Turborepo 2.x strips environment variables that aren't explicitly
declared in `turbo.json` from a task's child process — `DATABASE_URL`/`REDIS_URL`
were never declared, so `turbo run test` silently dropped them even though the
GitHub Actions *job* had them set. This was invisible in every local run so far
because a local `.env` file (created early in Phase 1 for Prisma CLI convenience, and
never committed — it's gitignored) fed the same values in through `env-setup.ts`'s
`dotenv.config()` fallback, masking the gap. Reproduced locally by temporarily
removing `.env` and running `pnpm test`/`typecheck`/`build` via shell-exported
env vars only (matching CI's setup exactly) — confirmed the failure, then fixed it by
adding `"globalEnv": ["DATABASE_URL", "REDIS_URL", "OPA_URL", "AUDIT_EVENT_QUEUE_KEY"]`
to `turbo.json`, and reproduced success the same way (no `.env` file, shell env vars
only) before re-verifying with `.env` restored and running both gate scripts again.
This commit is about to be pushed; CI confirmation on GitHub Actions is the next
step, not yet claimed here — see the top-of-file "Last updated" line for whether
that's since been confirmed.

## What actually works today

- **`packages/db`**: a pnpm workspace package holding the Prisma schema
  (`prisma/schema.prisma`) and a thin client wrapper (`src/client.ts`, singleton
  `PrismaClient`). Consumed by `apps/api`, `apps/worker`, and now `packages/queue` as
  `"db": "workspace:*"`. Domain model: `System`, `AppUser`
  (deliberately not `User`), `AccessAssignment`, `Campaign`, `ReviewItem`,
  `ReviewDecision`, `AuditEvent`. `ReviewItem` is unique on `(campaignId, userId)` —
  the hot lookup path for `/reviews/:campaignId/users/:userId`,
  `POST .../decision`, and `/audit/campaigns/:campaignId/users/:userId`. One
  migration so far: `packages/db/prisma/migrations/20260717103440_init` (unchanged
  this session — the seed-data fix below is fixture data, not a schema change). A
  shared `packages/db/src/seed-data.ts` exports `resetDatabase()` and
  `seedDemoData()` — the single source of truth for the fixture data, used by the
  real seed script and the `apps/api`/`apps/worker` test suites, so they can't drift
  apart. This session added `asg-4` (user-1, `AP Payments`, `sys-1`) — without it,
  user-1's SoD case (`FI Admin` + `AP Payments`) could never actually be detected by
  `evaluateSodPolicy`, since user-1 never had the `AP Payments` role assigned; the
  `message` field on `asg-1` described a violation the actual assignment data
  couldn't reproduce.
- **`packages/queue`** (new): a small `ioredis`-based Redis list queue
  (`LPUSH`/`BRPOP`, key `audit-events`, overridable via `AUDIT_EVENT_QUEUE_KEY` — see
  below for why). Exports `enqueueAuditEvent` (producer), `dequeueAuditEvent` +
  `applyAuditEventJob` + `consumeOne` (consumer primitives), and `createRedisClient`.
  Shared by `apps/api` (producer) and `apps/worker` (consumer) so the queue key and
  job shape can't drift between the two. Reversible implementation choice, no ADR
  (per this task's own instruction): a hand-rolled list queue was chosen over BullMQ
  because there's exactly one job type, no retries/scheduling/priorities needed yet —
  revisit if Phase 2+ needs that machinery.
- `apps/api`: Fastify server serving the demo flow (dashboard, inbox, review detail,
  decision submission, audit view) — backed by real PostgreSQL via Prisma, not the
  old in-memory `src/data/demo.ts` (deleted in Phase 0; nothing imports it anymore).
  Decision submission does a `prisma.$transaction` that creates a `ReviewDecision`
  row (storing the *full* `policyResult`, including `degraded`/`degradedReason`) and
  flips `ReviewItem.status` to `completed` — **audit-event writing is no longer part
  of that transaction**: the route now enqueues an `AuditEventJob` onto Redis
  (`packages/queue`) instead of writing the `AuditEvent` row itself; `apps/worker` is
  the only thing that does that now (see below). The audit description gets an
  honest `" (degraded: <reason>, local fallback used)"` suffix whenever
  `evaluateSodPolicy` had to fall back — the audit trail must never make a degraded
  policy evaluation look identical to a real one. `GET /audit/...` still reads real
  `AuditEvent` rows (now written asynchronously). `GET /admin/systems` reads the
  `System` table. `GET /admin/rules` is still a hardcoded array — no `Rule` model
  exists and it isn't OPA-Rego-driven; out of scope for both Phase 1 sessions.
  `GET /health/ready` does a `SELECT 1` against the DB and reports `services.db` (it
  does not yet check Redis reachability — a gap, see "What exists but does NOT work"
  below). Verified end-to-end manually: seeded data, decisions, and audit events
  survive a real `kill -9` + restart of both the compiled API *and* worker (not just
  an in-process test; not just the API alone, now that audit writing is async).
  Routes live in `buildApp()` (`apps/api/src/app.ts`); `main.ts` just calls it and
  listens. `main.ts` and `apps/api/src/db/seed.ts` load the repo-root `.env`
  explicitly, same as before.
- `apps/api/src/lib/opa.ts`: **no longer a silent fallback.** `evaluateSodPolicy`
  always returns `{ result: { deny }, degraded, degradedReason? }`. On a reachable,
  2xx OPA response: `degraded: false`. On any failure (network error / OPA
  unreachable, or a non-2xx status): `degraded: true` with a `degradedReason` string
  (`"OPA unreachable: <message>"` or `"OPA returned non-2xx status (<code>)"`), and a
  local fallback evaluation that reads `infra/opa/data/policy-data.json`'s
  `sodPairs` at runtime (via `fs.readFileSync` + `JSON.parse`, not a hardcoded
  literal and not a static `import ... json` — the file lives outside `apps/api`'s
  tsconfig `rootDir`, which a compile-time JSON-module import would reject) — so the
  fallback can't silently drift from the real policy data. `infra/opa/policies/
  sod.rego` and `privileged.rego` were rewritten (Rego v1 syntax, `import rego.v1`)
  to read `data.tenants.default.sodPairs` / `data.tenants.default.privilegedRoles`
  instead of hardcoded role-name literals. **Caveat:** the rewritten `.rego` files
  could not be validated against a real, running OPA binary in this sandbox —
  `docker pull openpolicyagent/opa` hit the same outbound-proxy 403 Part 1 hit for
  `postgres:16` (see the `infra/docker` note below), and downloading a static OPA
  binary from GitHub Releases was blocked the same way (proxy 403 on
  `github.com`/release assets too). The Rego was written carefully against the
  language spec and reviewed, but is **unverified against a live OPA instance** — a
  real gap, flagged here rather than glossed over. The "OPA reachable" code path
  (`degraded: false`) is covered instead at the unit level in
  `apps/api/test/opa.test.ts` via a mocked `fetch`, which at least proves `opa.ts`'s
  own logic branches correctly; it does not prove the actual `.rego` files parse and
  evaluate correctly inside a real OPA server. Next session with network access to
  Docker Hub or GitHub Releases should confirm this.
- `apps/worker`: no longer just a heartbeat loop. `apps/worker/src/queueConsumer.ts`
  exports `runConsumerLoop(prisma, redis, options)` — repeatedly calls
  `packages/queue`'s `consumeOne` (dequeue + `prisma.auditEvent.create`) until told to
  stop; `main.ts` calls it with no stop condition (runs forever) alongside the
  pre-existing heartbeat `setInterval`. This is the "real async work" the Phase 1
  roadmap item asks for: apps/worker is now the *only* code path that writes
  `AuditEvent` rows. `main.ts` now also loads the repo-root `.env` explicitly (same
  fix `apps/api/src/main.ts` already needed — bare `dotenv.config()` only ever found
  `apps/worker/.env`, which doesn't exist).
- `apps/web`: React/Vite UI shell for the demo flow. Untouched this session — its
  consumed JSON shapes were checked against the new API responses and still match
  (the `policyResult` shape gained fields but nothing existing changed shape).
- `infra/opa`: two small Rego policies + policy data, now data-driven (see above) —
  loadable (checked by eye against the Rego v1 spec), still **not verified against a
  live OPA binary** in this sandbox (see the caveat above).
- `infra/docker`: compose file for Postgres/Redis/MinIO/OPA/Rekor. Postgres and Redis
  are now both used for real (`DATABASE_URL`/`packages/db`, `REDIS_URL`/
  `packages/queue`). MinIO and OPA (as a running server) are still **not used by any
  code path** — MinIO is Phase 2 (evidence blobs); OPA's data files are read directly
  by `apps/api/src/lib/opa.ts`'s degraded-mode fallback, but no code path actually
  calls a running OPA server in this sandbox (see the caveat above) or in CI (no OPA
  service container was added to `.github/workflows/ci.yml` — not needed for the
  degraded-mode-only code paths currently exercised).
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
    work normally). **This session hit the identical block** trying `docker pull
    openpolicyagent/opa:latest` (same 403, same proxy) and trying to download a
    static OPA binary from `github.com/open-policy-agent/opa/releases` (403 from the
    same proxy on `github.com` release assets too) — so unlike Postgres, there was no
    "install it natively instead" escape hatch available for OPA in this sandbox (no
    `apt` package exists for it). Worked around by installing **Redis** natively the
    same way Postgres was (`apt-get install redis-server`; the binary was already
    present in this sandbox's image, just not started — `service redis-server
    start`), which unblocked the queue work, but OPA itself remains genuinely
    un-run in this environment. Both `infra/docker/docker-compose.yml`'s `redis` and
    `opa` services are untouched and should work normally wherever Docker Hub/GitHub
    Releases aren't proxy-blocked.
- **Quality gates are real**: every workspace (`apps/api`, `apps/web`, `apps/worker`,
  `packages/db`, `packages/queue`) has working `typecheck`, `lint`, `test`, and
  `build` scripts. Root `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (via
  turbo) passes clean — verified this session from a `dist/`-deleted state (see the
  `turbo.json` fix above), not just from a warm cache.
  - `apps/api`: 10 vitest tests across two files. `test/app.test.ts` (5 tests):
    `/health/live`, `/dashboard`, `/inbox`, a 404 case, and the full decision flow —
    now asserting the *degraded* SoD flag path honestly (no OPA runs in this test
    environment, so `policyResult.degraded` is asserted `true`, with a
    `degradedReason` matching `/OPA unreachable/`, and the stored `ReviewDecision.
    policyResult` is checked directly via Prisma, not just the HTTP echo), and
    polling `GET /audit/...` with a bounded ~2s/50ms retry loop instead of assuming
    the audit event exists immediately (it's written asynchronously by the queue
    consumer now — see below). `test/opa.test.ts` (5 tests, new): unit-level coverage
    of `evaluateSodPolicy` via a mocked `global.fetch` (vitest's `vi.fn()`, no new
    HTTP-mocking dependency) — OPA reachable, OPA unreachable, OPA non-2xx, an
    empty-deny role set through the fallback, and a mocked-2xx empty-deny result
    (proving a real "no violation" result isn't mislabeled degraded). Both still run
    against a real Postgres, per ADR 0004/ENGINEERING_STANDARDS — no mocked Prisma.
    `apps/api/test/db-setup.ts` now also runs an inline stand-in "worker": a
    background loop using `packages/queue`'s `dequeueAuditEvent` +
    `applyAuditEventJob` for the lifetime of the test file, so `GET /audit/...`
    assertions against the real (async) audit trail don't need a second OS process.
    **`apps/api/vitest.config.ts` sets `fileParallelism: false`** — discovered this
    session that vitest's default per-file worker parallelism gave each test file its
    own copy of `db-setup.ts`'s reset cycle *and* inline consumer loop, and since
    Postgres/Redis are one real shared instance (not sandboxed per worker), two test
    files' independent loops raced each other (one file's consumer could steal
    another's queued job; one file's `beforeEach` reset could wipe a row the other
    was mid-poll for) — reproduced as a real flaky failure, then fixed this way
    rather than papering over it with a longer timeout.
  - `apps/worker`: 5 vitest tests across two files. `test/heartbeat.test.ts` (2
    tests, unchanged). `test/queueConsumer.test.ts` (3 tests, new): real Redis + real
    Postgres — enqueue a job and confirm `runConsumerLoop` dequeues and writes it
    (checked via Prisma directly), confirm a job with no `timestamp` gets one stamped
    by the consumer, and confirm the loop terminates within its poll timeout against
    an empty queue rather than hanging. Uses its own queue key
    (`AUDIT_EVENT_QUEUE_KEY=audit-events-worker-test`, set in
    `apps/worker/test/env-setup.ts` before anything imports `packages/queue`) so it
    can't cross-drain jobs with `apps/api`'s test suite when `turbo run test` runs
    both as concurrent processes against the same Redis instance.
  - `apps/web`: unchanged (1 vitest smoke test).
  - `packages/db`, `packages/queue`: no unit tests of their own (thin wrappers,
    schema/client only) — exercised via `apps/api`'s and `apps/worker`'s integration
    tests, same posture `packages/db` already had.
  - Lint: unchanged — one root `eslint.config.mjs`, zero warnings/errors, now also
    covering `packages/queue` and the new test/source files.
- **CI**: `.github/workflows/ci.yml` — unchanged structure (checkout, Node 20,
  corepack pnpm, install, migrate, typecheck/lint/test/build), **this session added a
  `redis:7` service container** (health-checked via `redis-cli ping`) alongside the
  existing `postgres:16` one, and `REDIS_URL: redis://localhost:6379` at the job
  level, since `apps/api`'s and `apps/worker`'s test suites now need a real Redis too.
  **Still not verified green on GitHub itself** — same open item Part 1 left; this
  session ran everything locally (see the Verification note above) but did not push.
- **Phase 0 gate script**: `docs/reviews/phase-0/gate.sh` (+ README) — fixed this
  session (previously untouched-by-instruction, now genuinely needed a fix): it now
  reseeds itself (`pnpm --filter db run build` + `migrate:deploy` + `pnpm --filter
  api run seed`) right after `pnpm install`, so it's self-contained regardless of
  prior state (previously assumed `ri-1` was pending and never reseeded — no longer
  safe once Part 1 made the demo Postgres-backed). It also now starts the compiled
  worker alongside the API (audit-event writing is asynchronous as of this session —
  without a worker running, the audit-trail assertion could never pass) and polls
  `GET /audit/...` with a bounded retry instead of checking once immediately. Header
  comment corrected: OPA/Docker are still not required (the degraded fallback still
  works), but a reachable, migrated Postgres (and now Redis, for the worker) is.
  Verified passing end-to-end this session, from a state this session did not
  hand-seed as its only proof of the reseed step's own doing.
- **Phase 1 gate script** (new): `docs/reviews/phase-1/gate.sh` (+ README) — see the
  Part 2 summary above for what it does. Verified passing end-to-end this session.

## What exists but does NOT work (do not trust)

- **The rewritten `.rego` files are unverified against a live OPA instance** (see the
  caveat under `apps/api/src/lib/opa.ts` above) — Docker Hub and GitHub Releases were
  both proxy-blocked in this sandbox. They're reviewed by hand against the Rego v1
  spec, and `opa.ts`'s own branching logic is unit-tested, but nobody has actually
  run `data.access.sod`/`data.access.privileged` inside a real OPA server this
  session. Treat "OPA evaluated for real" as **partially** true until that's done:
  the degraded path is thoroughly real and honest; the non-degraded path's Rego is
  unverified.
- `apps/api/src/lib/opa.ts`'s local fallback resolves `infra/opa/data/policy-data.json`
  via a path relative to `__dirname` at runtime (four directories up from
  `apps/api/src/lib` or `apps/api/dist/lib`, either way lands on the repo root). This
  is fine for this monorepo's current deployment shape (everything runs from one
  checkout) but would break if `apps/api` were ever packaged/deployed independently
  of the rest of the repo (e.g. a standalone Docker image copying only `apps/api`'s
  build output) — flagging so a future session doesn't get a confusing
  `ENOENT` if that packaging change ever happens.
- `GET /health/ready` still only checks Postgres (`SELECT 1`); it does not check
  Redis reachability even though the decision route now depends on it to enqueue
  audit-event jobs. A Redis outage would make decisions "succeed" (they're still
  durably persisted) but silently queue nothing for the worker to ever write —
  `apps/api/src/app.ts`'s `try/catch` around `enqueueAuditEvent` logs loudly
  (`app.log.error`) rather than failing the request, which is a reasonable choice
  (the decision itself shouldn't fail over an audit-plumbing outage) but means
  nothing user-facing would flag it. Worth adding a `services.redis` check to
  `/health/ready` in a future session.
- `/admin/rules` is still a hardcoded array in `apps/api/src/app.ts` — no `Rule`
  model exists and it isn't wired to `infra/opa/data/policy-data.json`. Not
  misleading in a new way (already hardcoded before this session), just not
  addressed — out of scope for both Phase 1 sessions.

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
- Phase 1 persistence-layer work (`packages/db`, the Postgres-backed `apps/api`,
  real-Postgres tests, the CI Postgres service — part 1) and this session's OPA
  degraded mode / worker queue / Phase 1 gate script (part 2) are both committed on
  the same branch, still **not pushed** (by instruction — the orchestrating session
  re-verifies and pushes, same as it did for part 1). Do not treat the Phase 1
  roadmap gate as declared passed — that sign-off belongs to the orchestrating
  session, per `CLAUDE.md`'s model-tiering policy.

## Next session should

1. Push this branch, open/merge the PR, and confirm `.github/workflows/ci.yml`
   actually goes green on GitHub — this has been open since the end of Phase 0 and
   still is; a real CI run (now exercising both Postgres *and* Redis service
   containers) is the only thing that closes the roadmap's "CI is green on main"
   exit-gate item.
2. If/when this environment (or a future session's) has unblocked access to Docker
   Hub or GitHub Releases, actually stand up a real OPA instance and confirm
   `infra/opa/policies/sod.rego` and `privileged.rego` parse and evaluate correctly
   against `infra/opa/data/policy-data.json` — this is the one real gap left in "OPA
   evaluated for real" (see "What exists but does NOT work" above).
3. Add a `services.redis` check to `GET /health/ready` (currently Postgres-only) so a
   Redis outage is visible somewhere, not just silently logged server-side.
4. Phase 2 (evidence engine) is next per the roadmap — canonical evidence format,
   real signing, Rekor anchoring, the standalone verifier. Nothing in this session's
   work blocks starting that.

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
- The same proxy block hit `docker pull openpolicyagent/opa` and GitHub Releases
  downloads of a static OPA binary this session (see the `infra/docker` note above)
  — worked around for Redis (native `apt-get install redis-server`, binary was
  already present in the sandbox image) but there was no equivalent escape hatch for
  OPA (no native package). CI's OPA situation is moot for now since no code path
  calls a running OPA server yet from tests — this only matters for the "verify the
  real (non-degraded) Rego against a live OPA" follow-up above.
- `turbo.json`'s `typecheck` and `test` tasks now have `"dependsOn": ["^build"]`
  (added this session — see the Part 2 summary above). This was necessary for
  `packages/queue` (and, it turns out, was *already* silently necessary for
  `packages/db`, just unexercised until this session actually deleted `dist/` and
  tried a truly cold run) — since both packages' `main`/`types` fields point at
  `dist/*`, which is gitignored and only exists after a build. If a future session
  adds another workspace package other packages import at the TypeScript/module
  level, the same requirement applies automatically via `^build`; no further action
  needed unless a task other than `typecheck`/`test` starts needing it too.
- `apps/api`'s vitest suite now sets `fileParallelism: false` (see the Quality gates
  section above) to avoid cross-test-file races on the one real shared
  Postgres+Redis instance. This makes the suite slightly slower (test files run
  sequentially instead of in parallel workers) but correctness over speed was the
  right tradeoff for a suite this size. Revisit if the suite grows large enough for
  that to matter.
- `packages/queue`'s `AUDIT_EVENT_QUEUE_KEY` is overridable via the
  `AUDIT_EVENT_QUEUE_KEY` env var specifically so `apps/worker`'s own test suite
  (which sets it to `audit-events-worker-test`) doesn't cross-drain jobs with
  `apps/api`'s test suite (which uses the default `audit-events` key) when `turbo
  run test` runs both as concurrent processes against the same Redis instance. Real
  dev/prod usage (the actual `apps/api` producer and `apps/worker` consumer) always
  wants the shared default — don't set this env var outside test suites.
