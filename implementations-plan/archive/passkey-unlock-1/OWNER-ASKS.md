# Owner asks: passkey-unlock-1

A passkey profile gets a recovery phrase, kept encrypted in the wallet, and the passkey unlocks it as a password does. Every screen below changes only on your answer. Arc A1 changes nothing you see and does not wait. Arcs A2 to A4 wait for this page; each ask names the arc that builds it.

**Signed.** The owner signed decision page 86 on 2026-10-25 (signoff-P86). Each record is on #1127 under "## Decision" as P86-01 to P86-23, and each ask below quotes the records that decide it. P86-02 and P86-05 were owner notes the orchestrator settled in chat; #1127 records the settlement.

How to read a screen spec: **Route** · **Title** (as the page draws it, two lines where it has two) · **Body**, word for word · **Controls**, in order, with what each does. "Today" quotes the current screen. Copy follows the house rules: no em dash between clauses, error text in the danger colour, "recovery phrase", never "seed". [FLOWS.md](FLOWS.md) shows every flow as a numbered screen sequence and lists every screen.

**Two rules every option below uses, so they are stated once:**
- **The passkey card.** Every new passkey step opens the existing passkey card with a new tag, and keeps its existing states: waiting "Use your" / "passkey" with "Confirm the request from your browser or password manager."; cancelled or timed out "Not" / "confirmed" with "The passkey request was cancelled or took too long. Nothing changed."; done "Passkey" / "confirmed". A cancelled step leaves the page as it was. On Firefox's toolbar panel, which closes when the browser's passkey prompt opens, a page that asks the passkey opens in its own window first, as Settings → Back up profile → Full Backup does today.
- **A new file password.** Wherever a file gets a password of its own: "Enter password", then "Repeat password", with today's hint under the pair, in this order: "At least 8 characters" (under 8), "Passwords don't match", "Strong password" (8 to 24), "Long enough. Don't forget it." (over 24). The save button stays disabled until the hint is one of the last two.

## OA-1. Creating a profile with a passkey: the recovery phrase

**Flow:** F1. **Arc:** A2.

**Decided, P86-01:** "the recovery phrase when a passkey profile is created: **option A**. The password profile's phrase stage, with "Do it later"."

**Today.** Onboarding, `/onboarding/create`, Passkey tab: the step row reads Terms · Create · Ready. "Create with passkey" opens the passkey card, then goes straight to `/onboarding/done`. A password profile instead sees the phrase stage (below) between Create and Ready. In the popup (`/popup/profile/new`) neither method shows a phrase stage; a password profile gets Home's "Save your recovery phrase" step.

**Option A: the same phrase stage as a password profile.**
- Step row: Terms · Create · Phrase · Ready.
- `/onboarding/create`, Passkey tab: unchanged ("Your passkey replaces a password. Touch ID, Windows Hello, or a hardware key, whichever your device supports."; button "Create with passkey").
- After the passkey card: the phrase stage, as for a password profile.
  - Title: "Your recovery" / "Phrase".
  - Body: "Write these 24 words on paper and keep them offline. They bring your wallet back if you lose your passkey."
  - The 24 words in a 4-column grid.
  - "Keep in mind" with the three existing warnings ("Some applications on your PC can have access to your clipboard and read a recovery phrase" · "Storing a text file with sensitive information like a recovery phrase can be dangerous" · "Paper keeps the phrase off every computer; keep it somewhere safe from loss, water and fire.").
  - Controls: "Copy" (becomes "Copied"); "I saved it" (marks the phrase saved, goes to Done); link "Do it later" (goes to Done; Home then asks, OA-4).
- No second passkey prompt: the words come from the create step itself.
- `/popup/profile/new`: as today for both methods (no phrase stage; Home asks, OA-4).

**Option B: as A, without "Do it later".** The only way on is "I saved it".

**Option C: no phrase stage.** Create goes to Done as today. Home's Get started lists "Save your recovery phrase" first (OA-4). The words are in Settings → Back up profile → Recovery Phrase (OA-3b).

**Recommendation: A.** One create flow for both unlock methods, built on the stage you already approved for password profiles. "Do it later" keeps a person from being stuck, and Home keeps asking until the phrase is saved.

## OA-2. Importing: a recovery phrase or a backup, then how to unlock

**Flows:** F4, F5, F8, F13. **Arc:** A2 for the picker row; A3 for the unlock choice.

**Decided, P86-02:** "Importing: the recovery phrase or a backup brings the wallet back, then you choose how to unlock: **a note instead of an option**." The owner's note: "Shouldn't a back-up kinda set what it used to have as an option to unlock? Password, or Passkey? Or you think the best UX would be to let them re-choose?" Recorded: "Option A, and restoring a full backup opens the unlock choice on the method the backup was made with (still switchable); importing a recovery phrase opens on Passkey, as Create does."

**Today.** `/onboarding/import` (title "Import" / "Wallet", subtitle "Restore from a recovery phrase, passkey, or full backup.") and `/popup/import` (hero "Import Profile"). The picker "Import with" lists "Full Backup", "Recovery Phrase", "Passkey". "Passkey" brings back an existing passkey profile. A phrase import always makes a password profile ("New Password" section). A full backup restores with the method it was made with: a password backup asks a new password, a passkey backup asks the passkey.

After this change a passkey no longer brings a wallet back by itself. A2 removes the "Passkey" row (or turns it into B's notice) and, until A3 ships, a phrase or a backup restores as a password profile, as a phrase does today. No release ships between the two.

**Option A: pick the unlock method after the phrase or the file.**
- Picker: "Full Backup", "Recovery Phrase". Onboarding subtitle: "Restore from a recovery phrase or a full backup."
- Recovery Phrase form: the phrase field as today, then a section "How you'll unlock Nulo" with the tabs "Passkey" · "Password" (Passkey first and selected, as on Create; one Tab stop, arrow keys switch).
  - Passkey tab: "Your passkey replaces a password. Touch ID, Windows Hello, or a hardware key, whichever your device supports."
  - Password tab: today's "New Password" fields ("Enter new password", "Repeat password") with today's hints.
  - Button: "Import profile" (popup: "Import {name}"). With Passkey selected it opens the passkey card (tag "Import"), then finishes as today. Cancelled: the form stays filled, nothing is imported.
- Full Backup form: file, then "Decryption Password" as today, then the same "How you'll unlock Nulo" section for every backup, in place of "New Password". The Password tab keeps today's hint "Create a new password that will be used to log in to your profile in the future". With Passkey selected the card's tag is "Restore".
- "Back to methods" as today.

**Option B: as A, and the picker keeps a "Passkey" row** that opens a notice in place of a form.
- Title: "Passkeys don't restore wallets".
- Body: "A passkey unlocks a wallet on this device. To bring a wallet back, use its recovery phrase or a full backup. You can then choose to unlock it with a passkey."
- Controls: "Use Recovery Phrase" (opens the phrase form), "Back to methods".

**Option C: as A, with Password selected first on import.** Create keeps Passkey first.

**Recommendation: A.** One rule everywhere: the phrase or the backup brings the wallet back, and the person picks how to unlock it. B adds a row whose only job is to say no; the release notes carry that message (OA-8).

## OA-3. Exporting from a passkey profile

**Flow:** F9. **Arc:** A2 for 3a, 3b and 3d; A3 for 3c. Until A3 the menu shows a passkey profile no "Account" row.

**Today.** `/popup/settings/security/export` (title "Backup"): a passkey profile sees "Profile" with its name, the sentence "To access your profile on a new device, the Passkey must be synced with it or available on another device you own.", and one row, "Full Backup". A password profile sees "Profile to backup" and three rows: "Full Backup", "Recovery Phrase", "Account". The account list's export icon is hidden for passkey profiles. A passkey full backup may be saved without a password.

**3a. The Backup menu.** **Decided, P86-03:** "the Backup menu of a passkey profile: **option A**. The password profile's three rows for both; the passkey sentence goes."
- **A:** the password profile's menu for both: "Profile to backup", then "Full Backup", "Recovery Phrase", "Account". The passkey sentence goes.
- **B:** as A, with one sentence under the profile name for passkey profiles: "Your recovery phrase brings this profile back on any device. Your passkey only unlocks it here."
- **Recommendation: A.** The two menus become one, and the sentence says what the Recovery Phrase row already shows.

**3b. Revealing the recovery phrase** (`/popup/settings/security/export/seed`, hero "Recovery Phrase"). **Decided, P86-04:** "revealing a passkey profile's recovery phrase: **option A**. "Reveal with passkey" after the agreement."
- Today (password): the agreement "Before you continue" (three sentences, unchanged), "Agree & Continue", then "Unlock" with "Enter password" and "Reveal Recovery Phrase".
- **A:** same agreement; then one button "Reveal with passkey". It opens the passkey card (tag "Recovery phrase"); on success the words show as for a password profile, with "Keep in mind" and the closing countdown. Cancelled: the button stays, nothing shows.
- **B:** the words show after "Agree & Continue" with no passkey prompt. Not buildable without a revised plan: the wallet keeps the words sealed even while it is unlocked, so showing them needs the passkey, as it needs the password today.
- **Recommendation: A.** The same step a password profile takes, with the passkey in the password's place.

**3c. The account file** (`/popup/settings/security/export/account`, hero "Account Backup"). **Decided, P86-05:** "A passkey profile's account file, protected with a password of its own: **a note instead of an option**." The owner's note: "Can't it use the passkey to encrypt it?" Recorded: "Option A: a passkey profile's account file is protected with a file password of its own, and the passkey approves making it. A backup has to open after the passkey is lost."
- Today (password): select the account; agreement "This file gives full control of one account." / "Anyone holding the plain file can spend from this account. Store it as carefully as your recovery phrase." / "By continuing you accept these risks."; unlock with the password; "Protect your account file"; "Your profile password will be required to import this account."
- **A:** select the account; the same agreement; "Confirm with passkey" (passkey card, tag "Account file"); then a section "File password" with the file-password rule above; button "Save account file". Below it: "This password will be required to import this account." The account list shows the export icon for passkey profiles too.
- **B:** the account file stays unavailable for passkey profiles (the icon stays hidden; the menu has no "Account" row).
- **Recommendation: A.** The file needs a password of its own, since nothing the passkey makes may open a file outside the wallet.

**3d. The full backup** (`/popup/settings/security/export/full`). The file of a passkey profile now holds the recovery phrase, so it is always protected with a password. There is no plain download. **Decided, P86-06:** "the file password on a passkey profile's full backup: **approved as drafted**." The owner's note: "Asked whether the passkey could protect the file; kept as drafted in chat on 2026-10-25, since a backup has to open after the passkey is lost." Words to sign:
- After "Agree & Continue", the passkey card (tag "Backup"), then the banner "Backup is ready" / "Choose a password for this file. You'll need it to restore the backup."
- Section "File password" with the file-password rule above (today the page takes any non-empty matching pair).
- Controls: "Protect with Password" (disabled until the rule is met), then "Download Backup". The confirmation for a plain download goes.
- After saving: "Saved to your downloads" and "Backup is successfully encrypted" / "Don't forget your password, as it will be required to restore your backup." (both today's).
- **Recommendation:** these words. A password profile's backup page does not change.

## OA-4. Get started on Home

**Flow:** F3. **Arc:** A2.

**Decided, P86-07:** "Get started for passkey profiles: **option A**. The password profile's card and banner for every profile."

**Today.** A passkey profile's card lists "Back up this wallet" / "Sync your passkey or save a backup file" (done when a backup file is saved), then "How Aztec works", "Get Fee Juice", "Make proofs faster". A password profile's card lists "Save your recovery phrase" / "The 24 words that restore this wallet" first. That step cannot be hidden, and once Hide put the card away, a funded wallet without a saved phrase shows "Your funds have no backup" with "Save phrase".

- **A:** passkey profiles get exactly the password profile's card and banner. "Back up this wallet" goes. The phrase step is done after "I saved it" (OA-1) or after revealing the phrase (OA-3b).
- **B:** A, plus a "Back up this wallet" row with the description "Save a backup file", done when a full backup file is saved (as today's passkey row), and hidden with the card by Hide. The banner stays the phrase's.
- **C:** keep one row, "Back up this wallet" / "Save your recovery phrase or a backup file", done by either, and it cannot be hidden, like today's phrase row. After Hide, a funded wallet with neither done shows the banner "Your funds have no backup" with "Back up", which opens `/popup/settings/security/export`.
- **Recommendation: A.** One card for every profile; the phrase is the backup that matters, and the full backup stays one tap away in Settings.

## OA-5. The passkey's name, and one passkey for several profiles

**Flows:** F1, F4, F5, F11. **Arc:** A2 for the name; A3 for C.

**Decided, P86-08:** "the passkey's name, and one passkey for several profiles: **option C**. "Nulo wallet", and one passkey may unlock several profiles."

**Revised, 2026-10-26 (owner, chat):** the passkey is named by its profile; the reuse link stays.

**Today.** Each passkey profile creates its own passkey. Your password manager lists it as `nulo-{profile name}-{8-character id}`, for example `nulo-main-3f9a2c71`; the site shows as "Nulo". The name is synced to your password manager's cloud.

- **A:** keep today's naming and one passkey per profile.
- **B:** one passkey per profile, named "Nulo wallet" (no profile name, no id).
- **C:** B's name, and one passkey can unlock several profiles. Wherever a passkey is set up (Create, Import, Restore), the Passkey tab shows:
  - the button "Create with passkey" (import: "Import profile"), which creates a new passkey, as today;
  - under it, the link "Use a passkey I already have", which asks your device for an existing Nulo passkey and uses it for this profile (passkey card, tag as for the button).
  - When the device has no Nulo passkey, the browser says so in its own prompt; the card then shows its cancelled state, and the button still creates a new one.
  - Each profile keeps its own recovery phrase and its own lock; using the same passkey for two profiles does not join them.
- **Recommendation: C.** One passkey to look after if you want it, a name that tells your password manager nothing about your profiles, and no choice made on your behalf.

## OA-6. Adding or changing the unlock method

**Flow:** F10. **Arc:** A3, only if you put it in scope.

**Decided, P86-09:** "changing a profile's unlock method: **option B**. An "Unlock method" page, both directions, in A3."

**Today.** Settings → Safety has "Change password" for password profiles; passkey profiles have nothing.

- **A: out of scope.** To switch, a person saves a full backup, deletes the profile and restores the backup choosing the other method (OA-2). Importing the recovery phrase alone also works, but it does not bring back separately imported accounts, contacts or app connections.
- **B: an "Unlock method" page.** Settings → Safety gains the row "Unlock method" with the description "Password" or "Passkey"; it opens `/popup/settings/security/unlock-method` (title "Unlock" / "Method"), in its own window on Firefox's toolbar panel.
  - Body: "This profile unlocks with a password." or "This profile unlocks with a passkey."
  - Password profile: button "Use a passkey instead". It asks "Enter password" with "Continue" ("Wrong password" under the field when it does not open), then the passkey card (tag "Unlock method"). Done: the toast "Now unlocks with your passkey", and the page shows the new method. "Change password" stays where it is.
  - Passkey profile: button "Use a new passkey" (passkey card for the current passkey, then the card again for the new one; toast "Now unlocks with your new passkey"); button "Use a password instead" (passkey card, then "New Password" with today's hints, then "Save"; toast "Now unlocks with your password").
  - Any step cancelled: nothing changed, the page stays. A failure before the change is saved: the error toast "Couldn't change the unlock method. Try again." and nothing changed. If the change is saved but the wallet can't reopen the profile: the toast "Unlock method changed. Unlock Nulo again to continue." and the lock screen.
  - Changing the method keeps the profile, its accounts, its recovery phrase and its data. Backup and account files saved before keep the password they were saved with.
- **C:** only "Use a new passkey", for passkey profiles.
- **Recommendation: B, in A3.** It is the one way to move between a password and a passkey without a restore, and it reuses the password-change mechanism. If you want the lane smaller, A costs nothing now and B can come later.

## OA-7. Profiles made before this update

**Flow:** F12. **Arc:** A2.

A passkey profile made with 0.31.0 or earlier (or a sideloaded 1.0.0) cannot be opened by this version: it has no recovery phrase, and its accounts cannot be moved onto one. A password profile is not affected.

**Passkey profiles from before the update:** **Decided, P86-11:** "passkey profiles made before the update: **option A**. Kept, marked "Set up again", deletable." **P86-12:** "the second sentence on "Set up again": **option B**. With "What it held stays on the network, out of this version's reach."" (the optional second sentence below is in.)
- **A: kept, marked, deletable.** The profile stays in the profile list and in the profile picker. Choosing it on the lock screen (`/popup/auth`) shows, in place of "Passkey required" / "Use your passkey to continue" and the "Continue" button:
  - Title: "Set up" / "again".
  - Body: "This profile was made with an earlier version of Nulo and can't be opened in this version. Delete it, then create or import a profile."
  - Optional second sentence, your call: "What it held stays on the network, out of this version's reach."
  - Controls: "Delete profile" (opens `/popup/settings/security/reset`), and the profile name pill to choose another profile.
  - On the delete page, the footer "You will be able to recover the accounts derived from your recovery phrase later if you have saved it" reads for such a profile: "This profile has no recovery phrase. Deleting it can't be undone." The agreements and the typed name stay. Deleting the last profile opens the popup's create-or-import page (`/popup/register`), as today.
  - An app that asks to connect while such a profile is selected opens the same lock screen.
  - Its passkey stays in your password manager; you can delete it there.
- **B: a one-time way out.** The new version keeps the old unlock for these profiles only, for a limited time, and opens one page, "Move your" / "Funds" with "This profile was made with an earlier version of Nulo. Send everything to another profile, then delete this one.", the account list and Send. Not buildable without a revised plan: it keeps the unlock this change removes, and adds a screen, its tests and a later removal.
- **C: removed at the update.** The update deletes them and shows once: "A passkey profile from an earlier version was removed. Create or import a profile." Not buildable without a revised plan: a deletion at update time is a storage migration with its own recovery story.
- **Recommendation: A.** B keeps alive the very unlock this change retires; C deletes without asking.

**A backup made by such a profile** (a passkey backup from 0.31.0 or earlier): Restore refuses it as soon as the file is read (after its "Decryption Password", if it has one), before any other step. Restore again (Settings) refuses it the same way. **Decided, P86-13:** "the refusal of a backup made by an old passkey profile: **approved as drafted**."
- Shown in the file's error box, as other unreadable files are: the tag "Error", the title "Backup from an earlier version", the text "This backup was made by a passkey profile on an earlier version of Nulo, and this version can't restore it."
- Controls: the file row (choose another file), then "Back to methods" on Import, or the page's back arrow (to Home) on Restore again.
- **Recommendation:** these words.

**Password profiles from before the update:** **Decided, P86-14:** "password profiles from before the update: **approved as drafted**." (option A, carried over.)
- **A: carried over.** Nothing changes for them.
- **B: clean break.** Every profile from before the update is marked as above. Not buildable without a revised plan: a password profile from before the update is stored exactly like a new one, so the wallet cannot tell them apart.
- **Recommendation: A.** Their storage does not change, so a break would cost people their profiles for nothing.

## OA-8. How it is communicated

**Arc:** A4 writes what you pick into the repository files; the store text and the messages are yours to post. Browsers update extensions on their own, so only 8e reaches people before the update.

**8a. What a 0.3x user sees on update.** Password profiles: nothing. Passkey profiles: the OA-7 screen. **Recommendation:** no extra notice; the lock screen says it where it matters. (A one-time Home notice is possible but not buildable without a revised plan: it needs a stored dismissal of its own.) **Decided, P86-17:** "no extra notice on update: **approved as drafted**."

**8b. Release notes** (the GitHub release, written above the generated list). **Decided, P86-18:** "the release notes: **option A**. Three sentences: what changed, and what an old passkey profile's owner does."
- **A:** "Passkey profiles now have a recovery phrase. Your passkey unlocks Nulo on this device, and your recovery phrase brings your wallet back on any device, with a password or a passkey. A passkey profile made with an earlier version can't be opened in this version: delete it, then create or import a profile."
- **B:** "Every profile now has a recovery phrase, passkey profiles included. Passkey profiles from earlier versions need to be set up again."
- **Recommendation: A.** It says what changed and what the affected group does next.

**8c. Firefox Add-ons "Release notes" and the Chrome Web Store description.** **Decided, P86-19:** "the Firefox release notes: **option A**. Two sentences naming the group that has to act."
- **A:** "Passkey profiles now keep a recovery phrase. A passkey profile made with an earlier version needs to be set up again."
- **B:** 8b A, shortened to its first two sentences.
- **Recommendation: A** on Firefox. Chrome has no release-notes field; its description stays as it is ("Your keys stay on your device, behind your password or passkey." is still true).

**8d. README.** One paragraph under the install section: "Every profile has a 24-word recovery phrase. You unlock Nulo with a password or a passkey; the recovery phrase brings your wallet back on any device." **Recommendation:** this paragraph. **Decided, P86-20:** "the README paragraph: **approved as drafted**."

**8e. People you know who use a passkey profile** (a message you send).
- "Heads-up: the next Nulo update gives passkey profiles a recovery phrase. A passkey profile made with the current version can't be opened after the update, and browsers install updates on their own. If it holds anything you want to keep, send it to a password profile now. After the update, create a new profile; you can unlock it with your passkey again."
- **Recommendation:** this message, sent before the store release.
- **Decided, P86-21:** "the message to known passkey users: **approved as drafted**."

## OA-9. The version number

**Facts.** `v1.0.0` is tagged and published on GitHub; no store served it, and it will never ship. release-please counts from 1.0.0: a `feat:` commit makes 1.1.0, only `fix:` commits make 1.0.1, a `feat!:` commit or a `BREAKING CHANGE` footer makes 2.0.0, and a `Release-As: x.y.z` footer picks the number. This lane's arcs are `feat(...)`, so the next release is **1.1.0** unless you choose otherwise.

- **A: 1.1.0.** No change to the commits.
- **B: 2.0.0.** The last arc's commit carries `!`.
- **C: a number you name**, through a `Release-As:` footer on the last arc.
- **Recommendation: A.** The stores never served 1.0.0, so 1.1.0 is the first 1.x they serve; a major would announce a break against a version nobody installed from a store.
- **Decided, P86-22:** "the version number: **option A**. 1.1.0." The page also asked about the published `v1.0.0` GitHub release, which no ask here covers; **P86-23:** "the v1.0.0 GitHub release: **option A**. A one-line notice at the top of its notes." (the orchestrator's step, no arc's.)

## OA-10. Staying unlocked when the wallet's background restarts

**Flow:** F6. **Arc:** A3, if you pick B.

**Decided, P86-10:** "strict security mode for passkey profiles: **option B**. Passkey profiles follow Strict security mode, with the reworded texts."

**Today.** The browser stops the wallet's background when it is idle and starts it again on the next use. A password profile with "Strict security mode" off stays unlocked through that until its auto-lock time; with it on (the default) it asks for the password again. A passkey profile always asks again. After the browser itself restarts, every profile asks again, in either mode, so today's confirmation text ("Skip password re-entry across browser restarts.") describes the background, not the browser. Settings → Lock hides the toggle for passkey profiles.

- **A: keep today's behaviour and text.**
- **B: passkey profiles follow Strict security mode.** The toggle shows for them too, with the description "More secure, asks you to unlock more often. Recommended." (today: "More secure, asks for your password more often. Recommended."). With it on, nothing changes. With it off, a passkey profile stays unlocked through background restarts until its auto-lock time, as a password profile does; a browser restart still asks. Turning it off shows today's confirmation, reworded for both methods: "Disable strict security?" / "Stay unlocked when Nulo restarts in the background, until auto-lock. Less secure. Anyone who can read browser data can unlock the wallet without your password or passkey."
- **Recommendation: B.** It is what "the passkey takes the password's place" means, the default stays strict, and the confirmation stops naming browser restarts.

## OA-11. Legal documents and the store's data list

**Arc:** A4. Legal copy is yours to sign; drafts below.

**Decided, P86-16:** "Terms 1.2 and Privacy 1.2.6: **approved as drafted**." (OA-5 C holds, so § 5.4 and the listing take the "Nulo wallet" wording.)

**Version rule.** A material change is a minor version in both the document and `@nulo/legal`, with a "changes" list that the re-acceptance sheet shows; a patch never asks again. The Privacy Policy never blocks. Terms 1.1 takes effect on 26 October 2026.

- **Terms: 1.2, material.** Everyone accepts again, with the changes list: "Passkey profiles now have a recovery phrase." · "A full backup of a passkey profile is always protected with a file password."
  - § 3, last paragraph: "Before accepting, review the network, security and recovery risks in §§ 4–5." (the sentence about recovery options differing goes).
  - § 4.1, replaced: "**4.1 How your keys are protected.** Every profile has a recovery phrase, and the accounts in it come from that phrase. A password or a passkey unlocks the profile on your device. Separately imported accounts may use signing keys that do not come from the recovery phrase."
  - § 4.2: "A password-profile recovery phrase" becomes "A recovery phrase".
  - § 4.3, replaced: "**4.3 A passkey unlocks; it does not restore.** A passkey unlocks your profile on the device where you set it up. It does not bring a profile back by itself: on a new device, or if the passkey is lost, you restore with the recovery phrase or a full backup and choose how to unlock again. A passkey profile made with a version before 1.1 cannot be opened in this version." (The version follows OA-9.)
  - Line 198: "A recovery phrase alone does not restore separately imported keys or all local application data, and cannot repair an incompatible or unavailable network."
  - Line 502: "…and passkey backups still require the original credential for recovery" goes.
  - Risk point 2 on the acceptance sheet: "Lose what protects your wallet and your money is gone." / "Permanently. There is no reset and no support ticket. Your recovery phrase or a full backup is the only way back."
- **Privacy: 1.2.6, patch.**
  - § 3 table: the "Password-profile recovery entropy and master secret" row becomes "Recovery phrase and the keys it produces · Extension local storage · Encrypted under a key made from your password or your passkey"; the "Passkey profile" row becomes "Passkey profile · The credential identifier and a random value the passkey needs, in extension local storage · Opens nothing on its own; used with your passkey to unlock the profile".
  - § 9: "For passkey-profile full backups, you choose a file-encryption password." stays; "A passkey-profile backup still requires the original passkey credential for restoration, even when the file is encrypted." becomes "A passkey-profile backup is always encrypted with the password you choose, and restores with that password alone."
  - § 5.4, its last-but-one paragraph: "Your browser and selected authenticator process the credential identifier, a random identifier Nulo generates for the passkey, and the credential label "Nulo wallet"." (under OA-5 B or C; under A: "…and a credential label containing a short identifier and a normalised form of your profile name."). The domain, the "does not fetch" paragraph and the rest of § 5.4 stay.
- **Store data list** (`apps/extension/store/listing.md`):
  - The "Passkey credential id and sealed key material" row becomes "Passkey credential id and the random value it is used with · Extension local storage · No · none" (A2 makes backups carry neither; A4 checks it against the export code).
  - The label row becomes "Passkey label ("Nulo wallet")" under OA-5 B or C.
  - The Firefox declaration note (lines 207-209): "for passkey profiles the label "Nulo wallet" and a random identifier are handed to the browser's passkey interface" under OA-5 B or C; under A, the profile-name wording stays with the line reference updated.
- **Recommendation:** these drafts, Terms 1.2 material and Privacy 1.2.6.

## OA-12. Sentences the change makes untrue

**Arc:** A2. Each is a word swap; the recommendation is the new text.

**Decided, P86-15:** "the word swaps: **approved as drafted**." (the optional delete-page footer included.)

| Surface | Today | Recommended |
|---|---|---|
| Update failure (`MigrationBarrier`) | "Your funds are safe. Your secret phrase still recovers your accounts. It does not recover imported accounts or passkey profiles. Keep the extension installed. A later update may be able to repair this." | "Your funds are safe. Your recovery phrase still recovers your accounts. It does not recover imported accounts. Keep the extension installed. A later update may be able to repair this." |
| Lock screen, "Delete profile" tooltip, passkey profile | "Forgot your password? Delete this profile and re-import it with your recovery phrase." | "Lost your passkey? Delete this profile and re-import it with your recovery phrase." |
| "Lost your password?" popup, passkey profile | Title "Lost your password?" / "Password recovery is not possible. Delete this profile, then re-import it with its recovery phrase." | Title "Lost your passkey?" / "A lost passkey can't be recovered. Delete this profile, then re-import it with its recovery phrase." (the imported-accounts warning stays) |
| Passkey import notices ("Passkey already in use", "Couldn't import the passkey") | shown on Passkey import | gone with the "Passkey" row (OA-2) |
| Passkey window, "This passkey already has a profile in this wallet…" | shown when a discovered passkey already has a profile | gone (A2); under OA-5 C sharing is allowed |
| Backup made by an old passkey profile ("Backup cannot be restored" / "This passkey backup is too old or was changed. Choose Passkey to restore your wallet, then add your contacts and imported accounts again.") | shown on such a file | replaced by the OA-7 refusal |
| Delete page footer (`/popup/settings/security/reset`), every profile | "You will be able to recover the accounts derived from your recovery phrase later if you have saved it" | optional: "You will be able to recover the accounts created from your recovery phrase later if you have saved it" |
| Onboarding import subtitle | "Restore from a recovery phrase, passkey, or full backup." | per OA-2 ("Restore from a recovery phrase or a full backup." under A or C) |

## A4 asks (after the signed page)

A4 applied the signed text of OA-8 and OA-11 word for word. Where the documents still said something the wallet does not do, it wrote the shortest true sentence and lists it here; where signed text and the code disagree, it kept the signed text and asks. Each is one edit either way.

- **A4-1, the store data list (`apps/extension/store/listing.md`, the credential-id row). Kept as signed: "Passkey credential id and the random value it is used with · Extension local storage · No · —".** Both reviews found that every passkey prompt hands the credential id and the profile's random value to the browser and the user's authenticator, which can be a phone or a synced provider, and that the next row counts that same hand-off as "Yes". Neither value is in a backup or an account file, which is what the draft checked. The final review found the same gap in privacy § 5.4, which lists the credential id, a random identifier and the label but not the profile's random value; one answer covers both. **Recommendation:** "Passkey credential id and the random value it is used with · Extension local storage · Only to the browser and the user's authenticator, during a passkey prompt; never in a backup or an account file · The browser and the user's authenticator". **Decided, 2026-10-26 (owner, #1152):** "A4-1: **apply** the recommendation (the row text from the asks file; the profile's random value added to Privacy § 5.4; a privacy patch bump or an in-place edit of the unreleased 1.2.6 per `packages/legal/README.md`). Lands on #1142's branch." Built in #1142: this row, and § 5.4 now lists the profile's random value, an in-place edit of the unpublished 1.2.6.
- **A4-2, privacy § 9, written:** "For password-profile full backups, file encryption uses the profile password entered during export." (was "optional file encryption"). Every full backup leaves only encrypted.
- **A4-3, privacy § 3, the session row, written:** "…disabling it permits a locally stored credential capable of restoring the profile's session" (was "the password-profile session"). True once A3 lets passkey profiles follow Strict security mode (P86-10).
- **A4-4, the README banner, written:** "Your recovery phrase or a full backup is the only way to restore a lost profile." (was "Your recovery phrase, your passkey or a full backup…"). A passkey no longer restores a profile.
- **A4-5, the version-history rows, written.** Terms 1.2: "Passkey profiles now have a recovery phrase. A full backup of a passkey profile is always protected with a file password." (the signed changes list). Privacy 1.2.6: "Passkey profiles have a recovery phrase, and a passkey-profile backup restores with its file password alone (§§ 3, 5.4, 9)." Settings → About shows only "Privacy Policy updated" for it.
- **Decided, 2026-10-26 (owner, #1152):** "A4-2 to A4-5: **approved as written**."
- **A4-6, the Chrome privacy form (not changed).** Its "Data usage" still names the passkey label under *Authentication information* and *Personally identifiable information*. The label is now the fixed "Nulo wallet", so the PII entry over-declares. **Recommendation:** drop "; the passkey label above" from the PII line; leave the rest. **Decided, 2026-10-26 (owner, #1152):** "A4-6: **keep** the Chrome privacy form's PII entry, reworded: the passkey's name now carries the profile name the person typed (the owner's 2026-10-26 naming call, on #1127). Lands on #1142's branch." Built in #1142.

#1152's other items, asked from A2 and A3:

1. The reveal's failure toast, "Couldn't open the recovery phrase. Try again." **Decided, 2026-10-26 (owner, #1152):** approved as it reads.
2. `SECURITY.md` § Passkey RP ID. **Decided, 2026-10-26 (owner, #1152):** approved as it reads.
3. The settings hub's Lock row. **Decided, 2026-10-26 (owner, #1152):** "Auto-lock, strict mode" for every profile. Built by the UX follow-up PR on `dev`, `fix(ui): name the network alpha v6 and tidy the reveal and unlock-method flows`.
4. The passkey → password "New Password" step, "Wrong password" on Continue, and the account file's made-file state. **Decided, 2026-10-26 (owner, #1152):** approved as built, after seeing the pictures.
5. A profile that cannot change its unlock method. **Decided, 2026-10-26 (owner, #1152):** "This profile can't change its unlock method." Built by the same UX follow-up PR.
