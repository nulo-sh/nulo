# consent-display-2: owner asks

Arc 1 depends on none of these: its three surfaces are the owner's picks P77-01 B, P77-04 B and P77-05 B as
pictured. OA-1 and OA-2 concern arc 2 only, which starts after PR #964 is on `dev`; its PR opens as a draft and
builds each ask's "ships now" form until the owner answers.

## OA-1: what the locked screens say about imported accounts (arc 2)

- **Surfaces.** The lock screen's "Lost your password?" popup (`p77-forgot-c`) and the Delete Profile page it opens,
  which is reachable while locked. P77-07 C adds to the popup, under its sentence, a warning glyph and "Accounts you
  imported are lost with this profile. The recovery phrase can't bring them back." P77-07 B lists the imported
  accounts on Delete Profile. Both pictures were taken on an unlocked wallet whose profile holds one imported account.
- **Why it is open.** While locked, the wallet does not enumerate the profile's networks (`getNetworks` refuses until
  the password is entered, `requireActiveProfile`), and the page makes no account read while locked. Knowing it would
  take a locked read of account rows (`getAccounts` has no session check), which the lock exists to prevent.
- **Options.**
  - **A (ships now):** the popup line shows on every profile the popup opens for, since the wallet cannot know;
    Delete Profile reached while locked shows the qualified sentence and no "Imported accounts" section; unlocked, the
    section lists them as pictured (a paused reset's journal-held imports included), and Delete waits for that read: a
    failed read refuses the delete with the page's existing "Couldn't delete profile. Try again".
  - **B:** a new locked read, so the popup line and the section appear only for a profile with imported accounts.
    It shows account names and addresses, or at least whether imports exist, to whoever holds the locked browser.
- **Recommendation.** A. The lock exists so the wallet shows nothing about the profile's accounts without the
  password; a warning about accounts a person may not have is the smaller cost.

## OA-2: where "Export first" goes (arc 2)

- **Surface.** Delete Profile's "Imported accounts" section (`p77-delete-b`), unlocked. The brief sends "Export
  first" to the account export page.
- **Why it is open.** The account export page lists only the active network's accounts and turns passkey profiles
  away (`export/account.vue` at `f55b7b4e6`; re-read after #964). An imported account on another network, or any
  imported account of a passkey profile, cannot be exported from where the button lands.
- **Options.**
  - **A (ships now):** the account export page (with `?address=` when one account is listed), on a password profile
    only; an account on another network needs a network switch first, which the page does not say.
  - **B:** the full backup page, which carries every imported account on every network and restores them, but refuses
    while a network reset is pending (`export/full.vue`), since a backup would miss the journal-held accounts: those
    stay reachable only from the account export page, on their own network.
  - **C:** A when every listed account is on the active network, B otherwise.
- **Recommendation.** B when no reset is pending, else A: the full backup covers every listed account for both
  profile kinds if the page serves them after #964, and the account export page is the one that reaches journal-held
  accounts. Re-checked against the export pages as #964 leaves them.
