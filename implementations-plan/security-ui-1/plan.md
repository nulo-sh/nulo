---
plan: security-ui-1
tier: mid
status: approved (owner calls 1-4 answered: D, A, yes, yes); arc 1 merged (#51); arc 2 in review
issues: [17, 34, 14]
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 2 explorers (sonnet); dual audit (Codex gpt-6.1-sol high + one Opus Plan agent); final fresh Codex pass
post_implementation_hardening: not scheduled
---

# Security UI 1: backup encryption, a refusal on the emoji check, a per-backup key

Three security findings. Two of them change a screen, so the owner picks how they look before they are built. This plan carries the engineering for all three, and the material the owner decides from: [options.md](options.md) (every option, its copy, its testids, its e2e hook) and [OWNER-ASKS.md](OWNER-ASKS.md) (the calls, in order).

- **#17** Full backups carry the long-lived imported-keys key (DEK) and bind no AAD. No screen changes. Arc 1.
- **#34** Full backups download unencrypted unless Protect with Password is chosen first. Arc 2, after the owner's pick.
- **#14** The emoji check offers no way to refuse when the grids differ. Arc 3, after the owner's picks.

## Scope

**In:** the password-profile export of the full backup (`full.vue`, `ProfileService`, `AccountService`), the encrypted-backup file on export and restore, the emoji-check window, the one settings row that repeats its "Always trust" label, and the session teardown the refusal relies on.

**Out, with reason:**
- #15 (dApp calls dispatch before the person answers the check). "They don't match" ends the session but cannot undo a call already dispatched; making the check a gate is #15's work.
- The single-account export page (`settings/security/export/account.vue`) also saves an unencrypted signing key after a recommendation banner (`:273`). Same class as #34, outside its scope; it goes to `follow-ups.md` at close-out.
- No storage migration. The change keeps every persisted shape.

## Owner dependencies

| Call (OWNER-ASKS.md) | Blocks | Starts on |
|---|---|---|
| 1. #34 option | Arc 2 | the owner's pick |
| 2. #14 option | Arc 3 | the owner's pick |
| 3. #14: closing the window keeps the session, yes or no | Phase 3.3 only | the owner's answer |
| 4. #17: the encrypted-file format change, yes or no | Phase 1.2 only | the owner's answer |

Phase 1.1 depends on no call: it changes no file format and nothing a person sees. It starts on plan approval.

## Outcome & Quality Bar

**For whom.** A person who keeps a backup file somewhere they do not fully control (a synced folder, a USB stick, a shared drive), and a person connecting a dApp who sees two emoji grids that differ. Also the future maintainer of the backup format.

**What excellent looks like.**
1. A password-profile backup exported after Arc 1 holds no key that opens an imported key added after the export. A unit test proves it with real crypto.
2. Every backup the current version restores still restores, plain or encrypted. A test restores a legacy fixture through the real import pipeline (`validateAndMigrateBackup`, the migration registry, `ProfileService.restore`, `AccountService.restoreImportedKeys`).
3. On the emoji check, the person who sees different grids has one obvious control that ends the session, and the session is gone from Settings > Connected apps after it.
4. No unencrypted password-profile backup leaves the wallet without the person seeing, in plain words, what the file exposes (the exact rule is the owner's pick).

**Good enough.** No new design primitives: the export page reuses `ConfirmPopup`, `Banner` and `Button`; the verify window reuses `Button`. The restore screens do not change.

## Assumptions

### Facts (verified against `origin/dev` at `90f4fb3`)

1. The password export returns the long-lived DEK as base64 to the popup (`apps/extension/src/wallet/services/profile/service.ts:1793-1860`; RPC-exposed at `profile/client.ts:117-119`).
2. The passkey export returns the stored `dekSealed` verbatim, or a fresh DEK sealed under the ceremony's `dekWrapKey` (`profile/service.ts:1716-1785`). `exportPasskeyCredential` also serves `exportPlain` (`:1666`).
3. Restore opens every imported-key row with the envelope's key as `sourceDek` and seals it under a fresh destination DEK (`account/service.ts:772-815`, `profile/service.ts:162-175`). Any 32-byte key works as `sourceDek`.
4. An imported-key row is `{ profileId, chainId, address, encryptedSigningKey }`, sealed with a key derived by HKDF from the DEK with info `nulo:imported-account-key:v2|chainId|address` (`packages/wallet-crypto/src/imported-account-key-box.ts`). The row binding does not include the profile id.
5. `EncryptionKey.encrypt` and `decrypt` take an optional AAD that is not stored in the frame (`packages/wallet-crypto/src/encryption-key.ts:42`, `:68`). The full-backup export passes none (`full.vue:353`), and neither does the restore (`useFullBackupImport.ts:258`).
6. The restore tells files apart by content: `{` or `[` is plain; base64 whose first byte is `0` is encrypted (`utils/full-backup-helpers.ts:43-53`).
7. `backup-schema-version` is the storage schema version, 1 today, computed from the empty `realMigrations` (`backup/backup-migrator.ts:63-74`); `compat-epoch` accepts only `5` (`backup/backup-migration-registry.ts:77-79`). There is no separate backup-format field.
8. The verify page is one component for both the connect window's check and a reconnect's check window (`session-established.ts:176-202`).
9. `deleteDappSession` deletes the whole row (grants, rejections, trust flag) and emits `onDappSessionDeleted` (`dapp-session/service.ts:387-398`); `wireSessionTeardown` then terminates every live session on that `(origin, chainId)` (`wallet-sdk/background.ts:631-660`).
10. A session re-established when no row exists for its `(origin, chainId)` is terminated (`session-established.ts:97-104`). A row for that tuple, even a different one, lets it establish.
11. The account export already binds a fixed purpose AAD, `nulo:account-export:v1` (`packages/aztec-runtime/src/account/account-export.ts:35`).
12. A passkey plain backup holds no key that moves funds without the passkey: `master-key` is the credential id, the DEK is sealed under the passkey's PRF wrap key, and account rows hold no key (`full.vue:184-204`, `account/spec.ts:136-156`).
13. `deleteDappSession` throws "Invalid id" without deleting anything when the row is hidden: a locked wallet or another active profile cannot verify the row's MAC, so the read returns nothing (`dapp-session/mac-storage.ts:85-104`). A lock deliberately keeps live channels (`wallet-sdk/profile-switch-teardown.ts:15-18`). So "Invalid id" does not prove the session ended.
14. `wireSessionTeardown` wraps its whole termination loop in one `try`, so one throwing `terminateSession` skips the remaining matches (`wallet-sdk/background.ts:646-657`).
15. Every slice of the backup resolves the active profile on its own (`account/service.ts:677-680`, `profile/service.ts:2191-2194`), while the page passes `appStore.profile.id` to the key export. The page's `generation` changes only on unmount (`full.vue:427`).
16. Every other `EncryptionKey` ciphertext in the wallet binds its own AAD: the profile secret slots (`packages/wallet-crypto/src/password-secret-box.ts:202-204`), the sealed DEK (`profile/service.ts:2026`) and the account export (`account-export.ts:150`).

### Inferences (unverified; audits, attack these)

1. Nothing else in a full backup is encrypted or MACed under the DEK. The DEK also keys the PXE store and session tags, but neither travels in the backup's slices (the slice list is `full.vue:95-117`). If a slice did depend on the DEK, swapping it for a transfer key would break that slice's restore. Phase 1.1's round-trip test is the check.
2. `AccountService` can hold the source DEK for the length of one export without a new lock: the export reads rows once, and a row added mid-export is sealed under the same DEK, so it is either in the file and re-sealed, or not in the file. A profile switch, deletion or same-id re-creation during the export is not covered by that argument; the identity fence in Phase 1.1 covers it.
3. A tagged text prefix on the encrypted file breaks an older Nulo version's restore of new encrypted files with "not a backup" rather than corrupting anything (`detectBackupType` returns `unknown`). Plain files stay readable by older versions.
4. The playground reports a terminated session (its `pg-status` flips to `disconnected`) when the wallet ends it. If not, Arc 3's e2e asserts the wallet side only (no row, the next playground call fails).
5. Deleting a `DappSession` row while that app's capabilities or execute window is open behaves as a Settings disconnect does today. Arc 3 inherits that behaviour and does not change it.
6. (Withdrawn after the final audit: capability-exempt methods skip the missing-row check, `packages/wallet-bridge/src/dispatcher.ts:993`, so a channel can outlive its row. The refusal now ends channels by tuple on every path.)
7. A lock while the check is open routes the window to the unlock page instead of closing it, and the channel survives the lock, so the person cannot refuse until they unlock. This happens today too; it sits with #15, not here.
8. The dispatch guard refuses every call from a live session that has no profile stamp in `state.sessionProfiles` (`wallet-sdk/background.ts:550`; `profile-switch-teardown.ts` says an unstamped session "the dispatch guard would reject … anyway"). Phase 3.1 proves it with a test before relying on it.
9. Within one service-worker lifetime, a profile's session serial changes only when a new session starts (an unlock or a switch), never on `refreshSession`. Across a restart it does not identify a session: `lastSerial` starts at 0 and a silent restore increments it again (`session-manager.ts:150`, `:337`, `:651`), and deletion epochs live in memory (`profile-deletion-state.ts:27`). The export's run fence relies on the first half and adds a per-worker incarnation id for the second; Phase 1.1 tests (i) and (k) prove both.

### Asks (each is an owner call in OWNER-ASKS.md; work proceeds only where noted)

1. **#34 option** (A, B, C or D). Working assumption: none. Arc 2 waits.
2. **#14 option** (A or B). Working assumption: none. Arc 3 waits.
3. **#14: does closing the window keep the session?** Working assumption: yes, today's behaviour. Phase 3.3 runs only on "no".
4. **#17: change the encrypted-file format?** Working assumption: none. Phase 1.2 waits; Phase 1.1 does not.
5. **Planner asks (not owner calls; resolved here, attack them):** the restore screens keep their copy; "Decryption Failed" stays the one failure for a v2 file too. The settings row's "Always trust" label changes with the window's (it names the same flag), inside the #14 sign-off.

## Architecture & Implementation

### Arc 1, Phase 1.1: a per-backup key for a password profile's imported keys (no format change)

**What it closes, and for whom.** The forward reach in #17 needs someone who can open the file's key but cannot open the stored DEK slot. That person exists only for a password profile: a thief of a plain file, or of an encrypted file after the profile's password changed. For a passkey profile the file's DEK is sealed under a wrap key derived from the passkey's PRF output, with a fixed PRF input and a salt tied to the credential id, and the stored slot is sealed under the same key (`profile/service.ts:1726-1757`). So anyone holding the credential-derived capability that opens the file's key also opens the stored slot. This holds while there is no credential rotation and no profile-specific derivation; either would reopen the question. Likewise a thief who decrypts an encrypted password file with the current profile password can open the stored slot directly. So Phase 1.1 changes the password path only. The passkey export keeps carrying the stored sealed DEK, unchanged, and the plan records why.

**Shape.** At a password-profile export, the background seals every imported-key row under a fresh 32-byte transfer key and puts that key in `imported-keys-dek`, where the DEK goes today. The restore already opens rows with whatever key that field holds, so the restore code does not change, an old backup restores exactly as before, and an older Nulo version can still restore a new plain backup. The DEK never leaves the background on this path.

**Why the same field name.** A new field (for example `imported-keys-transfer-key`) buys nothing at restore: the restore consumes it at the same spot. It costs a `buildRestoreSecret` change, a redaction entry, a compat branch for old files, and it breaks forward compatibility for plain files. The field means "the key this file's imported-key rows open under"; the export comment says so.

**Interfaces.**

```ts
// AccountService, popup-callable. Replaces the password path's ProfileService.exportBackupMaterial
// plus AccountService.backupImportedKeys.
exportFullBackupKeys(fence: RunFence, password: string): Promise<{
  masterKey: string                      // base64, as today
  entropy: string                        // base64, as today
  importedKeysKey: string                // base64 transfer key, never the DEK
  importedKeyRows: ImportedAccountKey[]  // sealed under importedKeysKey
  dekReplaced: boolean
}>

// ProfileService, popup-callable. An ExecutionFence plus a random id drawn once per ProfileService
// instance, because serials and deletion epochs restart with the service worker.
type RunFence = ExecutionFence & { incarnation: string }
captureRunFence(): Promise<RunFence>
assertRunFence(fence: RunFence): Promise<void>   // incarnation first, then assertFence

// ProfileService, internal only: NOT in the RPC passthrough lists.
openBackupTransfer(id: string, password: string): Promise<{
  masterKey: string; entropy: string
  sourceDek: ImportedKeysDek | null      // null when the stored slot no longer opens
  transferKey: ImportedKeysDek
  dekReplaced: boolean
}>
```

**Flow.**
1. `full.vue` starts each run by capturing `ProfileService.captureRunFence()`: today's `captureExecutionFence()` (`profile/service.ts:506-517`), `{ profileId, epoch, session }`, plus `incarnation`, a `crypto.randomUUID()` drawn once when the `ProfileService` instance is built. A fence the popup holds can outlive the worker that issued it; after a restart the same profile id can come back with serial 1 and epoch 0, so only the incarnation tells the two apart. `assertRunFence` refuses a foreign incarnation with `SessionEndedError` and then runs today's `assertFence` (`:520-529`). The two new methods join the RPC lists; `captureExecutionFence`, `assertFence` and `ExecutionFence` stay internal and unchanged, since every in-worker fence dies with its worker. The fence holds no secret.
2. `full.vue` `exportKeyMaterial` calls `exportFullBackupKeys(fence, password)` on a per-run `AccountServiceClient`, built and disconnected like the run's slice clients (`managers.account` can be `null`, `utils/core.ts:38-55`). `AccountService` calls `profileService.assertRunFence(fence)` before it reads anything.
3. `ProfileService.openBackupTransfer` runs the existing unseal, pairing check and fence of `exportBackupMaterial`, and draws the transfer key with `generateImportedKeysDek()`.
4. `AccountService` reads `importedKeys.backup(profileId)`. For each row it opens the signing key with `sourceDek` and seals it under `transferKey`, with the same `chainId` and `address`.
5. `AccountService` calls `assertRunFence(fence)` again after the last seal; a lock, a switch (even away and back, which changes the session serial), a deletion, a same-id re-creation or a worker restart throws.
6. `finally` zeroizes `sourceDek`, `transferKey` and each opened signing key.
7. `full.vue` puts `importedKeysKey` in `imported-keys-dek` and serves `importedKeyRows` as the `imported-account-keys` slice. The passkey path keeps `exportPasskeyBackupMaterial` and `backupImportedKeys()` as today.

**A row that does not open** (a corrupt row, or every row when the slot is unrecoverable) travels unchanged, as today: the restore files it into the orphan taxonomy and `reconcileImportedAccounts` drops its type-1 account. `dekReplaced` keeps its meaning and its banner. Such a row is the one exception to "the file holds nothing sealed under the DEK": its ciphertext stays DEK-sealed, and the DEK is not in the file. Only a failure to open a row is caught; a failure to seal one aborts the export.

**Identity and completeness checks in the page.** The slices resolve the active profile on their own (Fact 15), a profile switch updates the page in place instead of unmounting it (`composables/useProfileBootstrap.ts:148`), and the key rows are now read before the account slice, where today they are read after it. So `full.vue`, after `assembleFullBackup` and before it publishes the payload:
- calls `assertRunFence(fence)` with the run's fence, so one session of one profile incarnation in one worker spans the whole assembly; a switch away and back, or a worker restart, fails it;
- checks that every imported (type-1) account in the `account` slice has a key row in `imported-account-keys`, and fails the run if not. An import inside the same session that lands between the two reads would otherwise ship an account that the restore drops for want of its key (`account/service.ts:829-860`).
A failed check shows today's "Failed to create the backup"; the person presses Create again.

**Buffer ownership.** `ProfileService` owns `sourceDek` and `transferKey` until its method returns, and zeroizes them on every throw. From the return on, `AccountService` owns them and zeroizes them in `finally`.

**RPC surface.** `captureRunFence` and `assertRunFence` join `ProfileService`'s RPC lists. `ProfileService.exportBackupMaterial` leaves them (`profile/service.ts:97`, `profile/client.ts:117`) and becomes `openBackupTransfer`. `ProfileService.getProfileDekSealed` has no production caller (only `full.test.ts:108` mocks it) and leaves them too. A unit test asserts both names are absent from the service's RPC method list. `exportPasskeyBackupMaterial` and `backupImportedKeys` stay: the passkey path uses them.

**File map.** `profile/service.ts`, `profile/spec.ts`, `profile/client.ts`; `account/service.ts`, `account/spec.ts`, `account/client.ts`; `wallet/logger/utils.ts` (`REDACTED_KEYS`) and its test; `popup/pages/settings/security/export/full.vue`; tests in `profile/service.integration.test.ts`, `account/import-export.test.ts`, `export/full.test.ts`, `export/full-passkey.pins.test.ts`, `composables/useFullBackupImport.test.ts`.

### Arc 1, Phase 1.2: AAD on the encrypted file (format change; owner call 4)

**Wire format v2.** The encrypted file's text becomes `nulo:full-backup:v2:` followed by the base64 frame, and the frame is `EncryptionKey.encrypt(payload, aad)` with `aad = UTF-8("nulo:full-backup:v2")`. One constant, `FULL_BACKUP_V2_TAG = "nulo:full-backup:v2"`, gives both the prefix and the AAD, in `utils/full-backup-helpers.ts` beside `detectBackupType` and `MAX_BACKUP_FILE_BYTES`.

**Restore.** `detectBackupType` returns `encrypted` for a tagged file and for a legacy bare-base64 frame. A shared `openFullBackupText(text, password)` decides by the prefix: a tagged file opens only with the AAD; a bare frame opens only without it; any other `nulo:full-backup:` tag is refused, never retried as legacy. No trial decryption, so a wrong password costs one PBKDF2 run, not two. Stripping the tag from a v2 file, or adding it to a legacy file, fails authentication. Before any PBKDF2 run the parser enforces the byte cap (prefix included) and a minimum frame of 29 bytes (1 version byte, 12 IV bytes, 16 tag bytes; today's check accepts 13). It uses `EncryptionKey.fromPassword`, which wipes the passhash, and `openEncryptedBackup` keeps its stale-result fence between awaits (`useFullBackupImport.ts:252-262`).

**What the AAD does and does not give.** It closes no attack that works today. Every other `EncryptionKey` ciphertext already binds its own AAD (`password-secret-box.ts:202-204`, `profile/service.ts:2026`, `account-export.ts:150`), so none of them opens as a no-AAD backup now. What it adds is an explicit, versioned purpose on every new encrypted file: a v2 file cannot open as anything else, a future AAD-less ciphertext cannot pass as a v2 file, and a later v3 is told apart by its tag. A legacy, untagged ciphertext still opens as a legacy backup, as long as old encrypted backups must restore. The cost is that an older Nulo version cannot open a new encrypted file.

**Export.** `handleEncrypt` calls a shared `sealFullBackupText(plaintext, password)`. `encryption-key.ts`, its frame and the npm-published `public.ts` do not change. New exports from `utils/full-backup-helpers.ts` regenerate `src/types/auto-imports.d.ts`; build before committing so the file is current.

**Why not bump `backup-schema-version` or `compat-epoch`.** The first is the storage schema version and moves only with a real storage migration, which CLAUDE.md forbids before production; the second rejects every old backup. The AAD lives on the encrypted wrapper, outside the plaintext the registry migrates, so the wrapper carries its own version. The brief's "bumps the backup format version … through the existing migration registry" does not hold as written; see Issue claims.

### Arc 2: the export page (#34), shape per option

Component changes, copy and testids per option are in [options.md](options.md). Engineering common to every option:
- The confirmation reuses `ConfirmPopup` through `cacheStore.confirm` with `confirm_color: "red"`, a `pre_title`, a `title`, a `description` per profile type, and `confirm_text`. Cancel stays first, the download second.
- `onKeydown`'s Enter never downloads an unencrypted file (today's rule) and never confirms the popup.
- Option A and D (password side) remove the plain path for that profile type: every e2e helper that downloads a plain password-profile backup (recon.md § E2E hooks) moves to an encrypted export, which the helper opens in Node with the production codec (`openFullBackupText` after Phase 1.2, else `EncryptionKey`), imported through `@/` as other e2e files already do. A copy of the codec would prove the copy, not what ships.
- Every confirm callback checks, when it runs, that the page's `generation` is the one captured when the confirm opened and that the plain payload still exists; `ConfirmPopup` calls it without awaiting, and an unmount nulls the payload.
- Option B, C and D (passkey side) keep a plain path behind the confirmation: helpers add the `confirm-submit` press.

UI impact per option:
- **A** UI impact: Download stays disabled until the file is encrypted; the "Backup is ready" banner becomes the instruction; passkey profiles see the password fields at once.
- **B** UI impact: Download is unchanged; an unencrypted Download opens a confirmation that names what the file exposes; the banner text changes.
- **C** UI impact: password profiles get an encrypted file from Create with no extra press; Download saves it; a quiet "Download without password" control opens B's confirmation; passkey profiles see the password fields at once.
- **D** UI impact: A on password profiles, B on passkey profiles.

### Arc 3: the emoji check (#14), shape per option

Both options:
- **A background refusal that ends the channels first, then the row.** `deleteDappSession(id)` reads through the MAC layer, which hides the row when the wallet is locked or another profile is active, and then throws "Invalid id" without deleting (Fact 13). So the window calls a new `DappSessionService.refuseVerification({ rowId, origin, chainId, profileId })`, built from the wallet's own MAC-verified row as the window read it at mount. Under the service lock it:
  1. **Ends the live channels for the captured tuple, always.** It emits a new `onVerificationRefused({ origin, chainId })`. The wallet-sdk background handles it with `revokeLiveSessions(origin, chainId)`: for each matching live session it first deletes the session's profile stamp, so the dispatch guard refuses its calls even if termination fails (Inference 8), and then calls `terminateSession` inside its own `try`. `terminateSession` notifies before it drops the channel, so a throw can leave the channel listed, but unstamped. `wireSessionTeardown` uses the same helper.
  2. **Deletes the row by its storage key, raw.** It checks that `rowId` is physically present in the inner store, not through the MAC view, whose `contains` cannot tell "locked" from "absent" (`mac-storage.ts:50`). If present, it deletes it without the MAC key, as the profile purge does (`mac-storage.ts:57-76`), and emits `onDappSessionDeleted` with a payload whose `id` is the deleted storage key, so the settings pages drop the right row (`settings/connected-apps/index.vue:75`, `[id].vue:196`). It returns `"revoked"`.
  3. **Otherwise looks for a replacement row, fenced.** It captures the owning profile's execution fence; a locked wallet or another active profile returns `"unavailable"`. It looks up the verified row for `(origin, chainId)` and deletes it if found. It then re-asserts the fence: a lock or switch during the lookup returns `"unavailable"`, because a hidden row would look absent. With the fence held it returns `"revoked"` or `"absent"`. The lookup must not call `isExpired()` while holding the service lock, which that method also takes (`dapp-session/service.ts:400`).
- **The window** (`handleRefuse`): `"revoked"` and `"absent"` close the window. `"unavailable"` keeps it open with the first error line (options.md): the channels are already ended, and the app's saved row and permissions may remain. A thrown error keeps it open with the second line, since the window cannot tell whether the channels ended. No error string is matched.
- **Teardown hardening.** `wireSessionTeardown` moves to `revokeLiveSessions`: the stamp goes first, then a `try` per match, so one failing `terminateSession` neither keeps that channel usable nor skips the rest (Fact 14). It stays tuple-matched: other profiles' channels are already ended by the profile-switch teardown.
- The "They match" path is today's `handleConfirm` (trust flag, then close).
- A latch (`isBusy`) blocks a second press of either control, and both refuse a repeat Enter (`refuseRepeatEnter`).
- The copy changes on the window and on `DappSessionVerification.vue` together, since both name the same flag.

UI impact per option:
- **A** UI impact: OK becomes two equal buttons in one row, "They don't match" first and "They match" second; the instruction and the toggle's copy change; the settings row's toggle copy changes.
- **B** UI impact: OK becomes "They match"; a small text control "These don't match" sits under it; the same copy changes as A.

### Arc 3, Phase 3.3 (only if call 3 is "no"): closing the window ends the session

The background must tell a close apart from "They match". Shape: the verify page reports "They match" to the wallet-sdk background, keyed by its own window id (the reservations live in `VerifyAdmissionGate`, keyed by the live session id, `verify-admission.ts:235-245`; `DappSessionService` never sees them); the background marks the reservation that owns that window as confirmed; `windowRemoved` on an unconfirmed reservation runs the same refusal as "They don't match". The mark binds to the reservation's own transport session id, its own verification hash and its window id, never to the shared row's latest hash, which a concurrent session can overwrite (`session-established.ts:129`). Reservations track transport ids and window state today, not the row, the profile or the hash (`verify-admission.ts:60`), so they gain those fields. Cases the tests must cover: the adopted connect window and the standalone reconnect window; a window removed before adoption; two checks open for one app; a lock while the window is open. Open product questions (options.md): a browser exit fires no `onRemoved`; an accidental close of an untrusted reconnect loses a long-held app's grants.

### Trade-offs and alternatives not taken

- **Export-time key swap through a stash and a handle** (mirror of the restore's `pendingDekRewraps`): `ProfileService` stashes `{ sourceDek, transferKey }` under a random handle; the popup passes the handle to `backupImportedKeys(handle)`. Workable with identity binding and one-shot consumption, but rejected for the single-call shape: it keeps a secret alive between two RPCs, with a TTL, an expiry path and a second call, to solve a problem one call does not have. The restore needs its stash because its rows arrive in a later RPC; the export does not.
- **Trial decryption for the AAD** (AAD first, then no AAD). Rejected: a wrong password costs two 600,000-iteration PBKDF2 runs, and a file's format is never explicit. It does not help older Nulo versions: they decrypt with no AAD, so they cannot open an AAD-bound file either way, and only their error differs (a wrong-password failure instead of an unknown file).
- **A new frame version byte in `EncryptionKey`.** Rejected: it changes a published class whose frame also protects profile secrets.
- **A plaintext envelope field for the transfer key.** Rejected above.
- **Terminate the live session but keep the row on "They don't match".** Rejected: no such API exists, the brief asks for the row to go, and a kept row would let a reconnect skip the check if it was marked trusted.

## Security & Adversarial Considerations

- **Threat model.** (a) A thief of a backup file (synced folder, lost device). (b) A storage reader with ongoing access to the profile's ciphertext, which is what the DEK exists to stop. (c) A network attacker between the dApp and the wallet during the handshake, which the emoji check exists to expose. (d) A hostile backup file at restore (attacker-controlled bytes).
- **#17, what Phase 1.1 closes.** A password-profile backup made after the change holds a transfer key that opens only the rows sealed at export. So (a)+(b) together no longer reach imported keys added later in two cases: a plain password file, and an encrypted password file after the profile's password changed. Limits, stated plainly:
  - An encrypted file opened with the current profile password gains nothing: that password opens the stored DEK slot directly.
  - Passkey profiles gain nothing, so they are left as they are: whoever can open the file's sealed DEK holds the passkey, which opens the stored slot.
  - It cannot revoke a backup exported before the change, which carries the real DEK.
  - It does not close what a plain password file already gives up (the master and every key that existed then); that is #34's job.
  - The new export response never carries the source DEK, and the DEK stays in the service worker on the password path. Dropping `exportBackupMaterial` and `getProfileDekSealed` from the RPC lists narrows what a page can ask for, but an extension page is not a trust boundary here.
- **AAD.** Explicit, versioned purpose binding for new encrypted files; it closes no attack that works today (see Phase 1.2). Legacy untagged files keep today's acceptance. Confidentiality and integrity rest on AES-GCM as today.
- **Crypto.** WebCrypto AES-GCM 256 and PBKDF2-SHA256 at 600,000 iterations via the existing `EncryptionKey`; HKDF and AES-GCM via the existing `imported-account-key-box.ts` and `imported-keys-dek-box.ts`. No new primitive, no new dependency.
- **Hostile restore input.** The restore path does not change in Phase 1.1. In Phase 1.2 the prefix parser accepts exactly one tag and a base64 body; anything else is `unknown`. The checksum, epoch and version gates run after decryption, unchanged.
- **Memory hygiene.** Zeroize `sourceDek`, `transferKey` and each plaintext signing key in `finally`; the base64 transfer key goes to the popup as the DEK did, and the page scrubs its payload strings on unmount as today.
- **Logging.** No new log line carries key material. The redaction list already covers `imported-keys-dek`; `sourceDek`, `transferKey`, `importedKeysKey` and `importedKeyRows` join `REDACTED_KEYS` (CLAUDE.md § Logging policy), with a case in `logger/utils.test.ts`.
- **#14.** "They don't match" is the safe action, so it asks no confirmation and cannot be undone except by reconnecting. It cannot reach calls already dispatched (#15). Deleting the row ends every live session of that app on that network, other tabs included: a fail-safe outcome. The refusal ends every live channel for the captured tuple first, on every path, unstamping each before terminating it, so a failed termination cannot leave a usable channel. It then deletes the row by its storage key even while the wallet is locked (Facts 13, 14). It reports `unavailable`, and the window stays open, only when that row is gone and a replacement cannot be verified under a held fence. The window's captured identity comes from the wallet's own MAC-verified row read at mount, never from the dApp, and the URL contributes only the row id. A raw delete by id skips the MAC, as the profile purge does; any extension page could already delete a row, so this widens nothing.
- **#34.** The rule that blocks or confirms runs in the page; it is a usability control against a mistake, not a boundary against a hostile page (a hostile extension page could already read the payload).
- **Least privilege, supply chain.** No new permission, dependency, workflow or token.

## Phases

Every gate runs inside the worktree. "Green" means every listed command exits 0 and every named test passes.

### Phase 1.1: per-backup key for password profiles (Arc 1) ✓

1. Add `openBackupTransfer` to `ProfileService` as an internal method; drop `exportBackupMaterial` and `getProfileDekSealed` from its RPC lists; add `captureRunFence` and `assertRunFence` to them, with the per-instance incarnation id.
2. Add `exportFullBackupKeys` to `AccountService` and its RPC list, with the identity fence.
3. Move `full.vue`'s password path to the new call; serve the returned rows as the imported-keys slice.
4. Add the page's identity and completeness checks after assembly.
5. Add the new names to `REDACTED_KEYS`.
6. Add the tests below, then run the gate.

Tests (compare opened key bytes, never sealed blobs: every seal draws a fresh IV):
- (a) The transfer key's bytes differ from the opened profile DEK, and every returned row opens under the transfer key.
- (b) A row sealed under the DEK after the export does not open under the transfer key (never-happens). A row from the export does (success control).
- (c) In the assembled password backup, base64(DEK) appears nowhere (never-happens), and base64(transfer key) appears in `imported-keys-dek` (success control).
- (d) The new backup restores through `ProfileService.restore` and `AccountService.restoreImportedKeys` and yields the original signing-key bytes.
- (e) The legacy builder's backup, which carries the real DEK, restores through `validateAndMigrateBackup` and the restore unchanged. A passkey backup's export is byte-for-byte today's path (its sealed DEK is the stored `dekSealed`).
- (f) An unrecoverable slot still sets `dekReplaced` and carries the rows unchanged.
- (g) A stale fence is refused at the key export: a lock, a switch, and a deletion or same-id re-creation between authentication and the last seal (a delayed seal in the test).
- (h) A seal failure aborts the export and zeroizes both keys.
- (i) The page fails the run, with a delayed slice in the test, on a switch A→B→A during assembly and on a delete and re-create of A after the key export; it also fails when an imported account has no key row. Each case has a success control with no interference.
- (j) `exportBackupMaterial` and `getProfileDekSealed` are absent from `ProfileService`'s RPC method list.
- (k) A worker restart between the key export and the page's final check (a new `ProfileService` and session manager, unlocked to the same profile id at serial 1) makes `assertRunFence` refuse the old fence. A `refreshSession` in the same place passes (success control).

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run test:all`; `bun run audit:vue`; `cd apps/extension && bun run test:e2e -- backup-roundtrip.test.ts backup-imported-account.test.ts security-backup.test.ts passkey-backup.test.ts --retry=0`.
- Pass criteria: every command exits 0; tests (a) to (k) pass; the four smoke specs pass locally. `passkey-backup.test.ts` skips on CI, so it is a local regression check only.
- Layers: lint, typecheck, unit, component, build, smoke e2e.

### Phase 1.2: AAD on the encrypted file (Arc 1; only after a "yes" on call 4) ✓

1. Add `FULL_BACKUP_V2_TAG`, `sealFullBackupText` and `openFullBackupText` to `utils/full-backup-helpers.ts`.
2. Use them in `handleEncrypt` and in `openEncryptedBackup`; extend `detectBackupType` and the size gate.
3. Add the tests below, then run the gate.

Tests, one per refused class plus the controls:
- (a) A v2 file round-trips.
- (b) A legacy bare-base64 file still opens.
- (c) A v2 body with its tag stripped is refused.
- (d) A legacy body with a v2 tag added is refused.
- (e) A wrong password is refused.
- (f) A body encrypted under the password with another purpose's AAD (`nulo:account-export:v1`) is refused.
- (g) An unknown `nulo:full-backup:` tag, a malformed body, and a frame under 29 bytes are refused before any PBKDF2 run.
- (h) A file one byte over the cap is refused, and one at the cap is accepted.
- (i) The export page passes the AAD. Assert the argument, since the existing mock ignores it.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run test:all`; `bun run audit:vue`; `cd apps/extension && bun run test:e2e -- backup-roundtrip.test.ts passkey-backup.test.ts --retry=0`.
- Pass criteria: every command exits 0; tests (a) to (i) pass; the encrypted round trip passes in both smoke specs (the passkey one locally).
- Layers: lint, typecheck, unit, component, build, smoke e2e.

### Phase 2.1: the export page per the owner's #34 pick (Arc 2) ✓

1. Build the picked option in `full.vue` exactly as options.md states it, copy included.
2. Update `full.test.ts` and `full-passkey.pins.test.ts`; add one test per refused path.
3. Run `bun run audit:vue`.

Tests: for every option, the plain path either does not exist (A, D-password) or opens the confirmation and downloads nothing until `confirm-submit` (B, C, D-passkey); Cancel downloads nothing (never-happens) and confirming downloads a `NuloBackup_` file (success control); the encrypted path downloads a `NuloEncryptedBackup_` file; Enter never downloads a plain file.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `bun run audit:vue`.
- Pass criteria: every command exits 0; the new tests pass.
- Layers: lint, typecheck, unit, component, build.

### Phase 2.2: the export page's e2e (Arc 2) ✓

1. Update every helper and spec that downloads a plain backup (recon.md § E2E hooks) for the pick.
2. Extend `security-backup.test.ts` with the picked rule and a `shotSend` capture of the new state.
3. Run the touched smoke specs on Chrome and Firefox, and each touched network spec.

**Validation gate**
- Commands: `cd apps/extension && bun run test:e2e -- <each touched smoke file> --retry=0`; the same with `NULO_E2E_BROWSER=firefox`; `cd <worktree> && NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/<each touched network file>.test.ts`, one at a time.
- Pass criteria: every listed spec passes on both browsers; the screenshots exist for the PR body.
- Layers: smoke e2e (Chrome, Firefox), network e2e.

### Phase 3.1: the emoji check per the owner's #14 pick (Arc 3)

1. Add `revokeLiveSessions` to the wallet-sdk background and move `wireSessionTeardown` onto it.
2. Add `DappSessionService.refuseVerification`, the `onVerificationRefused` event and the client entry.
3. Prove Inference 8 with a test before building on it.
4. Build the picked option in `windows/verify/index.vue` as options.md states it.
5. Change the copy in `DappSessionVerification.vue` to match.
6. Add the tests below, then run the gate.

Tests:
- Every `refuseVerification` call emits `onVerificationRefused` with the captured tuple, on every path, `"unavailable"` included.
- With the wallet locked and the row physically present, it deletes the row and emits one delete event whose `id` is that storage key. The never-happens case: the window closes while the row is still present.
- Unlocked under the owner, it deletes the row by id (success control); with the id gone it deletes the replacement row for `(origin, chainId)`; with no row it returns `"absent"`.
- With the id gone and the wallet locked, it returns `"unavailable"`. With the id gone and a lock or switch landing during the lookup (a delayed lookup in the test), it returns `"unavailable"`, never `"absent"`.
- `revokeLiveSessions`: when the first `terminateSession` throws, that session is unstamped and its next dApp call is refused (never-happens), and the second match is still terminated. The same holds after the row is re-created for the tuple.
- With both settings pages mounted, a refusal that deletes a replacement row removes that row from the list and leaves its detail page.
- The window calls `refuseVerification`, then closes, in that order (`index.window.test.ts` call log).
- "They don't match" never calls `setTrustedVerification`, even with the toggle on (never-happens). "They match" does call it (success control).
- `"unavailable"` and a thrown error keep the window open, each with its own error line.
- A second press runs nothing.
- Fixtures are wire-shaped: the `verificationHash` and CAIP accounts as the URL and the row carry them (`0x` + 64 hex, `aztec:<chainId>:0x…`).

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `bun run audit:vue`.
- Pass criteria: every command exits 0; the new tests pass.
- Layers: lint, typecheck, unit, component, build.

### Phase 3.2: the emoji check's e2e (Arc 3)

1. Add `tests/e2e/network/connect-verify-mismatch.test.ts` with two cases.
   - New connection: connect the playground, reach the check with `approveConnect`, and press "They don't match".
   - Untrusted reconnect: connect without the trust toggle, disconnect from the playground, connect again, and press "They don't match" in the reconnect's own window.
2. In each case, assert the window closes and Settings > Connected apps lists no session.
3. Assert the playground's session ended (Inference 4). If the playground does not report it, assert its next wallet call fails.
4. Add a `shotSend` capture of each check before the press.
5. Run the spec, and `connect-dapp.test.ts`, on Chrome and Firefox.

**Validation gate**
- Commands: `cd <worktree> && NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/connect-verify-mismatch.test.ts`; the same for `tests/e2e/network/connect-dapp.test.ts` and `tests/e2e/network/window-placement.test.ts` (it pointer-clicks `verify-confirm-btn` under the changed footer); all three again with `NULO_E2E_BROWSER=firefox`. One `e2e:agent` run at a time.
- Pass criteria: all six runs pass.
- Layers: network e2e (Chrome, Firefox).

### Phase 3.3: closing ends the session (Arc 3; only after a "no" on call 3)

1. Add the "They match" report and the reservation's confirmed mark, bound as plan.md § Arc 3, Phase 3.3 states.
2. Run the refusal on an unconfirmed removal.
3. Add unit tests in `session-established.test.ts` and the `verify-admission` tests for the cases that section lists.
4. Extend `connect-verify-mismatch.test.ts` with a close-without-answer case for each window kind.

**Validation gate**
- Commands: `bun run lint`; `bun run typecheck:all`; `bun run audit:vue`; the Phase 3.2 e2e commands.
- Pass criteria: every command exits 0 on both browsers.
- Layers: lint, typecheck, unit, network e2e.

## Delivery

One `gh stack`, one PR per arc, PRs opened only after each arc's Codex loop converged. `code_review: off` for every arc. Before each push run `bun run test` and `bun run lint:actions`; also run `bun run test:ci-gating` and `bun run test:release` if the arc touches `scripts/` or `.github/`.

| Arc | Phases | Branch | Stacks on | Closes |
|---|---|---|---|---|
| 1 | 1.1, 1.2 (1.2 only on a "yes") | `worktree-security-ui-1` (adopted with `gh stack init --adopt`) | `dev` | #17 (or comments on it if 1.2 is declined) |
| 2 | 2.1, 2.2 | `security-ui-1-backup-download` | `dev` (Arc 1 merged as #51) | #34 |
| 3 | 3.1, 3.2, 3.3 (3.3 only on a "no") | `security-ui-1-emoji-refuse` | Arc 2 | #14 |
| close-out | docs only | `security-ui-1-close-out` | Arc 3 | none |

If a pick has not arrived when the arc before it converges, the lane stops there and reports; nothing is built ahead of a pick. Each UI PR quotes the owner's pick and attaches the Chrome screenshots in both themes.

## Decision ledger

- **Outline chosen:** the single-call export (Phase 1.1) plus a tagged encrypted wrapper (Phase 1.2).
- **Competing outline (rejected):** "mirror the restore". `ProfileService.exportBackupMaterial` keeps its RPC and returns a transfer key plus a random handle, stashing `{ sourceDek, transferKey }` in an `ExpiringStash`; `full.vue` passes the handle to `AccountService.backupImportedKeys(handle)`, which pops the stash and re-seals rows; the AAD ships with trial decryption and no wrapper change, so no file looks different. Argued for: no change to the popup's RPC surface, symmetry with the restore, no format change at all. Argued against: a secret held in a stash between two RPCs, a TTL and its expiry path, and a second RPC, where one call has none of them; two PBKDF2 runs per wrong password; ambiguity about which format a file is. Both shapes keep accepting legacy no-AAD files. The panel's views and the final reasons are recorded under Audit verdicts.
- **Split of #17 into 1.1 and 1.2:** the per-backup key changes no file format, so it does not wait for the format call.
- **Phase 1.1 covers password profiles only:** the panel split on passkey profiles; see Audit verdicts § Where the panel disagreed.
- **Refusal design:** raw delete by the captured row id, tuple fallback only when verifiable, explicit result; see the same section.
- **Deviation (Phase 1.1, at implementation): the account slice comes from the key export, and the page's completeness check is dropped.** The plan had `full.vue` fail the run when an imported account had no key row. `EntityStorage.getAll` hides a row its codec rejects, so one corrupt key row would fail that check on every retry and the profile could never be backed up again; today the backup ships and the restore drops that one account. `exportFullBackupKeys` now also returns `accounts`, read before the key rows in the same call, and the page serves both slices from it. A concurrent import can then add a key row with no account (the orphan sweep removes it), never an account without its key. Test (i)'s "fails when an imported account has no key row" case is replaced by a test that the file's account and key slices are the export's. The run fence and the profile-id check stay.
- **Deviation (Phase 1.2): the restore's stale fence moves after the shared opener.** `openEncryptedBackup` now calls `openFullBackupText` and checks staleness once it settles, instead of between the KDF and decrypt awaits. Nothing is published in between, so correctness is unchanged; a superseded run only finishes its decrypt. The parser exposes `parseEncryptedBackup` so the detector and the opener share one decision.
- **Deviation (Phase 1.1): the incarnation id is the existing `ProfileService.workerId`**, which already keeps session handles from naming a later worker's session. `openBackupTransfer` returns no `dekReplaced` (it is `sourceDek === null`), and `getProfileDekSealed` is deleted, not just unlisted, since it had no caller.

- **Deviation (Phase 2.1): the confirm button's red needed a ConfirmPopup field, and a compact size.** `confirm_color: "red"` never coloured ConfirmPopup's confirm button: it reaches the design Button as a `type` attribute and only picks the pre-title. Turning it into the red variant would recolour every destructive confirm in the wallet, a UI change outside this sign-off. So ConfirmPopup takes an opt-in `confirm_variant`, unset everywhere else. At the row's medium size, `cta_destructive`'s CTA type (14 px, 0.2 em tracking, no side padding) clipped "Download anyway" to "OWNLOAD ANYWA"; a CTA variant now takes `compact`, the design package's CTA size for a tight spot, where the label fits edge to edge. The look is flagged to the owner in OWNER-ASKS.md § Render notes.
- **Deviation (Phase 2.1): one download writer, the plain-file rule held twice.** `canDownload` decides the button; `downloadBackup(isEncrypted)` refuses a plain file on a password profile again, so a confirmation answered after an in-place switch to a password profile writes nothing. The confirm callback also checks the run's `generation` and the `finished` status.
- **Phase 2.2 helpers:** `exportPlainBackup` became `exportBackupContent` (it now encrypts, downloads and opens the file with `openFullBackupText` in Node); new `downloadEncryptedBackup`, `downloadPlainPasskeyBackup` and `openEncryptedBackup` in `tests/e2e/helpers/backup-export.ts` take the press as a parameter, so `legal-acceptance` keeps its real pointer input.

## Issue claims checked against the tree

- **#34**: every location and claim holds. The saved file is `NuloBackup_<name>_<ts>.gz` (`files.ts` swaps `.json` for `.gz`). For a password profile, Protect with Password reuses the profile password already typed; it asks for nothing new.
- **#14**: every location holds (`background.ts` teardown is `wireSessionTeardown` at `:631-660`). "In both the connect window's check and a reconnect's check window" is one component (`windows/verify/index.vue`), so one change covers both.
- **#17**: every location holds; `encrypt` takes the optional AAD at `encryption-key.ts:42`; a password change rewraps the DEK (`profile/service.ts:1155`). Three claims do not hold as stated. "Both change the backup format": the per-backup key, carried in the existing field, changes no format; only the AAD does. The forward reach is real only for password profiles: for a passkey backup, whoever opens the file's sealed DEK holds the passkey, which opens the stored slot too, so Phase 1.1 leaves passkey profiles unchanged. "The password encryption … passes no associated data" is true, but every other `EncryptionKey` ciphertext already binds its own AAD, so the missing AAD enables no confusion attack today.
- **Lane brief**: "This bumps the backup format version; the restore path must still import every older version through the existing migration registry" does not hold as written. The only version fields are `compat-epoch` (a bump rejects old backups) and `backup-schema-version` (the storage schema version; a bump needs a storage migration). The AAD's version lives on the encrypted wrapper. Old backups still pass through the registry unchanged, and Phase 1.1 test (d) proves it.
- **Lane brief**: "the e2e hook … opens … the verify window" in smoke does not exist. The verify window is reachable only from the network suite, where the playground runs.

## Audit verdicts

### Codex, round 1 (gpt-6.1-sol, high)

**Verdict:** `reject (with blocking findings: refusal can falsely report disconnection; export lacks a profile-incarnation fence across assembly)`.

| # | Finding | Severity | Resolution |
|---|---|---|---|
| 1 | "Invalid id" from `deleteDappSession` does not prove deletion: a locked wallet or another active profile hides the row, and a lock keeps the channel. | High | Accepted, verified (`mac-storage.ts:85-104`, `profile-switch-teardown.ts:15-18`). New `refuseVerification` returns `revoked`, `absent` or `unavailable`; the window closes only on the first two. Facts 13, 14. |
| 2 | Fact 10 is conditional; a stale row id misses a replacement row; one throwing termination skips the rest. | High | Accepted: Fact 10 restated; the refusal falls back to `(origin, chainId)` under the captured profile; `wireSessionTeardown` gets a `try` per match. Profile-scoping the teardown rejected: the profile-switch teardown already ends other profiles' channels, by stamp. `upgradeDappSession` has no production caller today, so the replacement case is defensive. |
| 3 | "Every backup made before" overstates (unsupported epochs already fail); legacy no-AAD acceptance remains. | Medium | Accepted: wording narrowed in plan and OWNER-ASKS; the legacy exception is stated. |
| 4 | Removing the RPCs does not isolate the DEK from a page that holds the password (`getProfileDekSealed`). | Medium | Accepted: the claim is narrowed to "the export response never carries the source DEK"; `getProfileDekSealed` (no production caller) leaves the RPC list. |
| 5 | Inference 2 ignores a profile switch or re-creation during assembly; slices resolve the active profile on their own. | High | Accepted: identity fence in the RPC (deletion epoch and active id, re-checked after the last seal) and an active-profile re-check in `full.vue` before publishing. Fact 15. |
| 6 | Unopened rows stay DEK-sealed; retained passkey probe buffers can escape cleanup. | Medium | Accepted: the exception is documented; only open failures are caught; buffer ownership is stated. |
| 7 | Phase 3.3 needs lifecycle semantics. | Medium | Accepted: the confirmed mark binds to the reservation's transport id, hash and window; the cases are listed. |
| 8 | Option C as written hits the busy latch and the status-based download selection. | Medium | Accepted: options.md C now extracts an encryption worker and passes the artifact explicitly; confirm callbacks check `generation`. |
| 9 | Tests compare sealed blobs (random IVs) and lean on a CI-skipped passkey smoke. | Medium | Accepted: tests compare opened bytes; a unit round trip for the password path (the passkey path no longer changes; see the Opus row 2); the smoke is not counted as round-trip coverage; a reconnect refusal e2e is added. |
| 10 | Parser acceptance: 13-byte minimum, byte cap before PBKDF2, stale fence, passhash wipe, missing `lint:actions`. | Medium | Accepted: 29-byte minimum, cap and tag checks before PBKDF2, `fromPassword`, fence kept, `lint:actions` before every push; new refused-class tests. |

**Outline choice (Codex):** the main outline for both decisions. It called the stash workable with identity binding and judged my "two-window pairing failure" argument overstated, since a random handle avoids it. Accepted: the ledger now rejects the stash for its secret lifetime, TTL and second RPC, not for pairing. Its claim that trial decryption keeps older readers compatible is rejected: an older reader passes no AAD and cannot open an AAD-bound frame under either shape.

### Opus 5.5 (Plan agent), round 1

**Verdict:** `conditional approve (with conditions: fix the fail-open "Invalid id → close" in Arc 3; restate what #17 actually closes for passkey profiles and what the AAD half adds, in plan §Security and OWNER-ASKS call 4; add backup-imported-account.test.ts to the Phase 1.1 gate; make test (e) and Option C buildable)`.

| # | Finding | Severity | Resolution |
|---|---|---|---|
| 1 | "Invalid id → close" fails open: an auto-lock between press and delete hides the row, and the channel survives the lock. | High | Accepted, the same root as Codex 1, with a stronger fix: `refuseVerification` deletes `rowId` raw, without the MAC key, as the profile purge does, so a lock cannot hide it; it emits with the window's captured identity. |
| 2 | #17 overstated: passkey profiles gain nothing; an encrypted password file opened with the current password gains nothing; the AAD closes no current attack, since every other `EncryptionKey` use binds its own AAD. | Medium | Accepted, verified (`password-secret-box.ts:202-204`, `profile/service.ts:2026`, `account-export.ts:150`). Phase 1.1 now covers password profiles only; Security, the Phase 1.2 notes and OWNER-ASKS call 4 state the real value. |
| 3 | The Phase 1.1 gate misses `backup-imported-account.test.ts` and `audit:vue`. | Medium | Accepted. |
| 4 | Test (e) passes for a re-sealed DEK. | Medium | Accepted with Codex 9: tests compare opened bytes, plus a file-level check that base64(DEK) appears nowhere. |
| 5 | Option C hits the busy latch. | Medium | Accepted (same as Codex 8). |
| 6 | Reading key rows before the account slice lets a racing import ship a keyless imported account. | Low | Accepted: the page checks every imported account has a key row before it publishes. |
| 7 | `exportPasskeyCredential` complexity and probe zeroizing. | Low | Moot: the passkey path no longer changes. |
| 8 | Redact the internal names; test the RPC removal. | Low | Accepted. |
| 9 | Use the production codec in e2e, not a mirror. | Low | Accepted. |
| 10 | Phase 3.3's confirmation belongs in the wallet-sdk background, keyed by window. | Low | Accepted. |
| 11 | Confirm callbacks must check `generation` and the payload; add `window-placement.test.ts` to the Phase 3.2 gate. | Low | Accepted. |
| 12 | `auto-imports.d.ts` regenerates; keep the stale checks between awaits. | Low | Accepted. |

**Assumption attack (Opus):** Inferences 1, 3 and 4 hold (the playground subscribes to `onDisconnect`); Inference 2 was unsafe and is rewritten; a missing inference (a lock reroutes the check window and keeps the channel) is added as Inference 7.

**Outline choice (Opus):** the main outline for both decisions, adding that the stash sweep runs only on restore, finalize and delete (`profile/service.ts:196-200`), so an abandoned export stash would hold the source DEK until the service worker dies.

### Where the panel disagreed, and the call

- **Does the transfer key help passkey profiles?** Codex: yes, it removes backup-key-based forward reach for both types. Opus: no, whoever opens the passkey file's key holds the passkey, which opens the stored slot. Decided for Opus: the claim rests on the passkey wrap key being the same derivation at export, at restore and on the stored slot (`exportPasskeyCredential` opens the stored slot with the ceremony's `dekWrapKey`), so the file's key never reaches further than the passkey already does. Changing that path would add risk to a shared, complexity-budgeted function for no gain.
- **How "They don't match" survives a lock.** Codex: return `unavailable` and keep the window open. Opus: delete raw so a lock cannot block the refusal. Decided for both, in order: raw delete by the captured id first (it works locked), and `unavailable` only when that id is gone and the tuple fallback cannot be verified.

### Codex, final fresh pass (gpt-6.1-sol, high), round 1

**Verdict:** `reject (with blocking findings: backup identity fencing remains incomplete; refusal can still falsely report successful revocation)`.

| # | Finding | Severity | Resolution |
|---|---|---|---|
| 1 | A delete event built from the captured identity carries the wrong `id` for the settings pages. | Medium | Accepted: the event's `id` is the deleted storage key; teardown moves to its own `onVerificationRefused` event with the captured tuple. |
| 2 | options.md still said a locked refusal deletes nothing; the MAC view's `contains` cannot tell locked from absent. | Medium | Accepted: options synced; the presence check reads the inner store. |
| 3 | The page's final active-id check passes a switch A→B→A, and the epoch fence ended at the last seal. | High | Accepted, verified (`useProfileBootstrap.ts:148` updates in place; `captureExecutionFence`/`assertFence`, `profile/service.ts:506-529`, include the session serial). One execution fence now spans the whole run: captured first, asserted in the key export and again before publication. |
| 4 | A lock during the tuple fallback hides a replacement row and reads as `absent`. | High | Accepted: the fallback holds the owning profile's execution fence across the lookup; a changed fence returns `unavailable`. |
| 5 | `terminateSession` notifies before it drops the channel, and capability-exempt methods skip the missing-row check, so a failed termination or an `absent` path can leave a usable channel. | High | Accepted: `revokeLiveSessions` unstamps each match before terminating it, on every refusal path, `absent` included; Inference 6 withdrawn, Inference 8 added and tested first. |

**Passkey scope (Codex):** password-only is justified for the threat model as implemented; the wording is narrowed to the credential-derived capability, with the rotation caveat.

### Codex, final fresh pass (gpt-6.1-sol, high), round 2

**Verdict:** `conditional approve (with conditions: invalidate backup fences across service-worker restarts)`. The other five round-1 fixes hold within one worker lifetime; no new owner call; no rejected alternative reinstated.

| # | Finding | Severity | Resolution |
|---|---|---|---|
| 1 | A popup-held fence outlives the worker that issued it: serials restart at 0 and epochs live in memory, so an old `{ profileId, epoch: 0, session: 1 }` can match a restarted worker's session, and clients reconnect on their own. | High | Accepted, verified (`session-manager.ts:150`, `:337`, `:651`; `profile-deletion-state.ts:27`). The RPC fence becomes `RunFence`, an `ExecutionFence` plus a per-instance random incarnation id; `assertRunFence` checks it first. In-worker fences stay unchanged. Inference 9 narrowed; test (k) added. The condition is met in the plan; it is proven when (k) passes. |

### Arc 1 post-implementation: Codex fix loop, round 1 (gpt-6.1-sol, high), with one Opus review

**Codex verdict:** `approve with fixes`. No correctness or security bug; four findings, all accepted after checking them against the tree.

| # | Finding | Severity | Resolution |
|---|---|---|---|
| 1 | The stale-selection test released a string passhash into the real `fromPasshash`, so it only proved that a superseded *failure* publishes nothing; the moved fence guards a superseded *success*. | Medium | Accepted, verified. The test now seals a real v2 file, holds the KDF, swaps the selection, lets the real decrypt succeed and asserts nothing is published. Removing the fence after `openFullBackupText` fails it. |
| 2 | The legacy restore test called the services directly and skipped `validateAndMigrateBackup`. | Medium | Accepted. Both restore tests now build a checksummed file, run it through `validateAndMigrateBackup`, then restore with the real services. |
| 3 | Same-id re-creation was not exercised. | Low | Accepted. A held-export test deletes A, restores it under the same id, unlocks it, then releases: `SessionEndedError`. |
| 4 | Two page comments narrated code or repeated the service contract. | Low | Accepted: one deleted, one cut to the invariant. |

**Opus 5.5 review (general-purpose, same round):** `approve with fixes`, no correctness or security bug.

| # | Finding | Severity | Resolution |
|---|---|---|---|
| 1 | "A fence from another session is refused" seeded no row, so it passed with the entry assert removed. | Medium | Accepted: a row is seeded and `openBackupTransfer` must not be called. |
| 2 | The held-export tests had no control, and the deletion test accepted any throw. | Low | Accepted: a hold-and-release control resolves; the deletion test pins `SessionEndedError`. |
| 3 | Key wiping was tested only on the seal-failure path. | Low | Accepted: the lock test asserts both keys are zero after a fence refusal. |
| 4 | A doc comment still pointed at `exportBackupMaterial`. | Low | Accepted. |
| 5 | The orphan sweep runs at service start, not "after a restore". | Low | Accepted: reworded. |
| 6 | Rows that do not open still report `dekReplaced: false`, so the page names no loss though the restore drops those accounts (unchanged from before). | Observation | Not acted on: surfacing it changes what the page shows, an owner call. Goes to `follow-ups.md` at close-out. |
| 7 | A fence refusal during the key export shows "wrong password". | Observation | Already accepted (lessons/phase-1.md). |
| 8 | `atob` accepts whitespace inside the body and unpadded base64. | Observation | Harmless: the tag match is exact and AES-GCM authenticates the frame. |

### Arc 1 post-implementation: Codex fix loop, round 2 (resumed session)

**Verdict:** `clean`. "No material findings remain": the revised tests exercise the successful stale decrypt, validated legacy and new envelopes, same-id re-creation, early refusal and key wiping after a fence refusal. The loop converged for arc 1.

### Arc 2 post-implementation: Codex fix loop, round 1 (gpt-6.1-sol, high), with one Opus review

**Codex verdict:** `reject`. One High, two Low; all accepted after checking them against the tree.

| # | Finding | Severity | Resolution |
|---|---|---|---|
| 1 | A profile switch made in another window updates the page in place (`bootstrapActiveProfile` sets `appStore.profile`; the shell neither navigates nor closes popups), so a finished password backup was judged by the new profile's type: switched to a passkey profile, "Download anyway" wrote the password profile's master, entropy and imported-keys key. A passkey-to-passkey switch left a stale confirmation live. | High | Accepted, verified. A watch on the active profile id runs the unmount path (`discardRun`: fence, run clients, scrub) and returns the page to the agreement step. Tests: password to passkey (the page starts over), passkey to passkey (a confirmation from before the switch writes nothing after the new profile's run is ready; a fresh one does). |
| 2 | The unmount test cannot catch removal of the callback's generation check (unmount also nulls the payload), and nothing tests the `finished` half. | Low | Accepted: the passkey-to-passkey test pins the generation check, and "a confirmation answered after the file was encrypted writes nothing" pins `finished`. Each mutation fails exactly its test. |
| 3 | The capture helper's header claims an optional `downloads` permission and stubs a check nothing makes; a test doc comment walks through its helper. | Low | Accepted: header corrected, stub removed, doc cut to one line. |

**Opus 5.5 review (general-purpose, same round):** `approve with fixes`.

| # | Finding | Severity | Resolution |
|---|---|---|---|
| 1 | Same as Codex 1 (it traced `SessionManager.open` emitting `onActiveProfileChanged` with no lock first). Proposed binding eligibility to the run's `{ id, passkey }`. | Medium | Accepted as Codex 1, with the reset instead: the whole page is profile-type driven (banner copy, whether Protect reuses the profile password or asks for a new one), so a backup held across a switch is wrong beyond the download rule. |
| 2 | The callback's two guards lack failing tests. | Low | Same as Codex 2. |
| 3 | The confirm's doc comment overclaimed ("the run whose payload…") while `generation` changed only on unmount. | Low | Accepted: the switch reset bumps `generation`, and the comment says what the code guarantees. |
| 4 | "An Enter with nothing focused starts nothing" dispatches on `document.body`, which never reaches the page root, so it cannot fail. | Low | Not acted on: pre-existing and unchanged by this arc. |
| 5 | `Object.assign(cacheStore.confirm, …)` could inherit `single`, `confirmation_text` or `toggle` from an earlier request. | Nit | Accepted: the confirmation is a fresh object. |

**Where the panel disagreed, and the call.** Opus: bind the download rule to the run's profile. Codex: invalidate and reset the page on a profile change. Decided for the reset (reason above). What a person sees: after switching profiles in another window, this page returns to its agreement step, its own first screen, instead of showing the previous profile's backup.

### Arc 2 post-implementation: Codex fix loop, round 2 (resumed session)

**Verdict:** `approve with fixes`. The reset to the agreement step is "a reasonable fail-safe"; the round-1 bypass and test gaps are closed. Three findings, all accepted.

| # | Finding | Severity | Resolution |
|---|---|---|---|
| 1 | The reset left a pending passkey prompt for the previous profile open over the new agreement step. | Medium | Accepted: the reset rejects the page's pending ceremony, which unmounts its dialog and aborts the prompt. Test: a held prompt is ended by the switch, then the new profile's run completes. |
| 2 | The default watcher flush defers the reset, and a switch away and back within one tick coalesces it away. | Low | Accepted: `flush: "sync"`; the test asserts the prompt's end with no flush. |
| 3 | "In-flight closures die with the aborted run" overstated the scrub. | Low | Accepted: reworded. |

### Arc 2 post-implementation: Codex fix loop, round 3 (resumed session)

**Verdict:** `approve with fixes`, no production finding: "The production fix looks correct … No new production bug found in this diff." One Low test finding, accepted: the switch test held the prompt forever instead of rejecting it, so the stale run's catch and `finally` never ran. The test now rejects the held prompt through the page's ceremony rejection and asserts the stale run toasts and navigates nothing while the new profile's run completes; removing the catch's generation check fails it. The loop stops here at its three-round limit, with no production finding open.

## Post-implementation

Run per arc at each arc boundary, before `gh stack add` opens the next arc, scoped to that arc's diff. `/code-review` is not run (`code_review: off`).

1. **Codex audit.** Send Codex (`CODEX_ACCOUNT=alejo-gmail ~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol`) the arc's diff, this plan and its decision ledger, the arc map ("arc N of 3; later arcs build X"), an adversarial ask (what could go wrong, what an attacker targets, what we trust that we should not), and these two rules verbatim:
   - "Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."
   - "Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."
2. **Fix loop.** Verify each Codex claim against the tree. Apply the accepted fixes and commit them. Log the round in `lessons/phase-N.md`. Resume the same session (`resume-codex.sh <session-id> <followup> <codex-dir> high`) with the fix diff. Stop when a round has no new material finding. After three rounds with material findings, stop and report.
3. **Cross-arc pass.** After the last arc converges, open a fresh Codex session over the net diff from `dev`. Ask for seams between arcs, duplication across arcs and drift from this plan. Use the same loop.
4. **Delivery.** `gh stack submit --auto`, then `gh pr edit` each body: what changed and why, the validation run with outcomes, the owner's quoted pick for a UI arc, screenshots, `Closes #<n>`. Open without labels; add `e2e:extension-smoke` or `e2e:extension-network` afterwards only when a path filter would skip a suite the arc needs. Then `gh pr checks --watch`.
5. **Close-out.** On `security-ui-1-close-out`: merge `origin/dev` and read what changed in `index.md`, `lessons.md` and `follow-ups.md`. Write the `## Outcome` block right after the front matter (Date, Status, Shipped with PR numbers, Open items, a line retiring the seeds). Promote general gotchas to `lessons.md` (8 KiB budget, dedupe first). Add the account-export follow-up to `follow-ups.md` and delete any entry this lane resolves. Delete `STATUS.md`. Then, in its own commit, `git mv implementations-plan/security-ui-1 implementations-plan/archive/security-ui-1`, repair the links the extra level breaks, and move the index line to `archive/index.md`. Comment on any issue left open with the reason. Report and wait: merging is the owner's call.
6. **Teardown after the merge.** When `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/security-ui-1/plan.md` succeeds, run `agent-worktree done security-ui-1 --merged` (this session did not enter through `EnterWorktree`, so there is nothing to exit). Do not ask first. On a refusal, relay its output and stop. A `/loop` session checks on every firing; a `/goal` session arms one background wait after its report: `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/security-ui-1/plan.md; do sleep 300; done`.

## Seeds

Not run in this lane: the orchestrator drives implementation. Recorded for a session that resumes the plan inside the worktree.

Recommended: `/goal`.

```
/goal All phases this plan schedules (Phase 1.2 only after a "yes" on call 4, Phase 3.3 only after a "no" on call 3, Arcs 2 and 3 only after the owner's picks) are marked ✓ in implementations-plan/security-ui-1/plan.md, each backed by its validation gate reported passing in the transcript; for each phase `LESSONS_FILE=implementations-plan/security-ui-1/lessons/phase-N.md` is printed; `/code-review` was NOT run; the Codex fix loop on gpt-6.1-sol converged for each arc and for the final cross-arc pass, each convergence quoted from a resumed Codex pass reporting no new material findings; the gh stack (one PR per arc plus the docs-only close-out that archived the plan) exists, created only after the loops converged (`gh stack view` output and `git show --stat` of the archive-move commit in the transcript); `bun run test` and `bun run lint` both exit 0.
```

Fallback: `/loop`.

```
/loop 15m Drive implementations-plan/security-ui-1 forward inside its worktree. Never idle. Each firing: (1) read plan.md, OWNER-ASKS.md, STATUS.md and lessons/ from the stack's top layer; if implementations-plan/archive/security-ui-1/plan.md exists on origin/dev, run `agent-worktree done security-ui-1 --merged`, report, clear this loop and stop; if the close-out is delivered but unmerged, babysit CI only. (2) Never build an arc whose owner pick is missing; report the missing call and stop. (3) Otherwise take the next pending step, run its fast layers (`bun run lint`, the touched tests), commit, and at a phase end run the full gate from plan.md, mark ✓ and write lessons/phase-N.md. (4) At an arc boundary run the Codex loop from plan.md's Post-implementation section on gpt-6.1-sol at high, then `gh stack add` the next arc. (5) Stuck or facing a decision: consult Codex, log it, act; never merge, publish, push to main or widen scope. (6) Same step failed five times: stop and reassess with Codex.
```
