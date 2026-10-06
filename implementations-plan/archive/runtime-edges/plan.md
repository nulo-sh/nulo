# Runtime edges

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A typed duplicate-initialization error in `apps/extension/src/wallet/services/execution/execution-coordinator.ts`, a derived passkey window budget in `apps/extension/src/wallet/services/passkey/service.ts`, and a settle-then-aggregate service start in `packages/wallet-core/src/base/index.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

The last batch of a remediation arc fixed three low-severity runtime edges with minimal changes, each pinned and probed by reverting the fix.

- **Duplicate initialization**: classify the failure at send time, only for a transaction that carried the account-initialization call, as a typed error with its own journal kind and copy: another first transaction initialized this account, wait for network sync, then retry.
- **Passkey window budget**: derive the timeout from the ceremony constant instead of a magic five minutes.
- **Service start**: settle every service in a phase before failing.

## Why

- A mined receipt carries only success or reverted, with no error text, so the seam is the send-time rejection, before the task fails. Error text alone is unsafe: any double-spend says "Existing nullifier", and without provenance a note collision would be reported as "account initialized elsewhere". So the wrap decision that builds the initialization call threads an `initializesAccount` flag through the built transaction, the coordinator context and the reused-estimate caches, and classification fires only when it is set. A node cross-check before sending was rejected: the node client's retry and backoff blow caller timeouts offline.
- The passkey fallback runs two ceremony legs of three minutes each inside one window timeout of five minutes, so a slow fallback could not finish. The budget is two legs plus a minute, derived from the constant, and a test observes the value the window manager receives.
- The old reject-fast start left same-phase siblings running unobserved and no stop hook. Settling the phase and throwing an `AggregateError` that carries every root cause gives the boot log a full post-mortem, since a start failure vetoes retry for the worker's lifetime. Rolling back live listeners is out of scope, and gating handler registration would mean changing every transport constructor.

## What shipped

- `DuplicateInitializationError` registered in the messaging error table and the wallet SDK error envelope, narrowed to exactly that class so other wallet errors keep their reconstruction policy. A negative pin guards that, and the journal-kind mapping applies at both the send and transfer catch sites. The match is `/existing nullifier/i` only, since the other candidate texts never reach the send path.
- Real-account tests run the actual derivation to prove the flag is set, and the reuse paths are pinned to carry it.
- `PASSKEY_TIMEOUT_MS` is `2 * PASSKEY_TIMEOUT + 60_000`.
- `ServiceCollection.start()` uses `Promise.allSettled` per phase, never starts a later phase after a failure, and stays pending until every sibling settles.
