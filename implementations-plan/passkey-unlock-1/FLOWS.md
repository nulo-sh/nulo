# Flows: passkey-unlock-1

Every flow this change touches, as a numbered screen sequence. Each screen is marked **today** (unchanged), **changed** or **new**, with the ask that decides it ([OWNER-ASKS.md](OWNER-ASKS.md)). Where an ask has options, the sequence follows the recommended option and names the step the other options change. "Passkey card" is the in-page passkey dialog (`PasskeyCeremonyDialog`) with its existing states (waiting, cancelled "Nothing changed.", confirmed). On Firefox's toolbar panel, which closes when the browser's passkey prompt opens, the unlock and create steps run in the passkey window (`/popup/windows/passkey`) as today, and a settings page that asks the passkey opens in its own window first, as full backup does today. Paths are relative to `apps/extension/src/`.

## F1. Create with a passkey (onboarding)

1. `/onboarding/welcome` · today · "Create profile".
2. `/onboarding/terms` · today (wording of the risk point: OA-11).
3. `/onboarding/create`, Passkey tab · today · "Create with passkey". Under OA-5 C the link "Use a passkey I already have" shows under the button · changed (OA-5, A3).
4. Passkey card, tag "New profile" · today. The passkey is named per OA-5.
5. Phrase stage "Your recovery / Phrase" · **new for passkey** (OA-1 A/B). OA-1 C skips it.
6. `/onboarding/done` · today.
7. Home `/popup/general` with Get started · changed (OA-4).

Cancelled at step 4: the Passkey tab stays, nothing is created · today. A passkey saved but not confirmed: the card's "Your passkey was saved but not confirmed. Try again to finish." and a second prompt · today.

**Popup variant** (`/popup/profile/new`): name, method tabs, "Create with Passkey" (OA-5 link as in step 3), passkey card, Home. No phrase stage, as today for both methods.

## F2. Create with a password

1. to 3. as F1, Password tab · today.
4. Phrase stage · today.
5. `/onboarding/done` · today.
6. Home · today.

## F3. Get started (Home)

1. Home card · changed (OA-4). Under OA-4 A a passkey profile lists "Save your recovery phrase", then "How Aztec works", "Get Fee Juice", "Make proofs faster"; a later profile lists only the phrase step.
2. "Save your recovery phrase" → `/popup/settings/security/export/seed` · changed for passkey (OA-3b).
3. After Hide, funded and phrase not saved: banner "Your funds have no backup" · **new for passkey** (OA-4 A).

## F4. Import a recovery phrase, then choose the unlock method

1. `/onboarding/import` or `/popup/import` · changed: the "Passkey" row goes (OA-2; B keeps a notice row). A2.
2. "Recovery Phrase" form · changed: "How you'll unlock Nulo" tabs (OA-2 A; C selects Password first). A3; until then the form keeps "New Password" only.
3. Passkey tab: passkey card, tag "Import" · new on this path (OA-2; OA-5 C adds the reuse link). Cancelled: the form stays filled.
4. Done (onboarding) or Home with the toast "Profile imported" (popup) · today.

## F5. Restore a full backup

1. Import picker → "Full Backup" · today.
2. Choose the file; "Decryption Password" · today (a passkey profile's new backups always need it, OA-3d).
3. A backup from an old passkey profile: the file's error box "Backup from an earlier version", controls "choose another file" and "Back to methods" · **new** (OA-7). The flow stops here.
4. "How you'll unlock Nulo" tabs in place of "New Password" · changed (OA-2 A, A3). Until A3 every backup restores with a new password.
5. Passkey tab: passkey card, tag "Restore" · today's tag, new choice.
6. Import progress, Retry, Continue, View errors · today.
7. Done or Home · today.

## F6. Unlock

1. `/popup/auth`, passkey profile: "Passkey required" / "Use your passkey to continue", "Continue" · today.
2. Passkey card, tag "Unlock" · today. Cancelled or the wrong passkey: "Couldn't unlock. Try again." · today.
3. Home · today.
4. After the browser stops and restarts the wallet's background: a passkey profile asks again (OA-10 A); under OA-10 B only with Strict security mode on. After a browser restart every profile asks again · today.

## F7. Lock

1. Header lock, or Settings → Lock → "Lock now" · today.
2. `/popup/settings/lock`: Strict security mode toggle hidden for passkey profiles · today (OA-10 B shows it, reworded, A3).

## F8. A lost or deleted passkey

1. `/popup/auth`: the passkey prompt fails · today ("Couldn't unlock. Try again.").
2. "Delete profile" link, tooltip · changed for passkey (OA-12).
3. "Lost your passkey?" popup · changed for passkey (OA-12) · "Delete profile".
4. `/popup/settings/security/reset` · today (its footer "You will be able to recover the accounts derived from your recovery phrase later if you have saved it" becomes true for passkey profiles).
5. F4 with the recovery phrase, or F5 with a full backup, choosing a password or a new passkey · changed (OA-2).

A passkey deleted from the password manager behaves the same: the browser offers no passkey, step 1.

## F9. Export from a passkey profile

1. `/popup/settings/security/export` · changed: three rows (OA-3a; the "Account" row from A3).
2. Recovery Phrase (`.../export/seed`, own window on Firefox's panel): agreement · today; "Reveal with passkey" · new (OA-3b); passkey card, tag "Recovery phrase" · new tag; the words, "Keep in mind", countdown · today. Cancelled: the button stays.
3. Account (`.../export/account`, own window on Firefox's panel, A3): choose account · today; agreement · today; "Confirm with passkey" · new; "File password" with the 8-character hints · new; "Save account file" (OA-3c). Account list export icon for passkey profiles · changed (OA-3c).
4. Full Backup (`.../export/full`, own window on Firefox's panel as today): agreement · today; passkey card, tag "Backup" · today; "Backup is ready" with a mandatory file password and its hints · changed (OA-3d); "Protect with Password" then "Download Backup" · today's buttons, the plain download gone.

## F10. Add or change the unlock method (only under OA-6 B or C, A3)

1. Settings → Safety → "Unlock method" · new (OA-6).
2. `/popup/settings/security/unlock-method` (own window on Firefox's panel) · new: the current method and its actions.
3. Password → passkey: "Enter password" ("Wrong password" when it does not open), then passkey card, tag "Unlock method" · new; toast "Now unlocks with your passkey".
4. Passkey → new passkey: passkey card (current), passkey card (new) · new; toast.
5. Passkey → password: passkey card, then "New Password" / "Repeat password" with today's hints / "Save" · new; toast.
6. Any step cancelled: nothing changed, the page stays. A failure before the change is saved: the error toast "Couldn't change the unlock method. Try again." A saved change the wallet can't reopen: the toast "Unlock method changed. Unlock Nulo again to continue." and the lock screen · new.

## F11. A second profile on the same passkey (OA-5 C, A3)

1. Settings → profile pill → "New profile", or the lock screen's profile picker · today.
2. `/popup/profile/new`, Passkey tab · changed: the link "Use a passkey I already have".
3. Passkey card: the device offers the existing "Nulo wallet" passkey · new behaviour. No Nulo passkey on the device: the browser says so, the card shows its cancelled state, "Create with Passkey" still works.
4. Home · today. Both profiles keep separate recovery phrases and locks.

Under OA-5 A or B a second profile always creates a new passkey, as today.

## F12. Update from v0.31.0

**With a passkey profile:**
1. The store updates the extension; the storage update screen ("UPDATING") if a migration runs · today.
2. `/popup/auth` with the old passkey profile selected · **new** "Set up again" state in place of the passkey prompt (OA-7 A).
3. "Delete profile" → `/popup/settings/security/reset` · changed: footer "This profile has no recovery phrase. Deleting it can't be undone." (OA-7 A).
4. F1 or F4 to make a new profile · changed as above.

**With a password profile:**
1. The update · today.
2. `/popup/auth` "Password required" · today (OA-7 password A). Under OA-7 password B, the "Set up again" state.
3. Home · today, plus the Get started rows it already had.

## F13. Reinstall

1. Install opens onboarding · today.
2. `/onboarding/import` · changed: no "Passkey" row (OA-2).
3. F4 (phrase) or F5 (backup), choosing a password or a passkey · changed (OA-2, OA-5).

## F14. Restore again with an old passkey backup

1. Settings → Restore again (`/popup/restore-again`, own window) · today.
2. Pick the file; its "Decryption Password" if it has one · today.
3. The refusal "Backup from an earlier version" in the file's error box; the back arrow returns to Home · **new** (OA-7). Nothing is written.

## F15. An app asks while an old passkey profile is selected

1. The app's request opens the wallet popup on `/popup/auth` · today.
2. The "Set up again" state · **new** (OA-7 A). The request stays pending until the person chooses another profile or the app gives up · today's behaviour for a locked wallet.

## F16. Deleting the last old passkey profile

1. F12 steps 2 and 3 · new.
2. "Profile deleted" toast, then `/popup/register` (create or import a profile) · today's behaviour when no profile is left.

## Screen inventory

| Route | File | Today | Proposed | Ask |
|---|---|---|---|---|
| `/onboarding/create` | `onboarding/pages/create.vue`, `components/composite/AuthMethodTabs.vue` | passkey create goes to Done | phrase stage for passkey; OA-5 link | OA-1, OA-5 |
| phrase stage | `onboarding/components/OnboardingPhraseStep.vue`, `onboarding/steps.ts` | password only | passkey too, own body sentence | OA-1 |
| `/onboarding/import` | `onboarding/pages/import.vue`, `components/composite/import/ImportMethodPicker.vue`, `ImportSecretForm.vue`, `ImportFullBackupForm.vue` | three rows; phrase makes a password profile | two rows; unlock choice after phrase or file | OA-2 |
| `/onboarding/terms` | `onboarding/pages/terms.vue`, `packages/legal/src/manifest.ts` | risk point names passkey wallets | reworded risk point | OA-11 |
| `/popup/profile/new` | `popup/pages/profile/new.vue`, `popup/components/modules/settings/new-profile/NewProfileMethodTabs.vue` | one passkey per profile | OA-5 link | OA-5 |
| `/popup/import` | `popup/pages/import.vue` + the import components above | as onboarding | as onboarding | OA-2 |
| `/popup/auth` | `popup/pages/auth.vue`, `popup/components/popups/ForgotPasswordPopup.vue` | passkey unlock; password-worded delete help | "Set up again" state; passkey-worded help | OA-7, OA-12 |
| profile picker | `popup/components/popups/SelectProfilePopup.vue` | names only | names only; an old passkey profile opens "Set up again" | OA-7 |
| Home card | `popup/components/modules/general/GetStartedCard.vue`, `BackupReminderBanner.vue`, `utils/get-started.ts` | backup row for passkey | phrase row and banner for passkey | OA-4 |
| `/popup/settings` | `popup/pages/settings/index.vue`, `utils/settings-search.ts` | "Change password" for password only | "Unlock method" row | OA-6 |
| `/popup/settings/lock` | `popup/pages/settings/lock.vue` | strict toggle hidden for passkey | shown, reworded | OA-10 |
| `/popup/settings/accounts` | `popup/pages/settings/accounts/index.vue` | export icon hidden for passkey | shown | OA-3c |
| `/popup/settings/security/export` | `.../export/index.vue` | passkey: one row and a sync sentence | three rows | OA-3a |
| `.../export/seed` | `.../export/seed.vue`, `SecretUnlockSection` | password gate | passkey reveal; own window on Firefox's panel | OA-3b |
| `.../export/account` | `.../export/account.vue` | passkey bounced | passkey confirm + file password; own window on Firefox's panel | OA-3c |
| `.../export/full` | `.../export/full.vue`, `composables/useFullBackupExport.ts` | optional file password, any length | mandatory file password, 8 characters | OA-3d |
| `/popup/settings/security/unlock-method` | new | none | new page; own window on Firefox's panel | OA-6 |
| `/popup/settings/security/reset` | `.../security/reset.vue` | footer untrue for passkey | unchanged, now true; old passkey profile: its own footer | OA-7 |
| `/popup/restore-again` | `popup/pages/restore-again.vue`, `composables/useRestoreAgain.ts` | old passkey backup restores | refused | OA-7 |
| passkey card | `components/passkey/PasskeyCeremonyDialog.vue`, `utils/passkey-copy.ts` | tags Unlock, New profile, Import, Backup, Restore | adds "Recovery phrase", "Account file", "Unlock method" | OA-3, OA-6 |
| passkey window (Firefox) | `popup/windows/passkey/index.vue` | create, unlock, import (discovery) | create, unlock; "already in use" goes | OA-12 |
| update screen | `components/MigrationBarrier.vue` | names passkey profiles as unrecoverable | reworded | OA-12 |
| backup refusals | `composables/useFullBackupImport.ts`, `ImportFullBackupForm.vue` | old passkey-backup message | "Backup from an earlier version" | OA-7 |
