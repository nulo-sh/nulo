# Phase 4 (arc 2): implementation, e2e and review log

## Implementation

- 27 assertion points across the eight files: each `consoleErrors` file gained the `pageErrors` line after each point, each `pageErrors` file the `consoleErrors` line before it, on the same `ctx`, in `connect-dapp.test.ts`'s order. No helper (D-336). Lint and `typecheck:all` green.

## E2E runs (retry 0)

- Network, six files per run through `agent.sh`, Chrome on 01bcc0a4: rounds 1 and 2 6/6 (10 tests; 17 and 16 min). Round 3: `snack-placement` 2 red, both in `sendFromDrainedBalance` → `fillSendForm` (`helpers.ts:1248`, 60 s waiting for `send-amount-input` to be enabled), before any added assertion: #349, the open flake. A single-file rerun passed 4/4.
- Network, Firefox on 421b30c5 (origin/dev with #353 merged): rounds 1 and 3 6/6 (28 and 21 min). Round 2: `snack-placement` 2 red with the same trace (#349). Its single-file rerun failed `:372` again (the other three passed). Not this arc's breakage: in each failing case the only lines before the drain are passing `expect` calls on the arrays, side-effect free, and the trace is #349's. Fixing #349 is outside the lane; recorded rather than rerun until green.
- Smoke, `own-window` and `rows`, the armed build: three rounds per browser, 9/9 each (Chrome 45-80 s, Firefox 95-103 s).
- After #356's CI went green, #347 reached `dev`; merged in (2f30c209, clean), the six files plus `verify-hold` ran once per browser at retry 0: 7/7 files, 15 tests, Chrome 13 min, Firefox 27 min. `verify-hold.test.ts`, new with #347, asserts neither array: outside the eight files, reported, not changed.
- No run put an entry in either array; nothing was filtered.
- #349 now has these four occurrences (both browsers, three Send cases besides the Home one) as evidence.

## Codex fix loop (gpt-6.1-sol, high)

- Round 1: `approve`; all 27 points checked, no refusal or closure in the eight files feeds either array. One optional nit outside the diff (a pre-existing comment at `rows.test.ts:95` narrating `tabTo`): declined, the arc does not touch it.
- Opus 5.5 lens: `approve`. Converged in one round.
