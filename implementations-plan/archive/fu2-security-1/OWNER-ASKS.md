# fu2-security-1 owner asks

Five asks, all answered on decision page 100, signed 2026-11-03 at 14:02 UTC; arc 2 ships each answer.

## OA-1. The lock screen's line for an unfinished import (arc 2, #1528)

- **Answered: C** (P100-01, page 100, 2026-11-03).
- **Surface:** the lock screen (`#/popup/auth`) after an unlock refused because the profile's backup import never finished.
- **Today:** "This profile's import didn't finish. Delete it below and re-import your backup." Below it sits "Delete profile".
- **After P93-22 B:** the control below reads "Forgot your password?" (passkey profile: "Lost your passkey?"), so "below" points at a question this person does not have: they know the password, and the import is what failed.
- **Options:**
  - **A (ships now).** The line stays as it is. The person presses the question, then Delete profile on the recovery card.
  - **B.** The line names the link: "This profile's import didn't finish. Press “Forgot your password?” below, delete the profile, then re-import your backup." (“Lost your passkey?” on a passkey profile.)
  - **C.** In this state only, the link reads "Delete profile", as today, and opens the same recovery card.
- **Recommendation: C.** It is the one state where deleting is the advice, and Continue cannot succeed in it, so the fat-finger risk P93-22 removes does not apply.

## OA-2. Delete profile's third box on a profile made before 1.1 (arc 2, #1529)

- **Answered: A** (P100-02, page 100, 2026-11-03). The owner: "No one is using the version before 1.1 let's not complexify our code for something no one is using."
- **Surface:** Settings › Delete profile (`#/popup/settings/security/reset`), reached from the lock screen's "Delete profile" button on a passkey profile made before 1.1, which no unlock opens.
- **After P93-40 C:** the third box reads "I have my recovery phrase or a full backup", while the line under the name field says "This profile has no recovery phrase. Deleting it can't be undone." The page asks the person to tick a statement it then contradicts.
- **Options:**
  - **A (ships now).** The same box on every profile, as the pick's words say.
  - **B.** Such a profile shows only the first two boxes; the typed name still gates the button.
  - **C.** Such a profile keeps a box about its funds: "I'm sure there are no assets left in my profile".
- **Recommendation: B.** The box asks for something this profile cannot have; the two other boxes and the typed name still stand.

## OA-3. The repeat field's label on Account export (arc 2)

- **Answered: B** (P100-03, page 100, 2026-11-03).
- **Surface:** Settings › Back up profile › Account (`#/popup/settings/security/export/account`).
- **After P93-27 C:** Full backup's second file-password field carries the label "Repeat password". Account export shows the same pair of fields, through the same component, with the second one unlabelled, which the lab flagged on Full backup.
- **Options:**
  - **A (ships now).** Account export stays as it is; the component labels the field only when Full backup asks it to.
  - **B.** Account export labels its second field "Repeat password" too, and the opt-in goes.
- **Recommendation: B.** One component, one look, and the lab's complaint applies to the same field.

## OA-4. The lock screen's link before the profile is known (arc 2, #1528)

- **Answered: A** (P100-04, page 100, 2026-11-03).
- **Surface:** the lock screen (`#/popup/auth`) while it has not yet learned which profile it shows. Today the heading and the form stay hidden in place until then; "Delete profile" shows from the start.
- **After P93-22 B:** the link's words depend on the profile's kind, so it hides in place with the heading until the kind is known. If the profile list never loads (the worker unreachable), the link, and with it the recovery card's "Report issue with authorization" mail link, stays hidden; the start-up banner's Retry is that state's way on.
- **Options:**
  - **A (ships now).** Hidden until the profile is known, as the heading and form are.
  - **B.** Shown from the start as "Forgot your password?", changing to "Lost your passkey?" once a passkey profile is known.
- **Recommendation: A.** A passkey user never reads the wrong question, and the state where the list never loads already hides the rest of the screen.

## OA-5. When "Doesn't match" shows on Delete profile (arc 2, #1529)

- **Answered: B** (P100-05, page 100, 2026-11-03). The owner: "Should we also add a debounce? Try to create the most lovely UX. This is a well-known user flow, so we need to use well-known and tested behaviour for our apps."
- **Surface:** Settings › Delete profile, the profile-name field under "Confirm deletion".
- **The pick says** a mismatched name shows "Doesn't match Main"; it does not say when.
- **Options:**
  - **A.** On every keystroke that leaves the field unlike the name: typing "M" for "Main" already shows the line.
  - **B (ships now).** Once the typed text can no longer become the name: a lookalike letter, a typo or an extra space shows it at once; a correct name still being typed does not.
  - **C.** Only after the person leaves the field with a mismatch.
- **Recommendation: B.** It explains the disabled button the moment it can, and never scolds a correct name half-typed.
