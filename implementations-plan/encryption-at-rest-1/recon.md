# Recon: encryption-at-rest-1 (#522)

Base: `origin/dev` at `2f591ddd`. Three read-only explorers (Sonnet) plus the planner's own reads. Paths are relative to `apps/extension/src/` unless they start with `packages/`, `tests/`, `apps/` or a root file; `S` = `wallet/services`.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| A per-profile key from the profile's secrets | `importDualSecretHkdfKey` (`packages/wallet-crypto/src/dual-secret-hkdf.ts:16`); the pattern of `pxe-store-key.ts:36-45` and `dapp-session-mac-key.ts:10-25`; key handed out by a `ProfileService` facade (`S/profile/service.ts:1019`), never the raw secrets | reuse the pattern; one new label, pinned by a vector in `wallet/crypto/key-vectors.test.ts` as V11 pins the PXE store label |
| AES-GCM with associated data under a `CryptoKey` | none generic. `EncryptionKey.encrypt` runs PBKDF2 600 000 rounds per call (`encryption-key.ts:42-58`), so it cannot seal rows. `sealDekUnderWrapKey` (fixed AAD, 32-byte plaintext) and `sealImportedSigningKeyV2` (no AAD) hand-write the same `version(1) ‖ iv(12) ‖ ct` frame | build new, small; closed known limit #523 ("reopen if a third box needs this frame") applies |
| A wrapper that seals or verifies rows over `EntityStorage` with a per-profile key provider | `DappSessionMacStorage` (`S/dapp-session/mac-storage.ts`): key provider `(profileId) => Promise<CryptoKey>`, a locked read hides and never deletes, `rowsForProfile` purges raw rows by `profileId` without the key | adapt: the same shape for sealing |
| A storage seam for every root | `MinimalStorageArea` (`packages/wallet-core/src/storage/entity_storage.ts:15-19`); services build `new EntityStorage(ROOT, browserApi.storage.local, codec)` in their constructors (about 20 sites). The #865 plan (branch `worktree-migration-rule-1`, docs only at `ef78a901`) adds factories `entityStorage(name, area)` / `valueStorage(name, area)` over a `STORED_SHAPES` registry as the single construction seam | adapt; land on #865's factories if they are on `dev` first |
| Hide-not-delete for an unreadable row | `EntityStorage.decodeRow` keeps the row and logs a fixed category and the payload size only (`entity_storage.ts:98-145`) | reuse |
| Unlock-time maintenance hook | none generic. `verifyBeforeSessionOpen(profileId, master)` (`S/account-integrity/types.ts`, called at `S/profile/service.ts:1318`) runs under the facade lock before `open`, with no DEK; `onActiveProfileChanged` subscribers run after open (token-balance reconcile, seeding, `IncomingTransferService.hydrateSchedulers`); the coordinator's `{walletVersion, digest}` stamp makes a pass idempotent per profile (`S/account-integrity/coordinator.ts:~113-150`) | build new on `onActiveProfileChanged`, reusing the stamp idea |
| Re-seal rows under another key | `AccountService.restoreImportedKeys` (`S/account/service.ts:1153-1192`), `resealImportedForReset` (`S/account/service.ts:460`) | reuse the shape |
| Typed decrypt failure on the wire | none. `RecoveryModeError` (`packages/extension-messaging/src/errors.ts:586`) is the pattern: a `CODE`, a `REBUILT_AS` entry, a mapping in `S/wallet-sdk/error-envelope.ts:64-214`, which otherwise sends a constant unclassified message | build new only if a caller must tell it apart; else the hidden-row category |
| Log redaction | `trim()` and `REDACTED_KEYS` (`wallet/logger/utils.ts:83-135,193-285`), `log-payload-ban.test.ts` | reuse; add any new field names |
| Raw-storage "no plaintext" test | none for `chrome.storage.local`. Nearest: `tests/e2e/network/opfs-storage.test.ts:67-96` (scans OPFS files for a plaintext SQLite header); `S/note/service.test.ts:233` | build new |
| Fakes for unit and composition tests | `MemoryStorageArea` (`packages/wallet-core/src/storage/memory-storage-area.ts`), `FakeBrowserApi` (about 88 files), `recordWrites` (`S/storage-write-log.ts`), the codec corpus `S/storage-codecs.test.ts` (12 stores) | reuse |
| Migration e2e on a real cold boot | `tests/e2e/migration.test.ts` (seeds raw rows, relaunches on a persistent `userDataDir`); #865's planned update harness `tests/e2e/fixtures/update/` | reuse `migration.test.ts`'s mechanics; the harness if it has landed |

## Storage-root inventory (`chrome.storage.local`)

Every store writes `JSON.stringify` strings under `${root}@${id}` or `${root}`; `getAll`/`getKeys`/`getValues`/`rawEntries` read the whole area and filter by prefix. The offscreen document never touches `chrome.storage` (PXE state is the encrypted OPFS store). "Key leaks" = identifying data in the storage KEY, which value encryption does not hide.

### Profile-scoped content (boundary candidates)

| Root | Owner, codec | Content | Key leaks | Read or written with no session | Backup slice |
|---|---|---|---|---|---|
| `nulo:core:accounts@["account",p,chain,addr]` | AccountService, `AccountSchema` | address, name, index, type, visibility | address | `verifyBeforeSessionOpen` reads the profile's rows before `open` (master only, `S/account-integrity/types.ts:63`); init orphan sweep reads keys of every profile and deletes orphans (`S/account/service.ts:198-218`); restore writes before open | `account` |
| `nulo:core:imported-account-keys@<same>` | ImportedKeysRepository | signing key already sealed under `HKDF(dek, chain‖addr)` | address | init orphan sweep; restore | `imported-account-keys` |
| `nulo:core:tokens@<n>` | TokenService, `TokenSchema` | contract, symbol, name, decimals | — | restore | `token` |
| `nulo:core:token-balances@<n>` | TokenBalanceService, numeric key identity | account, public and private amounts | — | init legacy sweep reads every profile's raw rows and deletes legacy-shape rows (`S/token-balance/service.ts:175`); restore | `token-balance` (join) |
| `nulo:core:txs@<txHash>` | TransactionService, `TxSchema` (`profileId` optional on legacy rows) | calls, transfers (from, to, amount), dApp origin, endpoint URL, fees | tx hash | init loads every profile's rows into `pending`/`finalityWatch` (`S/transaction/service.ts:149-151`); the worker runs only with an active profile (`:405`) | `transaction` |
| `nulo:core:auth-registry@<n>` | AuthRegistryService | authwit hash, account, content, txHash | — | restore | `auth-registry` |
| `nulo:core:auth-registry-enabled@["authwit-status",p,chain,acct]` | AuthRegistryService, bare boolean | enable flag | account | — | none (block-listed) |
| `nulo:core:contacts@<id>` | ContactService | name, address | — | restore | `contact` |
| `nulo:core:fpcs@<id>` | FpcService | fee-payer address, type, name | — | — | none (retired) |
| `nulo:core:networks@<id>` | NetworkService | chain ids, name, RPC URLs | — | `seedDefaultsForProfile` during restore, before open; `verifyBeforeSessionOpen` reads network rows | none (retired) |
| `nulo:core:active-network@p` | NetworkService, bare string | active network id | — | restore seeding | none |
| `nulo:core:dappSessions@<64 hex>` | DappSessionMacStorage | origin, metadata, accounts, grants, expiry; MAC under `HKDF(master‖dek)` | — | a MAC-less row is deleted before the key check (`mac-storage.ts:~96`); `isExpired` deletes | none |
| `nulo:journal@<16 hex>` | OperationJournalService | kind, origin, amount, recipient, account, contract, txHash, title, errors | — | reaper boot sweep and 1-min tick, GC hourly and `SendCheck.start` read every profile's rows in-process (`reaper.ts:179`, `gc.ts:115`, `send-check.ts:78-89`); lock-time terminal writes land after the session closed (`S/execution/execution-lane.ts:253,531`, `claim-helper.ts:169`, `S/wallet-sdk/queued-journal.ts:295`) | none |
| `nulo:core:incoming-transfers@note:…/pub:…` | IncomingTransferService | account, contract, amount, txHash, from, noteHash | note hash or tx hash | schedulers and outbox drain run only for the active profile (`S/incoming-transfer/service.ts:1017`, `balance-outbox.ts:65`); purges by key prefix | none |
| `nulo:core:incoming-trust@p\|net\|contract`, `-public-cursors@<same>` | same | trust state, arrival floor; scan cursor (no `profileId` in the cursor row) | contract | same | none |
| `nulo:core:incoming-balance-outbox@p\|net\|acct\|token`, `-arrivals@p\|net\|acct` | same | dirty marker; arrival floor and played receipt ids (no `profileId` in the rows) | account | same | none |
| `nulo:core:token-seeded@p` | TokenSeeder, hand-parsed | attempts, outcomes, user-deletion tombstones, verified pins | — | `purgeForProfile` removes it | none |

### Plaintext by necessity (read before unlock, or device-wide)

- `nulo:core:profiles@p`: name, type, sealed credentials, plaintext `walletFingerprint`; the picker and lock screen read it by RPC; it is the key source.
- `nulo:core:profile-tombstones@p` (holds addresses during a deletion), `nulo:core:restore-pending@p`: fail-closed id reservation and the unlock gate, read at init.
- `nulo:core:account-integrity-blocked@p` (stored and derived addresses; the popup's `AccountIntegrityBarrier.vue:39` reads it raw and fails closed on an unparseable record), `-verified@p` (a digest over addresses).
- `nulo:core:stale-networks@p` (read raw from change events by `S/network-reset/service.ts:230`), `nulo:core:network-reset@p` (the account list, names, addresses and resealed imported keys, only during a reset), `-reset-done@p`.
- Device-wide: `nulo:config` (read and rewritten at every boot), `nulo:core:token-list` (signed, public), `nulo:core:token-prices` (public quotes), `nulo:legal:accepted`, `nulo:schema:*`.
- UI keys through the facade `utils/storage.ts`: `nulo:ui:pinnedTokens@p`, `nulo:ui:feePaymentMethods@p` and `nulo:ui:sendFeePaymentMethods@p` (maps keyed by account address; written by the SW's `saveFeePick`, which needs no session, `S/profile/service.ts:1050-1066`), `nulo:ui:restoreOutcome@p` (written before `finalizeRestore`), `nulo:ui:lastActiveProfile` (read before unlock), `nulo:ui:activeAccount` (device-wide address pointer), `nulo:onboarding:completed`.

### Change-event consumers

`utils/storage.ts:43` (`nulo:schema:running`), `MigrationBarrier.vue:110`, `AccountIntegrityBarrier.vue:58`, `composables/usePinnedTokens.ts:251`, `RestoreOutcomeBanner.vue:60`, and the one service listener `S/network-reset/service.ts:230` (stale networks). No popup surface reads a content root from storage or its change events; content reaches the popup by RPC and service events.

### Recon claims corrected by the planner

- The inventory explorer wrote that imported-key rows seal under `HKDF(master, …)`; the code roots them in the DEK (`packages/wallet-crypto/src/imported-account-key-box.ts:24-32`).
- `verifyBeforeSessionOpen` receives the master only; the DEK is in the caller's hands at that point (`S/profile/service.ts:1318,1345`).

## Crypto and session facts

- WebCrypto only; no `@noble`/`@scure` import anywhere in `apps` or `packages` (transitive only, through `@aztec-labs/foundation`). Every box draws a random 96-bit IV per seal; `nonce-uniqueness.test.ts` pins that for four boxes.
- `ActiveSession = { profile, session, secret: Fr, dek?: ImportedKeysDek, serial, … }` (`S/profile/spec.ts:168-187`), memory only. `dek === undefined` is recovery mode. `close()` zeroizes the DEK; the `Fr` is dropped (`S/profile/session-manager.ts:385`).
- Strict mode is the default (`wallet/config/config.ts:26`): no bearer, so every worker start boots locked.
- A password change reseals the master and the DEK under the new password and changes neither (`S/profile/service.ts:1132,1190`); a DEK that does not open refuses the change. So a key derived from them survives a password change, the property `pxe-store-key.ts` states.
- Passkey profiles derive the same master shape; their DEK is sealed under the passkey's wrap key (`passkey-credential.ts:113`).
- Full-backup restore: `restore()` writes the profile row, mints a fresh destination DEK and stashes the secrets (`pendingRestoreSecrets`, `pendingDekRewraps`, 30-min TTL); the slices are restored BEFORE `finalizeRestore` opens the session (`composables/useFullBackupImport.ts:454-461` vs `:373`).
- The dApp-session MAC is keyed by `HKDF(master ‖ dek)`, covers every field but `mac` (row `id` and `profileId` included) and does not bind the storage key (`S/dapp-session/integrity.ts:31-57`; `requireKeyIdentityMatch` off at `S/dapp-session/service.ts:111-115`). A failed MAC deletes the row (`mac-storage.ts:107-110`); a locked read hides it.
- The key is re-derived on every `get`/`set` (no cache) for the dApp-session MAC.

## Backup and migration facts

- A full backup carries service DTOs: each `backup()` returns decoded rows (`S/contact/service.ts:245-247`, `S/token/service.ts:979`, `S/transaction/service.ts:573`, `S/account/service.ts:951`). `restore()` writes through the same storage. The file is plaintext JSON inside an optional password `EncryptionKey` frame tagged `nulo:full-backup:v2:` (`utils/full-backup-helpers.ts:64,92,104`); password profiles download only the encrypted file.
- Slices: profile (block-listed), accounts, imported keys, tokens, token balances, contacts, transactions, auth registry, config (value projection), account state (non-storage) (`S/backup/backup-migration-registry.ts:202-225`). NOT in any backup: the operation journal, dApp sessions, the five `incoming-*` roots, networks and FPCs (retired slices), stale-network and reset records.
- The backup migrator normalizes slices into a `MemoryStorageArea` in the live plaintext key/value format and runs the real `Migrator` there (`S/backup/backup-migrator.ts`). It never sees ciphertext if the services export decrypted DTOs.
- `realMigrations` is empty and `BASELINE_VERSION = 1` (`wallet/storage/migrations/index.ts`); `backup-schema-version` = the max real migration, so registering a numbered migration bumps it, and an imperative one must be acknowledged in `IMPORT_BLOCKING_ACK` (blocks every older backup) (`S/backup/footprint-coverage.test.ts:30`).
- The engine runs on every worker start, before `config.load()` and before any unlock (`wallet/runtime.ts:221-271`). Its staging reads and writes JSON strings only and throws "malformed row" on anything else (`packages/wallet-core/src/migration/staging.ts:27-31`); its pre-migration backup copies the footprint rows in plaintext to `nulo:schema:backup`.
- #865 (milestone v1.0.0; owner decisions page 62, option A) plans, in `worktree-migration-rule-1` at `ef78a901` (docs only): `wallet/storage/stored-shapes.ts` with `encoding: "json" | "structured"`, `read: "codec" | decoder`, flags `authenticated` (set on `nulo:core:dappSessions`) and `engine`; a snapshot test with rules R1-R5; R2 forbids a migration over an `authenticated`, `engine` or `structured` shape and says such a change "stops for a plan of its own, encoding support or re-signing at unlock" (its D9); R3 decodes frozen goldens through each entry's real read path; the baseline freezes at the 1.0.0 promote (A4). Encryption is therefore the first post-freeze shape change.

## Collisions and overlaps with lanes running now

- **migration-rule-1 (#865)**: same files (`wallet/storage/`, every store construction site, `S/backup/`, `template.ts`, CLAUDE.md § Persisted-storage). Its A1 (registry, factories, snapshot) and A4 (freeze) land before this lane's arcs; this lane registers a sealed encoding there and re-stamps.
- **mainnet-arrival-1 (#875)**: zero commits ahead of `dev` at recon time. The brief's "per-profile record of offered default networks" is not in #875's text (unverified); whatever root it adds needs a sealed-or-plaintext classification and a place in the profile purge.
- **tx-record-1**: adds `feeChoice` to transaction or journal records (a shape change in a root this lane seals). Lands first; this lane seals whatever shape is on `dev`.
- **harden-security-fixes-3 arc 3, connect-split-1, ui-picks-1, a11y-errors-1, onboarding-3 arc 2, firefox-sidebar-1, viewer-flake-1, egress-flake-1**: no shared storage files found by name; any of them that adds a `nulo:` root before this lane lands needs the classification.

## Closed known limits in the area

- #523: the imported-key and DEK boxes hand-write the same AES-GCM frame; "reopen if a third box needs this frame … or a fixed-IV vector test lands that pins both frames' bytes".
- #687: Firefox keeps `storage.local`'s default access (content scripts share it); Chrome sets trusted contexts.
- #524: profile rows are read without a row codec.
- #709: a pre-v0.31.0 password backup carries the long-lived DEK.
