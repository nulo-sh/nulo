# fixes-1.2.0-1 phase 1: every Home row writer derives the flag from the remaining tasks

## Red first (at the plan commit, before the fix)

`bun --bun vitest run src/popup/components/modules/general/TokensView.test.ts src/composables/useTokenBalanceSnapshot.test.ts`: 4 failed, 70 passed.
- "an update for a listed id lands through mapRow": the row came back without `mapped`.
- T1 (deleted older refresh), T2 (older finishing after a newer started), T3 (balance update during a refresh): each `expected false to be true` at the first lit assertion.

## Green

- The same two files: 74 passed.
- `bun run lint` exit 0 (4 pre-existing infos, none in a touched file); `bun run typecheck:all` exit 0; `bun run test` exit 0 (988 files, 17247 tests); `bun run test:all` exit 0.
- `tests/e2e/home-links.test.ts --retry=0` on the armed smoke build (the command `global-setup-smoke.ts` names, plus `NULO_E2E_CSP_REPORT=1` at run time): Chrome 2/2 in 17.4 s, Firefox 2/2 in 27.0 s. Firefox's `PrivateBrowsingUtils` console errors are the browser's own and fail nothing.

## Review loop

- Round 1: Codex gpt-6.1-sol high over `git diff 3b845ef02...HEAD -- apps`: clean. One Opus 5.5 review beside it: one finding, accepted: the balance-update test never checked that the update reached the row, so a handler that stopped replacing the row would still pass. The test now asserts `toMatchObject({ publicBalance: "2", isUpdating: true })` on the card's row.
- Round 2: Codex resumed on that fix: clean. Converged.

## Close-out

- Merged `origin/dev` (one plan landed: list-refresh-1; no overlap with this diff).
- Filed #1627 (open `bug`, D4 (a)); #1628 and #1629 as closed `known-limit` (D4 (b), (c)), after a dedupe that found no twin.
