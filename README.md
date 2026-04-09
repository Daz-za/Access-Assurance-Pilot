# Access Assurance Pilot

Access Assurance Hub is a pilot platform for running cross-system access reviews with policy-based risk detection, evidence generation, and audit traceability using Rekor for immutable anchoring.

## Stack

- React + Vite
- Fastify + TypeScript
- PostgreSQL
- Redis
- MinIO
- OPA
- Rekor
- Docker Compose
- GitHub Codespaces ready

## Quick start

1. Copy `.env.example` to `.env`
2. Run:

```bash
make pilot-up
```
3. Open:\
Web: `http://localhost:3000`\
API: `http://localhost:4000/health/live`\
MinIO Console: `http://localhost:9001`\
OPA: `http://localhost:8181`\
Rekor: `http://localhost:8080`

## Pilot flow

- Start infrastructure with `make infra-up`
- Run migrations and seed data with `make migrate` and `make seed`
- Launch services with `make api`, `make web`, `make worker`
- View dashboard for access reviews
- Open inbox for pending reviews
- Review access items with policy checks
- Submit decisions and generate evidence
- Inspect audit trail with Rekor anchors

## Repo structure
`apps/web` – React UI shell\
`apps/api` – backend API, modules, and database\
`apps/worker` – async jobs and Rekor integration\
`infra/docker` – local runtime with Rekor\
`infra/opa` – Rego policies\
`infra/rekor` – Rekor configuration\
`infra/seed` – seed data\
`packages/shared-types` – shared TypeScript types\
`packages/config` – configuration utilities\
`docs/pilot-runbook` – pilot guide
