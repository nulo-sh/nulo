# lows-1: owner asks

Each ask names the surface, what a person sees before and after, the options, the recommendation and what ships without the answer. Screenshots travel with the orchestrator's decision page, not this file. Arc 1 (the restore admission) needed none of these answers. **All seven are answered**: decision page 111, signed by the owner on 2026-11-06 at 14:12 UTC, no notes.

## OA-1. Unlock method, "Use a password instead" (passkey profile)

- **Answered:** page 111, P111-01, 2026-11-06, A: "Fields first; Save shows the card; the change is made once it is answered. Sentences and the Save label stay."
- **Before:** press "Use a password instead" → the passkey card → the New Password fields and Save → Save changes the unlock.
- **After (recommended):** press "Use a password instead" → the New Password fields and Save → Save shows the passkey card → the change is made. The page's sentences and the Save label stay as they are.
- **Option B:** as recommended, with Save renamed "Save with passkey".
- **Ships without an answer:** nothing on this page.

## OA-2. Unlock method, "Use a new passkey" (passkey profile)

- **Answered:** page 111, P111-02, 2026-11-06, A: "New passkey's card first, then the current passkey's, and the change follows at once. A cancelled second card leaves the new passkey in the password manager, opening nothing (as after a refused import today)."
- **Before:** the current passkey's card, then the new passkey's card.
- **After (recommended):** the new passkey's card, then the current passkey's card. Both cards read as today ("Use your passkey", tagged "Unlock method · <profile>"). If the person cancels the second card, the new passkey stays in their password manager, opening nothing, as after a refused import today.
- **Option B:** keep the order, and ask the current passkey a second time right before the change (three cards).
- **Ships without an answer:** nothing on this page.

## OA-3. Full backup (passkey profile)

- **Answered:** page 111, P111-03, 2026-11-06, A: "Continue → pair + “Create protected backup” → card → Creating → Encrypting → warnings + “Download protected backup” → saved. Warnings are read before a file exists, as on a password profile. A cancelled card or a seal failure returns to the typed pair."
- **Before:** Continue on "Before you continue" → the passkey card → "Creating your backup" → the file's warnings, the file-password pair and "Download protected backup" → the download.
- **After, option A (recommended):** Continue → the file-password pair and a "Create protected backup" button → the passkey card → "Creating your backup", then "Encrypting your backup" → the file's warnings and "Download protected backup" → the download. The person reads any warning (keys left out, networks to add again, recovery mode) before saving the file, as a password profile does today. A cancelled card, or a file that fails to seal, returns to the pair, still typed, and the next press shows the card again.
- **Option B:** as A, but the one press also saves the file; the warnings then show after the download.
- **Ships without an answer:** nothing on this page.

## OA-4. Account file (passkey profile)

- **Answered:** page 111, P111-04, 2026-11-06, approved as written: "the empty “Confirm with passkey” step goes; the file-password pair comes right after “Agree & Continue”, and Save shows the card; a cancelled card keeps the typed pair; a failure after the card clears it and says “Failed to create the file”, as a failed Save does today."
- **Before:** pick the account → "Agree & Continue" → "Confirm with passkey" → the file-password pair and "Save account file" → the download.
- **After (recommended):** pick the account → "Agree & Continue" → the file-password pair and "Save account file" → Save shows the passkey card → the download. The "Confirm with passkey" step goes. A cancelled card keeps the typed pair; a file that fails after the card clears it and says "Failed to create the file", as a failed Save does today.
- **Ships without an answer:** nothing on this page.

## OA-5. Full backup after a lock that leaves the page open

- **Answered:** page 111, P111-05, 2026-11-06, approved as written: "the page starts over at “Before you continue” after such a lock, as Account file and Recovery phrase already do."
- **Before:** a lock that leaves the page open (another window unlocked first) keeps the page where it was.
- **After (recommended):** the page starts over at "Before you continue", as the account file and the recovery phrase already do.
- **Ships without an answer:** nothing on this page.

## OA-6. Password restores and a lock

- **Answered:** page 111, P111-06, 2026-11-06, A: "Same rule for password restores. Cost: a restore whose background worker restarts in the seconds between writing the profile and opening it ends at “Couldn't open the imported profile”; the profile is listed and opens at the next unlock with its password. Comments promising a finish after a restart are corrected."
- **Context:** arc 1 makes a passkey restore need a record the background worker gives it when the profile is written; an explicit Lock, deleting the profile, or 30 minutes take it back, and so does a background restart, since the record lives in memory, as it did at 1.0.0.
- **Option A (recommended):** the same rule for a password restore. Cost: a password restore whose background worker restarts between writing the profile and opening it ends at "Couldn't open the imported profile"; the profile is listed and opens at the next unlock with the password chosen for it. The comments that promise such a restore finishes after a restart are corrected.
- **Option B:** the same rule, kept in the browser's session storage, so a restart does not end a password restore. Cost: a stored record, its own failure handling at the lock, more code.
- **Option C:** no change for password restores.
- **Ships without an answer:** the passkey rule only (arc 1). An answer A or B lands in arc 2 if it arrives before arc 2 starts, else in its own small PR.

## OA-7. What a stopped passkey restore shows (for information; arc 1 ships it)

- **Answered:** page 111, P111-07, 2026-11-06, B: "“The import stopped before the profile opened. Unlock the profile to open it.” (new copy, only on your word)."
- **When:** a passkey restore is stopped before it opens the new profile: by an explicit Lock after the profile was written, by a background restart (as at 1.0.0), or 30 minutes after the profile was written.
- **What the person sees:** the existing failure screen, "Couldn't open the imported profile", with the existing sentence "The wallet session that approved this request has ended." The profile is listed and opens at the next unlock with the passkey chosen for it.
- **Option B:** a sentence of its own, for example "The import stopped before the profile opened. Unlock the profile to open it." New copy, so only on your word.
- **Ships without an answer:** the existing sentence.
