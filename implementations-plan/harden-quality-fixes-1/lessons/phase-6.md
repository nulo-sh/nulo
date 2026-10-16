# Phase 6: arc gate and review loop

## Gates

- `test:all` (every workspace), `check:plans` (0 findings), `bun run --cwd apps/extension build`, `git diff --exit-code -- apps/extension/src/types`: pass on 3a769683.
- Smoke and network e2e wait for load1 < 150 (the host runs several leads).

## Review round 1

- Codex (gpt-6.1-sol, high, read-only; session 01a14547): conditional approve. Accepted: hoisting the journal metadata into a `const` before the record literal evaluated its nine reads before `kind`, `origin`, `profileId`, `sessionId` and `initialStage`; equivalent for a plain input, but it moves a read, which the arc's rule forbids. The fix spreads an inline literal with `satisfies` where the nine keys stood; adding a field to `JournalMetadata` still fails at the shape, the forwarding and the test. Accepted: a comment restating the test writer type.
- Opus (general-purpose): approve with five comment and test nits, all verified and accepted.
