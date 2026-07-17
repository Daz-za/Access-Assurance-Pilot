# Roadmap — Phases and Exit Gates

**Status:** Active · **Current phase:** 2 (Phase 0 and Phase 1 gates both closed —
see `docs/reviews/phase-0/` and `docs/reviews/phase-1/SIGNOFF.md`)

Each phase ends with a scripted end-to-end test — the only artifact the funder
reviews. A gate passes when its script runs **from a fresh clone, unattended,
exactly as written**. Agents may re-sequence work inside a phase freely; changing a
gate's criteria requires an ADR.

---

## Phase 0 — Truth and Foundation

The repo currently claims more than it does. Before building, make the codebase
honest, buildable, and continuously verified.

**Work:**
- Governance docs in place (this set) — done.
- Delete or quarantine dead code: `apps/*/src/modules/**` reference a Prisma client
  (`lib/db`) that does not exist; `apps/api/src/db/seed.ts` is a stub; the worker is a
  heartbeat loop. Keep only what compiles and runs.
- One-command dev bootstrap that actually works (`make` targets verified end to end).
- GitHub Actions CI: typecheck, lint, test, build on every push. Red main is a
  stop-the-line event.
- Minimal test harness in each app so "tests pass" means something.

**Exit gate (E2E):** On a fresh clone, a single documented command sequence installs
deps, starts the demo stack, and serves the existing demo flow (dashboard → inbox →
decision → audit view). CI is green on main. No document in the repo describes
anything that does not exist.

---

## Phase 1 — Real Vertical Slice

Replace the in-memory demo with a real, persistent review workflow.

**Work:**
- PostgreSQL persistence (schema owned by an ADR: Prisma vs. plain SQL — decide, record).
- Domain model: systems, users, access assignments, campaigns, review items,
  decisions, audit events — seeded from synthetic data.
- Decisions persist, transition state, and write real audit events.
- OPA evaluated for real (SoD + privileged-access policies driven by
  `infra/opa/data/policy-data.json`, not hardcoded role strings), with the fallback
  path removed or made an explicit degraded mode.
- Worker does real async work (snapshot capture, audit event writing) via Redis queue.

**Exit gate (E2E):** Fresh clone → bootstrap → seeded campaign appears → reviewer
completes both seeded reviews → restart every service → decisions, state, and audit
trail survive; audit trail is served from the database, not memory.

---

## Phase 2 — The Evidence Engine (the reason this company exists)

**Work:**
- Canonical evidence document format (deterministic serialization — an ADR).
- Real signing: per-deployment keypair (Sigstore/cosign toolchain), no dummy keys.
  Current `rekor.ts` submits a fake signature a real Rekor instance would reject —
  replace it.
- Anchor evidence hashes in local Rekor at decision time; store UUID, log index, and
  inclusion proof with the evidence; evidence blobs in MinIO.
- **Standalone verifier**: a separate small CLI (own package, minimal deps) that takes
  an exported evidence pack and validates hashes, signatures, and Rekor inclusion
  proofs — designed to be run by an auditor who does not trust us.
- Evidence pack export for a campaign.

**Exit gate (E2E):** Complete a review → export the campaign evidence pack → on a
machine/container without this codebase, the verifier validates the pack. Then tamper
with one byte of one evidence document and show the verifier **fails**. The
tamper-detection demo is the centerpiece.

---

## Phase 3 — Real Data In

**Work:**
- CSV connector matching real export formats (SAP role assignments, AD/Entra group
  membership) with mapping UI or config.
- One live connector: Microsoft Graph (Entra ID) against a free developer tenant
  (if a paid resource is unavoidable, that's a `funder-input` issue).
- Campaign management: create a campaign from imported snapshots, assign reviewers,
  track completion.
- Authentication and basic roles (admin, reviewer) — pilot-grade, honestly documented.

**Exit gate (E2E):** Import realistic CSV exports + a live Entra ID snapshot → launch
a campaign → two different reviewer accounts complete their queues → violations
flagged by OPA from configured rules → campaign evidence pack exports and verifies.

---

## Phase 4 — Pilot Readiness

**Work:**
- Auditor-facing evidence pack polish: human-readable summary + machine-verifiable
  bundle in one export.
- Deployment story (single VM / docker-compose profile with real secrets handling).
- Security pass: authn/authz review, dependency audit, threat model doc.
- Pilot runbook for a design partner; walkthrough with a practicing auditor
  (intro brokered via `funder-input`).
- Revisit parked items (VC, OSCAL, revocation integrations) with ADRs.

**Exit gate (E2E):** Full pilot simulation — from empty deployment to completed
campaign to independently verified evidence pack — executed as a recorded demo
against the pilot runbook, plus written auditor/compliance feedback.

---

## After Phase 4

Decided then, by whoever is running the project — informed by pilot feedback, recorded
in ADRs, and constrained only by the charter.
