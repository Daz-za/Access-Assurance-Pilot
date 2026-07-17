# 0003 — Sigstore Rekor as the evidence transparency log

Status: Accepted
Date: 2026-07-17

## Context

The verifiable-evidence thesis needs an append-only, publicly auditable log with
inclusion proofs. The repo already gestures at Rekor (`apps/api/src/lib/rekor.ts`,
docker-compose service), but the current client submits a `hashedrekord` with a
dummy public key and a base64 payload in the signature field — a real Rekor instance
rejects this. A genuine implementation must be chosen and built in Phase 2.

## Decision

Use **Sigstore Rekor** as the transparency log: self-hosted (docker) for the pilot,
with entries as `hashedrekord` records signed by a real per-deployment keypair
managed with the cosign toolchain. Evidence documents are canonically serialized,
hashed (SHA-256), signed, and anchored; the stored proof (UUID, log index, inclusion
proof, checkpoint) travels inside the exported evidence pack so the standalone
verifier can validate offline against the log's public key.

## Alternatives rejected

- **Public Rekor instance (rekor.sigstore.dev)** — attractive later (stronger
  neutrality claim) but publishes hashes of customer review activity to a public log
  and adds an external dependency to every demo; also borders the "external
  publication" reserved matter. Revisit at Phase 4.
- **Roll our own Merkle log** — reimplementing audited infrastructure is the worst
  kind of undifferentiated heavy lifting, and "we built our own log" is weaker with
  auditors than "the log Kubernetes and npm supply-chain security use."
- **Blockchain anchoring (e.g., OpenTimestamps/Ethereum)** — cost, latency, and
  narrative baggage in compliance sales; adds nothing over a transparency log for
  this threat model.
- **Trusted timestamping (RFC 3161 TSA) only** — proves time, not append-only
  inclusion; weaker tamper-evidence story. Could complement Rekor later.

## Consequences

Phase 2 must replace `rekor.ts` wholesale, introduce real key management (generation,
storage, rotation documented honestly as pilot-grade), and build the verifier against
Rekor's inclusion-proof format. Self-hosting means the pilot's trust claim is
"tamper-evident against insiders and after-the-fact edits," not "trustless" — the
honest framing until a public/witnessed log is adopted.
