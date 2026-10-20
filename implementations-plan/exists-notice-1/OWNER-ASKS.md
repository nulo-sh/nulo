# exists-notice-1: owner asks

The arc builds OA-1's recommendation and opens as a **draft** until the owner signs. OA-2 ships "unchanged".

## OA-1: the words for a passkey whose profile is already in this wallet (#914)

- **Surfaces.**
  - The popup's notice (`NotificationManager`), after Import → Passkey picks a passkey whose profile is here. The person reaches Import from the lock screen: profile name at the top → "Select Profile" → Import. Layout stays: warning icon and title, one paragraph, one full-width button. The notice names the profile ("Daily"). The nameless form is a fallback the wallet never reaches in practice (the refusal always comes from a readable profile), kept so a malformed message cannot drop the sentence.
  - The same notice in onboarding's tab. Onboarding reaches it only when the same passkey is imported twice (Back after an import, or a second tab); the profile may be open or locked by then, and onboarding itself shows no profile list. The options use one set of words for both.
  - Firefox's passkey window (toolbar panel only), after the same import. Layout stays: the step tag ("Import · <typed name>"), the key with its failure mark, a two-part title, one paragraph, a Close button. The window cannot name the profile.
- **Unchanged in every option:** a passkey whose id is held by a profile being deleted or by a row the wallet cannot read keeps today's notice (it cannot be chosen from the list).
- **Today** (`screenshots/exists-today-*.png`, `screenshots/window-today-*.png`). Notice: title "Profile import failed"; "An error occurred while importing the profile. This authenticator may not be supported or encountered an issue. Try again or use another one."; note "Windows Hello may not work correctly with some versions of Windows."; button "OK". Window: "Couldn't / import the passkey"; "Close this window and try again from Nulo."
- **Options** (no note line in any; titles show in capitals; no em dash joins two clauses):
  - **A (recommended, ships now as a draft):**
    - Notice title "Profile already added". Named: "“Daily” already uses this passkey in this wallet. Choose “Daily” from your profiles instead of importing it again." Nameless: "This passkey already has a profile in this wallet. Choose it from your profiles instead of importing it again." Button "OK".
    - Window: "Profile / already added"; "This passkey already has a profile in this wallet. Close this window and choose it from your profiles in Nulo."
  - **B (names the control; popup-true, odd in onboarding):**
    - Notice title "Passkey already in use". Named: "“Daily” already uses this passkey in this wallet. Click the profile name on the lock screen and choose “Daily”." Nameless: "This passkey already has a profile in this wallet. Click the profile name on the lock screen and choose it." Button "OK".
    - Window: "Passkey / already in use"; "This passkey already has a profile in this wallet. Close this window, open Nulo and choose it on the lock screen."
  - **C (nameless everywhere):**
    - Notice title "Already imported"; "This passkey already has a profile in this wallet. Unlock that profile instead of importing it again." Button "Got it".
    - Window: "Already / imported"; "This passkey already has a profile in this wallet. Close this window and unlock that profile in Nulo."
- **Pictures** (Chrome popup, 400×600, light and dark, profile "Daily"): `screenshots/exists-today-{light,dark}.png`, `screenshots/exists-option-{a,b,c}-{light,dark}.png`. Window (Firefox, 500×800): `screenshots/window-today-{light,dark}.png`, `screenshots/window-option-{a,b,c}-{light,dark}.png`.
- **Recommendation.** A. The title says what happened; the body names the profile the person already has and says to choose it rather than import it, which reads true from the popup (the lock screen's profile list) and from onboarding (the profiles are one click away in Nulo). B if the owner wants the exact control named, accepting its onboarding mismatch; C if no name.

## OA-2: the full-backup box for the same case

- **Surface.** The full-backup box (`import-full-backup-error`) when a passkey full backup is restored while its profile is here: title "Import failed", message "Passkey profile already exists".
- **Why it is open.** It already names the cause, but not where to find the profile. Giving it OA-1's words changes the restore's result type and `useFullBackupImport.ts`, which the migration-rule-1 lane holds (its OA-1 rewrites this box's other refusal).
- **Options.** A (ships now): unchanged. B: after migration-rule-1 lands, a follow-up shows OA-1's words in this box.
- **Recommendation.** A now; B only if the owner wants one voice for both.
