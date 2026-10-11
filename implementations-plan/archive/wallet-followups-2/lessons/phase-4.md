# Phase 4: #291 log

## 2026-10-11: implementation

- The co-mount case failed on the base store exactly where the plan said: after the first backoff tick no gas read had been issued (`expected 3 to be 4`), so the notice was backed by no retry.
- `adoptForRetrySubscribers` runs after the tx-settle forced read; the comment on `adoptGasRetryDebt` names both observers. The rewritten comment drops the decision tag the old one carried.
- Store cases: the shared-key failure and the mid-flight arrival fail on the base store; the mid-flight release control passes on both.
- Fuzz model, first run: a counterexample owed `ready` for a key whose entry a profile fence had cleared. The store's forced read returns at once when the key has no entry, so no read, no failure and nothing to recover. The model now owes only when the key has an entry at the settle, as well as a live `txRefresh` subscriber and retry cover. A model error, not a store one; recorded in the decision ledger as a refinement of D9.
- Red proof: on the base store the pinned tape fails C1 (`tx-settled key ... under retry cover is not ready after a clean drain`), and the rewritten control fails.
- `NULO_FUZZ_RUNS=2000`: 5/5, no counterexample.
