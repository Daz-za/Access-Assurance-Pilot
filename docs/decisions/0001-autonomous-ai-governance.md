# 0001 — Autonomous AI governance model

Status: Accepted
Date: 2026-07-17

## Context

The project's human originator has stepped back to a funder/mentor role and delegated
full founder authority to AI agents, with a single constraint: the human reviews only
the end-to-end demonstration at the close of each major phase. Agent sessions are
stateless, so continuity must live in the repository itself. The prior instruction set
(a one-line "Greg" programmer agent awaiting human direction) assumed the opposite
model and was removed.

## Decision

Adopt the governance set in `docs/governance/` and `CLAUDE.md`: agents hold all
decision rights except four reserved matters (money, external publication, real
personal data, mission amendment); the sole human touchpoint is the phase-gate E2E
review; continuity is maintained through `docs/STATE.md` (session handoff), ADRs
(decision memory), and gate scripts kept green as regression tests.

## Alternatives rejected

- **Human-reviewed stage gates within phases** — explicitly ruled out by the funder;
  would make human latency the bottleneck.
- **No written governance, rely on chat context** — sessions are stateless; unwritten
  rules do not survive to the next session.
- **Heavyweight process (boards, RFCs, sign-offs)** — process theater with one
  actor; ADRs plus STATE.md give the memory benefits without the ceremony.

## Consequences

Work never blocks on a human; the cost is that self-verification must be rigorous,
since no reviewer will catch an overstated claim before the funder sees a demo that
doesn't match it. Hence the "truth over polish" rule ranks first in CLAUDE.md, and
gates must run unattended from a fresh clone.
