# Arc 2 lessons: harden-quality-fixes-2

## Base re-check (2026-10-16, `origin/dev` at `5e2888be`)

Arc 2 branches off `dev` after #598 (harden-security-fixes-2 arc 1), #610 (small-ui-fixes-1), #595 (harden-quality-fixes-1) and #604 (arc 1). Recon's facts hold at this base; the line moves (paths under `apps/extension/src/`):

- Confirm sites: still 15 (13 in 10 SFCs, 2 composables). `export/full.vue:449` is now `:451` (open `:463`). `useProfileImportFlow.ts` no longer captures the slot: #610 fixed #567 with a whole-object request at `:140`, typed by a local `DuplicateConfirmRequest` (`:96`); its watcher starts after the assignment and before `open`, which `requestConfirm` keeps by starting the watcher first.
- `ConfirmPopup.vue`: callback `:36`, reset on close `:45`, header comment `:12-19`: as recon.
- Handshake: `EditContactPopup.vue` reads `cacheStore.importContact` at `:117` (dirty gate), `:121` (save branch) and `:162` (on show), not `:137`/`:140`. `ImportContactsPopup.vue`: `stageRow` strip `:93`, `handleEditContact` `:108`, watcher `:124`, clear on hide `:140`. Not in the plan: `popup/components/modules/settings/contacts/useContactImportExport.composition.test.ts:249` also drives the edit by writing `cacheStore.importContact`; it is re-pointed to the payload with the two suites the plan names.
- Backup selection: `full-backup-helpers.ts:37-42` (`BackupSelection`), `:110-118` (`openEncryptedBackup`) as recon. `useFullBackupImport.ts`: the plain-name cast is `:559`, the `as string` cast `:583`, the validator cast `:629`, `isAllowedToImportBackup` `:802-806`. `useRestoreAgain.ts`: `as string` `:172`, validator cast `:239`, `profileType` readers `:234`, `:362`. `ImportFullBackupForm.vue` lives in `components/composite/import/` (`:113`, `:133` as recon); `import.vue:292` and `full-backup-ctas.ts:17-22` as recon.
- `import-helpers.ts` reads no `type`: it calls the CTA predicates, so it needs no edit.
- Fences: `export/full.vue:75` and `export/account.vue:59` (`let generation`); bumps only in `discardRun` (`full.vue:476`), `resetFlow` (`account.vue:62`) and `account.vue`'s unmount (`:213`).

## I2 pins (before any phase 2.2 edit)

- `useFullBackupImport.test.ts`, "a second Decrypt on an opened backup", both driven through `pickBackupFile` so the real producer builds the selection: an opened body with no profile type keeps Decrypt offered and a second Decrypt shows "Decryption Failed"; a file sealed twice opens its inner backup on the second Decrypt. Both pass at `5e2888be`: I2 holds.

## Phase 2.1 (#543)

- The store slot's read type unwraps `toggle.model` (Pinia types a setup store's state through `UnwrapRef`), so `useConfirm`'s one write casts the request to `UnwrapRef<ConfirmRequest>`: the runtime stores the caller's ref and the reactive read unwraps it, which `useConfirm.test.ts`'s toggle case proves (the switch writes the caller's ref).
- `useDuplicateConfirm` now starts its close watcher before `requestConfirm` instead of between the slot write and `open`; the watcher reads only `popupStore.isOpened("confirm")`, which the slot write does not change, so nothing it observes moved.
- `EditContactPopup.handleUpdateContact` reads the payload twice, at the dirty gate and at the branch, both before its first await, as it read `cacheStore.importContact` twice.
- Its "Enter with a clean form is a no-op" case dispatches Enter on the detached tree, which never reaches the document-level listener, so it passes whatever the gate does. The new import-mode bug pin dispatches from a document input, as the re-entrancy pin does, and so is the success control for the keyboard path; the old case is left as it is (out of scope).
- Generated globals: `useConfirm` and the type `ConfirmRequest` in `auto-imports.d.ts`; `.eslintrc-auto-import.json` gains both names (the plan named only `useConfirm`).
- Proofs, not committed (each reverted): `requestConfirm` merging with `Object.assign` fails the replace and open-dialog cases; the slot as `reactive` fails the `pinia.state` case; one site reverted by hand to a field write and an `open('confirm')` makes the ban list both `file:line`s.
