# Bounded chain sync at the end of a backup import

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The bounded import tail in `apps/extension/src/composables/importPreflight.ts` and `apps/extension/src/composables/full-backup-restore.ts`, the `probeNodeStatus` RPC in `apps/extension/src/wallet/services/network/`, the restore-pending marker in `apps/extension/src/wallet/services/profile/restore-pending-repository.ts` with its typed error in `packages/extension-messaging/src/errors.ts`, and the token-card failure and refresh states in `apps/extension/src/popup/components/modules/general/TokenCard.vue`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

An import requires a reachable RPC, but waiting for it is bounded and the failure is honest. A short connectivity preflight with backoff runs first, the registration leg gets a hard shared deadline, and anything skipped is recorded and shown on the existing finished-with-errors screen. That screen keeps its Continue gate; there is no auto-route on failure. A durable background re-registration design was declined as its own arc.

## Why

- A smoke backup-roundtrip test flaked at its product root. The popup bootstrap was storage-bound and could not hang on a dead RPC; the stall was the account-state restore at the end of the import. It registers each sender and contract through the offscreen chain runtime, which dials the network URL carried in the backup, after the session was already open and every storage slice written.
- On a hanging RPC the popup's 60-second request timer fired first and showed "Import failed" for an import that had succeeded. On a failing RPC the per-item errors parked the flow on a screen that waits for a click. A wallet import should not block on public-RPC reachability for non-critical registration state.
- The backup is attacker-controlled input, so the registration leg also needed caps and a normalizer, not only a deadline.

## What shipped

- One deadline is captured when the tail begins. The preflight spends at most about 21 seconds (5 seconds per attempt, three attempts, backoff between), probing only networks that have something to register. The registration leg gets the remainder, capped at 30 seconds, and the service refuses to launch new work past it, checked before every registration, so at most one call is left in flight.
- The probe is a single non-retrying node-info call aborted at the fetch boundary, added to the node-factory port, its adapter and the fake in lockstep. Only an active chain counts as go; a wrong chain is its own per-network failure.
- One pure normalizer merges slices by network and enforces aggregate caps before both the preflight and the service. Excess or invalid content collapses into one fixed-size record; attacker items are never copied into the error log. A settled flag stops a late result from appending to the log or changing the route.
- A pending marker is written before the restored rows and cleared when finalize is entered. A profile that still carries it refuses unlock with a typed error, shown on the auth screen with the existing delete-profile action. The marker covers the storage-slice window only, not the later chain-registration leg. A corrupt marker blocks; a generation mismatch is purged.
- Token balances persist a bounded sync-failure record and show a dimmed last-known amount with a "Couldn't refresh" caption; the card also shows a refreshing dot.
- The smoke test gained one causal branch, route advanced or Continue visible, with its 90-second bound unchanged. A dead-RPC e2e covers refused, blackholed and stateful endpoints. The smoke test then passed three consecutive times with no retries and the bound untouched.
- Registration-wide cancellation, durable re-registration and editing the RPC mid-import were left out.
