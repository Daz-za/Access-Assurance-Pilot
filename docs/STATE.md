# STATE — Project Truth Snapshot

> Living handoff between agent sessions. Update at the end of every working session.
> If this file disagrees with the code, the code wins — then fix this file.

**Last updated:** 2026-07-17 · **Phase:** 0 (Truth and Foundation) — in progress

## What actually works today

- `apps/api`: Fastify server serving the demo flow (dashboard, inbox, review detail,
  decision submission, audit view) from **hardcoded in-memory data**
  (`src/data/demo.ts`). Decisions mutate memory only; everything resets on restart.
- `apps/web`: React/Vite UI shell for that demo flow.
- `apps/api/src/lib/opa.ts`: calls OPA if reachable, otherwise a hardcoded local
  SoD fallback — so demos "work" even when OPA is down (misleading; slated for
  an explicit degraded mode or removal in Phase 1).
- `infra/opa`: three small Rego policies + policy data. Loadable, minimally exercised.
- `infra/docker`: compose file for Postgres/Redis/MinIO/OPA/Rekor. Postgres, Redis,
  and MinIO are **not used by any code path** yet.

## What exists but does NOT work (do not trust)

- `apps/api/src/modules/**` and `apps/worker/src/modules/**`: import a Prisma client
  from `lib/db` that **does not exist**. Dead code, never wired into `main.ts`.
  Delete or make real in Phase 0/1.
- `apps/api/src/lib/rekor.ts`: submits a dummy-key entry a real Rekor would reject.
  Full replacement is Phase 2 work (see ADR 0003).
- `apps/api/src/db/seed.ts`: a `console.log` stub.
- `apps/worker`: heartbeat loop only.
- No tests exist anywhere. No CI exists.
- README previously referenced `packages/`, `infra/seed`, `infra/rekor` — none exist
  (README rewritten 2026-07-17 to match reality).

## In flight

- Governance reboot (this commit): CLAUDE.md, charter, operating model, roadmap,
  engineering standards, ADRs 0001–0003, honest README/architecture docs. Old
  "Greg" agent file and demo-flow doc removed.

## Next session should

1. Finish Phase 0: delete the dead `modules/**` code and prisma-less imports, or
   stand up the minimal real versions; verify the `make` bootstrap path end to end.
2. Add GitHub Actions CI (typecheck, lint, test, build) — note each app currently
   lacks lint/test configs, so wire minimal ones first.
3. Write the Phase 0 gate script under `docs/reviews/phase-0/` and run it from a
   fresh clone.

## Known risks / open questions

- Phase 1 needs an ORM decision (ADR pending): Prisma vs. plain SQL/kysely.
- Node/pnpm versions are not pinned beyond `packageManager`; devcontainer and CI
  should agree.
