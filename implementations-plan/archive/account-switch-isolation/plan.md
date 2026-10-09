# Account-switch isolation

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Containment of cross-account state on an account switch, in `apps/extension/src/composables/useIncomingTransfers.ts`, `apps/extension/src/stores/app.store.ts`, `apps/extension/src/utils/activity-rows.ts` and `apps/extension/src/wallet/services/incoming-transfer/service.ts`, proven by `apps/extension/tests/e2e/network/account-switch-isolation.test.ts`.
- **Open items**: the structural slices for journal, incoming, task and cancel state were not built, tracked in #152.
- **Seeds retired**: the plan's goal and loop seeds are spent and must never be pasted.

## Decision

Close the leak first, then restructure behind it. The first stage ships a drop-only containment layer: every reducer that feeds the activity view filters on the scope it can see and discards foreign records, with no sequence numbers or new slices. The later stages were designed to move each producer into per-scope slices behind those guards, proven by checking which slice a record lands in with every runtime filter switched off. Scope is always the composite of profile, network, chain and account address, never the account alone, and it is read from each document's own store, not from a global.

## Why

After an account switch within a profile, the activity feed showed account A's history and, worse, A's incoming transfers inside B's view. The feed was built from flat active-view state mutated by broadcast events and by async fetches keyed on whichever account was active when they resolved, and the feed never remounted on a switch. The incoming-transfer service polls every account and broadcasts to every client unfiltered, so the privacy exposure was real, not cosmetic. Guards alone are fragile, since each new listener is another place to forget one, so the plan treated containment as a ship-now privacy fix and structural slices as the durable answer, with an explicit off-ramp after the first stage.

## What shipped

- A synchronous scope watcher in the incoming-transfers composable clears the visible rows on a switch, captures scope and a generation before each fetch, and accepts add and update events only when profile, network and account address match the live scope.
- The app store's transaction fetch captures the account and chain when it starts and keeps only matching rows, so a fetch that lands after a switch cannot replace the new account's rows.
- `buildActivityRows` filters transactions, incoming transfers and journal rows by the active scope as a last line of defence, and the journal detail page validates its record against the active scope.
- The incoming-transfer service keys everything on the scanned `accountAddress`, never on the note's `owner`, and fails closed on both emission and read when the visibility setting cannot be resolved; records are still retained so they reappear when it resolves.
- A deterministic network test holds the incoming poll after note discovery through an e2e-only gate that is compiled out of production builds, switches accounts, and asserts that A's incoming and settled rows render nothing in B, with a switch-back as the positive control.
- Per-scope transaction and awaiting slices came later from [account-profile-siloing](../account-profile-siloing/plan.md). Journal, incoming, task and cancel state stay flat and isolated by ingest filters and guards.
- Not built: the durable sequence and tombstone protocol, wire-level validation of every incoming event, keying nullifiers by scope (a siloed nullifier is unique within one network's tree, not across networks), and the task-to-journal correlation id.
