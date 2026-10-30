# chips-2 phase 0: planning consults

## Codex round 1 (gpt-6.1-sol, high, read-only, session `01a18e5c`)

Verdict: `conditional approve (repair the missed test expectations, complete the required gates, and resolve the history-row sign-off assumption)`. Each finding verified against the tree:

1. Two tests expect every Terms entry's `changes` (`LegalAcceptanceSheet.test.ts:92`, smoke `legal-acceptance.test.ts:265`); a patch with a `changes` line fails both. Demonstrated. Taken (F8): filter by `material`, exact equality kept.
2. Five positional reads after "LOCK" in `StaleNetworkTakeover.test.ts` (`:134,135,165,166,339`). Demonstrated. Taken (F6).
3. CLAUDE.md § Quality gates names the full smoke suite, `audit:vue` and `build-storybook` for a user-visible change; the landing build exercises the archive. Taken (Phases 2-4).
4. The history row is public copy on nulo.sh/terms. Partly taken: UI impact quotes the row exactly; no separate ask, since the owner's pick of "a patch version" makes a row mandatory and privacy 1.2.2's precedent holds (I2).
5. The scratch spec does not exist yet and Phase 4 needs it. Taken: Phase 1 writes it and keeps it through Phase 4.

Codex also called D1's argument overstated (`launch-legal` already refuses a `«FILL»` into `main`). Checking the history showed the `«FILL»` form is the precedent (Terms 1.2, privacy 1.2.2-1.2.4, 1.2.6, dated by #1229 at the promote), so D1 flipped to it.

## Opus 5.5 Plan leg (same family)

Verdict: `conditional approve (fix findings 1, 2, 4 and 5; reverse D1 as finding 3 says)`. Verified and resolved:

1. The two tests reading every Terms entry's `changes` (also Codex 1). Taken (F8).
2. The Phase 2 grep searched `legal/archive`, where the byte copy keeps "Alpha V6". Demonstrated. Taken: the pathspec is `legal/terms.md`.
3. D1 should be `«FILL»`. Already flipped after Codex round 1; Opus's trace agrees (`launch-legal` is required by `quality-status`).
4. Index shifts in `StaleNetworkTakeover.test.ts` (also Codex 2), and the test name at `NetworkArrival.test.ts:116`. Taken.
5. The scratch spec could not show a takeover as written; the B build must be armed. Taken: the spec seeds the arrival for the heights (as written and run in Phase 1), and B was built armed.
6. Nothing checks the archived body. Plausible (needs an implementer error); the fix is a gate command. Taken: `cmp` against the base in Phase 2; the Security sentence corrected.
7. D2's `calc(1lh + 16px)` repeats `.chip`'s padding. Taken the simpler option: `align-self: stretch`, which takes the row's height (the network chip's) with no constant and follows a wrapped name.
8. The history row is public text (also Codex 4). Taken: UI impact quotes it; no ask.
9. Plan language: "Not taken" → "Rejected alternatives"; the § 4 items named. Taken.

## Codex verification (resumed, session `01a18e5c`)

Verdict: `approve`, no new material finding. Confirmed: the stretch holds (both chips render together in every takeover state that shows the bar; a wrapped name grows the row), the `«FILL»` pair breaks no `dev` gate (`build-landing` checks pages exist, not their banners), and I2 needs no owner ask once the row is quoted.
