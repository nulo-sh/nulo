# Account and profile siloing

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Activity state is held in per-scope slices keyed by profile, network, chain and account (`packages/wallet-core/src/activity/scope.ts`, `apps/extension/src/stores/activity.store.ts`); account rows are filed per profile and chain, and a switch guard lives in `apps/extension/src/utils/in-flight-send.ts`. The durable causal protocol it also built was later deleted as unused ([hd-behaviour-alignment](../hd-behaviour-alignment/plan.md)).
- **Open items**: a resurrected late-mined authwit transaction leaves its registry row pending forever, tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

One immutable composite scope, profile, network, chain and account, governs every activity record, cache slice and rendered row, and a producer may mutate only the slice named by its own trusted scope. There is no "ingest into the active slice" API. Execution drift is prevented rather than detected: while a send is in flight, a voluntary account switch is blocked, so the active scope is constant for the send's life and the builders' reads of the active account are always right. Lock is never blocked, and cancelling the send is the escape hatch. The guard has since been narrowed to the wallet's own sends, see [approval-scope-follow](../approval-scope-follow/plan.md).

## Why

The activity feed was flat and keyed by account and chain, so a record could land in whichever view was active when it arrived, and a snapshot that finished after a switch could overwrite the wrong view. Two profiles from the same seed derive the same address and overwrote one account row. Transactions carried no owning profile, and journal writes could race each other. A first design detected a scope change during a send and unwound it, which needed a session fence, a commit-to-submit hand-off and recovery on restart, and three audit passes kept finding holes in it. Blocking the switch removed that whole class and made a simpler design correct.

## What shipped

- **Pinned first.** Characterization tests for every behavior a later step flips, then the causal protocol as a pure, property-tested module (per-source counters, coverage watermarks, incarnations, tombstones). A single global-maximum sequence was rejected because it loses out-of-order distinct records.
- **Account re-key.** Account rows are filed under profile, chain and address, so same-seed profiles coexist. The frozen account-address derivation and artifacts are untouched.
- **Producers and storage.** The protocol's allocate, settle and abandon coordinator, and scope-stamped transactions that record their owning profile and network.
- **Frontend slices.** A switch swaps the active slice reference, so a cached slice renders instantly with no clear-and-rebuild flash. A snapshot updates the slice it requested, never the active one, and cannot resurrect a deleted row. The slice store owns transactions and awaiting placeholders; journal and incoming records keep scope-filtered ingest that is now profile-aware.
- **Journal integrity.** Every journal read-modify-write, delete and supersede shares one lock. Queued-journal creation and dispatch use the same account-selection function, including the wallet-ordered fallback. Re-filing a scope is in place, creation is fenced on profile existence, deletion epoch and network liveness, and purge snapshots are taken under the transition lock.
- **Guard and proof.** The in-flight switch guard, its network e2e (`apps/extension/tests/e2e/network/in-flight-send-guard.test.ts`), an account-switch containment e2e (`apps/extension/tests/e2e/network/account-switch-isolation.test.ts`) and unit pins such as `apps/extension/src/wallet/services/account/composite-key.test.ts`. Incoming-transfer identity uses a profile- and network-scoped record id, which replaced a planned composite storage key.
