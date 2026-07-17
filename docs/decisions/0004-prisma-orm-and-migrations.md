# 0004 — Prisma as ORM and migration tool

Status: Accepted
Date: 2026-07-17

## Context

Phase 1 replaces the in-memory demo (`apps/api/src/data/demo.ts`) with real
PostgreSQL persistence for the domain model: systems, users, access assignments,
campaigns, review items, decisions, audit events. This is the first real schema in
the project and needs a migration story from day one — the previous `modules/**`
scaffolding (deleted in Phase 0) already assumed a Prisma client that was never set
up, so the shape of that choice existed before but was never decided or recorded.

Requirements: type-safe queries against the domain model shared by `apps/api` and
`apps/worker`; a migration tool that works unattended in CI and the Phase 1 gate
script (fresh clone → migrate → seed → run); minimal ceremony, since this is a small
schema run by autonomous agents, not a large team needing query-builder flexibility.

## Decision

Use **Prisma** (`@prisma/client` + `prisma migrate`) as the ORM and migration tool,
as a shared package consumed by both `apps/api` and `apps/worker`. Schema lives in
one place (`packages/db/prisma/schema.prisma`), migrations are checked into git, and
`db:migrate` / `db:seed` become real scripts instead of the current stubs.

## Alternatives rejected

- **Kysely (or plain `pg` + hand-written SQL)** — more control and fewer moving
  parts, but requires hand-maintaining TypeScript types and a separate migration
  runner (e.g. `node-pg-migrate`). For a schema this size, Prisma's generated types
  and built-in migration diffing remove more risk than the extra dependency costs,
  and "boring and few dependencies" (ENGINEERING_STANDARDS.md) is about avoiding
  exotic tools, not avoiding a single well-known ORM.
- **Drizzle ORM** — lighter runtime than Prisma and SQL-like query syntax, a
  reasonable second choice. Rejected only for maturity of its migration tooling
  relative to Prisma's at the time of this decision; revisit if Prisma's generated
  client or engine binary becomes a real pain point (e.g. cold-start cost in
  serverless deployment, which is not a Phase 1 concern).
- **No ORM, raw SQL migrations only** — fastest to start, but pushes all type safety
  onto manual discipline across two apps (api, worker) sharing one schema; the
  first place that would drift is exactly the evidence pipeline in Phase 2, where
  correctness matters most.

## Consequences

Adds `prisma`/`@prisma/client` as dependencies and a generated-client build step
(`prisma generate`) that CI and the gate script must run before typecheck/build.
Schema changes are made via `prisma migrate dev` locally and `prisma migrate deploy`
in the gate script/CI, keeping migration files as the source of truth alongside the
schema file. If Phase 2's evidence canonicalization needs deterministic serialization
Prisma's client doesn't give for free (e.g. stable key ordering), that is handled at
the application layer, not by replacing the ORM.
