# Architecture Overview

**Principle:** conventional runtime, differentiated trust layer. The workflow engine
is deliberately boring (Fastify, Postgres, Redis, React); all novelty budget is spent
on the evidence pipeline.

## Current architecture (Phase 0 — what actually runs)

```
React/Vite (apps/web) ──HTTP──> Fastify (apps/api)
                                   │
                                   ├── in-memory demo data (src/data/demo.ts)
                                   └── OPA sidecar (SoD check; silent local
                                       fallback when OPA is unreachable)
```

Everything is ephemeral. Postgres, Redis, MinIO, and Rekor are defined in
`infra/docker/docker-compose.yml` and start cleanly, but no live code path uses them.
`apps/worker` logs a heartbeat. The `modules/` trees in api and worker reference a
nonexistent Prisma client and are dead code pending Phase 0/1 cleanup. Full inventory:
[`../STATE.md`](../STATE.md).

## Target architecture (Phase 2+)

```
                        ┌────────────────────────────────────────────┐
 React UI ──> Fastify API ──> PostgreSQL   (campaigns, assignments,  │
                  │           decisions, audit events)               │
                  │                                                  │
                  ├──> OPA sidecar (SoD / privileged / reviewer      │
                  │     policies from infra/opa, config-driven)      │
                  │                                                  │
                  └──> Redis queue ──> Worker                        │
                                        │  evidence pipeline:        │
                                        │  1. canonicalize decision  │
                                        │     record (deterministic  │
                                        │     serialization)         │
                                        │  2. SHA-256 + sign         │
                                        │     (per-deployment key,   │
                                        │     cosign toolchain)      │
                                        │  3. anchor in Rekor        │
                                        │     (hashedrekord; store   │
                                        │     UUID/index/proof)      │
                                        │  4. store blob in MinIO    │
                        └────────────────────────────────────────────┘

 Evidence pack export (per campaign)
        │
        ▼
 Standalone verifier CLI  — separate package, minimal deps, runs on the
 auditor's machine: validates hashes, signatures, and Rekor inclusion
 proofs offline. Trusts only the log's public key, never our servers.
```

## Load-bearing design rules

1. **Evidence is created at decision time, not export time.** The anchor timestamp is
   the anti-backdating claim; batching or lazy anchoring breaks the product's core
   promise (ADR 0002).
2. **The verifier shares no code with the platform.** It is the auditor's tool; a
   shared bug that makes both sides agree on a wrong answer would be invisible.
3. **Degraded modes are explicit.** If OPA or Rekor is down, the system says so and
   records it — never silently falls back (the current OPA fallback violates this and
   is scheduled for Phase 1).
4. **Connectors normalize at the edge.** Import (CSV, Microsoft Graph) maps into one
   internal assignment model; policy and evidence layers never see source formats.

## Decisions and open questions

Hard-to-reverse choices are recorded in [`../decisions/`](../decisions/). Open as of
now: ORM/query layer for Phase 1 (ADR pending); public vs. self-hosted Rekor is
decided for the pilot (self-hosted — ADR 0003) and revisited at Phase 4.
