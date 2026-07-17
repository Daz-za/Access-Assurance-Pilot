# Access Assurance Pilot

Building the first access-review product whose compliance evidence is
**independently verifiable by the auditor** — review decisions produce signed,
canonical evidence documents anchored in a transparency log (Sigstore Rekor), so
tampering and backdating are detectable without trusting the vendor.

**This project is run autonomously by AI agents.** A human funder/mentor reviews only
the end-to-end demonstration at the close of each roadmap phase. If you are an agent,
start with [`CLAUDE.md`](CLAUDE.md). Governance lives in
[`docs/governance/`](docs/governance/); the current-truth snapshot is
[`docs/STATE.md`](docs/STATE.md).

## Honest status (Phase 0 — Truth and Foundation)

What runs today is a **UI/API demo on hardcoded in-memory data**: dashboard → review
inbox → decision submission (with an OPA SoD check) → audit view. Nothing persists.
Postgres, Redis, MinIO, and Rekor start in docker but are not yet used by any real
code path. The persistence layer, evidence engine, and verifier are roadmap items,
not features. See [`docs/STATE.md`](docs/STATE.md) for the precise works/doesn't-work
inventory and [`docs/governance/ROADMAP.md`](docs/governance/ROADMAP.md) for what
comes next.

## Stack

- **apps/web** — React + Vite UI shell
- **apps/api** — Fastify + TypeScript API
- **apps/worker** — background jobs (currently a stub)
- **infra/docker** — docker-compose: PostgreSQL, Redis, MinIO, OPA, Rekor
- **infra/opa** — Rego policies (SoD, privileged access, reviewer rules)
- pnpm workspaces + turbo monorepo

## Quick start

Prereqs: Node 20+, pnpm 10 (`corepack enable`), Docker.

```bash
cp .env.example .env
pnpm install
make infra-up      # starts Postgres/Redis/MinIO/OPA/Rekor (only OPA is used so far)
pnpm dev           # starts api, web, worker via turbo
```

Then open:

- Web: http://localhost:3000
- API health: http://localhost:4000/health/live
- OPA: http://localhost:8181

`make pilot-up` combines `infra-up` + `pnpm dev`. `make pilot-down` stops infra.

## Documentation map

| Path | What it is |
|---|---|
| `CLAUDE.md` | Agent operating instructions (start here) |
| `docs/STATE.md` | What is true right now — session handoff |
| `docs/governance/CHARTER.md` | Mission and product thesis |
| `docs/governance/OPERATING_MODEL.md` | Decision rights and the human touchpoint |
| `docs/governance/ROADMAP.md` | Phases and exit-gate E2E tests |
| `docs/governance/ENGINEERING_STANDARDS.md` | Quality bar |
| `docs/decisions/` | Architecture Decision Records |
| `docs/architecture/overview.md` | Current and target architecture |
