# Owner asks: security-ui-1

Four calls, in the order the decision page shows them. Each recommendation is the planner's own, labelled as such; the review panel argued how each option is built, never which one to pick. Full copy, testids and screenshot hooks per option: [options.md](options.md).

## 1. #34: how the full-backup export handles an unencrypted file

**Surface:** Settings, Security, Export, Full Backup (`apps/extension/src/popup/pages/settings/security/export/full.vue`).

**Today:** once the backup is ready, Download Backup saves an unencrypted file at once. A banner only recommends encrypting. For a password profile that file holds the recovery phrase and keys in plain text. For a passkey profile it shows accounts, contacts and activity, but holds no key that moves funds without the passkey.

| Option | What the person sees |
|---|---|
| **A. Encryption required** | Download stays disabled until the file is encrypted. The banner tells them to protect it first. A passkey profile sees the password fields at once and must choose a password for every backup. |
| **B. Warn and confirm** | The flow stays as it is. Download without a password opens a confirmation titled "Download without a password?". It says, for their profile type, what the file exposes. Cancel comes first and "Download anyway" (red) second. |
| **C. Encrypted by default** | A password profile's Create Backup ends with an encrypted file, and Download saves it. A small "Download without password" control under it leads to B's confirmation. A passkey profile sees the password fields at once, with the same small control. |
| **D. Split by profile type** | Password profiles get A. Passkey profiles get B. |

**Planner's recommendation: D.** An unencrypted password-profile file is a total loss if it leaks. For a password profile, encryption costs one press, because it reuses the password already typed. An unencrypted passkey file leaks privacy, not funds. Forcing a passkey user to choose a password risks a backup they cannot open later. B's confirmation names that trade honestly.

## 2. #14: how the emoji check lets a person refuse

**Surface:** the emoji check. It opens inside the connect window for a new connection, and in its own window for a reconnect that is not trusted (`apps/extension/src/popup/windows/verify/index.vue`). The "Always trust" row on Settings, Connected apps, app detail changes its label with it.

**Today:** the only control is OK. A person whose grids differ cannot end the session from the check. The copy says the check confirms a secure connection, and "Always trust" sounds like more than "skip this check on reconnect".

| Option | What the person sees |
|---|---|
| **A. Two equal controls** | One row of two buttons: "They don't match" first, then "They match". |
| **B. One primary control, a quiet refusal** | A full-width "They match" button. Under it sits a small text control, "These don't match". |

**Both options:**
- The refusal ends every open session of that app on that network. It removes the app from Connected apps, with its permissions, and closes the window. Reconnecting starts over with a new check.
- The instruction becomes: "Check that the app shows these same emojis in the same order. If they differ, the connection may not be safe. Choose They don't match."
- "Always trust" becomes "Skip this check next time", with the sub-label "Only for this app on this network.". This applies on the window and on the settings row.
- If the wallet ends the connection but cannot remove the app's record, the window stays open and says: "The connection ended, but this app could not be removed. Remove it in Settings, Connected apps." If the refusal itself fails, it says: "Couldn't disconnect this app. Disconnect it in Settings, Connected apps."

**Planner's recommendation: A.** The refusal is the reason the check exists, so it should not look optional. A press on "They don't match" by mistake costs only a reconnect.

## 3. #14: does closing the check window keep the session?

**Yes (today):** closing the window answers nothing, and the session stays connected. **No:** closing the window without pressing "They match" ends the session, the same as a refusal. With "No", a window closed by mistake disconnects the app. An untrusted reconnect of a long-used app would then lose its permissions.

**Planner's recommendation: Yes, keep today's behaviour.** The new refusal control covers the person who sees a mismatch. Turning the check into a real gate also means holding the app's calls until the person answers. That is #15, and it is the right place for this decision.

## 4. #17: go ahead with the backup format change?

**What changes for a person.** Nothing they see.
- Every backup the current version restores still restores, encrypted or not.
- A password-profile backup exported after the change no longer carries the profile's lasting imported-keys key. It carries a key made for that one backup. Whoever finds an unencrypted file, or an encrypted one after the profile's password changed, can open only the imported keys that existed when it was made, never ones added later. This part changes no file format, so it ships whatever the answer below.
- Passkey backups stay as they are. Anyone who can open their key already holds the passkey, which opens the same keys inside the wallet, so a separate backup key would protect nothing.

**The question:** change the encrypted backup file format, yes or no? The change ties each new encrypted file to its purpose and gives it a version.
- Value: it closes no attack that works today, since every other encrypted item in the wallet is already tied to its own purpose. It makes the format explicit, so a later version can be told apart, and it prevents a future mix-up.
- Cost: an encrypted backup made after the change does not open in an older Nulo version. Unencrypted backups still do.
- With "no", #17 stays open for this half, with a comment saying why.

**Planner's recommendation: Yes.** The cost is near zero now, because Nulo has no production users and nobody holds an older version that needs the new files. After launch, the same change would strand people on older versions.

## Answers: owner sign-off, 2026-10-08

Recorded by the owner on the decision page (a private Claude Artifact, "Security UI Decisions", with real-wallet screenshots of every option in both themes), then signed off at 16:08 UTC with the four answers as they stood:

| Call | Answer | Note |
|---|---|---|
| 1. #34 unencrypted full backup | **D**, split by profile type: A on password profiles, B on passkey profiles | none |
| 2. #14 emoji check refusal | **A**, two equal controls | none |
| 3. #14 closing the check window | **Yes**, keep today's behaviour: closing answers nothing | none |
| 4. #17 encrypted backup format change | **Yes**, go ahead | "I actually thought it already saved the version, to apply migrations if it's an 'older' version of a back-up (into a newer version of Nulo). But I might be wrong." |

Two render caveats were shown with the page and are not sign-offs of their own: the confirmation's "Download anyway" must use the design package's destructive (red) variant, which the prototype could not render; primary buttons uppercase their labels, so the instruction's "Choose They don't match." reads against THEY DON'T MATCH. The owner raised no objection to either, so the ask's wording stands.

On the call-4 note: the plaintext body already carries `backup-schema-version` (the storage schema version, migrated through the registry on import) and `compat-epoch`. What has no version today is the encrypted wrapper around that body; Phase 1.2 gives it one. So the note is right about the body and the change is about the wrapper only.

Consequences: Arc 1 runs Phase 1.1 and Phase 1.2. Arc 2 builds option D. Arc 3 builds option A and skips Phase 3.3.

## Render notes after implementation (arc 2, #34)

Not a new call: the build follows call 1 (D) and the caveat that "Download anyway" uses the design package's destructive (red) variant. One thing the prototype could not show:

- **The red button's type.** The design package's only red button is its full-width call-to-action style: 14 px type, wide letter spacing, no side padding. In the confirmation's half-width row that clipped "Download anyway". It now uses the same style's compact size (12 px), the size the design package gives that style in a tight spot, and the label fits, close to the button's edges. Cancel is unchanged. If it reads cramped in the final shots, two alternatives exist, each a UI change for the owner: stack Cancel above a full-width "Download anyway", or add to the design package a red button with the regular button's type, which would match the prototype's look in red.

## Answers: result page, 2026-10-09

Recorded by the owner on the result page (a private Claude Artifact, "Backup Page Result", with the arc 2 and arc 3 screenshots), signed off at 12:50 UTC:

| Call | Answer | Note |
|---|---|---|
| r1. The red "Download anyway" button | **C**, a red variant of the regular button | none |
| r2. A profile switch in another window resets the export page | **Yes**, ship as built | none |
| r3. Ending an app's session is scoped to the profile that owns it | **Yes**, ship as built | none |

Consequences: `@nulo/design`'s `Button` gains a `destructive` variant, the regular button's type and padding on red, and the passkey confirmation's "Download anyway" uses it at Cancel's size. The compact CTA size the render note above describes is gone from ConfirmPopup. r2 and r3 change nothing.

Render note on r1, not a new call: **the red button's hover.** It follows the regular button's hover, which mixes 18% of the text colour into the fill. In the dark theme that lightens the red from `#f03c3c` to about `#f15c5b`, and the white label falls from 3.6:1 to 3.1:1 while the pointer is over it. In the light theme it darkens the red (about 4.9:1). No shot shows a hover. Two alternatives exist, each a UI change for the owner: the red CTA's hover, 90% opacity (about 4.3:1 dark, 3.3:1 light), or a darker red in both themes.
