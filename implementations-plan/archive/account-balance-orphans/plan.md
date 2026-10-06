# Account balance orphans

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Token-balance rows carry their token's identity triple, one shared predicate gates every raw-row decision, and account removal purges balances through a registered awaited subscriber. Live in `apps/extension/src/wallet/services/token-balance/` (`balance-identity.ts`, `service.ts`, `reconcile-pairs.ts`) and `apps/extension/src/wallet/services/account/service.ts`.
- **Open items**: route the `svc()` `as never` gotcha to `apps/extension/tests/COMPOSITION-TESTS.md`, tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Make the balance row scope itself instead of patching the one leak. `TokenBalanceRaw` gains required `profileId`, `chainId` and `contract` (the paired token's immutable triple), and every place that decides about a raw row goes through `rowMatchesToken`. Account removal purges balances before the account row goes, through a purge registered with the account service, scoped by `(profileId, chainId, address)` tuples. The point patch (join on token id, no schema change) was rejected.

## Why

The only orphan producer was the reconcile that drops keyless imported accounts after a backup restore: it deleted the Account row and emitted an event no balance code listened to. Re-importing the same key reproduces the same address, the stale row already occupied the `(token, account)` slot, and the user saw pre-deletion balances with no time-bounded self-heal.

The same schema gap sat under the whole family: a bare-address purge would destroy a sibling profile's rows (shared addresses are deliberate), an address-plus-profile purge would destroy the same profile's rows on another chain, and a reused token id could attach a dead incarnation's row to a new token. The token triple cannot change after creation, so a stamped copy only goes stale by token deletion, which already has its own purge paths. Pre-production policy meant a required field needed no migration.

## What shipped

- **Schema and stamping.** Rows are stamped from the full token at create. `restore()` derives all three fields itself from the profile's owned tokens, rejects rows whose token the profile does not own, and collapses duplicate `(token, account)` pairs, so nothing identity-bearing survives from a backup blob.
- **One predicate.** Reads, refresh enqueues, event handlers, the projector, the queue's write-time check, `backup()`'s export join, reconcile matching and the occupancy set all use `rowMatchesToken`. The failure mode is a missing row that the reconcile repairs, never a wrong row shown or exported.
- **Reconcile.** It deletes and fences a row only when its token id resolves to a live token of the active profile and the identity mismatches. Rows of foreign profiles and rows whose token is codec-hidden are left alone, since deleting them could destroy recoverable data. Init also runs an idempotent legacy sweep of rows matching the complete pre-identity codec, because hidden debris taxes every id allocation.
- **Purge.** `purgeForAccounts` takes the same lock and invalidation fence as the token purge, has no RPC surface, and runs list, purge, delete inside `reconcileImportedAccounts`, re-checking key absence per row and returning only the scopes actually deleted. The import composable no longer swallows a purge failure: it escapes to the pre-finalize rollback, so an import fails whole instead of committing orphans.
- **Proof.** Two purge tests fail against a bare-address purge and an address-only purge respectively; an end-to-end spec imports a doctored backup and checks the re-imported key starts with fresh balances. `ARCHITECTURE.md` describes the final shape.

## Lessons

### svc() as never

The composition-test `svc()` helper casts its stub with `as never`, so a stub missing a method type-checks. Registering the purge in the balance service's init needed a `registerAccountPurgeSubscriber` stub in 16 account fakes, found only when those tests ran; the existing network stub already documents the same pattern for the chain purge subscriber.
