# Access Assurance Pilot

Access Assurance Hub is a pilot platform for running cross-system access reviews with policy-based risk detection, evidence generation, and audit traceability.

## Stack

- React + Vite
- Fastify + TypeScript
- PostgreSQL
- Redis
- MinIO
- OPA
- Docker Compose
- GitHub Codespaces ready

## Quick start

1. Copy `.env.example` to `.env`
2. Run:

```bash
make pilot-up
```
3. Open:
Web: [http://localhost:3000]\
API: `http://localhost:4000/health/live`\
MinIO Console: `http://localhost:9001`\
OPA: `http://localhost:8181`

## Demo flow

- View dashboard
- Open inbox
- Review access item
- See SoD or privileged flag
- Submit decision
- Inspect audit trail

## Repo structure
`apps/web` – React UI shell\
`apps/api` – backend API and orchestration\
`apps/worker` – async jobs\
`infra/docker` – local runtime\
`infra/opa` – Rego policies\
`infra/seed` – demo data\
`docs/pilot-runbook` – live demo guide
