# Phase 6: arc gate and review loop

## Gates

- `test:all` (every workspace), `check:plans` (0 findings), `bun run --cwd apps/extension build`, `git diff --exit-code -- apps/extension/src/types`: pass on 3a769683.
- Smoke and network e2e wait for load1 < 150 (the host runs several leads).

## Review round 1

- Codex (gpt-6.1-sol, high, read-only; session 01a14547): conditional approve. Accepted: hoisting the journal metadata into a `const` before the record literal evaluated its nine reads before `kind`, `origin`, `profileId`, `sessionId` and `initialStage`; equivalent for a plain input, but it moves a read, which the arc's rule forbids. The fix spreads an inline literal with `satisfies` where the nine keys stood; adding a field to `JournalMetadata` still fails at the shape, the forwarding and the test. Accepted: a comment restating the test writer type.
- Opus (general-purpose): approve with five comment and test nits, all verified and accepted.

## Review round 2

- Codex resume on b91bc5ce: approve, no findings. Converged.

## E2E

- Smoke, Chrome, armed bundle built at 3a769683, retry 0: 56 files passed, 6 env-gated skips, 0 failed, 2091 s wall (the host's load was 145 to 350 through the run). Round 1's fixes after it reorder no runtime value and change comments only.
- Network, Chrome, retry 0, on b91bc5ce, one at a time: `execute-scope-account` 368 s, `batch-mixed` 218 s, `data-privateEvents` 242 s; all green.
