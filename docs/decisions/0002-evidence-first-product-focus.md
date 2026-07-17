# 0002 — Evidence-first product focus

Status: Accepted
Date: 2026-07-17

## Context

The original pilot framing bundled access-review workflow, policy detection, evidence,
audit trails, verifiable credentials, and OSCAL translation. The access-review market
is crowded: SailPoint/Saviynt at the enterprise end, Vanta/Drata absorbing the
checklist end, and a wave of mid-market IGA startups (ConductorOne, Lumos, Opal,
Zilla) on the workflow. A pilot that competes on workflow alone has no edge. What no
incumbent offers is evidence an auditor can verify **without trusting the vendor**:
today's "audit trail" is a mutable database row everywhere.

## Decision

The product's core bet is **independently verifiable review evidence**. Workflow
features are built to the minimum competence needed to generate that evidence
credibly. The standalone offline verifier (Phase 2) is the existential deliverable;
tamper-detection is the centerpiece of every demo from Phase 2 on. Verifiable
credentials and OSCAL are parked until after a successful pilot.

## Alternatives rejected

- **Compete on workflow breadth** — outgunned by funded incumbents on day one.
- **Keep VC/OSCAL in pilot scope** — three trust technologies before one paying-user
  problem is solved; each dilutes the Rekor story that is already sufficient to
  differentiate.
- **Pivot to pure evidence-notarization API (no review UI)** — plausible fallback,
  but without owning the review workflow we can't guarantee evidence is created at
  decision time, which is the whole anti-backdating claim. Revisit at Phase 4 if
  workflow drag exceeds its worth.

## Consequences

Scope gets dramatically tighter and demos get a sharp, single claim ("tamper with one
byte and verification fails"). The risk accepted: if auditors turn out not to care
about verifiability, the differentiator is moot — which is exactly why Phase 4's gate
requires feedback from a practicing auditor.
