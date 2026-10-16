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
- Its "Enter with a clean form is a no-op" case dispatched Enter on the detached tree, which never reaches the document-level listener, so it passed whatever the gate did. It now dispatches from a document input, as the re-entrancy pin does (removing the gate fails it), and the import-mode bug pin is its success control.
- Generated globals: `useConfirm` and the type `ConfirmRequest` in `auto-imports.d.ts`; `.eslintrc-auto-import.json` gains both names (the plan named only `useConfirm`).
- Proofs, not committed (each reverted): `requestConfirm` merging with `Object.assign` fails the replace and open-dialog cases; the slot as `reactive` fails the `pinia.state` case; one site reverted by hand to a field write and an `open('confirm')` makes the ban list both `file:line`s.

## Phase 2.2 (#541)

- `showsDecryptCta` first read `selectedBackup` once into a local; the popup and onboarding import suites pin which CTA-source properties each render reads (the `readonly()` view in `full-backup-ctas.ts`), and six cases failed on the missing second read. It now reads `kind`, then `profileType` only for an encrypted pick, which is today's read sequence (`type`, then `profileType`).
- `openSelection` refuses a target whose `backup` is not text with its own throw, before `openFullBackupText`; today the same targets rejected with a `TypeError` from `text.trim`, also before any key derivation, and both callers map either to "Decryption Failed". The helper tests pin that no KDF runs.
- `useFullBackupImport` gains `embeddedBackupName(backup)`, the one display read of the embedded profile name, used by the plain pick and the decrypt (the decrypt's typed `backupObject` is gone, so it would otherwise need a second copy of the plain path's cast).
- `import-helpers.ts` needs no edit (it reads the CTA predicates). Test fixtures move from `type` to `kind` by rule: an `encrypted` fixture with a profile type is `opened`, without one `sealed`.
- Proof, not committed: `git diff -U0` of `export/full.vue` and `export/account.vue` shows only fence substitutions (`let generation` to `runs`, `const gen = generation` to `runs.snapshot()`, each comparison to `isCurrent()`, each bump to `runs.invalidate()`, `() => gen === generation` to `isCurrent`), the import and two comments; no `await` line added or moved.

## Phase 2.3 and review round 1

- Smoke (Chrome, retry 0): `contacts`, `contacts-import`, `duplicate-phrase-import`, `passkey-backup`, `backup-imported-account`, `backup-roundtrip`, `restore-outcome`, `wallet-lock`: 8 files, 24/24 (316 s). The load watcher saw load1 < 150 and the run launched seconds later at 154; later runs check the load in the launching command itself.
- Round 1: Codex (session `01a146da`) 3 low, the Opus lens 2 low; dispositions in the plan's Audit verdicts. Two of the five were tests that passed vacuously (the copied request, the decrypt publication race), each now proven by a mutant: storing the caller's object, and removing the caller's fence, each fail.
- A mutant edit of source while `e2e:agent` builds would ship in its bundle: the network run's `dist/chrome/manifest.json` was written at 22:43:14, before the one mutant at 22:44:55, so that run is clean; no mutant runs while an e2e build may.
