# Phase 1: the per-backup key and the encrypted-file tag (Arc 1)

## Phase 1.1

- **The incarnation id already existed.** `ProfileService.workerId` (`crypto.randomUUID()` per instance) already keeps session handles from naming a later worker's session. `RunFence.incarnation` reuses it rather than drawing a second id.
- **The page's completeness check would have blocked backups for good.** The plan had `full.vue` fail the run when an imported account in the account slice has no key row. `EntityStorage.getAll` hides a row its codec rejects (`packages/wallet-core/src/storage/entity_storage.ts`, `decodeRow`), so one corrupt key row makes that check fail on every retry: the profile could never be backed up again, where today the backup ships and the restore drops that one account. Replaced by reading the account slice inside `exportFullBackupKeys`, before the key rows, in the same call. A concurrent import then adds at most a key row with no account (removed by the orphan sweep), never an account without its key, and a corrupt row behaves as today. Recorded in plan.md's decision ledger.
- **`openBackupTransfer` drops `dekReplaced`.** It is exactly `sourceDek === null`; `AccountService` derives it.
- **`getProfileDekSealed` is deleted, not just unlisted.** It had no caller outside one integration test.
- **A key-export failure still shows "wrong password".** The password path's catch flags `isWrongPassword` for any error, including a fence refusal mid-export. Kept: routing it elsewhere would change what a failed export shows, which is an owner call; a lock or switch mid-export unmounts or reroutes the page anyway.
- **Mutation check.** With the reseal removed and the DEK put back in `imported-keys-dek`, the three per-backup-key tests fail and the three held-export fence tests time out (no seal runs to hold); the two restore tests pass, as they should, since both shapes restore.
- **Gate.** `audit:vue`, `test:all` and the four smoke specs passed on the first run. `backup-imported-account.test.ts` drives the new export end to end in a real extension: the imported key restores and decrypts.
