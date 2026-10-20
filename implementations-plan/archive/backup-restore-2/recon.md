# backup-restore-2: recon

Base: `origin/dev` at `ad4de50d8`. One Explore agent (sonnet) for the reuse sweep; the driver traced the restore order and the secret lifetimes. Paths are relative to `apps/extension/src`; `S` = `wallet/services`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Bind a restored row to the threaded profile id | `S/auth-registry/service.ts:775` parses `{ ...authwit, id, profileId }` | reuse the pattern in `S/transaction/service.ts:632` |
| Scope key for an account | `accountScopeKey` (`S/account/spec.ts:56`), used by auth-registry and token-balance | reuse |
| The restored profile's accounts, without a session | `AccountService.getAccountsRaw(profileId)` (`S/account/service.ts:880`) | reuse |
| Per-row refusal recorded, never aborting the slice | `restoreRows` (`S/restore-rows.ts`) | reuse |
| Awaited cleanup when an account is dropped | `AccountService.registerAccountPurgeSubscriber` (`S/account/service.ts:1206-1214`), used by auth-registry (`:145`) and token-balance (`:159`) | reuse in `TransactionService.init` |
| Re-deriving a derived row before the session opens | the integrity check in `openSessionVerified` (`S/profile/service.ts:1316-1350`), pinned for the import by `S/profile/service.integration.test.ts:2829` | reuse as is (plan, Alternative A) |
| The restored profile's master before `finalizeRestore` | `pendingRestoreSecrets` (`S/profile/service.ts:176`), set only by the passkey restore (`:2582`); `getProfileSecret` (`:2142`) needs an open session | not used (plan, Alternative A) |
| Legit-path proof with the real derivation | `tests/e2e/backup-roundtrip.test.ts` (smoke), `tests/e2e/network/backup-migration-roundtrip.test.ts` (network): both restore a derived account | reuse, no new scenario |

## Facts the plan rests on

- `TxSchema.profileId` is optional (`S/transaction/spec.ts:202`); the only other optional `profileId` is the operation journal's, which no backup carries.
- `normalizeAllIds` rewrites the key only on rows that carry it (`utils/full-backup-helpers.ts:478`).
- The import drops every tx, authwit and token-balance row whose account this restore did not import (`composables/full-backup-restore.ts:400-470`), with `console.warn`, not a row error.
- `AccountService.restore` checks schema, chain identity, empty address and batch duplicates; it never derives (`S/account/service.ts:973-1034`).
- The session opens in `finalizeRestore`, after every slice is written; `openSessionVerified` re-derives every derived account there (`S/profile/service.ts:1316-1350`, `S/account-integrity/coordinator.ts:178-191`).
- A password restore holds the master only inside `restorePasswordProfile` and wipes it after sealing (`S/profile/service.ts:2307-2372`).
- A keyless imported account dropped by `reconcileImportedAccounts` emits `onAccountDeleted` (`S/account/service.ts:1251`); the tx listener (`S/transaction/service.ts:307-311`) runs fire-and-forget, deletes rows scoped to that profile and marks shared unscoped rows `ambiguous`. The reconcile awaits only registered purge subscribers, and `TransactionService` registers none.
- `nulo-v6.1` superseded `nulo-v6` in place (`packages/aztec-runtime/src/account/address-freeze.ts:108-132`); a `nulo-v6` backup's derived rows restore and the integrity check quarantines their chain (`S/backup/backup-migration-registry.ts:66-72`).
- `restoreImportedKeys` rewraps a key without checking it against its row's address (`S/account/service.ts:1182-1193`).
- `TransactionService.restore` and `AccountService.restore` are reached only from `composables/full-backup-restore.ts` (`:406`, `:787`), through the framework `restore` RPC, which `isTrustedInternalSender` limits to extension pages (`packages/extension-messaging/src/background/service.ts:26,46`).
- A row error reaches the person as the existing "Profile import completed with some errors" outcome, with the message verbatim (scrubbed, at most 200 characters) in the details log (`utils/full-backup-helpers.ts:335`, `popup/pages/import.vue:133`); onboarding shows only "Some entries from the backup couldn't be restored."
- No stored shape changes: `stored-shapes/snapshot.json` and `goldens.json` (`txs.full`, `txs.minimal`, `txs.ambiguous`) stay as they are.

## Collisions

- Open PR #924 (encryption-at-rest-1) edits `S/profile/service.ts` near the restore commits (its hunks at old lines 2392 and 2548). Textual only: rebase on whichever lands first.
- Open PR #938 (migration-rule-1) edits one hunk each in `S/account/service.ts:171` and `S/profile/service.ts:1504`. No stored shape moves here, so no ordering after #938.
- #964 edits the backup pages, not the restore services. #968 (refused-send-1) does not touch these files.

## Tests that change with the code

- `S/transaction/service.test.ts:299` and `S/transaction/service.finality.test.ts:206,227`: the account fake gains `getAccountsRaw`.
- `S/cross-profile-isolation.test.ts:567`: the hash-collision case names an account of the restoring profile, so it still proves the collision guard.
- `S/cross-profile-isolation.test.ts` carries the reconcile test: it wires the real `AccountService` and `TransactionService`.
