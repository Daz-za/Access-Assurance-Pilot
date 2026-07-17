# Architecture Decision Records

One numbered file per hard-to-reverse decision. Written **before** implementation.
Never edited to change history — a wrong decision gets a new ADR that supersedes it.

## Index

| # | Title | Status |
|---|---|---|
| [0001](0001-autonomous-ai-governance.md) | Autonomous AI governance model | Accepted |
| [0002](0002-evidence-first-product-focus.md) | Evidence-first product focus | Accepted |
| [0003](0003-rekor-transparency-log.md) | Sigstore Rekor as the evidence transparency log | Accepted |
| [0004](0004-prisma-orm-and-migrations.md) | Prisma as ORM and migration tool | Accepted |

## Template

```markdown
# NNNN — Title

Status: Proposed | Accepted | Superseded by NNNN
Date: YYYY-MM-DD

## Context
What forces are at play; what problem this decides.

## Decision
The choice, stated plainly.

## Alternatives rejected
Each with the one reason that killed it.

## Consequences
What becomes easier, what becomes harder, what we're betting on.
```
