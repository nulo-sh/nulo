# Incoming sync indicator

## Outcome

- **Date**: —
- **Status**: superseded by holdings-loading-sync.
- **Shipped**: a per-token "Catching up" indicator on the token card, driven by a coverage signal from the incoming public-transfer scan in `apps/extension/src/wallet/services/incoming-transfer/service.ts`. The indicator itself is gone; its successor in [holdings-loading-sync](../holdings-loading-sync/plan.md) removed the per-row dot and replaced the signal with an outcome-based scan health, read by `apps/extension/src/composables/useIncomingSyncHealth.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Show, per token, that its incoming public-transfer history is being backfilled from far back, and distinguish that from the steady poll. The indicator was a pulsing dot with the caption "Catching up", escalating to the loading shimmer when the balance itself was also unresolved.

The service derived one state per network and contract from data the scan already reads each tick, with no extra node call: `backfilling` or `caught-up`. It emitted an event only on a transition and exposed a snapshot method for first render. Any gap in the signal resolved to `caught-up`, so a bug could never strand a token in a permanent spinner. The token list subscribed, seeded from the snapshot on mount and on account or network change, and passed a flag to the token card.

## Why

On a fresh token add or a service-worker restart the scan cursor can be far behind the tip and take several budgeted passes to catch up. The screen showed nothing, which reads as "broken, nothing here" instead of "still pulling history".

The first signal was wrong. It compared the tip with the block of the cursor's last event, but that is where the last event was, not how far the scan had covered. A quiet token whose last event was long ago, fully scanned to the tip, would have read as far behind and shown the indicator forever. The shipped signal is coverage: a pass reports that it reached the tip only when it was neither budget-incomplete nor had a page dropped by the validator. The same review found that a hostile indexer page that did not advance had to count as dropped, not as caught up.

Two cases were accepted rather than closed. A failed tips read emits nothing and leaves the last state, because flipping to caught-up on a transient error would clear the indicator mid-backfill. After a reconciliation rewind, the state returns to caught-up only on the next forward pass.

## What shipped

- As first built, the coverage signal, transition-only emission, the snapshot method and the client wiring, with tests for the quiet-token case, budget-incomplete passes, dropped and non-advancing pages, deduplication and the fail-open default.
- As first built, a token card prop and the two visual states, and a token-list subscription guarded against three races: a live event beating a later-resolving snapshot, an A to B to A scope cycle, and a snapshot clobbering a balance event. The guards use a live-event clock and a synchronous scope generation captured before any await.
- The indicator was later removed. Its successor drops the per-row dot and the lag-based framing and reports whether recent scans made progress instead.
