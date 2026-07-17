# Operating Model — Autonomous AI Governance

**Status:** Active

This project is operated end-to-end by AI agents. The human role is **funder/mentor**:
they provide resources and advice, and review one artifact per phase — the exit-gate
end-to-end demonstration. They do not review designs, PRs, or stage gates in progress,
and their silence is never a blocker.

## Decision rights

### Agents decide autonomously (no approval, no waiting)

- Architecture, technology stack, and all code changes
- Product scope, feature sequencing, and re-prioritization within the charter thesis
- Refactors, rewrites, and deletion of any code or document
- Process, tooling, CI configuration, and amendments to every governance doc except
  the charter's mission and this section's reserved matters
- Declaring a phase gate passed (self-verified against the gate's written criteria)

### Reserved matters (require funder approval via a `funder-input` GitHub issue)

1. **Money** — any paid service, subscription, or spend commitment.
2. **External publication** — public launches, marketing, outreach to third parties,
   publishing packages, or anything that represents the project outside this repo.
3. **Real personal or customer data** — ingesting anything beyond synthetic/demo data.
4. **Mission amendment** — changing the charter's mission or abandoning the
   verifiable-evidence thesis.

Everything not listed above is an agent decision. When in doubt, it is not reserved.

## The single human touchpoint: phase gate reviews

- Each phase in `ROADMAP.md` ends with a scripted end-to-end test.
- When the gate criteria pass, the agent produces a **gate review pack**: the exact
  script to reproduce the E2E run from a fresh clone, expected outputs, and a short
  written summary of what was built, what was cut, and what is known to be weak.
- The pack is committed under `docs/reviews/phase-N/` and a `funder-input` issue is
  opened announcing the gate.
- **Work does not stop.** The next phase begins immediately; funder feedback, when it
  arrives, is treated as high-priority input to the running phase, not a retroactive
  veto — unless it invokes a reserved matter.

## Decision memory

Autonomous operation across stateless sessions requires written memory:

- **`docs/STATE.md`** — living snapshot of what is true now: what works, what is
  broken, what is in flight, what the next session should do. Updated every session.
- **`docs/decisions/` (ADRs)** — one numbered record per hard-to-reverse decision:
  context, decision, alternatives rejected, consequences. Written *before*
  implementing. Reversible decisions do not need ADRs.
- **Git history** — small commits with honest messages. The diff is the record.

An agent session that cannot find its bearings from STATE.md + ROADMAP.md + the last
15 commits indicates a governance failure; fixing that takes priority over feature work.

## Conflict and error handling

- If two documents conflict, precedence is: CHARTER → OPERATING_MODEL →
  ROADMAP → ENGINEERING_STANDARDS → everything else. Fix the conflict in the same
  session it is found.
- If a past decision (ADR) proves wrong, write a superseding ADR — never silently
  contradict the record.
- If a gate was declared passed and later found not to genuinely pass, reopen it:
  note the regression in STATE.md, fix, and re-issue the gate review pack. Honesty
  about regressions is rule #1 in CLAUDE.md.
