# Phase 3: #839 rows 3, 4 and 5

- `useJournalMirror` loses `appendAdded`, `dropRefusedUpdate` and `supersede`, and gains Home's retry (the catch wraps `read()` only, re-arms for a current run, always rethrows). Home's wrapper is one `.catch`; its suite passed unchanged over both the base and the new code, so the move kept its timing.
- Base copies at `993b3efc`. New cases red over base: the mirror's three retry cases, History's refused-update, reconnect and profile cases, TokensView's listed-once and reconnect cases. "A retry armed for a run a later run superseded reads nothing" is green over base, which has no retry: it is a control.
- Replaced cases red over new: the mirror's `supersede: false`, `dropRefusedUpdate` and `appendAdded` cases, TokensView's `(BUG PIN)` and reconnect cases, History's two.
- Mutations, all red: appending a listed id, dropping a refused update, `fence.snapshot()` for `begin()`, no retry, a stale refusal re-arming, `dispose()` keeping the timer, History's read without the profile check.
- History's `keys()` helper threw on an empty list (no `TransactionsList` renders); it now reads none.
- `types/auto-imports.d.ts` is regenerated only by a Vite build (`vitest.config.ts` sets `dts: false`); with load1 above 150 the line was edited to the generator's form, and the phase 4 build must leave it unchanged.
