# e2e determinism

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: e2e helpers synchronise on what the user sees: `waitForTxConfirmation` in `apps/extension/tests/e2e/fixtures/helpers.ts` reads `data-tx-*` attributes rendered by `apps/extension/src/components/composite/activity/TransactionCardLayout.vue`, and the PXE anchor wait is a named workaround constant in the same helper file.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Replace fixed sleeps in the e2e helpers with signals the test can observe, in three independently revertable changes: the small sleeps first, then the post-refresh sleep in `sendTransfer`, then transaction confirmation.

For confirmation the signal is the settled activity card, not an internal store. Four optional `data-tx-*` attributes (amount text, transfer-type label, status, hash) are bound on the card's root next to its existing test id, and `waitForTxConfirmation` waits for the card matching amount and transfer type to reach a terminal status. The attribute values are the strings the user sees, so a refactor of the journal or transaction store cannot break the tests while the rendered card stays intact.

Not done in this work, on purpose: the fixed five-second wait after fee estimation was renamed and documented, not removed, and the popup-handshake signal and a `waitForToast` audit were left for separate changes.

## Why

- Sleeps are both slow and wrong: a sleep that is too short flakes and one that is long enough wastes minutes. The transfers scenario paid about 40 seconds of sleeps.
- Two earlier signal designs were rejected in review. A scan of the transaction store couples the test to an implementation detail. The awaiting card unmounts when the wallet submits, not when the chain confirms, so it would have signalled "submitted" and left the next transfer's nullifier race in place.
- The five-second wait works around a real wallet bug: the simulate-then-prove pipeline does not gate proving on the PXE's anchor block having caught up to the simulation's anchor, and the dApp send paths share it. The correct fix is a shared anchor-freshness gate in the wallet, a larger change than this one, so the test side only names the workaround.
- The popup-handshake signal was dropped because session storage survives service-worker suspension, a non-immediate watcher can miss the first connect, and the signal would observe the handshake bug rather than fix it.

## What shipped

- State-driven waits in place of about nine small sleeps, and the redundant sleep after the private-send refresh removed.
- The `data-tx-*` attributes and `waitForTxConfirmation`, with unit assertions on the card layout for each attribute.
- `PXE_ANCHOR_SYNC_WORKAROUND_MS` with a comment naming the wallet bug it covers.
- A known limit of the helper: it matches on amount and transfer-type label, so it is only safe for sequential submits with distinct pairs. Parallel or repeated identical submits need the hash or a pre-submit snapshot to disambiguate. "Confirmed" here means first mined, not finalised.
