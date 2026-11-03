# quality-profile-1: recon

Base: `origin/dev` at `846030f16`. Two read-only explorers (sonnet), one per issue, then the parent's own read of both files. Line numbers are at the base.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Open a row's slots under an unlock | `ProfileService.openSlots` (`profile/service.ts:416`), with `openPasswordSlots` (424), `openUnderPasshash` (447), `openPasskeyRowSlots` (469); `OpenedSlots` type (127) | reuse as is, moved into the codec |
| Refuse a key that did not open | `notOpened(key, passwordRefusal)` (`service.ts:503`) | reuse as is, moved |
| Seal slots and the DEK slot | `sealUnder` (2064), `sealSlotsUnder` (2075), `sealDekWithPasshash` (2319), `unsealDekWithPasshash` (2327) | reuse as is, moved |
| Pairing and MAC checks over opened material | `assertEntropyMasterPair` (2283), `envelopeMacValid` (2301) | reuse as is, moved |
| The words-to-master pairing in a restore | `decodeRestoreMaterial` inline (`restore-material.ts:34-41`) | adapt: share one `entropyDerivesMaster` |
| Collaborator held as a field | `RowKeyring` (`row-keyring.ts:12`, `service.ts:278`), `ExpiringStash` (`expiring-stash.ts:12`, `service.ts:220`), `SessionManager` (`service.ts:199,323`) | the precedent shape for the codec |
| Row fence and re-check | `captureRowFence` (524), `profileFenceBroken` (540), `rowUnchangedHoldingLock` (545), `snapshotForUnlock` (556) | reuse as is |
| Live-row gate (row present, id not reserved) | six inline copies: `captureRowFence` 526-529, `snapshotForUnlock` 558-564, `unlockProfile` 849-857, `revalidatePasskeyRowHoldingLock` 998-1003, `deleteProfile` 1817-1820, `finalizeRestoreHoldingLock` 2592-2601 | build new: one private helper |
| The refusal text a client matches | literal `"Invalid profile id"` at 26 `new Error` sites in `service.ts`; matched by `isInvalidProfileIdError` (`client.ts:17-19`); `client.ts` re-exports `spec.ts` | build new: one constant in `spec.ts` |
| Unlock fields of a row | `PasswordUnlock`, `PasskeyUnlock` picks (`profile-row.ts:29-30`); `sameStoredRow` (`profile-row.ts:168`, every key) | adapt: `sameUnlockFields` beside the picks |
| Profile incarnation state (PXE) | `profileLifecycles` (`pxe/service.ts:175`), `storeKeys` (158), `ProfileLifecycle` (69-75); precedent `PxeLifecycleCoordinator` (`pxe/lifecycle-coordinator.ts`, held at `service.ts:150`) | see plan D9 |
| Log level routing for the public-event helpers | two copies of one lambda (`pxe/service.ts:661-663`, `684-686`) | build new: one private method |

Absence trails: a `withOpenedSlots`, `openForReveal`, `verifyCredential`, `ProfileSecretCodec`, `INVALID_PROFILE_ID`, `sameUnlockFields`, `entropyDerivesMaster` or `ProfileIncarnations` exists nowhere (`grep -rn` over `apps/` and `packages/`, names and close variants). `scripts/complexity-baseline/manifest.json` has no entry for either file, and neither file has a `biome-ignore`.

## ProfileService (#1439)

- The class runs from line 162 to 2663 (2,502 lines); 28 `…HoldingLock` methods; one non-reentrant `Lock`, taken only through `runExclusive` (344), which `SessionManager` also receives.
- `openSlots` consumers and their frame:

| Site | Fence first | Refusal | Re-check | Lock |
|---|---|---|---|---|
| `unlockProfile` 831 | `snapshotForUnlock` | `InvalidPasswordError` | inline, locked, 3 fields | open unlocked |
| `unlockPasskeyProfile` 973 | `snapshotForUnlock` | `PasskeyNotOpenedError` | `revalidatePasskeyRowHoldingLock`, 6 fields | open unlocked |
| `changeProfilePassword` 1303 | inside its lock | `"Invalid profile old password"` | none (all locked) | whole body locked |
| `verifyUnlockCredential` 1355 | `captureRowFence` | `notOpened(InvalidPasswordError)` | `rowUnchangedHoldingLock`, locked, after pairing | open unlocked |
| `verifyExportCredential` 1372 | same | same | same | same |
| `changeUnlockMethod` 1409 | `captureRowFence` | `notOpened(InvalidPasswordError)` | in the locked commit | open unlocked |
| `exportPlain` 2115 | `captureRowFence`, outside the flattening `try` | `notOpened(InvalidPasswordError)` | `profileFenceBroken`, unlocked, before pairing | none |
| `openBackupTransfer` 2165 | same | same | same; then `openDek`; DEK handed out | none |
| `exportImportedKeysDek` 2208 | same | same | same; no pairing | none |
| `exportMnemonic` 2245 | same | `notOpened(Error("Invalid profile old password"))` | locked, after `getMnemonic` and pairing | fence locked |
| `finalizeOpenHoldingLock` 2645 | caller's locked read | `notOpened(InvalidPasswordError)` | none (all locked) | whole path locked |
| `assertReplacementOpens` 1483 | n/a | none: `null` is a result there | n/a | caller's lock |

- Every site but `assertReplacementOpens` opens, refuses on `null` with its own refusal (all expressible as `notOpened(key, passwordRefusal)`), runs a body and wipes in a `finally` that covers that body.
- `verifyUnlockCredential` and `verifyExportCredential` differ only in the locked `zeroize(await this.trustedDekForRekeyHoldingLock(...))` (1361). Pins: `service.passkey-unlock.test.ts:634-655` (unlock refuses a bad DEK slot or MAC), `:700-714` (export passes them).
- `this.secretBox` (198, built 322) is read at 451, 789 (`createProfile`), 1183 (`unsealResealedVerifiedHoldingLock`), 1316 (`changeProfilePassword`), 2082 (`sealSlotsUnder`). `PasswordSecretBox` holds no state.
- The codec methods read no instance state but `secretBox`: `openSlots`, `openPasswordSlots`, `openUnderPasshash`, `openPasskeyRowSlots`, `sealUnder`, `sealSlotsUnder`, `sealDekWithPasshash`, `unsealDekWithPasshash`, `assertEntropyMasterPair`, `envelopeMacValid`; plus the module function `unlocksWith` (137) and the types `SlotKey`, `RowSeal`, `SealedUnder`, `OpenedSlots` (110-133). `slotKey` and `newRowSeal` read `passkeyCoordinator`.
- Test reach-ins that name a codec member: `service.passkey-unlock.test.ts:61,488` (`secretBox`, spied `sealWithPasshash`), `:480-488` (`sealDekWithPasshash` on the service), `:526` (`envelopeMacValid` on the service), `service.integration.test.ts:4740-4744` (`openSlots` on the service), `profile-chaos-scenarios.composition.test.ts:626` (`replace(r.profiles, "openSlots", …)`). Others name facade members that stay (`lock`, `sessionManager`, `repo`, `pendingDekRewraps`, `precheckBeforeRekeyHoldingLock`, `trustedDekForRekeyHoldingLock`, `fillRowKeysHoldingLock`).
- Coverage of the frame: `service.open-slots.test.ts` pins each password path's refusal (`PATHS`, 76), the pairing refusal on every paired path (160), and that the passhash, master and entropy are zero after each path returns, wrong or right password (199-229). No test pins the wipe when a body throws after the slots opened.
- `"Invalid profile id"`: 26 `new Error` sites in `service.ts`, one string match in `client.ts:18`; tests match `/Invalid profile id/`.
- Precedent: the closed `profile-service-dedup` plan kept every helper a private method because "helpers reach into the repository, the deletion state and the session manager" and left "the unlock staleness checks … where each secret is zeroized, export error identities" un-unified on purpose. The codec reaches none of those.
- Neighbour: quality-sdk-1 arc 2 converts the timer race in `awaitDeletionDelegate` (`service.ts:1558-1572`); no other open lane names this file.

## PxeService (#1446)

- `packages/aztec-runtime/src/pxe/service.ts`, 1,059 lines. `profileLifecycles: Map<string, ProfileLifecycle>` (175), `storeKeys` (158).
- Lifecycle: `clearProfileState` 738-770 (join, mismatch refusal, dead return, synchronous `deleting` mark, `stopRetries`, erase start, `clearing` publish), `newLifecycle` 772, `eraseProfile` 778-810 (profile barrier write, still-deleting check, `registry.disposeProfile`, chain-guard sweep, key drop, `removeProfileStoreDirs`, barrier-map delete, record to dead), `provisionChainStoreKey` 821-861 (one synchronous check-and-install), `assertGenerationCurrent` 882-897 (reads the record and `network.{profileId,pxeGeneration}` only).
- Readers: `sweepOrphanStores` 271 (`has`, inside an inline barrier loop that must stay inline), `withPxeRead` 930, 943, 955, `withPxeWrite` 1007, 1013.
- Timing invariants a move must keep: the `deleting` mark and the erase start run before any await; provision's check and install run with no await; the sweep loop stays inline.
- Tests that cast into the maps: `service.test.ts:254-259,323-381` (record shapes with `toEqual`, `profileBarriers`), `incarnation-fence.test.ts:302-310` (writes a record inside a `peekMatching` stub), `store-key-decode.test.ts:31-34,68-125` (decode before the lifecycle check).
- `stopRetries` is a synchronous counter (`chain-runtime.ts:393`).
- The package's tests run in `bun run test:all` (`@nulo/aztec-runtime`, `bun --bun vitest run`); root `test` runs the extension only.

## Duplication baseline (`bun run audit:dup` at the base)

Production 183 clones / 8,841 lines; whole tree 1,549 clones / 21,309 lines (3.36 %). `extension/src/wallet/services/profile/service.ts (internal)`: 4 clones, 46 lines.
