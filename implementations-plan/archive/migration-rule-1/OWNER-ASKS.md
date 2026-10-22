# migration-rule-1: owner asks

A1 and A3 depend on none of these. A2 ships OA-1's D on all three pages (answered: P70-11 D, P70-13 A). A4 ships OA-2's answer (P66-03 B, P70-10 B) and OA-3's (P62-11 A).

## OA-1: the words that refuse a passkey backup with no passkey check (P62-05)

- **Answered 2026-10-20.** P70-11 D: title as A ("Backup cannot be restored"); message "This passkey backup is too old or was changed. Choose Passkey to restore your wallet, then add your contacts and imported accounts again." P70-13 A: "The import's words, whichever you pick for them, on this page too. What the draft ships now; their advice cannot work here." D fits the box's three lines at 400 px on Chrome and Firefox. What ships, live: Import [light](screenshots/p70-import-light-chrome.png), [dark](screenshots/p70-import-dark-chrome.png); Restore again [light](screenshots/p70-restore-again-light-chrome.png), [dark](screenshots/p70-restore-again-dark-chrome.png).

- **Surface.** The full-backup import's error box (`ImportFullBackupForm.vue`, testid `import-full-backup-error`), on the popup's Import, onboarding's Import and the restore-again page. It shows when the file is a passkey profile's full backup that carries no passkey check (`backup-mac`): every passkey backup made by 0.31.0 or earlier, and any later one whose check was removed. The wallet refuses it before any passkey prompt. The import page's choices read "Import with: Full Backup, Recovery Phrase, Passkey".
- **Today.** Title "Incompatible backup"; message "This backup was created by an incompatible wallet version and cannot be imported. Re-export a backup from a current version of the wallet." The same box shows for a backup of a retired generation (the compat-epoch refusal), which keeps its words in every option.
- **What a passkey restore brings back.** "Import with Passkey" creates the profile and its first account (`useProfileImportFlow.ts` `handleImportPasskey`, then the default account); the person adds further accounts again. Not in it: contacts, imported accounts, added networks and tokens, account names, local history. P62-05 names contacts and imported accounts.
- **Options** (each at most two sentences, no em dash; none says the file is old, since a current file with its check removed gets the same box):
  - **A:** title "Backup cannot be restored"; message "This passkey backup is from an older version or was changed, so it cannot be restored. Choose Passkey to restore your wallet, then add your contacts and imported accounts again."
  - **B:** title "Incompatible backup" (unchanged); message as A.
  - **C:** title as A; message "This passkey backup is from an older version or was changed, so it cannot be restored. Choose Passkey to restore your wallet, then add back your contacts, imported accounts, networks and tokens."
  - **D (chosen, ships):** title as A; message "This passkey backup is too old or was changed. Choose Passkey to restore your wallet, then add your contacts and imported accounts again."
- **The box shows three lines of the message.** `ImportFullBackupForm.vue` clamps the message at three lines and ends it with "…"; the whole text reaches only the clipboard, by tapping the box. At 400 px, A and C are cut after "then add your" and "then add back", so the person never reads what to add again. D fits in three lines. Lifting the clamp shows A whole (one more line), a layout change every refusal in that box would share.
- **Pictures** (popup Import page, 400×600, Chrome, a backup of a profile named Daily, the box in `dev`'s colours; A was live before the answer, the others are mockups of the same box):
  - A: [light](screenshots/oa1-A-light-chrome.png), [dark](screenshots/oa1-A-dark-chrome.png)
  - C: [light](screenshots/oa1-C-light-chrome.png), [dark](screenshots/oa1-C-dark-chrome.png)
  - D: [light](screenshots/oa1-D-light-chrome.png), [dark](screenshots/oa1-D-dark-chrome.png)
  - A with the clamp lifted: [light](screenshots/oa1-A-unclamped-light-chrome.png), [dark](screenshots/oa1-A-unclamped-dark-chrome.png)
- **The imported accounts' keys are in the refused file.** A passkey backup carries them sealed under the passkey (`imported-keys-dek-sealed`). "Add your imported accounts again" assumes the person kept each key elsewhere; for one who did not, the refused file was the only copy.
- **Restore again needs its own words (OA-1R).** Restore again runs inside the profile a backup restored and checks the file with the same validator, so a passkey file with no check gets these words there too, though following them fails: importing a passkey that already has a profile is refused ("Passkey profile already exists"). Restore again shipped in 0.31.0, and its record survives the update, so a passkey profile restored in 0.31.0 with a network left to retry holds a record only its own unchecked file matches, and that file is refused (before this arc too, with "Incompatible backup", whose advice fails as well). Restore again never asks for the passkey and accepts only the body whose checksum its record names.
  - **R-a (chosen, ships):** the import's words, as above.
  - **R-b:** keep "Incompatible backup" and its words on that page.
  - **R-c:** accept there an unchecked passkey body whose checksum the record names, so the retry works again. A behaviour change to a security check: its own plan if chosen.
  - **Pictures** (popup at 400×600, Chrome, `dev`'s colours, a profile named Daily; the Restore again pages come from a real import that left Local Network unrestored, so its reminder names it; the page shows no profile type and reads the same for a passkey profile):
    - R-a, live: Restore again refusing a passkey backup with no check, in A's words, as the draft shipped before the answer: [light](screenshots/oa1r-a-light-chrome.png), [dark](screenshots/oa1r-a-dark-chrome.png)
    - R-b, mockup: the same box with today's "Incompatible backup" words written into it: [light](screenshots/oa1r-b-light-chrome.png), [dark](screenshots/oa1r-b-dark-chrome.png)
    - R-c, live: the reminder's own backup accepted and the restore running, the network held unanswered. Under R-c the accepted file is the unchecked one, and the page reads the same. When the run ends it returns Home with a toast naming the restored networks, or offers Retry for one that did not answer: [light](screenshots/oa1r-c-light-chrome.png), [dark](screenshots/oa1r-c-dark-chrome.png)
    - Where R-a's advice leads, live: with the passkey profile Daily installed, Import with Passkey picks the same passkey, the wallet refuses it because its profile already exists, and the person sees "Profile import failed", which names the authenticator rather than the existing profile: [light](screenshots/oa1r-exists-light-chrome.png), [dark](screenshots/oa1r-exists-dark-chrome.png)
  - **Recommendation:** R-c if the owner wants 0.31.0 restores to finish; else R-b, which at least changes nothing there.
- **Recommendation.** D: the only words that show the whole way back without changing the box, and they name the choice on the import page ("Passkey") and the two things P62-05 names. A with the clamp lifted if the owner wants A's fuller first sentence.

## OA-2: the update-failed screen once real migrations exist

- **Answered.** P66-03 B, with the owner's note that a later update MAY repair it; P70-10 B: "Soften: "Keep the extension installed. A later update may be able to repair this."" Ships in A4. Pictures, before and after, Chrome popup at 400×600: [before light](screenshots/oa2-before-light-chrome.png), [before dark](screenshots/oa2-before-dark-chrome.png), [after light](screenshots/oa2-after-light-chrome.png), [after dark](screenshots/oa2-after-dark-chrome.png).

- **Surface.** `MigrationBarrier.vue`'s terminal screen ("UPDATE FAILED"), shown when a migration fails on every retry and the wallet refuses to start. Its sub line today: "Your funds are safe. Your secret phrase still recovers your accounts. It does not recover imported accounts or passkey profiles. Reinstall the extension to start clean." (P38-10 B). Below it, the engine's reason in small type.
- **Why it is open.** Before 1.0 a reinstall lost nothing that mattered. After 1.0 it deletes a person's imported accounts, contacts and history, which the screen itself says the phrase does not recover. A 1.0.0 user can reach the screen with no migration shipped: a corrupt or out-of-range stored schema version, or a rollback past a later migration, ends in it (`packages/wallet-core/src/migration/migrator.ts:244-249`, `apps/extension/src/wallet/runtime.ts:409`). In each case the engine has deleted nothing, so a fixed update can still read the data.
- **Options.**
  - **A (ships now): unchanged.** The advice stays reachable at 1.0.0 in the corruption cases above until the owner answers.
  - **B:** keep the first three sentences; replace the last with "Keep the extension installed. A later update can repair this."
  - **C:** as B, plus a line that names where to report it, once the owner publishes a support contact (none is in the extension today).
- **Recommendation.** B, before 1.0.0 if the owner answers in time: the engine keeps its backup and the rows on every failure, so the data a fixed update can repair stays only while the extension stays installed. B is one string and its test pin.

## OA-3: #709 at 1.0.0

- **Answered.** P62-11 A: "Keep accepting them; the known limit stays, reopened only by a leaked old backup." #709 stays closed; A4 restates its line in `packages/wallet-crypto/ATTACK-SURFACE.md`.

- **Surface.** None on screen: `packages/wallet-crypto/ATTACK-SURFACE.md` § Known limitations and issue #709. A password full backup made before PR #51 (v0.30.2 and earlier) still restores and carries the source profile's long-lived key for imported accounts. P38-12 = A accepted it "while the wallet has no production users", reopened "on the first production user".
- **Why it is open.** 1.0.0 is that condition. No 1.0.0 build makes such a file; only someone who exported one from a pre-release build holds one.
- **Options.**
  - **A (ships now):** A4 reopens #709 as its condition says, labelled `owner-decision`, and restates the line as facts (which builds made such files, what the file opens). No behaviour changes.
  - **B:** refuse these files at import. A compat-epoch bump would refuse every older backup, 0.31.0's included; refusing only them needs a file check the plan has not traced.
  - **C:** rotate the imported-key key on the next password change.
- **Recommendation.** A now; B or C only on evidence that such a file left a tester's machines.
