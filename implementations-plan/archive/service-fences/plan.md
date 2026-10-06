# Service fences

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: deletion and generation fences in `apps/extension/src/wallet/services/account/service.ts`, `apps/extension/src/wallet/services/restore-fence.ts` (used by the slice-restore writers) and `apps/extension/src/wallet/services/token-balance/balance-job-queue.ts`, each with a colocated test.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Three wallet services dispatched a durable write after an await, under an authorization captured before it: account creation, slice restore at backup import, and the balance sync. All three get the repo's existing capture-then-assert discipline, with no new mechanism. The fence is captured before the first await it guards, and asserted immediately before the write with no await in between.

## Why

JavaScript is single-threaded only within one synchronous block. Once a value crosses an await, anything may have run, including a profile deletion that begins and finishes. An epoch captured after the secret read in account creation can already be past the bump, so the assert passes and an orphan row lands for a deleted profile. The same holds for a restore that captures its epoch lazily at the first row.

The restore design also had to respect that rows lie about ownership: authwit and balance rows carry no profile id and a transaction row's is optional and backup-controlled. So the fence keys on a profile id the composable passes in, never on row fields.

The alternative of a torn-write guard for restore was passed over in favour of the writer fence.

## What shipped

- Account creation reads the deletion state and rejects a reserved profile before the secret await, captures the epoch there, and asserts it just before the row is written. Tests park the secret and the chain-id probe while a deletion runs, and the first one discriminates capture order.
- The slice-restore writers capture one epoch per profile at entry (after initialization, before any other await) and assert before each write. A post-deletion row throws and becomes a per-row restore error, which keeps the import's per-row error-continue contract. The authwit, balance and transaction restore calls take a required profile id with an exact typed client signature, and each service validates it and fails closed before capturing. The configuration and account-state slices are exempt because they have no profile anchor or live in the node-side store.
- A table-driven suite covers each writer, including an entry-race case where the deletion both begins and releases during the park, which is the case only an entry capture rejects. Every entry-time pass over raw rows tolerates a hostile `null` row, since a crafted backup must not turn the per-row contract into a whole-import abort.
- The balance job queue takes a required `getGeneration` callback. A batch captures the generation first and bails before its result write (failing the task) and before its failure write (silently, since that helper has no task). Making the callback required turns a dropped production wiring into a type error.
- Each fence was probed by reverting it and watching the pin turn red.
- Capture fences before the await they guard, and pin the capture point itself: a test that only begins a deletion exercises the reservation, not the capture. A hold point injected for tests is a park like any other.
