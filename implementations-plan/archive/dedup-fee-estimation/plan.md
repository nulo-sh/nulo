# One fee-estimation state machine

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: a shared engine in `apps/extension/src/composables/internal/fee-estimation-engine.ts` under `apps/extension/src/composables/useFeeEstimation.ts` and `apps/extension/src/composables/useFeeEstimationMap.ts`, which keep their public surfaces.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

`useFeeEstimation` (one estimate) and `useFeeEstimationMap` (one estimate per key) each hand-rolled the same debounce, counter, in-flight, completed-token, remote-cancel, handed-off and dispose machinery. That machinery now lives once, in a private engine that is a pure TypeScript state machine with no Vue imports. The engine reports through callbacks (a result sink, an estimating sink, an optional error sink); each composable keeps its own Vue state and adapts the engine to its existing API. The scalar composable uses a single fixed sentinel key and plain refs.

## Why

Both files changed in lockstep in every feature that touched estimation, so a protocol change meant editing the same logic twice. The refactor had to leave both consumers (the send page and the execute popup) untouched.

Two alternatives lost on a real defect each. Adding a per-key handoff to the keyed composable and wrapping it for the scalar case puts a member on the multi-operation surface whose call would orphan an in-flight stash, needs writable computed values to keep the ref contract, and coerces a successful `undefined` to `null`. An engine that owns the Vue state and has the keyed composable wrap it makes that composable a pass-through. The sink-based engine avoids all three because the duplicated machinery is the only thing it holds.

## What shipped

- Two seams are preserved exactly. The scalar `handoff()` is in-flight-inclusive (completed token, else the in-flight one, marked handed off). The keyed `handoffAll()` is completed-only. The keyed estimator keeps its flow key (`op:` plus instance and key); the scalar one keeps its two-argument signature and mints none.
- Both handoff operations are atomic engine members, so token selection and the handed-off mark never split across layers. The keyed one marks each token immediately before assigning it, so a throw mid-iteration cannot leave later tokens marked but unreported.
- Sink order matches the old write order: schedule clears the result before setting estimating, cancel clears the result before clearing estimating, and the error sink fires before estimating flips off. The result sink fires before the completed bookkeeping.
- The characterization tests were written first and passed against the old implementation: in-flight and never-started handoff, the keyed asymmetry, supersede after handoff, a rejection after cancel as a stale settle, a writable-ref seed write, `undefined` preservation, dispose mid-flight with exactly one remote cancel, no random-number use on the scalar path, `rearm` reverting ownership and per-instance isolation. All pass unchanged after the refactor, which is the equivalence proof for both adapters.
