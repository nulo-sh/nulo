---
plan: backup-import-export
tier: mid
status: approved by the orchestrator; arc 1 in progress; arc 1b waits on the orchestrator's A1 call; arcs 2 and 3 wait on decision page 1
issues: "#146, #203, #207, #223, #226 (arc 1); #148 in-repo half (arc 1b, stays open); #147, #191, #221 (arc 2); #98, #189, #192, #230, #231 (arc 3)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); dual audit (Codex gpt-6.1-sol high + one Opus Plan agent); final fresh Codex pass
post_implementation_hardening: not scheduled
---

# Backup import and export: key wipes, decoders, the migration engine, the account-state slice

Fourteen issues on backup and storage integrity, in four arcs and a close-out, as the lane map groups them.

- **Arc 1 (decision-free; OA-6 ships in today's words).** The imported-key load and export paths share one unseal helper that wipes every secret buffer in one order (#223). The passkey user handle decodes through a strict hex decoder, and the session MAC check states its only reachable failure (#203). `RestoreData` stops claiming checks nobody makes on `profile` and `network`, a password restore stops keeping a profile id the wallet would not generate, and the `jsonStringify` encoders are pinned on the shipped `Buffer` (#226). The migration engine gets a watchdog on `up()`, a recorded decision not to authenticate its journal, and registry tests that cannot pass on an empty list (#146). Enter stops restarting a failed full-backup restore (#207).
- **Arc 1b (decision-free).** The in-repo half of #148. The issue says the wallet writes keys before addresses; recon shows the order is upstream's `PXE.registerAccount`, so the fix is a one-line patch of `@aztec-labs/pxe` that lets the next registration heal a half-written account. #148 stays open for the upstream report.
- **Arc 2 (waits on page 1, record P1-05).** One account-state slice change: the export drops the contracts every PXE registers itself (#191); the import skips the profile's own account contracts and Nulo's sponsors only if a proof holds (#221); an edited Local Network reads its status the way Settings does, so it stops being left out of backups (#147).
- **Arc 3 (waits on page 1, records P1-01 to P1-04, P1-06, P1-07, and OWNER-ASKS.md).** A deleted default token stays deleted after a restore (#98); the import's warning, failed-Retry line and network names (#189); a restore that did not finish is remembered and shown (#192); the single-account file must be protected before Download (#230); the full-backup page warns when imported accounts will not restore (#231).

Recon: [recon.md](recon.md). Owner questions beyond page 1: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Scope

**In:** the fourteen issues above, with every surface they name. One adjacent hardening found in audit: a password restore keeps the backup's profile id only when it has the shape the wallet generates (Opus S1; no visible change on any file the wallet exported).

**Out, with reason:**
- `#204`'s "config restore loop" and "retire the rc.2-era IndexedDB sweep". The lane map's #204 table assigns them to this lane's arc 1, but they are not among the lane brief's fourteen issues (Ask A6). #204 stays open.
- The two reseal sites in `AccountService` (`resealImportedKeys`, `restoreImportedKeys`): they unseal into bytes for a reseal, not into a scalar, and #223 names only the load and export paths (decision ledger D2).
- An in-app recovery for installs that already lost a note (#148's backup-and-storage-5): page 1 record P1-08 proposes none.
- The upstream report for #148: filing an issue on `AztecProtocol/aztec-packages` is outward-facing, so it stays with the owner. Arc 1b's PR body carries a draft.
- No storage migration (CLAUDE.md § Persisted-storage shape changes: pre-production). Every persisted or backup shape change is a documented baseline change with its backup-compatibility consequence stated.
- No change to the account-address freeze surfaces (`packages/aztec-runtime/src/account/`).

## Owner dependencies

| Record | Issue | Kind | Phases | Built when |
|---|---|---|---|---|
| P1-05 | #191, #221, #147 | approve | 2.1-2.4 | page 1 signed with P1-05 approved or changed |
| P1-04 + OA-5 | #98 | approve | 3.1 | P1-04 approved and OA-5 answered |
| P1-02, P1-03 + OA-1, OA-2, OA-3 | #189 | approve, veto | 3.2 | P1-02 answered; each OA part ships only when answered (see OWNER-ASKS.md "what ships now") |
| P1-01 + OA-4, OA-7 | #192 | visual (A, B, C) | 3.3 (common), 3.4 (the chosen option) | P1-01 answered; 3.4 also needs OA-4 |
| P1-06 + OA-8 | #230 | approve | 3.5 | P1-06 answered |
| P1-07 | #231 | approve | 3.6 | P1-07 answered |
| OA-6 | #146 | copy | 1.5 (reason text only) | ships now with existing words; a new sentence only if the owner gives one |
| OA-9 | #226 | approve | none now (a profile check in `validateAndMigrateBackup`, only if answered) | ships now as today: no new check, no new words |
| P1-08 | #148 | approve | none (arc 1b is decision-free) | — |

- Merge hold H4: no change to what a backup carries, the account-state slice, the import's skip list or an export page's download rule merges without its page 1 answer. Arcs 2 and 3 are planned in full and built only after the orchestrator hands over the signed page and the OWNER-ASKS answers.
- An item answered "as is" closes as not planned with a comment quoting the answer and its date (SR3); its phase drops and the arc ships the rest.
- A "changed" answer replaces the proposal text in its phase before the phase is built; if the change reaches beyond the phase, the planner revises this plan and re-runs the Codex pass on the changed part.
- An unanswered OWNER-ASKS item leaves that part as it is today (SR2); the rest of its phase ships.

## Outcome & Quality Bar

**For whom.** A person who restores a full backup on a fresh install, often after losing a device, and trusts that what comes back is what they had. A person who exports one account or a whole profile to keep it safe. A future maintainer who adds the first real storage migration.

**What excellent looks like.**
1. Nothing a backup cannot restore is hidden. A full backup that leaves imported accounts or a network behind says so before the download (#231) or after the reopen (#192), in the owner's words. Proven by component tests and a smoke e2e per surface.
2. The wallet's own secret buffers die at the first point the code allows, in one order on both paths, and the order is proven: a test parks contract construction and asserts the DEK, the plaintext and its copy are already zero (#223). (The upstream scalar keeps its own unwipeable copies; F2.)
3. Every decoder at a trust boundary is the one the tests run. A Buffer-free strict decoder replaces the shim-dependent one (#203); the `jsonStringify` encoder branch that sees Buffers runs under both `Buffer` bindings (#226).
4. A migration whose `up()` stops responding cannot hold the wallet on "Updating" while the worker stays alive. It becomes a counted failure at the watchdog bound, and the abandoned `up()` can no longer read or stage anything (#146).

**Good enough.** No new screens beyond what page 1 names. No refactor of the restore pipeline beyond what each fix needs. The import-side skip for #221 ships only behind its proof.

## Assumptions

### Facts (verified against the tree at f15a9b5)

- F1. Load wipes DEK, plaintext, copy after the awaited construction (`apps/extension/src/wallet/services/account/service.ts:424-441`); export wipes plaintext, copy, DEK right after the scalar (`:468-481`). The DEK is not used after `unsealImportedSigningKeyV2` on either path. `unseal-wipe.test.ts` pins both orders.
- F2. `GrumpkinScalar.fromBuffer` stores a bigint (`@aztec-labs/foundation` 6.0.0-rc.1, `bn254/field.ts:49,158-161`), through a `BufferReader` copy and hex strings the wallet cannot wipe (`serialize/buffer_reader.ts:198-201`, `bigint-buffer/index.ts:21-26`). Wiping the wallet's buffers never touches the scalar.
- F3. The only production hex decode is `Buffer.from(userHandle, "hex")` at `apps/extension/src/wallet/utils/passkey-ceremony.ts:43`, on the passkey create path. Its input is a profile id from `ProfileRepository.generateUniqueId` (8 hex characters, `profile/repository.ts:30`), directly or through the popup's pre-reserved `credentialData.userHandle`.
- F4. Vitest runs on Bun's native `Buffer`; the bundle rewrites bare `Buffer` to the `buffer` package shim (`apps/extension/vite.config.ts:53-54,266-273`). `tests/helpers/shipped-buffer.ts` runs a test under either.
- F5. `normalizeBackupData` runs on every import and guarantees each present root slice is an array of plain objects with a valid id (`backup-migration-registry.ts:251-345`). `profile` is block-listed and passed through unvalidated. `network` is a retired slice: a backup carrying it is refused (`wallet/services/backup/README.md`, Retired slices).
- F6. A password restore keeps the backup's `profile.id` whenever it is free (`profile/service.ts:2328-2331`); a passkey restore takes its id from the credential's user handle (`:2478`).
- F7. `realMigrations` is `[]` (`apps/extension/src/wallet/storage/migrations/index.ts:29`); `registry.test.ts` iterates `migrations`, which is empty off the e2e build. Both e2e fixtures carry version 9001 (`apps/extension/src/e2e/migration-fixture.ts:33`, `backup-migration-fixture.ts:24`) and transform rows only.
- F8. A migration's writes go to an in-memory `StagingArea` and reach storage only after `up()` resolves (`packages/wallet-core/src/migration/staging.ts`, `migrator.ts` `applyOne`); its reads go to the live store.
- F9. No secret exists before unlock: every MAC key in the tree derives from `master` and `dek` (`packages/wallet-crypto/src/dapp-session-mac-key.ts`, `entropy-mac.ts`); the migrator runs at service-worker boot, before unlock (`apps/extension/src/wallet/runtime.ts:358-372`), and in the import page for a backup (`backup-migrator.ts:105`).
- F10. A blocked migration's reason renders verbatim on the recovery screen (`apps/extension/src/components/MigrationBarrier.vue:125`) and inside the import's "could not be upgraded" message (`useFullBackupImport.ts:143`). The e2e fixture's hold caps itself at 30 s (`migration-fixture.ts:38`).
- F11. `resolveFullBackupEnterAction` excludes only `progress` (`apps/extension/src/popup/pages/import-helpers.ts:23`); the button uses `restoreCtaBlocked` (`apps/extension/src/utils/full-backup-ctas.ts:25-27`).
- F12. Upstream `PXE.registerAccount` writes the key store, then the address store, in two transactions, and returns early when the key store already had the account (`@aztec-labs/pxe` 6.0.0-rc.1 `dest/pxe.js:359-371`). Both writes are idempotent; `addCompleteAddress` returns `false` on an equal entry (`key_store.ts:361-383`; `address_store.ts:19-45`). The repo carries two `patchedDependencies`, both on MIT `package.json` files (root `package.json:54-57`); `@aztec-labs/pxe` is Apache-2.0 through `OVERRIDES` (`packages/third-party-notices/src/policy.ts:100-118`).
- F13. `getNodeStatus` calls `_getChainId(rpcUrl)` without the kind hint `_getChainId(rpcUrl, kindHint?)` accepts (`network/service.ts:746,997`); `probeNodeStatus` applies `isLocalNetworkTarget` (`:763`), under which a local-kind network that answers is Active without a chain-identity check (`:143-145`).
- F14. The account-state slice is `non-storage` and not schema'd (`backup-migration-registry.ts:218`); the import already skips PXE-provided addresses (`account-state/service.ts` `precheckContractAddress`). Its cap is `maxSliceCodeUnits: 40 * 1024 * 1024` UTF-16 code units (`normalize.ts:34`).
- F15. The deleted-token marker lives at `nulo:core:token-seeded@<profileId>` (`token/seeder.ts:665`). `markDeletedByUser` replaces whatever entry the token had with `deleted`, and `updateMarker` never lets a later write replace a `deleted` entry (`seeder.ts:302-304,334-337`). `TokenService.backup` returns token rows only (`token/service.ts:775-779`); its restore captures and checks the deletion fence (`:783-786,802`). The seeder runs for the active profile only (`token/service.ts:182`).
- F16. `FpcService.getFpcs` registers a protocol sponsor only when its row is missing (`fpc/service.ts:142,159-161`); `getFpc` registers nothing (`:243-248`). Protocol sponsor rows are not in backups (backup README, Retired slices).
- F17. `resealImportedKeys` counts rows that do not open under the backup's source DEK and only logs the count (`account/service.ts:826-850`). The passkey export opens the stored DEK under the ceremony's wrap key as a probe and wipes it (`profile/service.ts:1753-1775`), and never opens a row.
- F18. `account.vue` fetches a plaintext account file at "Create Account File" and enables Download on it for a password profile (`export/account.vue:122-130,300-312`); `full.vue` refuses a plain download for a password profile (`canDownload`, `:148`, re-checked at `:398`).
- F19. The account-state tail runs in the page, publishes its outcomes once after all networks settle, and its retry context is never persisted (`importChainSync.ts:73-81`; `full-backup-restore.ts:652-657`; `useFullBackupImport.ts:408-423`). `finalizeRestore` clears the restore-pending marker at entry (`profile/service.ts:2581`).
- F20. `PROFILE_UI_KEY_PREFIXES` (`apps/extension/src/utils/profile-ui-keys.ts:9`) is what the profile-deletion coordinator removes on every deletion path, a rolled-back restore included (`wallet/services/profile-deletion/coordinator.ts:135`).

### Inferences (unverified; audits attack these)

- I1. #223 asks for one order "without changing when the DEK is released relative to the key bytes". No single order keeps both paths' statements: load wipes DEK, plaintext, copy; export wipes plaintext, copy, DEK. The plan reads the clause as "neither outlives the other across an await": the helper wipes all three in one synchronous `finally` right after the scalar, DEK first (load's order). So export's statement order changes (the spy harness sees it, and its pins change with it), load's buffers die before the awaited construction instead of after it, and nothing separates the DEK from the key bytes on either path. This is a deliberate engineering reading, recorded in D2, not an exact preservation.
- I2. Bun's native `Buffer` decodes `" 0a"` differently from the shim, as #203 says. Not run; the fix does not depend on it, since the new decoder uses no `Buffer`.
- I3. The watchdog's 60 s is a chosen policy, not a measurement: no real migration exists to measure. A data transform over `chrome.storage.local` is expected to finish in seconds.
- I4. The watchdog bounds the engine's wait on an awaiting `up()` only. It cannot cut a loop that never yields, and it cannot help when `chrome.storage` itself stops answering (the restore and the attempt bump would hang too). On Chrome the worker's idle termination often comes first; the existing resume path then counts the interruption. Its real targets are Firefox's event page with a wallet page open and the in-page backup-import migrator.
- I5. The lazily registered account contracts and protocol sponsors are registered before any read that needs them (#221). Phase 2.3 exists to prove or refute this, on a real PXE.
- I6. A slice carrying an edited Local Network fits under the existing cap once #191 removes the PXE-provided contracts.
- I7. Writing the deleted-token markers for the new profile before `finalizeRestore` beats the first seed pass, since the seeder runs for the active profile only (F15). The phase 3.1 e2e proves a seed pass ran.

### Asks (each with the working assumption the plan proceeds on)

- A1. **#148's in-repo fix is an upstream patch, not a wallet write order.** The lane map says "fix the wallet's registerAccount write order"; the wallet has none (F12). Working assumption: patch `@aztec-labs/pxe` (decision ledger D7). The orchestrator may instead drop arc 1b and leave all of #148 to the upstream report.
- A2-A5, A8-A10: owner questions, each in OWNER-ASKS.md with its "what ships now" form: OA-1 (what M counts), OA-2 (the onboarding notice's sentence), OA-3 (how the viewer names a network), OA-4 (whose restore the reminder belongs to, and what a deleted network does to it), OA-5 (an older version refusing a backup with markers), OA-6 (the watchdog's reason text), OA-7 ("Restore again" makes a second profile), OA-8 (the UI no longer makes an unprotected account file), OA-9 (what a malformed backup profile shows).
- A6. **#204's two items.** Working assumption: out of scope, since the lane brief lists fourteen issues. The orchestrator may add them to arc 1.
- A7. **P1-05 (3): "its own per-network section inside the existing import cap".** Working assumption: the slice's existing per-network items, with no wire change and the whole-slice cap unchanged.

## Architecture & Implementation

### Arc 1

**#223, one unseal helper that owns every secret buffer.** A module-private function in `account/service.ts`:

```ts
/** Unseals an imported signing key into a scalar and takes ownership of `dek`: the DEK, the
 *  plaintext and its copy are wiped, in that order, before the scalar returns or the error
 *  propagates. */
async function unsealImportedScalar(dek: ImportedKeysDek, chainId: number, address: string, sealed: string): Promise<GrumpkinScalar>
```

Both paths call it, then do their own work (construct and check the address; build the envelope) with no secret buffer alive. Pinned logs after the change, identical on both paths:

| Case | Log (load continues with `construct, constructed`; export with `build`) |
|---|---|
| success, or load's address mismatch | `unseal, wipe:dek, wipe:sk, wipe:copy` |
| non-canonical scalar | `unseal, wipe:dek, wipe:sk, wipe:copy` (load maps the error; export propagates it raw, as today) |
| unseal rejection | `unseal, wipe:dek` |

The DEK and the key bytes die in the same tick on both paths (I1); on load that tick moves from after the awaited construction to before it. The parked-construction test asserts all three are zero while construction waits.

**#203, strict hex.** `fromHex(hex: string): Uint8Array<ArrayBuffer>` in `packages/wallet-core/src/utils/encoding.ts`, beside `bytesToHex`, exported from `@nulo/wallet-core/utils`. It accepts an even-length string of `[0-9a-fA-F]` and throws on anything else, with no `Buffer`. `buildCreateOptions` uses it. In `verifyDappSession`, the `try/catch` around `fromBase64Lenient(mac)` becomes an explicit `typeof mac !== "string"` refusal, which is the only failure that catch could see; the decode stays lenient, as its two-binding test already pins.

**#226, honest restore types and generated profile ids.**
- What already checks `profile` today: file selection refuses a plain backup with no `profile.type` ("Unrecognized Backup File", `useFullBackupImport.ts:483`); Restore stays disabled without one (`:715`); the profile service refuses a `type` that does not match the restore secret ("Restore secret type does not match profile type", `profile/service.ts:2187`). Arc 1 adds no check in the composable, since any new refusal would change what a person reads (OA-9). Instead the types stop claiming one: `RestoreData.profile` becomes `unknown`, and the read at `:323` casts to `{ id: unknown; name: unknown; type: unknown }`, what the gates actually leave unchecked, carried as such up to the RPC, where the service validates. If OA-9 picks the integrity message, a check moves into `validateAndMigrateBackup` and the type narrows with it.
- `RestoreData` then claims only what is checked:

```ts
/** What `validateAndMigrateBackup` guarantees: each present root slice is an array of plain
 *  objects with a valid row id. `profile` is unchecked here; the profile service validates it. */
export type RestoreData = Record<string, unknown> & {
	account?: Array<Record<string, unknown>>
	token?: Array<Record<string, unknown>>
	"token-balance"?: Array<Record<string, unknown>>
	profile: unknown
}
```

  `network` goes (F5).
- `restorePasswordProfile` keeps the backup's id only when it matches `^[0-9a-f]{8}$`, the shape `generateUniqueId` makes (`PROFILE_ID_HEX_LENGTH`); any other value, string or not, is treated as taken, so a fresh one is generated, as already happens when the id is in use. The restore remaps every child row to the new profile id unconditionally (`useFullBackupImport.ts:351`) and account derivation does not read the profile id, so a file the wallet exported restores exactly as today. A hand-edited file with a non-text id now restores under a fresh id instead of whatever the unchecked id did; no words change (stated in OA-9).
- The `jsonStringify` encoders stay the upstream copy (the issue's own disposition). A test runs them under both bindings. `JSON.stringify` calls `Buffer.prototype.toJSON` before the replacer, so the `{ type: "Buffer", data }` branch is the one that sees Buffers; the test pins that branch's output and says so.

**#146, watchdog, journal, tests.**
- `MigratorOptions.upTimeoutMs?: number`, default `60_000` (I3). A module-private `runWithWatchdog(up, staging, ms, version)` races `m.up(...)` against a timer; `applyOne` stays inside its line budget. On timeout it revokes the `StagingArea` (new `revoke()`: every later read or write throws, and a read already awaiting the store checks again after its await, so it never returns live data after the timeout) and throws into the existing failure path: restore the footprint, mark the journal counted, bump the attempt, clear `running`, return `failed`. The `up()` promise gets a no-op `catch`; the timer is cleared in a `finally`. Every later `ctx` call of the abandoned `up()` rejects (it may catch that and keep computing, which the engine cannot stop), and nothing it staged is ever committed (F8). Revocation does not touch the rollback, which writes through the engine's own store (`migrator.ts:427-437`). `runtime.ts` and `backup-migrator.ts` take the default.
- The timeout's reason reuses the engine's existing interrupted-migration wording, `migration N was interrupted mid-write (restored cleanly)`, so the recovery screen gains no new copy (F10; OA-6 offers the owner a dedicated sentence).
- The journal stays unauthenticated, as a decision: no key exists before unlock (F9), a checksum detects nothing a forger cannot recompute, and anything that can forge the journal can write the same keys directly. The engine header says this in one sentence, including the residual: a forged journal can delete or substitute any key inside its registered footprint. The existing "resume refuses a journal its registry did not write" tests (`migrator.test.ts:400-485`) gain one case: a forged empty-entries journal whose refs match deletes only footprint keys, and a key outside the footprint survives.
- `registry.test.ts` runs its per-migration checks over the real registry plus both e2e fixtures (deduplicated by object identity, since both are version 9001). It seeds rows for each fixture before the run-twice check, asserts each run succeeded before comparing outputs, and adds one negative control: a migration that appends to a value key makes the same helper report non-idempotent.

**#207.** `resolveFullBackupEnterAction` takes the page's `FullBackupCtaSource` and returns `"restore"` only when `showsRestoreCta(s) && !restoreCtaBlocked(s)`. `import.vue` passes `fullBackupCta`. The drift pin in `import-helpers.test.ts` flips to the fixed contract.

### Arc 1b

**#148, heal a half-registered account.** A Bun patch of `@aztec-labs/pxe@6.0.0-rc.1`, `dest/pxe.js` only, removes the `return` from `registerAccount`'s already-registered branch, so every call ends in `addressStore.addCompleteAddress`, which writes a missing entry and returns `false` on an equal one (F12). The patched branch carries a one-line "Modified by Nulo" comment (Apache-2.0 §4(b)), and the pxe `OVERRIDES` note in `packages/third-party-notices/src/policy.ts` says `dest/pxe.js` is modified. A kill between the two writes now heals on the next `NuloAccount.ensureRegistered`, which already calls `registerAccount` whenever `getRegisteredAccounts` misses the address. No wallet code changes. The `aztec-update` skill's patch list gains this patch (rename on every bump; delete once upstream ships a fix). The PR body carries the draft upstream report.

### Arc 2

- **#147 status.** `getNodeStatus` passes `network.kind` to `_getChainId`, as `probeNodeStatus` applies `isLocalNetworkTarget`. The header dot, `getSendersAcrossActiveNetworks` and the backup export all read the corrected status; the export now includes an edited Local Network that answers. The header dot's testid'd element gains a `data-status` attribute so the e2e reads the status, not a CSS class.
- **#191 export.** `backupNetworkState` skips `isPxeProvidedAddress` contracts before fetching their instance and artifact. The cap stays as it is; the `normalize.ts:21-34` comment is rewritten to what is now true. Old backups still import, since the import already skips those addresses (F14). No compat-epoch or schema-version change: the slice is `non-storage`, and an older build reads a slimmer slice the same way.
- **#221 proof, then skip.** Phase 2.3 inventories every PXE call that can name the profile's own account address or a protocol sponsor address after a restore, and proves each read that needs the contract is preceded by its own registration, separating harmless registration probes from reads that need the contract. The proof covers both sponsor states: no row (discovery registers, F16) and a row present on a fresh PXE (`getFpc` registers nothing). It ends in a network e2e on a real PXE. If it holds, `precheckContractAddress` and `registrableNetworkIds` also skip those addresses (own accounts from the restored accounts slice; sponsor addresses from `protocol-fpcs.ts`). If it fails, #221 closes as not planned, quoting P1-05.
- **#147 backup half.** Follows from the status fix: chain 0's contracts and senders travel as its own per-network item (A7).

### Arc 3

- **#98.** A new optional slice in `BACKUP_SLICE_REGISTRY`, `token-seed-tombstones`, kind `non-storage`: `Array<{ chainId: number; contract: string }>`. `TokenService` gains `backupSeedTombstones()` (the active profile's `deleted` entries) and `restoreSeedTombstones(profileId, entries)`. The restore requires an array, refuses one longer than the count of default-token seeds across all chains before reading any entry, validates each entry (integer `chainId`, a valid Aztec address, canonicalized to lower case, a default-token seed of that chain), de-duplicates, takes the restore deletion fence at entry (`captureRestoreEpochs`), and writes every entry in one call to a new seeder method `restoreDeletedMarkers(profileId, keys, assertLive)`: a single read-modify-write inside the seeder's marker lock, which calls `assertLive()` (the restore's `assertRestoreEpoch`) immediately before `markerStorage.set`, with no await between. A deletion that begins while the call waits for the lock therefore fails the write instead of recreating the blob that `purgeForProfile` removes under the same lock. The export omits the slice when it is empty. The restore writes markers in the tokens stage, before `finalizeRestore` (I7). A backup without the slice restores as today. The backup README gains one line: this slice is a wire projection of `chrome.storage` data, not PXE state, and the engine cannot migrate it, so a later marker-shape change needs explicit compatibility handling. Forward compatibility: OA-5.
- **#189.** `useFullBackupImport` keeps the outcome of the last Retry (`attempted`, `stillFailing`). `ImportFullBackupForm.vue` shows the P1-02 line above Retry after a Retry that fails again, through a pure `retryResultText(stillFailing, attempted)` beside `restoreWarningText`, once OA-1 is answered. The warning text uses `var(--txt-warning)` (P1-03; dark is `--yellow`, so dark is unchanged). The onboarding notice drops the developer-console sentence (P1-02) and names networks once OA-2 is answered. The popup viewer adds names at render time, never into the rows (`retryReplacedRows` matches rows by identity, `useFullBackupImport.ts:653-657`), once OA-3 is answered.
- **#192.** A per-profile record `nulo:ui:restore-outcome@<profileId>` = `{ run: string; networkIds: string[]; leaseUntil: number }`, through `@/utils/storage`, where `run` is a 128-bit random hex token minted by each restore run, armed immediately before `finalizeRestore`, after the networks stage has mapped backup network ids to the new profile's (`reseedNetworksStage`, `useFullBackupImport.ts:353`), holding the destination ids of exactly the networks the tail will try: the account-state planning step is extracted so the arm and `restoreAccountStateStage` use one set, and an empty or entirely skipped item is not in it (F19). Closing the page before `finalizeRestore` runs no rollback: it leaves a torn import, which stays unlock-refused and which the boot sweep deletes through `deleteProfile` once it is seven days old (`profile/service.ts:194,1632-1650`), removing the record with the prefix. Until then the reader ignores it, since it shows a record only for a finalized profile: under OA-4 A the active profile, which a torn import never is; under OA-4 B the reader skips any profile still carrying the restore-pending marker. An awaited per-network hook added to `runImportChainSync` reports each network's real registration result; a network that restored with no error is trimmed. Arm, renew, trim and clear each run inside one Web Lock per profile (`navigator.locks.request("nulo:restore-outcome@<profileId>", …)`, the primitive `scope-follow.ts` already uses), in every context: the import page, a second import window, the popup's Dismiss. Inside the lock, renew and trim read the record and write nothing when it is absent or carries another run's token, so a trim or renewal after Dismiss cannot recreate it, and a delayed callback from an earlier restore of a reused profile id (a password restore keeps a free backup id) cannot touch the later restore's record. Every read decodes the stored value at runtime (`@/utils/storage` returns `unknown`): an object whose `run` is 32 hex characters, whose `networkIds` is an array of at most 64 strings of at most 64 characters, and whose `leaseUntil` is a finite number; anything else is treated as absent and removed under the lock, and a lease more than 30 s in the future counts as expired, so tampered storage can neither crash the reader nor hide the reminder for good. Profile deletion removes the key without that lock, so a trim racing a deletion can leave an orphan record for a profile that no longer exists; a reader shows a record only for an existing profile and removes an orphan it finds, and a later arm for a reused id overwrites it. While the tail or a Retry runs, the page renews `leaseUntil` to now + 30 s every 10 s; a reader shows the record only once `leaseUntil` has passed, so a restore still running in another window does not read as abandoned. Names resolve at render from the network rows. Its prefix joins `PROFILE_UI_KEY_PREFIXES` (F20), so every deletion path removes it, a rolled-back restore included. Phase 3.4 renders it per the owner's option; option B's Retry opens the file picker, as the page's shot spec says, since nothing of the backup is persisted.
- **#230.** "Create Account File" fetches the protected body (`exportAccount(..., true)`) instead of the plain one, and holds it; "Protect with Password" then marks the file protected; Download is disabled until then, and `handleDownload` re-checks the rule. No plaintext signing-key file is ever built in the page. The screens and their order stay as P1-06 states; the banner copy becomes P1-06's; the testid `account-file-ready-banner` stays.
- **#231.** The count comes from the DEK the file carries. Password path: `FullBackupKeys` gains `unopenedImportedKeys: number`, returned from `resealImportedKeys`. Passkey path: a new `AccountService.exportPasskeyBackupKeys(fence, credentialData)` mirrors `exportFullBackupKeys`: it calls the profile service's passkey export in-process with a typed `inspectDek` callback (never part of the RPC surface; `AccountService` already depends on `ProfileService`). In the profile service, the existing `try/catch` stays narrowly around `unsealDekUnderWrapKey`; when the probe opened, the callback is awaited in its own `try/finally` that owns the opened DEK and wipes it, and a callback failure aborts the export instead of reading as "DEK unrecoverable". The callback reads the imported-key rows once, counts the rows that do not open under that DEK (wiping each plaintext at once), and keeps those rows. When the probe does not open (`dekReplaced` is true), the callback never runs: `exportPasskeyBackupKeys` reads the rows once itself and reports no count, since the banner shows only when `dekReplaced` is false. It returns the material, the rows and the count. `full.vue`'s passkey branch switches to it and holds the rows like the password branch. Run fences are checked before and after. `full.vue` shows the P1-07 banner when the count is above zero and `dekReplaced` is false.

### File-level change map

| Arc | File | Change |
|---|---|---|
| 1 | `apps/extension/src/wallet/services/account/service.ts` | add `unsealImportedScalar`; both paths call it |
| 1 | `apps/extension/src/wallet/services/account/unseal-wipe.test.ts` | new logs; parked-construction assertion |
| 1 | `packages/wallet-core/src/utils/encoding.ts` (+ `encoding.test.ts`, utils index) | `fromHex` |
| 1 | `apps/extension/src/wallet/utils/passkey-ceremony.ts` (+ test) | use `fromHex` |
| 1 | `apps/extension/src/wallet/services/dapp-session/integrity.ts` (+ test) | explicit non-string refusal |
| 1 | `apps/extension/src/composables/useFullBackupImport.ts` | the `profile` read casts to what the gates leave unchecked |
| 1 | `apps/extension/src/composables/full-backup-restore.ts` | narrowed `RestoreData`, `BackupProfile` |
| 1 | `apps/extension/src/wallet/services/profile/service.ts`, `repository.ts` (+ test) | restored id kept only when generated-shaped |
| 1 | `apps/extension/src/wallet/utils/serialization.test.ts` | encoder branch under `BUFFER_BINDINGS` |
| 1 | `packages/wallet-core/src/migration/migrator.ts`, `staging.ts` (+ `migrator.test.ts`) | watchdog, `revoke()`, header sentence, forged-journal case |
| 1 | `apps/extension/src/wallet/storage/migrations/registry.test.ts` | non-vacuous checks, negative control |
| 1 | `apps/extension/src/popup/pages/import-helpers.ts` (+ test), `import.vue`, `import.test.ts` | Enter follows `restoreCtaBlocked` |
| 1b | `patches/@aztec-labs%2Fpxe@6.0.0-rc.1.patch`, root `package.json`, `bun.lock` | the patch |
| 1b | `packages/third-party-notices/src/policy.ts` | the modified-file note |
| 1b | `packages/aztec-runtime/src/pxe/register-account-heal.test.ts` (new) | runs the shipped `registerAccount`; text pin |
| 1b | `.claude/skills/aztec-update/SKILL.md` | the patch joins the patch list |
| 2 | `apps/extension/src/wallet/services/network/service.ts` (+ `service.test.ts`) | kind hint; flip the BUG PIN |
| 2 | `apps/extension/src/components/Header.vue` | `data-status` on the dot |
| 2 | `apps/extension/src/wallet/services/account-state/service.ts` (+ test), `normalize.ts` | export filter; comment |
| 2 | `apps/extension/src/wallet/services/account-state/pxe-provided.ts`, `service.ts` (+ tests) | import skip, only if 2.3's proof holds |
| 2 | `apps/extension/tests/e2e/network/backup-edited-local-network.test.ts`, `restore-skip-proof.test.ts` (new) | dot and backup inclusion; the #221 proof |
| 3 | `apps/extension/src/wallet/services/backup/backup-migration-registry.ts`, `README.md`, `footprint-coverage.test.ts` | the tombstone slice |
| 3 | `apps/extension/src/wallet/services/token/service.ts`, `seeder.ts` (+ tests) | tombstone backup and restore |
| 3 | `apps/extension/src/popup/pages/settings/security/export/full.vue` (+ `full.test.ts`) | export the slice; passkey branch; the #231 banner |
| 3 | `apps/extension/src/composables/full-backup-restore.ts`, `useFullBackupImport.ts`, `importChainSync.ts` | restore tombstones; retry outcome; record arm, hook, trims, lease |
| 3 | `apps/extension/src/components/composite/import/ImportFullBackupForm.vue`, `restore-warning.ts` (+ tests) | retry line, warning colour |
| 3 | `apps/extension/src/onboarding/pages/import.vue`, `apps/extension/src/popup/pages/import.vue` | notice and viewer names |
| 3 | `apps/extension/src/utils/restore-outcome.ts` (new, + test), `profile-ui-keys.ts` | the record; its prefix |
| 3 | option A: `apps/extension/src/popup/components/modules/general/RestoreOutcomeBanner.vue` (new, + test), `general.vue`; option B: the popup router guard; option C: the Settings backup entry | render |
| 3 | `apps/extension/src/popup/pages/settings/security/export/account.vue` (+ new `account.test.ts`), `tests/e2e/helpers/account-io.ts` | protect before Download |
| 3 | `apps/extension/src/wallet/services/account/service.ts`, `spec.ts`, `client.ts`, `profile/service.ts` | unopened count on both paths; `exportPasskeyBackupKeys` |

## Security & Adversarial Considerations

- **Threat model.** (a) A hostile backup file: plain backups carry a checksum anyone can recompute, so every slice is attacker-controlled, including the new `token-seed-tombstones` slice and the `profile` object, whose `id` a password restore keeps when free (F6). (b) Tampered `chrome.storage.local`: anyone who can write it can forge the migration journal, and can equally write any row. (c) Memory disclosure of key material in the extension's own process (a later heap read, a crash dump). (d) A stuck migration as a denial of service against the wallet's own UI. (e) The dependency patch, which sits on the code that stores an account's privacy keys.
- **Key material (#223, #231).** The helper wipes the DEK, the plaintext and the copy before any further await on both paths. The #231 passkey count runs inside the profile service's probe scope, opens each row under the DEK the file carries, and wipes each plaintext before the next row; it never reseals, logs or returns key material. `zeroize` is `@nulo/wallet-crypto`'s; no new cryptography.
- **Input validation.** `fromHex` refuses odd length and any non-hex character, whitespace included. The backup's `profile` is checked where it is today (selection, Restore eligibility, the service's type match); a restored id that does not match `^[0-9a-f]{8}$` exactly, string or not, is replaced, closing the file's control over storage keys like `nulo:core:profiles@<id>`. Tombstone entries: array required, length bounded before iteration, each field validated and canonicalized, restricted to the chain's default-token seeds, behind the restore deletion fence checked inside the marker lock, so a hostile file can only mark default tokens deleted, which a person undoes by adding the token again. The #192 record holds a run token, network ids and a timestamp only; every write is serialized by one Web Lock and bound to its run, and every read decodes and bounds it.
- **Journal (#146).** Not authenticated, by decision D4; the residual (a forged journal can delete or substitute keys inside its registered footprint) is stated in the engine header and pinned by a test. The watchdog's bound is a constant, not read from storage.
- **Supply chain (#148).** The patch is a committed, reviewed one-line diff applied by Bun's `patchedDependencies`; `bun.lock` records it; CI installs with `--frozen-lockfile`; the 7-day minimum age is unaffected. It adds no network or storage capability. Arc 1b's gate runs the audit gate and a build, so the notices generator sees the modified Apache-2.0 file with its notice.
- **Rendering.** Network names are user-controlled (custom networks) and render as text interpolation only, never `v-html`.
- **Logging.** New log lines carry counts and fixed categories only: no contract address of a deleted token, no network URL, no key material, no profile id from a file (CLAUDE.md § Logging policy).
- **Least privilege, CI.** No workflow, permission or secret changes.

## Phases

Every gate includes `bun run lint` and `bun run typecheck:all`. During a phase, run unit tests per file with `cd apps/extension && bun --bun vitest run <file>` or `cd packages/<pkg> && bun --bun vitest run <file>`. Smoke e2e runs as `cd apps/extension && bun run test:e2e -- <files> --retry=0`; network e2e as `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent <files> --retry=0`. A gate passes only when its named tests ran (none skipped unless the Firefox driver lists the spec as Chrome-only). Never run two `e2e:agent` runs in this worktree at once; until gate G1 (#169) merges, run network e2e only when no other lane is running it on the host.

### Arc 1: crypto and wipe, decoders, migration residuals, Enter guard

#### Phase 1.1: Enter follows the Restore button (#207)

1. Change `resolveFullBackupEnterAction` to take a `FullBackupCtaSource`. Return `"restore"` only when the Restore button is enabled.
2. Pass `fullBackupCta` from `apps/extension/src/popup/pages/import.vue`.
3. Replace the drift pin in `import-helpers.test.ts`: `failed` resolves to `null`; a not-allowed state resolves to `null`; an allowed idle state resolves to `"restore"` (the success control).
4. Add a page test in `import.test.ts`: Enter on a failed restore does not call the restore; Enter on an allowed idle restore does.

UI impact: none on screen. Enter after a failed restore no longer restarts it, which matches the disabled button; the PR says so.

Validation gate:
- Commands: `bun run lint`; `bun run typecheck:all`; `cd apps/extension && bun --bun vitest run src/popup/pages/import-helpers.test.ts src/popup/pages/import.test.ts`.
- Pass: exit 0; the four new cases pass.
- Layers: lint, typecheck, unit, component.

#### Phase 1.2: one unseal helper (#223)

1. Add `unsealImportedScalar` and call it from the load and export paths, as in Architecture.
2. Rewrite `unseal-wipe.test.ts` to the new logs and header.
3. In the parked-construction test, assert while construction waits that the DEK, the plaintext and the copy are zero, after asserting the same buffers held key material when the unseal returned (the control).

UI impact: none.

Validation gate:
- Commands: lint; typecheck; `cd apps/extension && bun --bun vitest run src/wallet/services/account/`.
- Pass: exit 0; every account test passes, including `full-backup-keys.test.ts`.
- Layers: lint, typecheck, unit.

#### Phase 1.3: strict hex, honest MAC refusal (#203)

1. Add `fromHex` to `packages/wallet-core/src/utils/encoding.ts` and export it.
2. Add tests: one per refused class (odd length, a non-hex character, leading whitespace), plus success cases (empty, mixed case, a `bytesToHex` round trip).
3. Use `fromHex` in `buildCreateOptions`. Test that a malformed handle rejects and never produces a truncated `user.id`, beside the existing valid-handle case.
4. Replace the `try/catch` in `verifyDappSession` with the explicit non-string refusal. Add a non-string-MAC case returning `false`.

UI impact: none.

Validation gate:
- Commands: lint; typecheck; `cd packages/wallet-core && bun --bun vitest run src/utils/encoding.test.ts`; `cd apps/extension && bun --bun vitest run src/wallet/utils/passkey-ceremony.test.ts src/wallet/services/dapp-session/`.
- Pass: exit 0; the decoder under test uses no `Buffer`.
- Layers: lint, typecheck, unit.

#### Phase 1.4: honest restore types, generated profile ids, pinned encoders (#226)

1. Narrow `RestoreData` (drop `network`, `profile: unknown`) and replace the cast at the restore read with the unchecked shape, carried to the RPC. `typecheck:all` is the test for this step: no runtime behaviour changes.
2. In `restorePasswordProfile`, keep the backup's id only when it matches `^[0-9a-f]{8}$`. Test: a string id of another shape (`"x@y"`) restores under a fresh id; an array id (`["abc12345"]`, which a template literal would turn into a real key) restores under a fresh id; a generated-shaped free id is kept (the control); a generated-shaped taken id is rerolled, as today.
3. Add a `describe.each(BUFFER_BINDINGS)` case to `serialization.test.ts` that pins the base64 output of a Buffer value.

UI impact: none. Every backup the wallet exported restores as today; a hand-edited file with a non-text profile id restores under a fresh id (OA-9 states it).

Validation gate:
- Commands: lint; typecheck; `cd apps/extension && bun --bun vitest run src/composables/ src/wallet/services/profile/ src/wallet/utils/serialization.test.ts`.
- Pass: exit 0.
- Layers: lint, typecheck, unit.

#### Phase 1.5: migration watchdog, journal decision, non-vacuous tests (#146)

1. Add `upTimeoutMs`, `runWithWatchdog` and `StagingArea.revoke()`, as in Architecture.
2. Add tests with fake timers. A never-settling `up()` returns `failed` with the existing interrupted wording, clears `running`, restores the footprint and counts one attempt. After the timeout, the abandoned `up()`'s next read and next write both throw, a read parked on the store before the timeout and released after it throws, and the store is unchanged. An `up()` that finishes inside the bound commits (the control).
3. Add the header sentence and the forged-journal case.
4. Make `registry.test.ts` non-vacuous, with the negative control.

UI impact: none on screen. A stuck migration reaches the existing recovery screen, with existing words (OA-6).

Validation gate:
- Commands: lint; typecheck; `cd packages/wallet-core && bun --bun vitest run src/migration/`; `cd apps/extension && bun --bun vitest run src/wallet/storage/ src/wallet/services/backup/`.
- Pass: exit 0; the negative control fails the helper as intended.
- Layers: lint, typecheck, unit.

#### Arc 1 gate (after 1.5, before the arc's Codex loop)

- Commands: `bun run audit:vue` (typecheck, unit and component tests, lint, then build); `bun run test:all`; `cd apps/extension && bun run test:e2e -- tests/e2e/backup-roundtrip.test.ts tests/e2e/backup-migration.test.ts tests/e2e/import-paths.test.ts tests/e2e/import-errors-scroll.test.ts tests/e2e/passkey-backup.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`.
- Pass: all exit 0; every named spec ran (Chrome-only specs skip on Firefox by design).
- Layers: lint, typecheck, unit, component, smoke e2e on Chrome and Firefox.

### Arc 1b: heal a half-registered account (#148, in-repo half)

#### Phase 1b.1: the PXE patch

1. Run `bun patch @aztec-labs/pxe@6.0.0-rc.1`. Remove the `return` from the already-registered branch of `registerAccount` in `dest/pxe.js` and add the "Modified by Nulo" comment. Commit with `bun patch --commit`.
2. Add the modified-file sentence to the pxe `OVERRIDES` note.
3. Add `register-account-heal.test.ts`. It must execute the shipped method; if the default runner cannot import the lazy client entry, use a `// @vitest-environment node` file that imports `dest/pxe.js` through `@nulo/resolve-asset`. Call `registerAccount` on fake key and address stores. Assert: keys without an address gains the address (the heal); keys and address present leaves the address store's entries unchanged (the control); neither present writes both; a first address write that throws, followed by a second call, heals.
4. Add a text pin over `dest/pxe.js` beside it, so a patch dropped on a bump fails loudly. It complements, never replaces, the behavioural test.
5. Add the patch to the `aztec-update` skill's patch list.

UI impact: none.

Validation gate:
- Commands: `bun install --frozen-lockfile --force`; lint; typecheck; `bun run test:all`; `bun audit --json > ~/.cache/nulo-backlog/backup-import-export/audit.json; code=$?; bun scripts/ci-cd/audit-gate.ts ~/.cache/nulo-backlog/backup-import-export/audit.json --exit-code "$code" --mode enforce`; `bun run build`; `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/import-handshake-note.test.ts tests/e2e/network/profile-reimport-matrix.test.ts --retry=0`.
- Pass: all exit 0; the heal test passes on the patched install and fails with the patch reverted (checked once by hand, logged in `lessons/phase-1b.md`); the build's notices step accepts the modified file.
- Layers: install, lint, typecheck, unit, audit, build, network e2e.

### Arc 2: the account-state slice (waits on page 1, P1-05)

Every phase in this arc waits on page 1. If P1-05 is answered "as is", #191, #221 and #147 close as not planned (SR3) and the arc does not exist.

#### Phase 2.1: an edited Local Network reads its true status (#147)

1. Pass `network.kind` to `_getChainId` in `getNodeStatus`.
2. Flip the `(BUG PIN)` in `network/service.test.ts`. A local-kind network on a non-seed URL that answers is Active. A local-kind network on a dead URL is Inactive. A public network whose chain id differs is still InvalidChain (the control).
3. Add `data-status` to the header dot's testid'd element.

UI impact (P1-05, quoted): "an edited Local Network is checked the way Settings checks it, so its header dot stops reading red while the node answers". The PR attaches a screenshot of the header.

Validation gate:
- Commands: lint; typecheck; `cd apps/extension && bun --bun vitest run src/wallet/services/network/ src/components/`.
- Pass: exit 0.
- Layers: lint, typecheck, unit.

#### Phase 2.2: the export drops PXE-provided contracts (#191)

1. Skip `isPxeProvidedAddress` contracts in `backupNetworkState` before their instance and artifact are fetched.
2. Rewrite the `normalize.ts:21-34` comment to what is now true.
3. Test: the export omits a protocol address and a preloaded contract and keeps a custom contract (the control); an old-shape slice with those contracts still restores (existing import tests stay green).

UI impact (P1-05, quoted): "the export stops writing the contracts every PXE boot registers; old backups still restore". No screen changes.

Validation gate:
- Commands: lint; typecheck; `cd apps/extension && bun --bun vitest run src/wallet/services/account-state/ src/composables/importChainSync.test.ts`.
- Pass: exit 0.
- Layers: lint, typecheck, unit.

#### Phase 2.3: the #221 proof, then the skip

1. List in `lessons/phase-2.md` every PXE call that can name a profile account address or a protocol sponsor address after a restore. Mark each as a harmless probe or a read that needs the contract.
2. Add composition tests on a fake PXE that refuses an unregistered address, one per class of read: tx build, fee payment through a sponsor (with no row, and with a row present on a fresh PXE), the gas-balance read, a view.
3. Add the network e2e `restore-skip-proof.test.ts` with the skip switched on in a test build: restore a used account that holds private notes into a fresh install; read the private and fee balances; send one transaction through a sponsor.
4. If every test shows registration first, keep the skip, and test that a slice holding only those addresses registers nothing and probes no network, beside a slice with a custom contract (the control).
5. If any read comes first, stop. Revert the skip, keep the tests that document the order, and record that #221 closes as not planned, quoting P1-05.

UI impact: none.

Validation gate:
- Commands: lint; typecheck; `cd apps/extension && bun --bun vitest run src/wallet/services/account-state/ src/wallet/services/fpc/ src/wallet/services/execution/`; `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/restore-skip-proof.test.ts --retry=0`.
- Pass: exit 0, with the proof's outcome written in `lessons/phase-2.md`.
- Layers: lint, typecheck, unit, composition, network e2e.

#### Phase 2.4: chain 0 travels in the backup (#147)

1. Test that a full-backup export includes an edited Local Network that answers, with its contracts and senders as its own per-network item.
2. Add `tests/e2e/network/backup-edited-local-network.test.ts`. Edit the Local Network's RPC URL to the sandbox's own address (the edit flow of the smoke spec `tests/e2e/endpoints.test.ts`). Assert the dot's `data-status` reads active. Export a full backup and assert its account-state slice carries the chain 0 item.

UI impact: as in 2.1.

Validation gate (also the arc gate):
- Commands: `bun run audit:vue` (typecheck, unit and component tests, lint, then build); `bun run test:all`; `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/backup-edited-local-network.test.ts tests/e2e/network/backup-import-stalled-network.test.ts tests/e2e/network/backup-restore-integrity.test.ts tests/e2e/network/import-handshake-note.test.ts --retry=0`; `cd apps/extension && bun run test:e2e -- tests/e2e/backup-roundtrip.test.ts tests/e2e/import-dead-rpc.test.ts tests/e2e/endpoints.test.ts --retry=0`.
- Pass: all exit 0; every named spec ran.
- Layers: lint, typecheck, unit, network e2e, smoke e2e.

### Arc 3: warnings, outcomes, export rules (waits on page 1)

Every phase in this arc waits on page 1. Each phase is built only for its answered record; an "as is" drops it (SR3); an open OWNER-ASKS item leaves its part as it is today (SR2).

#### Phase 3.1: deleted default tokens stay deleted (#98, P1-04, OA-5)

1. Add the `token-seed-tombstones` slice, the `TokenService` backup and restore methods, the README line, and the export and restore wiring, as in Architecture.
2. Test: one case per refused input class (not an array, too long, a bad `chainId`, a bad address, not a default-token seed, a duplicate); a profile deletion that begins while `restoreDeletedMarkers` waits for the marker lock leaves no marker blob; a valid entry writes a `deleted` marker; an existing `deleted` marker stays `deleted`; a backup without the slice restores as today (the control).
3. Extend `tests/e2e/network/default-token-seeding.test.ts`: delete one default token, export, restore into a fresh install, and assert that token does not return, while the destination's marker blob holds a `seeded` entry for a default token that was not deleted. Only a seed pass on the destination writes that entry (the backup carries `deleted` entries only, and `seedOne` writes `seeded` even when the row came back with the restore), so the assertion fails if no seed pass ran.

UI impact (P1-04, quoted): "Nothing on any screen changes except that the token stays gone."

Validation gate:
- Commands: lint; typecheck; `cd apps/extension && bun --bun vitest run src/wallet/services/token/ src/wallet/services/backup/ src/composables/`; `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/default-token-seeding.test.ts --retry=0`.
- Pass: exit 0.
- Layers: lint, typecheck, unit, composition, network e2e.

#### Phase 3.2: the import's warning, Retry line and names (#189, P1-02, P1-03, OA-1 to OA-3)

1. Track the last Retry's outcome. Add `retryResultText` with tests for "1 of 1 network" and a plural count.
2. Once OA-1 is answered, show the line above Retry after a Retry that fails again (new testid `import-full-backup-retry-result`).
3. Set the warning text to `var(--txt-warning)`; dark stays `--yellow`.
4. Remove "Check the developer console for details." from the onboarding notice. Name networks in it once OA-2 is answered, and in the popup viewer at render time once OA-3 is answered.
5. Extend `tests/e2e/import-errors-scroll.test.ts`: a Retry that fails again shows the line.

UI impact (P1-02, quoted): "After a Retry that fails again, the line above Retry reads \"Retry didn't work · N of M networks still not restored\" (\"1 of 1 network\" agrees with M). The error notice and the error viewer name each network the way the warning already does (\"Testnet\", \"Local Network\"), and \"Check the developer console for details.\" is removed." (P1-03, quoted): "Light-theme warning text uses --txt-warning (#7f6200, 5.28:1 on the page; today 1.56:1); dark unchanged." Screenshots of both themes attach to the PR.

Validation gate:
- Commands: lint; typecheck; `cd apps/extension && bun --bun vitest run src/components/composite/import/ src/composables/ src/onboarding/ src/popup/pages/import.test.ts src/utils/copy-dash-ban.test.ts`; `cd apps/extension && bun run test:e2e -- tests/e2e/import-errors-scroll.test.ts tests/e2e/onboarding-import.test.ts --retry=0`.
- Pass: exit 0.
- Layers: lint, typecheck, unit, component, smoke e2e.

#### Phase 3.3: remember a restore that did not finish (#192, common to every option)

1. Add `apps/extension/src/utils/restore-outcome.ts` (arm, renew the lease, trim, clear, read), keyed per profile, and add its prefix to `PROFILE_UI_KEY_PREFIXES`.
2. Add the awaited per-network hook to `runImportChainSync`. Arm the record, with a fresh run token, right before `finalizeRestore`; trim it per network on the first run and on Retry, under the Web Lock; renew the lease while the tail or a Retry runs; release it when they end.
3. Test: closing mid-tail leaves every unsettled and failed network in the record; closing before `finalizeRestore` leaves a record no reader shows; a full success leaves no record; an item with no registrable work is never in it; a trim or renewal carrying an earlier run's token changes nothing in a later run's record; each malformed stored shape (not an object, a bad token, a non-array or oversized `networkIds`, a non-finite lease, a lease far in the future) reads as absent or expired and never throws; a Dismiss that lands between a trim's read and its write (both inside the lock, so the Dismiss waits) leaves no record; a renewal after Dismiss writes nothing; an orphan record of a deleted profile is never shown and is removed by the reader; a record whose lease is still live reads as running; a renamed network resolves to its new name; a deleted network follows OA-4's answer.

UI impact: none in this phase (the record has no reader until 3.4).

Validation gate:
- Commands: lint; typecheck; `cd apps/extension && bun --bun vitest run src/utils/restore-outcome.test.ts src/utils/profile-ui-keys.test.ts src/composables/`.
- Pass: exit 0.
- Layers: lint, typecheck, unit.

#### Phase 3.4: show it (#192, P1-01, the owner's option only, once OA-4 is answered)

- **Option A**: `RestoreOutcomeBanner.vue` (from `RecoveryModeBanner.vue`: `Banner` warning, vertical, testid `restore-outcome-banner`), mounted in `general.vue` after `<RecoveryModeBanner />`. "Restore again" opens the full-backup import; "Dismiss" clears the record. Component test (at least 5 cases).
- **Option B**: the popup's first navigation goes to the import result screen when a released record exists, rendering the existing warning from the record; its Retry opens the file picker. Router test.
- **Option C**: one row in the Settings backup entry ("Last restore", "<names> not restored", "Restore again"). Component test.
- For each option, a smoke e2e on `import-dead-rpc.test.ts`'s refusal: hold the tail mid-flight (assert it is), close the import page, wait past the lease, reopen the popup, see the surface name the network.

UI impact (P1-01, the chosen option's text, quoted from the signed page). Screenshots of both themes attach to the PR.

Validation gate:
- Commands: lint; typecheck; the new component and router tests; `cd apps/extension && bun run test:e2e -- tests/e2e/import-dead-rpc.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`.
- Pass: exit 0.
- Layers: lint, typecheck, component, smoke e2e on Chrome and Firefox.

#### Phase 3.5: protect the account file before Download (#230, P1-06, OA-8)

1. In `account.vue`, fetch the protected body at "Create Account File"; let "Protect with Password" mark it protected; add `canDownload` and the handler re-check; set the banner copy to P1-06's; keep the testid `account-file-ready-banner`.
2. Add `account.test.ts`: Download disabled at the ready stage; enabled once protected; a forced press at the ready stage writes nothing; no plain export call is made; a passkey profile is redirected.
3. Update `tests/e2e/helpers/account-io.ts` so the plain-body import test builds its plain file without the removed UI path. Run `account-import-export.test.ts`.

UI impact (P1-06, quoted): "Download stays disabled until the file is protected with your password, as on the full backup for a password profile. The \"Account file is ready\" banner becomes the instruction: \"Protect your account file\" / \"Encrypt the file with your profile password before you download it. Without a password, anyone who opens the file controls this account.\"" Screenshot attaches to the PR.

Validation gate:
- Commands: lint; typecheck; `cd apps/extension && bun --bun vitest run src/popup/pages/settings/security/export/`; `cd apps/extension && bun run test:e2e -- tests/e2e/account-import-export.test.ts --retry=0`, then Firefox.
- Pass: exit 0.
- Layers: lint, typecheck, component, smoke e2e on Chrome and Firefox.

#### Phase 3.6: warn when imported accounts will not restore (#231, P1-07)

1. Return `unopenedImportedKeys` from `resealImportedKeys`. Add `exportPasskeyBackupKeys` and the profile service's `inspectDek` callback, with the probe's unseal catch kept narrow. Switch `full.vue`'s passkey branch to it.
2. Show the P1-07 banner in `full.vue` (testid `backup-imported-unopened-banner`), singular and plural.
3. Test both paths: one unopened row shows the singular banner; three show the plural; zero show none (the control); `dekReplaced` shows only the existing banner; the passkey count uses the probe DEK (a degraded session with no session DEK still counts right); the counted rows are the rows the file carries; a callback that throws aborts the export, with the probe DEK wiped, and is not reported as `dekReplaced`; an unopenable slot exports the rows once with no count.
4. Extend `tests/e2e/backup-imported-account.test.ts`: corrupt one imported-key row before export and assert the banner.

UI impact (P1-07, quoted): "When imported-key rows do not open, the page shows a warning banner beside the existing ones, and Download stays available: \"Some imported accounts are not in this backup\" / \"N imported accounts could not be opened, so they will not be restored. Import their keys again after the restore.\" (\"1 imported account\" in the singular)." Screenshot attaches to the PR.

Validation gate (also the arc gate):
- Commands: `bun run audit:vue` (typecheck, unit and component tests, lint, then build); `bun run test:all`; `cd apps/extension && bun run test:e2e -- tests/e2e/backup-imported-account.test.ts tests/e2e/backup-roundtrip.test.ts tests/e2e/account-import-export.test.ts tests/e2e/import-errors-scroll.test.ts tests/e2e/import-dead-rpc.test.ts tests/e2e/onboarding-import.test.ts tests/e2e/passkey-backup.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`; `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/default-token-seeding.test.ts tests/e2e/network/backup-import-stalled-network.test.ts --retry=0`.
- Pass: all exit 0; every named spec ran.
- Layers: lint, typecheck, unit, component, smoke e2e on Chrome and Firefox, network e2e.

## Decision ledger

Each row: the chosen design, the alternatives weighed, the panel's views, and why.

| # | Decision | Alternatives | Panel | Why |
|---|---|---|---|---|
| D1 | Keep the lane map's arcs (1, 1b, 2, 3) plus a docs-only close-out layer | merge 1b into 1; split arc 1 by risk | neither leg objected | Arc 1b touches no file arc 1 touches (a dependency patch), so it reviews alone; the lane map's order holds for reviewers. |
| D2 | One helper owns the DEK, plaintext and copy and wipes them together right after the scalar | keep each path's cleanup (callback helper); wipe key bytes early but keep the DEK late (round-1 draft); reorder export only; fold in the reseal sites | Codex: the round-1 draft broke the DEK-vs-bytes clause; Opus: the helper should own all three | Same tick for DEK and bytes on both paths, DEK first as on load today; every buffer dies earliest; one pinned order. Export's statement order changes on purpose, which the spy harness pins (I1; Codex round 2 asked that this be recorded, not called a preservation). Reseal sites need bytes, not a scalar. |
| D3 | A Buffer-free strict `fromHex`; integrity's dead `catch` becomes an explicit refusal | run the existing call under both bindings; a lenient decoder | both legs prefer strict | The tested decoder is the shipped one by construction; the handle is always generated hex (F3). |
| D4 | Engine-level watchdog (60 s policy) that revokes staging; no journal authentication; non-vacuous registry tests | a host-side alarm watchdog; a journal checksum or MAC | both legs: engine ownership, no auth; both asked for narrowed claims (I4) | The engine owns restore and counting, and staging confines the abandoned `up()` (F8). No pre-unlock key (F9); a checksum detects nothing a forger cannot recompute. |
| D5 | No new profile check in the composable; `RestoreData.profile` is `unknown` and the read casts to the unchecked shape; the service replaces a restored id that is not `^[0-9a-f]{8}$` | a guard returning a projection (round-1 draft); a check in `validateAndMigrateBackup` with the integrity message (round-1 revision); an assertion in `executeRestore` with a new detail sentence (round-2 revision) | Opus S1 and Codex: the draft dropped `id`; Codex round 2: the integrity mapping is visible; final pass: the new sentence is unapproved copy | Every refusal a composable check could add changes what a person reads, so it waits on OA-9; the types alone make `RestoreData` honest, and the gates and the service already refuse what today's screens refuse. The id rule closes the file's choice of storage key and changes nothing on an exported file (child rows are remapped unconditionally, `useFullBackupImport.ts:351`; derivation does not read the profile id). |
| D6 | The resolver calls `restoreCtaBlocked` | add `failed` to the resolver's own check | both legs | One predicate for the button and the key; the alternative also misses import eligibility. |
| D7 | Patch upstream `registerAccount`, one line (drop the early return), `dest` only, with a behavioural test and a text pin | check both stores before returning (round-1 draft); wallet-side detection; reorder upstream's writes; no in-repo change | both legs: the patch; Opus: the one-line form | Only a patch heals; the address store has no public write; detection repairs nothing and would edit the freeze directory. The one-line form reads no extra state and relies on the idempotent write. |
| D8 | Pass the kind hint in `getNodeStatus` | a separate local-only status path | no objection; Opus adds the dead-URL test | `_getChainId` already takes the hint. |
| D9 | Filter in `backupNetworkState` | filter in `getContracts` | no objection | `getContracts` is also an RPC whose callers expect the full list. |
| D10 | Proof first, on a real PXE, skip only if it holds | skip at once; never skip | Codex: realistic sponsor states; Opus: real-PXE e2e | P1-05 states this order and its failure exit; fakes cannot see lazy contract sync or fee notes. |
| D11 | A new optional `non-storage` slice, omitted when empty, bounded and fenced | extend the token slice's rows; a `value-projection` slice; an envelope-level field outside `data` (older versions would ignore it) | Opus: fine; Codex: bound, fence, document the migration consequence | The registry is the one place restorable data is declared; the envelope field would be a second channel. The forward-compatibility cost goes to the owner (OA-5), with the envelope field as an option. The fence is checked inside the seeder's marker lock, where `purgeForProfile` also runs (Codex round 2). |
| D12 | A write-ahead per-profile record armed right before `finalizeRestore` from the remapped set of networks the tail will try, every write under one Web Lock per profile and bound to its run's token, decoded on every read, with a lease | record at the end of the tail; record after finalize (round-1 draft); arm at profile creation (round-1 revision); an in-page promise chain; a background service owning the record; persist the backup payload for option B | Codex: armed too late, lost trims, B cannot rebuild Retry; round 2: backup ids are not yet remapped at creation, an in-page chain does not serialize the popup's Dismiss; Opus: lease, deletion via `PROFILE_UI_KEY_PREFIXES` | The tail runs in the page (F19); arming before finalize closes the crash gap, and the unfinalized profile's rollback removes the record; a Web Lock serializes every extension page with a primitive the repo already uses, where a new service would add an RPC surface for one UI key, and the run token orders writers across reused profile ids, which the lock alone cannot (final pass); a torn import keeps its record unread until the seven-day sweep deletes the profile; option B's Retry opens the file picker, so nothing hostile is persisted. |
| D13 | Retry outcome kept in the composable; a pure text helper; viewer names at render | compute the line in the template; write names into rows | Opus: rows matched by identity | Testable without mounting; render-time names keep `retryReplacedRows` working. |
| D14 | Fetch the protected file at Create; Download only once protected; handler re-check | mirror `full.vue` and keep the plain fetch (round-1 draft) | Opus: no plaintext file in the page | `account.vue` encrypts in the service, so the plain body has no use once Download needs protection. |
| D15 | Count unopened rows under the DEK the file carries, on both paths | session DEK on the passkey path (round-1 draft); password path only | Codex: wrong DEK authority; Opus: name the RPC, read rows once | The count must describe the file; the probe DEK is what opens the file's rows at restore. The callback runs outside the unseal `catch`, so its failure aborts instead of reading as an unrecoverable DEK (Codex round 2). |
| D16 | The watchdog reason reuses the engine's interrupted wording | a new sentence | both legs: new copy is the owner's | No new copy ships without sign-off (OA-6). |
| D-orch-1 | No stack: arc 1 opens its own PR against `dev` (`gh pr create --base dev`), titled per the Delivery table; arc 1b and later arcs branch from arc 1's branch and rebase onto `dev` after it lands | the Delivery section's `gh stack` | orchestrator decision (overrides Delivery) | The orchestrator merges each arc in order; a plain PR per arc keeps that merge independent of the stack tooling. |
| D-orch-2 | Arc 1 only: nothing of 1b, 2 or 3 is built in arc 1's run; OA-6 and OA-9 ship as the plan states (the watchdog with the engine's existing sentence; the profile-id rule with no new words) | build 1b alongside | orchestrator decision | The orchestrator decides A1 (arc 1b's PXE patch) separately; arcs 2 and 3 wait on decision page 1. OA-6 and OA-9 are information with a veto on that page; a strike reaches the next arc through the orchestrator. |

### Competing outline (cheapest-first), sent to both audits

- Arc 1 as five one-line fixes: reorder only the export path's `finally` to match load (#223); run the existing `Buffer` decode under both bindings and pin today's behaviour (#203); delete `network` from `RestoreData` only (#226); a `chrome.alarms` check in the boot gate that writes a blocked status if `running` outlives five minutes (#146); add `failed` to the resolver's `progress` check (#207).
- Arc 1b: wallet-side detection only. `NuloAccount.ensureRegistered` re-reads `getRegisteredAccounts` after `registerAccount` and throws a typed error.
- Arcs 2 and 3 as in the main plan.

Both legs rejected the outline row by row: the export-only reorder dedupes nothing; pinning the lenient decode keeps garbage-accepting behaviour; deleting `network` alone leaves the profile cast; the alarm adds a second owner of the journal state, is as stuck behind a hung store, and misses the backup-import migrator; the `failed`-only check misses import eligibility; detection leaves the account broken and touches the freeze directory.

## Audit verdicts

### Round 1 (2026-10-09)

- **Codex (gpt-6.1-sol, high): reject**, with blocking findings: the #231 passkey count used the wrong DEK; the #192 record was armed after `finalizeRestore` and option B could not rebuild Retry; OWNER-ASKS shipped recommendations as "what ships now"; #223 changed the DEK-vs-bytes order.
- **Opus 5.5 Plan: conditional approve**, conditions (a) to (g): keep and bound `id` in the profile guard; the #223 helper owns all three wipes; Apache-2.0 notice and audit gate for the patch; the watchdog's copy to the owner and narrowed claims; a real-PXE e2e for #221; the #98 e2e and the registry control able to fail; close Codex's blockers.

Findings and dispositions (each verified against the tree first):

| # | Source | Sev | Finding | Disposition |
|---|---|---|---|---|
| 1 | Codex, Opus | High | #231 passkey count used the session DEK, not the DEK the file carries | Accepted: `exportPasskeyBackupKeys` counts under the probe DEK in-process, rows read once (D15). |
| 2 | Codex | High | #192 record armed after `finalizeRestore`; crash gap | Accepted: armed as soon as the new id exists, before finalize (D12). |
| 3 | Codex | High | #192 option B cannot rebuild Retry from `{ networkIds }` | Accepted in substance: the page's own shot spec has B's Retry open the file picker; nothing of the backup is persisted (D12). |
| 4 | Codex | High | OWNER-ASKS defaults ship the planner's recommendation | Accepted: every "what ships now" is today's form or an already-approved part (SR2). |
| 5 | Codex, Opus | High | #223 draft reversed the load path's DEK-vs-bytes order | Accepted: the helper owns all three and wipes them together, DEK first (D2, I1). |
| 6 | Opus | High | Profile guard dropped `id`; a hostile file picks the restored profile id | Accepted: a non-generated id is replaced (D5). The composable validation it led to was later withdrawn (F-1). |
| 7 | Codex | High | #221 proof could pass on an unrealistic fixture | Accepted: both sponsor states, probe vs needed read, real-PXE e2e (D10). |
| 8 | Opus | High | #98 e2e passes if seeding never ran | Accepted: a non-deleted default token must return in the same restore. |
| 9 | Codex | Medium | Abandoned `up()` keeps reading live storage | Accepted: `StagingArea.revoke()`; tests for a late read and a late write; wording says the watchdog bounds the wait, not execution. |
| 10 | Codex, Opus | Medium | Tombstone slice: no outer bound, no deletion fence | Accepted: array check, length bound first, canonical addresses, `captureRestoreEpochs`/`assertRestoreEpoch`. |
| 11 | Codex, Opus | Medium | F13 misdescribed the never-overwrite rule | Accepted: F15 restated; the test asserts a `deleted` marker stays `deleted`. |
| 12 | Codex, Opus | Medium | Watchdog claims overpromised (sync loops, hung storage, Chrome idle kill) | Accepted: I3 and I4 restated as a policy bound with stated exclusions. |
| 13 | Codex | Medium | #192 trims race and can recreate a dismissed record; success must be the real result | Accepted: awaited per-network hook, serialized trims that never create, real registration results. |
| 14 | Codex, Opus | Medium | Registry fixtures share version 9001; empty-store runs vacuous; results ignored | Accepted: dedupe by identity, seeded rows, success asserted, value-key negative control. |
| 15 | Codex, Opus | Medium | PXE source pin cannot prove a heal | Accepted: the behavioural test is required; the text pin is a complement; a failed-then-retried write case added. |
| 16 | Codex, Opus | Medium | The watchdog reason renders verbatim (new copy) | Accepted: reuse the existing interrupted wording; OA-6. |
| 17 | Codex | Medium | #98 slice bypasses the engine; future marker changes cannot migrate | Accepted: README line; consequence stated in Architecture. |
| 18 | Codex | Medium | Reminder dismissal, deleted networks, reopened Retry are product choices | Accepted: OA-4 covers deleted networks; dismissal and Restore again are on page 1's options; OA-7 adds the second-profile consequence. |
| 19 | Opus | Medium | Apache-2.0 modified-file notice; audit gate on a lockfile change | Accepted: comment in the patched branch, `OVERRIDES` note, audit gate and build in the 1b gate. |
| 20 | Opus | Medium | #230 builds a plaintext file the page can no longer release | Accepted: fetch the protected body at Create (D14). |
| 21 | Opus | Medium | #192 cannot tell a running restore from an abandoned one | Accepted: the lease. |
| 22 | Opus | Medium | "Restore again" makes a second, suffixed profile | Accepted: OA-7. |
| 23 | Opus | Medium | Viewer names written into rows break `retryReplacedRows` | Accepted: names at render time. |
| 24 | Opus | Medium | `applyOne` near its line budget | Accepted: the race lives in `runWithWatchdog`. |
| 25 | Opus | Medium | Prefer the one-line PXE patch, `dest` only | Accepted (D7). |
| 26 | Codex | Low | "40 MiB" is code units, not bytes | Accepted: F14. |
| 27 | Codex | Low | Network gates kept two retries; tests must actually run | Accepted: `--retry=0` everywhere; "every named spec ran". |
| 28 | Opus | Low | Kind hint skips the chain check for local-kind networks | Accepted: dead-URL test. |
| 29 | Opus | Low | The e2e should read a status attribute, not a CSS class | Accepted: `data-status`. |
| 30 | Opus | Low | F2 overclaims; F3 holds on create only | Accepted: F2 and F3 restated; Outcome criterion 2 says "the wallet's own buffers". |
| 31 | Opus | Low | `endpoints.test.ts` is a smoke spec; `full-backup-restore.test.ts` does not exist | Accepted: paths fixed. |
| 32 | Opus | Low | Only the `{ type: "Buffer" }` encoder branch sees Buffers | Accepted: the pin says which branch it covers. |
| 33 | Opus | Low | The malformed-profile message must be named | Accepted, then superseded by F-1: no new message ships; OA-9 holds the choice. |
| 34 | Opus | Low | #207 is a keyboard change; mention it | Accepted: the PR says so. |
| 35 | Opus | Low | #230 removes the only UI path to a plain account file | Accepted: OA-8. |
| 36 | Opus | Low | Extend the existing journal tests instead of a new one | Accepted. |
| 37 | Codex | — | Competing outline, row by row | Agreed with the main plan on every row; see the outline above. |

None rejected.

### Round 2 (2026-10-09)

- **Codex (resumed session, gpt-6.1-sol, high): conditional approve**, with conditions: race-safe reminder and tombstone writes; isolate `inspectDek` failures from DEK-unseal failures; fix the seed-pass control; record #223's order change and #226's visible error change. It confirmed: the four round-1 blockers are resolved; every accepted full-backup restore reaches `validateAndMigrateBackup` (`useFullBackupImport.ts:569,602`), shared by popup and onboarding; replacing a non-generated password profile id changes no derivation; dropping the PXE early return reaches only `addCompleteAddress` and the final return; the `inspectDek` hook is not a layering problem.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| R2-1 | High | `inspectDek` inside the probe's unseal `catch` loses the wipe on a hook failure and misreports it as an unrecoverable DEK; rows-read-once undefined when the probe does not open | Accepted: narrow `catch`, callback in its own `try/finally` owning the DEK, failure aborts; no probe means rows read once, no count; tests for both (D15). |
| R2-2 | Medium | #223 changes export's statement order; "nothing can observe it" is false | Accepted: I1 and D2 record the order change as a deliberate reading of the clause. |
| R2-3 | Medium | #98 control passes without a seed pass (the token returns through the token slice) | Accepted: assert a destination `seeded` marker entry; verified `seedOne` writes `seeded` when the row is present (`token/seeder.ts:437-443`). |
| R2-4 | Medium | Tombstone fence checked outside `markDeletedByUser`'s lock | Accepted: `restoreDeletedMarkers` checks the fence inside the marker lock; test a deletion while it waits (D11). |
| R2-5 | Medium | Reminder trims serialized in-page only; Dismiss in another context or a deletion can be overwritten | Accepted: one Web Lock per profile for arm, renew, trim and clear; renew and trim never create; an orphan after a racing deletion is never shown and is removed by the reader (D12). |
| R2-6 | Medium | Backup network ids are not yet remapped when the profile is created | Accepted: arm right before `finalizeRestore` from the remapped set the tail will try (D12). |
| R2-7 | Medium | `revoke()` must also reject reads already awaiting storage; the abandoned `up()` can catch and continue | Accepted: re-check after the await; parked-read test; wording says later `ctx` calls reject. |
| R2-8 | Medium | #226's integrity mapping changes what a person reads | Accepted: the assertion keeps today's "Import failed" screen; OA-9 offers the integrity message (D5). Superseded by F-1. |

None rejected.

### Final fresh pass (2026-10-09)

- **Codex (fresh session, gpt-6.1-sol, high): reject**, with one blocking finding: OA-9's "what ships now" shipped an unapproved sentence ("backup profile is malformed"). It found no further material problem in D1-D4, D6-D11 or D13-D16, confirmed the PXE patch reaches only the address write and that the real address store refuses conflicting entries, and confirmed every other "what ships now" keeps today's behaviour or depends on a signed page-1 record. Every finding below was verified against the tree and fixed in the plan; no further Codex round ran (the brief asks for one final pass).

| # | Sev | Finding | Disposition |
|---|---|---|---|
| F-1 | High | OA-9 ships new copy while unanswered (D5 reasoning fails) | Accepted: arc 1 adds no composable check and no words; the types alone stop overstating; OA-9's "what ships now" is today's behaviour; the integrity message is the owner's option (D5). |
| F-2 | Medium | The malformed-profile test contract contradicts the entry gates (selection refuses a missing type, Restore stays disabled) | Accepted: verified `useFullBackupImport.ts:483,715`; the composable tests are gone with the check; OA-9 describes today's gates accurately. |
| F-3 | Medium | Reminder writes lack an incarnation fence: an earlier restore's delayed trim can edit a later restore's record for a reused id | Accepted: a per-run token in the record, compared inside the lock; test added (D12). |
| F-4 | Medium | The persisted reminder record is read without runtime validation | Accepted: a bounded decoder, malformed reads as absent, a far-future lease as expired; tests added. |
| F-5 | Medium | Closing before `finalizeRestore` runs no rollback; torn imports are reaped only after seven days | Accepted: verified `profile/service.ts:194,1632-1650`; claim corrected; the reader shows only finalized profiles. |
| F-6 | Medium | Arc gates omit `bun run audit:vue` (CLAUDE.md requires it before a UI PR) | Accepted: arcs 1, 2 and 3 gates run `audit:vue`; arc 1b already builds. |

None rejected.

### Arc 1 implementation review (2026-10-09)

- **Codex round 1 (gpt-6.1-sol, high, read-only; session 01a122d2-e279-78a3-9a87-a042b147ef6d): approve with fixes.** It probed the watchdog (rollback, one counted attempt, revoked reads and writes, no unhandled late rejection, no fake-timer conflict), the wipe paths, the hex decoder's legitimate inputs, the profile-id rule and the Enter states, and found no functional or security defect.
- **Opus 5.5 diff review (alongside round 1): approve, three Lows.**

| # | Source | Sev | Finding | Disposition |
|---|---|---|---|---|
| A1-1 | Codex | Low | Two new test comments narrate (`runTwice`'s body, `at`'s defaults) | Accepted: `at`'s removed, `runTwice`'s cut to its return contract. |
| A1-2 | Opus | Low | A timeout whose restore then fails reads "failed to restore … (migration error: … interrupted mid-write (restored cleanly))" on the recovery screen | Accepted: the watchdog throws `UpTimeoutError` ("interrupted mid-write"); the `failed` return maps it to the "(restored cleanly)" sentence only after the restore succeeded. No new words. Test added. |
| A1-3 | Opus | Low | The resolver's doc says Enter acts only on an enabled button, false for Decrypt; `BackupProfile`'s doc names selection as the type check | Accepted: both reworded (Decrypt refuses an empty password itself; "the entry gates"). |
| A1-4 | Opus | Low | The registry test now needs a seed per migration and the template does not say so; its comment cited step 6 for colocated tests (step 9) | Accepted: template step 5 names the `SEEDS` entry; reference fixed. |

None rejected.

## Delivery

One `gh stack`, base `dev`, one PR per arc, opened only after the arc's gates pass and its Codex loop converges.

| Layer | Branch | Phases | Stacks on | PR title (≤ 93 chars) | Closes | code_review |
|---|---|---|---|---|---|---|
| 1 | `worktree-backup-import-export` (adopted) | 1.1-1.5 | `dev` | `fix(backup): guard restore enter, strict hex decode, migration watchdog, one key unseal` | #146, #203, #207, #223, #226 | off |
| 2 | `backup-import-export-arc-1b` | 1b.1 | layer 1 | `fix(pxe): heal an account whose keys were stored without its address` | none (Refs #148; it stays open, blocked:external) | off |
| 3 | `backup-import-export-arc-2` | 2.1-2.4 | layer 2 | `feat(backup): slim the account-state slice, back up an edited local network` | #147, #191, #221 (or #221 by comment, if 2.3's proof fails) | off |
| 4 | `backup-import-export-arc-3` | 3.1-3.6 | layer 3 | `feat(backup): keep deleted tokens, keep restore outcomes, protect account files` | #98, #189, #192, #230, #231 | off |
| 5 | `backup-import-export-close-out` | close-out | layer 4 | `docs(plans): close backup-import-export` | — | off |

- Start: `gh stack init --adopt worktree-backup-import-export --base dev`. Each later layer: `gh stack add <branch>` after the previous arc's loop converges.
- Arcs 1 and 1b may be submitted and merged before page 1 is signed. The orchestrator merges in order (G2). Arcs 2 and 3 then stack on `dev` after `gh stack sync`; after a squash merge, merging `dev` into an old head is add/add (lessons.md), so restack with `gh stack sync`, never a merge.
- Open each PR without labels. Then add `e2e:extension-network` or `e2e:extension-smoke` only when the path filter would skip a suite the arc needs (adding a label at creation cancels the run).
- PR body: what changed and why, the validation run with outcomes, `Closes #n` per issue, screenshots for every UI change (arcs 2 and 3), and for arc 1b the draft upstream report.
- An issue whose fix is left out or did not hold gets a comment with the reason: #148 stays open after arc 1b; #221 closes as not planned per P1-05 if the proof fails.

### Issue to arc (for each issue's Pickup section)

| Issue | Arc | Closed by |
|---|---|---|
| #223, #203, #226, #146, #207 | 1 | layer 1's PR |
| #148 | 1b | not closed: layer 2's PR does the in-repo half; the issue stays open for the upstream report (SR5) |
| #147, #191, #221 | 2 | layer 3's PR (waits on page 1, P1-05) |
| #98, #189, #192, #230, #231 | 3 | layer 4's PR (waits on page 1 and OWNER-ASKS.md) |

## Post-implementation

This section is self-contained: the implementing session follows it from here.

### Per arc, at each arc boundary (before `gh stack add` opens the next layer)

1. Run the arc gate (above) and paste its result.
2. Codex audit: `env -u CODEX_ACCOUNT ~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` (on a quota or 401 error, retry once with `CODEX_ACCOUNT=alejo-icloud`; if that fails too, log the failed consult and continue on your own judgment within scope). The prompt carries: the arc's diff; this plan and its decision ledger; the arc map ("this is arc N of 4; later arcs build X on it", so seams reserved for later arcs are not flagged); the adversarial ask (what could go wrong, what would an attacker target, what are we trusting that we should not); and the two rules below, verbatim.
3. Triage each finding. Verify Codex's factual claims against the repo first; it can misread code. Apply the accepted fixes, commit, and log the round (consult and verdict) in `lessons/phase-N.md`.
4. Resume the same Codex session (`resume-codex.sh "" <followup> <codex-dir> high`) with the fix diff and ask for a re-review under the same rules. Repeat until a round yields no new material findings. Rejected nitpicks do not count. Still material after three rounds: stop and surface it to the orchestrator.

### After every arc is looped

5. Final cross-arc pass: a fresh Codex session over the net diff from the plan baseline, asking for seams between arcs, duplication across arcs and drift from this plan, with the two rules. Same loop, same three-round stop.

**The no-over-engineering rule** (verbatim in every post-implementation Codex prompt): *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*

**The comment-quality rule** (verbatim in every post-implementation Codex prompt): *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*

### Delivery

6. Per the Delivery section. Never open a PR, not even a draft, before its arc's loop converges. `gh stack submit --auto`, then `gh pr edit` each body. Then `gh pr checks --watch`.

### Close-out (the stack's docs-only top layer, after the arc PRs exist)

7. Before the close-out commit, merge `origin/dev` into the branch and read what changed in `implementations-plan/index.md` and `lessons.md`; never a union merge.
8. Write an `## Outcome` block directly after the front matter: date, status, what shipped with PR numbers, what was dropped or did not hold (a disposition line each), an `Open items:` line (#148 at least, plus any issue left open), and a line retiring the `/goal` and `/loop` seeds below.
9. Promote the generalizable gotchas into `implementations-plan/lessons.md`, one line each, linking the archived detail; keep it under 8 KiB, deduplicate, retire what a new entry supersedes, date tool-specific lines.
10. File every open item in its home:

| Situation | Home |
|---|---|
| Work inside the implementation you are on | this `plan.md` and the PR |
| Actionable work that outlives the plan | a GitHub issue with a domain label and a `Record` link to the archived plan |
| Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` |
| A suspected exploitable weakness | a private draft security advisory; the plan records only "tracked privately: GHSA-…" |
| Rejected, superseded or already done | a disposition line in the Outcome block |
| Knowledge that prevents a repeat | `implementations-plan/lessons.md` |
| A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |
| Accepted code work that blocks launch | the `v1.0.0` milestone, pointed at once from `BEFORE-LAUNCH.md` |

   Dedupe first (`gh issue list --state all --search "<words>"`); an issue body has `## What happens`, `## Where`, `## Impact`, `## Possible fix`, `## Record`.
11. Delete `STATUS.md`. Move `OWNER-ASKS.md`'s answers into the Outcome (or keep the file, which archives with the plan). `git mv implementations-plan/backup-import-export implementations-plan/archive/backup-import-export` in its own commit; repair the relative links the extra level breaks (`git grep -n 'backup-import-export'`); move the index line to `implementations-plan/archive/index.md`. Run `bun run check:plans`.
12. Report and wait. Merging is the orchestrator's call; the merge of the close-out completes the plan.

### Teardown after the merge

13. Once `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/backup-import-export/plan.md` succeeds, run `agent-worktree done backup-import-export --merged --trunk dev`, without asking (this session was started inside the worktree, so there is nothing to exit). It refuses rather than forces: relay a refusal and stop. A `/loop` session checks this on every firing; a `/goal` session arms one background wait after its wrap-up report: `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/backup-import-export/plan.md; do sleep 300; done`.

## Seeds

Recommended: `/goal`. Use exactly one per session; they do not compose. Both are drafts until the orchestrator approves the plan; arcs 2 and 3 start only with the signed page 1.

```
/goal Every phase of the arcs the orchestrator released is marked ✓ in implementations-plan/backup-import-export/plan.md, each backed by its validation gate reported passing in the transcript; for each phase the transcript prints LESSONS_FILE=implementations-plan/backup-import-export/lessons/phase-N.md; /code-review was NOT run (code_review is off); the Codex fix loop (env -u CODEX_ACCOUNT run-codex.sh … high read-only gpt-6.1-sol) converged for each released arc at its boundary and for the final cross-arc pass, each convergence a resumed Codex pass reporting no new material findings, quoted in the transcript; the Delivery section's stack exists on GitHub, created only after the loops converged (gh stack view in the transcript), including the close-out layer that archived the plan (git show --stat of the archive-move commit); bun run test and bun run lint both exit 0 in the transcript.
```

```
/loop 15m Drive implementations-plan/backup-import-export forward. Never idle. Each firing: (1) read plan.md, STATUS.md, OWNER-ASKS.md and lessons/ from the top stack layer; if the plan path is gone, check `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/backup-import-export/plan.md`: success means merged, so run `agent-worktree done backup-import-export --merged --trunk dev`, report, clear this loop and stop; failure means delivered, so babysit CI only. (2) Waiting on CI is fine; confirm it progresses. (3) No task in hand: take the next pending step of a released arc; arcs 2 and 3 need the signed page 1, and an open OWNER-ASKS item leaves its part as it is. Run lint and the touched tests after each edit; commit; gh stack push. (4) A decision you would bring to a person: consult Codex (env -u CODEX_ACCOUNT run-codex.sh … high read-only gpt-6.1-sol) and log it; anything a person would see goes to OWNER-ASKS.md and waits. Never merge, publish or widen scope. (5) Same step failed 5 times: reassess with Codex. (6) Phase green per its gate: mark ✓, print LESSONS_FILE=…, advance; at an arc boundary run the Codex loop before gh stack add. (7) All released phases ✓: final cross-arc pass, Delivery, close-out per plan.md, gh pr checks --watch, report and stop.
```
