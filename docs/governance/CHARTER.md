# Charter — Access Assurance Pilot

**Status:** Active · **Amendable by:** funder approval only (reserved matter)

## Mission

Build the first access-review product whose compliance evidence is
**independently verifiable by the auditor** — not just exported from the vendor's
database, but cryptographically anchored so that tampering, backdating, and
after-the-fact editing are detectable by anyone, without trusting us.

## The problem

Periodic user access reviews (SOX ITGC, ISO 27001 A.5.18, SOC 2 CC6) are still run in
spreadsheets and screenshots at most mid-market companies. Where tooling exists
(SailPoint, Saviynt at the top end; Vanta/Drata checklists at the bottom), the evidence
trail is a mutable database row. Auditors accept it because there is nothing better.
The evidence is the product of the review — and today it is the weakest part.

## The thesis

**Evidence-first access reviews.** The workflow (campaigns, inbox, decisions) is table
stakes and must be competent but conventional. The differentiation is the trust layer:

1. Every review decision produces a **canonical, signed evidence document**.
2. Evidence hashes are anchored in a **transparency log (Sigstore Rekor)** at decision
   time — inclusion proofs make backdating and tampering detectable.
3. Auditors get a **standalone verification tool** that validates an evidence pack
   offline, against the log, with zero trust in our servers.

If we cannot make point 3 real, the company has no reason to exist. It is the gate
for Phase 2 and the heart of every demo after it.

## Target customer (pilot)

Mid-market companies (200–2,000 employees) subject to SOX ITGC or ISO 27001/SOC 2,
currently running access reviews in spreadsheets, with SAP/ERP + a directory
(Entra ID/AD) as the systems under review. Buyer: Head of IT / Compliance lead.
Secondary user we must delight: **the external auditor**.

## What we will NOT build (pilot scope)

- Full IGA: provisioning, joiner-mover-leaver, role mining. We review access; we do
  not manage it. Revocation is a ticket/notification, not an integration, until a
  design partner demands otherwise.
- Verifiable credentials and OSCAL translation — parked until after a successful
  pilot (revisit at Phase 4).
- Enterprise SSO matrix, multi-tenancy hardening, SOC 2 for ourselves — pilot-stage
  answers only, documented honestly.

## Success criteria for the pilot

1. A full review campaign can be run end-to-end on real-format data (CSV exports +
   one live directory connector).
2. An evidence pack from that campaign is verified by the standalone verifier on a
   machine that has never seen this codebase.
3. The verification story survives a walkthrough with at least one practicing auditor
   or compliance professional (funder can broker the intro; the ask goes through a
   `funder-input` issue).

## Direction changes

Agents may sharpen, re-sequence, and re-scope freely within this thesis. Abandoning
verifiable evidence as the core differentiator, or pivoting to a different product
category, amends the mission and is a reserved matter.
