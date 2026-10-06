# Migration retry budget and kill-loop bound

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The boot gate in `apps/extension/src/wallet/runtime.ts` spends the migration retry budget only on a user gesture, the engine in `packages/wallet-core/src/migration/migrator.ts` counts an interrupted `up()` exactly once, and `apps/extension/src/components/MigrationBarrier.vue` carries the Retry button; the one-shot key is `SCHEMA_RETRY_REQUESTED_KEY` in `apps/extension/src/wallet/storage/migrations/index.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Three defects in the storage-migration machinery were fixed before the first real migration ships.

- **Retry budget.** Ambient service-worker wakes no longer spend it. A blocked migration is retried only on a user gesture, plus at most one slow autonomous backstop run per episode, and a terminal verdict can only come from a gesture-initiated attempt.
- **Kill loop.** A worker kill during `up()` is counted, so repeated kills bound out at the retry limit and reach the recovery screen instead of looping.
- **Probe.** The boot storage probe counts journal rows in the area where the journal actually lives.

## Why

A recoverable block was burning its budget on routine wakes (the price alarm alone fires every few minutes), so a transient failure escalated to a terminal "Reinstall" screen with no user action. A kill during `up()` resumed through the restore path without being counted, so a crash-boot loop had no bound and no recovery surface. A bare short-circuit would have killed automatic retry and made the barrier's "reopen to retry" copy false, and a cool-down alone only slows the burn. The barrier already owned a raw storage channel, so a button writing a one-shot key gives a true gesture signal with no new RPC.

## What shipped

- **Gate.** Before the engine runs, `doStart` reads the blocked status and the retry key. It fails closed: an unreadable gate or a failed key removal means no engine run on that boot, so read faults cannot burn attempts. The status is decoded field by field, so a valid terminal verdict is never voided by a malformed timestamp. The status is stamped with the manifest version, so an update starts a new episode and clears the durable attempt record too. The backstop claim is written before the run, and the backstop runs only in episodes with no gesture. The retry key is consumed before a run, so a mid-run kill cannot replay the gesture.
- **Engine.** Attempts accumulate per version across failure kinds. A retained journal carries a `counted` marker set before the bump, so a restore throw and a later resume never double-count. After a successful restore of an uncounted journal the engine counts, then stands down with a retryable needs-recovery result, so one authorization covers at most one `up()`. The accepted cost is that a single innocent kill now shows the retryable barrier instead of healing silently.
- **Barrier.** Retry writes the key and reloads the extension, and terminal blocks show no button.
- **Probe.** It is count-only against local storage; the bytes half was removed because the storage adapter does not expose it.
- **Tests.** `apps/extension/src/wallet/runtime.migration-gate.test.ts` drives a real engine over a shared durable store with fresh runtimes per wake, because the invariant lives at the runtime layer, not the engine's; three engine pins were deliberately re-pinned to the stand-down contract. The probe itself has no pin.
