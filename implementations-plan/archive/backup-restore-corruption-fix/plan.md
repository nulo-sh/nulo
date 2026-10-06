# Backup restore data-corruption fixes

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the restore fixes in `apps/extension/src/composables/useFullBackupImport.ts` and `apps/extension/src/utils/full-backup-helpers.ts`, the transaction service change under `apps/extension/src/wallet/services/transaction/`, the cross-profile suite `apps/extension/src/wallet/services/cross-profile-isolation.test.ts` and the live round-trip `apps/extension/tests/e2e/network/backup-restore-integrity.test.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Fix three high-severity corruption bugs in full-backup restore and profile deletion, plus two cheap neighbours, as one change:

- Deleting a profile must not erase other profiles' transaction history.
- Remapping a network id must touch only the rows that carried the old id.
- Restored token balances must not collapse across chains.
- The test fixtures are rebuilt from the real schemas.
- The import completion step is awaited and every client is disconnected on a throw.

No storage migration: nothing about the persisted shape changes.

## Why

The transaction service purged by chain id alone, so deleting one profile on a chain wiped every profile's history there. The account service already cascades account deletion on both purge triggers, and the transaction service already cleans up per account, so the chain-wide subscriber was redundant and its only distinct effect was the over-wipe. The first design added a profile id to transaction rows. It was rejected because restore would then trust an attacker-supplied field, it changed a stored shape for no gain, and its premise was false.

The backup blob is attacker-controlled, so each fix is judged against a crafted one:

- With the subscriber gone, a restored transaction whose account belongs to another profile would show in that profile's activity. Restore therefore accepts only transactions for accounts it just imported.
- Pairing restored networks to backup rows by field equality is ambiguous, because a failed restore echoes its input back. Pairing is by position in the restore result, and a network id is rewritten only where it equals the old id.
- Profile ids are still rewritten on every row, unconditionally, so a hostile row cannot name a victim profile even when the root id is unchanged.

## What shipped

- The chain-wide purge subscriber and its dead method are removed from the transaction service; cleanup runs through account deletion.
- Restore drops transactions for accounts it did not import.
- Network remapping is index-paired and scoped to the old id; the profile-id remap is unconditional.
- Token balances are re-linked to the tokens the restore just created, paired by position in the restore result, and kept only when the balance's account was imported on the token's chain. A row that fails the pairing is dropped and recorded rather than resolved last-wins, and recorded restore errors append rather than overwrite.
- The completion step is awaited in its own try block that cannot trigger rollback, and each client has a finally-disconnect.
- A live-sandbox test exports a backup, doctors it to carry one valid and one foreign-account transaction, imports it into a fresh extension and checks storage for the first and the absence of the second.

Deferred from this change: an awaited deletion coordinator that hands cleanup the exact account set, so a worker killed mid-cascade cannot orphan transactions. It has since landed as `apps/extension/src/wallet/services/profile-deletion/coordinator.ts`.

## Lessons

### Async events

`EventHandler.invoke` discards the promise of an async handler, so awaiting an emit waits for nothing and a rejection escapes. Anything chained on an event, such as profile deletion's cleanup, is fire-and-forget, and deletion returning does not prove cleanup finished. Subscriber registration order is also not guaranteed, since services in one start phase initialize in parallel.
