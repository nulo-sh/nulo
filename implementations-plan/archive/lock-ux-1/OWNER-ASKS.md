# Owner asks: lock-ux-1

Five asks, one per issue. Each was built as an uncommitted mock in the real extension and pictured in both themes; the picture ids below are the entries of the lane's shots manifest (popup at 360×600, the onboarding tab at 720×900). **What ships now** for every ask: nothing; today's behaviour stays until the pick is quoted, and each arc ships on its own pick.

## OA-1 (#1158): saving auto-lock as 0, "never lock"

- **Surface**: Settings › Lock › Auto-lock Timeout (`apps/extension/src/popup/pages/settings/lock.vue`).
- **Today** (`1158-today`): `0` saves 300 ms after the keystroke with the toast "Auto-lock timeout updated"; only an info icon appears, whose tooltip reads "'0' means the wallet will never be locked automatically". Emptying the field also turns it into `0` and saves "never".
- **A** (`1158-A`): a confirm before `0` is saved. Title "Never lock automatically?"; text "Nulo will stay unlocked until you lock it yourself. Anyone who can use this browser can use your wallet meanwhile."; buttons "Cancel" and "Never lock". Cancel, Escape or a tap outside puts the field back to the saved minutes. It also asks when the field is emptied and left at `0` for 300 ms.
- **B** (`1158-B`): no confirm; `0` saves as today and a line shows under the field while it reads `0`: "Nulo never locks on its own. Lock it yourself when you step away."
- **Recommendation**: A. The likeliest way to `0` is an emptied field, which B saves silently; A catches it at the one moment it matters, and the strict-mode switch on the same page already asks before lowering security.

## OA-2 (#1192): a 5-minute close on the onboarding phrase step

- **Surface**: the onboarding Create tab's recovery-phrase step (`apps/extension/src/onboarding/components/OnboardingPhraseStep.vue`). Owner, 2026-10-26: a 1.2.0 change.
- **Today** (`1192-today`): the words stay until "I saved it", "Do it later", a lock or the session's end.
- **A** (`1192-A`): the Settings reveal's countdown on the step's exit. "Do it later · 4:59" counts down from 5:00; under it, "Disable auto-close", the Settings reveal's own words and look. At zero the step leaves for Ready as "Do it later" does, and Home keeps its back-up reminder.
- **B** (`1192-B`): a line above the buttons, "For your safety, the words hide in 4:59.", with a "Keep them open" link. Same five minutes, same end.
- **C**: no timer; record that the lock bound is enough (the issue's other "done when").
- **Recommendation**: A. The phrase gets one rule in both places it shows, and "Disable auto-close" serves the slow writer the owner worried about. C is defensible if the owner prefers no time pressure on a first run: the words already go at the auto-lock.

## OA-3 (#1207): an account file once saved

- **Surface**: Settings › Back up profile › Account, after the file is made (`apps/extension/src/popup/pages/settings/security/export/account.vue`).
- **Today** (`1207-today`, a passkey profile right after "Save account file"): the file is already in the downloads, yet the banner reads "Account file is protected" and the button "Download File" saves a second copy.
- **A** (`1207-A`): as Full Backup does after its download, the banner reads "Saved to your downloads" and the button becomes "Close". It applies after any download that succeeds, so the password path's "Download File" press reaches it too; a failed download keeps "Download File".
- **B** (`1207-B`): the banner reads "Saved to your downloads" and the button becomes an outlined "Download again".
- **Cost to know**: "Saved" means the browser accepted the download, which is all the wallet can see; a download the browser later cancels or fails still reads "Saved", and A leaves no button to try again: the person makes a new file. Full Backup has the same limit today. For an imported account this file is its only backup.
- **Recommendation**: A. Both backup files then end the same way, and a second copy of a spend-capable file has no use: the person can make a new one any time.

## OA-4 (#1208): the duplicate-phrase confirm with several profiles

- **Surface**: the "You already have this wallet" confirm on a recovery-phrase or full-backup import (`apps/extension/src/composables/useProfileImportFlow.ts`).
- **Today** (`1208-today`, "Main" and "Savings" both on the phrase): "“Savings” already uses this recovery phrase. Both profiles will hold the same accounts and funds. Add it anyway?"
- **A** (`1208-A`): every profile, A to Z: "“Main” and “Savings” already use this recovery phrase. All of these profiles will hold the same accounts and funds. Add it anyway?" Three or more read "“Main”, “Savings” and “Work” already use…". One match keeps today's text.
- **B** (`1208-B`): one name, the first A to Z, and a count: "“Main” and 1 other profile already use this recovery phrase. All of these profiles will hold the same accounts and funds. Add it anyway?" ("2 other profiles", and so on.) One match keeps today's text.
- **Engineering fact for the copy**: the sentence both options keep from today, "will hold the same accounts and funds", holds for the accounts the phrase derives, not for imported accounts: those belong to the one profile that imported them. Keep it, or give new words with the pick.
- **Recommendation**: A. Names are what the person recognises. Each name is at most 32 characters, but the list has no cap; two or more profiles on one phrase are rare, so it stays short in practice.

## OA-5 (#1228): the lock screen after the selected profile is deleted

- **Surface**: the lock screen (`apps/extension/src/popup/pages/auth.vue`; the rule lives in `apps/extension/src/popup/lock-screen-profile.ts`). Owner, 2026-10-27: a 1.2.0 change.
- **Today** (`1228-today`, "Work" deleted with "Main" and "Savings" left): no profile is selected and the profile chooser opens over the lock screen.
- **A** (`1228-A`): the lock screen selects the first remaining profile by name, A to Z, in the chooser's own order ("Main"); the chooser stays one press away on the "Current profile" row. Nothing new is stored. When the rule has to pick, a profile made before 1.1, which this version cannot open, comes last; a last-active profile is still selected first, as today. The rule applies whenever no last-active profile is known, not only after a delete (for one, when that record cannot be read).
- **B** (`1228-B`): it selects the profile that was active most recently before the deleted one ("Savings"). The wallet would keep a new list of recently active profiles on this device; that new stored data is part of this pick.
- **C**: as today.
- **Recommendation**: A. The issue's own rule (most recently unlocked, else oldest) needs data the wallet does not keep; A picks the same profile every time from what is already there, and the case is rare enough that a new stored list (B) does not pay for itself.
