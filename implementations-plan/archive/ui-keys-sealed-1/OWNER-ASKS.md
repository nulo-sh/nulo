# ui-keys-sealed-1: owner asks

## OA-1: which account a profile opens on after a profile switch

**Surface:** the account the popup selects when it opens a profile (Home's header, and every screen that acts for the selected account).

**Today:** the wallet keeps one "last selected account" for the whole browser, in plaintext storage. Each profile's popup selects that account if the profile holds it, else the profile's first account, and then writes its own choice over it.

**Why it cannot stay exactly as it is once sealed:** a sealed value opens only for the profile that wrote it. Two profiles can hold the same account: a recovery phrase imported twice (the wallet warns, and the person confirms), or one external account imported into both. Today profile A selects that shared account, the person switches to profile B, and B opens on it too. Sealed, B cannot read A's choice.

| Option | What the person sees |
|---|---|
| **A. One last selection, as today** (recommended) | Every case looks as today except two profiles sharing an account: A selects the shared account, a switch to B opens B on its own first account. |
| B. Each profile remembers its own | Every profile reopens on the account it last selected. Example: A selects account 2, a switch to B and back opens A on account 2 (today: account 1). A change for every person with two profiles. |
| C. Keep the selected account unsealed | Nothing changes on screen. The last selected account's address stays readable in storage, the one address #1062 is about; pins and fee picks are still sealed. |

**Also changed with A or B (known limit KL-1, part of this sign-off):** when a dApp window's approval names another account, the wallet switches to that account as the window closes, unless a send for that window's account and network is starting. Today a send starting up to the instant of the switch's write stops it; with A or B, one starting after the window has asked for the switch no longer does (usually milliseconds, longer if the window must wait for the wallet's background to answer), so the next popup opens on the dApp's account. The send itself and its account are unaffected, and an open popup is still never moved during a send. With C this does not change.

**What ships now:** nothing that depends on it. The PR waits for this answer before it merges; with C, the arc is built as its C variant (plan § Delivery), without the selected account's part.

## OA-2: the privacy policy's one-line change note (1.2.4)

**Surface:** Privacy Policy § 3 and its version history; Settings → About shows the privacy-update notice with this line, as it does for every privacy version.

**Draft (`packages/legal/src/manifest.ts` `changes`, and the history row):** "Pinned tokens, fee-payer choices and the last-selected account are now stored encrypted too."

**§ 3's exception paragraph, after:** "A profile's data is converted to this form the first time it is unlocked after the update. Exceptions: profile names; a profile not yet unlocked since the update; older transaction entries the wallet cannot attribute to one profile; and records kept while a deletion, a network reset or an account-integrity block is in progress." With OA-1 C, "the last-selected account" stays in the exception list and leaves the sentence.

A patch bump (`material: false`), as the owner chose for 1.2.3 (P70-07 A): protection only improves and nothing new is collected, so nobody is asked to accept again.

**What ships now:** the draft, in the PR; it does not merge before the owner's recorded sign-off of the sentence (edited or as is), quoted in the PR body.
