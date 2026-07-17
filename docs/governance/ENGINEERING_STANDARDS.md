# Engineering Standards

**Status:** Active · Amendable by agents (record notable changes in git history)

The bar exists so that unattended agent sessions compound instead of churn. Every
rule here is enforceable by a machine or by the next session reading the repo.

## Definition of done

A change is done when:

1. `pnpm typecheck && pnpm lint && pnpm test && pnpm build` pass from the repo root.
2. Behavior it claims is demonstrated — by a test, or for user-facing flows, by
   actually running the flow (not just compiling it).
3. Docs it invalidates are updated in the same commit (README, STATE.md, architecture).
4. It is pushed. Local-only work does not exist once a session ends.

## Code

- TypeScript `strict` everywhere; no `any` in new code without a comment stating the
  constraint that forces it.
- No dead code, no aspirational scaffolding, no "will be wired in later" modules.
  If it isn't reachable from an entrypoint or a test, delete it — git remembers.
- Errors are handled or propagated deliberately. Silent `catch {}` fallbacks that mask
  infrastructure failures (see the old OPA fallback) are allowed only as an explicit,
  logged, documented degraded mode.
- Secrets never in git. `.env.example` documents every variable the code reads.

## Testing

- Every module with logic gets unit tests; the decision→evidence→anchor path gets
  integration tests against real Postgres/Rekor/MinIO in docker.
- Each phase's exit-gate E2E script lives in the repo (`docs/reviews/phase-N/` +
  executable script) and must stay green after the phase closes — gates are
  regression tests, not ceremonies.
- Tests assert behavior, not implementation. A test that never fails when the code
  breaks is deleted.

## Git

- `main` is protected by convention: never commit to it directly; merge only when CI
  is green. A red main halts feature work until fixed.
- Feature branches, small commits, present-tense conventional-commit style
  (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`).
- Commit messages state what and why. Never claim in a message what the diff doesn't do.

## Dependencies

- Prefer boring and few. Every new runtime dependency needs one sentence of
  justification in the commit message.
- Free/OSS only without funder approval (reserved matter: money).

## Documentation

- `README.md` describes the repo as it is, verified against reality whenever touched.
- `docs/STATE.md` updated at the end of every working session — it is the handoff.
- ADRs (`docs/decisions/`) before hard-to-reverse choices. Template in that directory.
- Writing style: short, factual, no marketing language inside the repo.
