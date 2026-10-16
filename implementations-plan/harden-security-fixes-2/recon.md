# Recon: harden-security-fixes-2

Read at `c5e9c8e8` (origin/dev). Three explorers (sonnet) plus direct reads. Paths are repo-relative.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| HKDF key from a passkey's PRF under a distinct label | `PasskeyCredential.deriveDekWrapKey` (`packages/wallet-crypto/src/passkey-credential.ts:110`): same extract, own expand label (`nulo:dek-wrap:v1`) | adapt: a sibling `deriveBackupMacKey()` (HMAC-SHA256, non-extractable) |
| A MAC helper | `computeEnvelopeMacV3`/`verifyEnvelopeMacV3` (`packages/wallet-crypto/src/entropy-mac.ts:42-102`): keyed on `master ‖ dek`, preimage fixed to the profile envelope | build new, small; only its HKDF→HMAC→`subtle.verify` shape carries over |
| One place where the export seals the body | `assembleFullBackup` (`apps/extension/src/utils/full-backup-helpers.ts:195-219`), shared by both profile types | adapt: an optional authenticator callback over the checksum |
| One place where the import checks the body | `validateAndMigrateBackup` (`apps/extension/src/composables/useFullBackupImport.ts:119-180`), shared; `INTEGRITY_REFUSAL` (`:95-99`) | adapt: strip and return the MAC; refuse a passkey body without one |
| Earliest point after the passkey prompt, before any write | `executeRestore` between `resolvePasskeyCredential` (`useFullBackupImport.ts:379`) and `restoreProfileStep` (`:389`); `credentialData` (with `prf`) is in hand | reuse as the verification point |
| Chain read of a token's name, symbol, decimals | `previewTokenMetadata` / `fetchTokenMetadata` (`apps/extension/src/wallet/services/token/service.ts:771-830`): needs the active profile, a node and the PXE; seeder bounds `metadataValid` (`seeder.ts:651-658`) | adapt: a profile-fenced method over the restored rows, run after `finalizeRestore` opens the session |
| Restored-token trust | `trustRestoredTokens` (`incoming-transfer/service.ts:787-806`), called at `useFullBackupImport.ts:423`; first-receipt prompt `IncomingTrustPopup.vue`; the add path's `onTokenAdded` also trusts (`:1307-1336`), so a re-read must update, not add | remove the call (owner's pick); the prompt is reused as is |
| A fee above a person-approved figure asks again | `QueuedFeeAnswers` (`execution/queued-fee-cap.ts:174-227`), the `queued` journal stage with `reask` (`packages/wallet-core/src/jobs/types.ts:60-90`, FSM back-edge `fsm.ts:24-27`), `getEstimatedFee` (`tx-fee-details.ts:31`), Send's loop `buildPass`/`askAgain` (`transfer-executor.ts:329-398`) | reuse the answers, the stage and the compare; adapt the loop for the dApp executor (its slot scaffold is `runInSlot`/`parkSlot`) |
| The figure the window showed | `estimateOperationFee` returns `maxFee` (`dapp-send-executor.ts:464`); no worker-side record survives to Confirm for `send_transaction`, embedded, app-capped, `fjwc` or lagging estimates (`:584-612`) | build new: the delta carries it, validated with `isFeeAmount` |
| Approval data into the executor | `OperationApprovalDelta` (`dapp-interaction/approval-delta.ts:12-19`), envelope built at `dapp-interaction/service.ts:342-345`; `send_transaction` gets no envelope (`execution/service.ts:908-914`) | adapt both |
| Accept RPC and Home surfaces | `acceptQueuedFee` (`execution/service.ts:713-720`); the popup's `RecentActivityView.vue:367,376,381,563`, `reask-review.ts:30`, `in-flight-send.ts:41`, `journal-state.ts:446-451`; all gated on `kind === "transfer"` | adapt to the surface the owner picks |
| Reopen a dApp window after Confirm | none: `focusInteractionWindow` needs the stored interaction, deleted at approve (`dapp-interaction/service.ts:206-238,434-446`); the popup closes itself (`popup/windows/execute/index.vue:540`). Searched `openAndAwait`, `handOver`, `DispatchHold` | build new, only if the owner picks a window surface |
| Grant arguments to fields | `encodeArguments(fn, content.args)` inside `computeCallMessageHash` (`execution/authwit-discoverer.ts:141-166`), function by name (`contract-resolver.ts:59-61`) | adapt: extract the resolve-and-encode step so display and signing share it |
| Fields to named rows | `decodeCallForDisplay` (`execution/call-decoder.ts:36-58`, fields only, `0x` hex), RPC `decodeCallsForDisplay` (`execution/service.ts:779-800`), `callSurface` (`popup/windows/execute/call-surface.ts`), `CallArguments.vue` (rows trimmed for the eye, `valueText(v, true)` prints whole; `AddressDisplay` has a `full` form but puts a known name first) | reuse; `CallArguments` gains a `full` print for the grant card |
| The window's error row | `DappApprovalFooter.vue:34-41` via `setError` (`composables/useDappApprovalWindow.ts:93-99`); `handleFeeUpdate` clears it (`index.vue:495`) | reuse the row; the refusal needs its own state so a fee change does not clear it |

## Facts the plan rests on

- **Backup paths share one pipeline.** One export page (`popup/pages/settings/security/export/full.vue`) and one import composable branch on `profile.type`; no flow is copied. Type-specific code: credential and key export (`full.vue:174-233`, about 60 passkey-only lines), the ceremony and secret building (`full-backup-restore.ts:191-259`), and the paired service methods `exportFullBackupKeys`/`exportPasskeyBackupKeys` (`account/service.ts:1026-1072`) and `restorePasswordProfile`/`restorePasskeyProfile` (`profile/service.ts:2241-2465`). The pairs reach different secrets; the repeated skeleton is the fence-and-reset preamble (about 6 lines each).
- **Why they differ** (`archive/security-ui-1/`, owner's answer D, 2026-10-08): a password profile's plain file holds the master secret, so only the encrypted file may leave; a passkey plain file holds no key that moves funds without the passkey. That call settled what a plain file may carry.
- **Second caller of the import gate**: `useRestoreAgain.ts:238` calls `validateAndMigrateBackup` and requires the checksum of the recorded restore (`:239`), so it inherits any rule added there.
- **Session timing**: the restored profile's session opens at `finalizeWithReminder` (`useFullBackupImport.ts:455-460`), before the account-state tail; the tail's deadline is created inside `runImportChainSync` (`importChainSync.ts:65`).
- **The dApp window**: `send_transaction` (a grant) renders its arguments as one text line in `OperationActionRow.vue:34`; `displayCallsOf` returns nothing for it (`display-calls.ts:33-39`). The `aztec_createAuthWit` card already renders a call through `CallArguments` (`OperationCard.vue:493-517`).
- **Fee compare in Send**: `BigInt(fee) <= BigInt(cap)` on the total for every payer (`transfer-executor.ts:366-367`); the exact-match rule for Private Fee Juice exists only in the reuse ladders (`fee/fee-cap.ts:59-68`).
- **Confirm without a figure**: the window enables Confirm before a wallet-chosen fee's estimate lands; only an app-set fee waits (`index.vue:174-176,718-727`).

## Collisions

- `execute-popup-readability` (#508, implementing): `OperationCard.vue` above `op_divider` for `aztec_sendTx` only, `CallArguments.vue` (shared `DetailsToggle`, `UnreadableArgsNotice`), `call-surface.ts`, `tx-enrichment.ts`, `identifier-sites.expected.json`, `type-roles-windows.test.ts`. Arc 3 builds on its merge.
- `send-fees-ux` (planned): `OperationCard.vue:287-297` (the app-fee row), `FeeSettingsCard.vue`, `send.vue`. Arc 2 touches neither file's logic; its surface may touch the fee block.
- Open issue #508 is the only open issue on these surfaces. Closed: #416 (known limit, the approved figure; its reopening condition is met by the owner's pick), #34, #17, #163 (backup history), #430.
