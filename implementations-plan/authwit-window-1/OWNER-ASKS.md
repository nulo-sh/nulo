# authwit-window-1: owner asks

The owner's words of 2026-11-03 sign off the scope (#1639 § Decision). Two asks decide what a person reads; the PR builds the recommendation for each and waits for the pick before it merges. The third is a question about adding a record, not built. Captures (light, Chrome, the two-account fixture: B sends 1 USDC of A's to X) land in `screenshots/` during the arc, one per rendering; the text mockups below match them.

## OA-1. The line for an authorization another account already gave (execute window, `SendTxSummary.vue`)

Where: the Authorizations section under "What this does", and "Show all details", on every route a dApp send takes (the app paying its own fee included). The fee re-ask window shows the same card. `<A>` is the name the wallet shows for that address everywhere else: a contact's name if the person saved the address as a contact, else the account's own name; a tap shows the address.

What the line can vouch for: the transaction asks for an authorization on behalf of A, and the app attached a witness for it. When the contract checks it, A's own account checks that witness during the wallet's simulation, so on an app-paid or standard send the estimate fails if the witness is not A's. A contract that names A but never checks it would make the line say more than happened, never less.

- **A. A line under the row (recommended).**
  ```
  AUTHORIZATIONS 1
  • Lets <B> move 1 USDC from <A> to 0x1e25…6fa5
    Already authorized by <A>.
  ```
  Details: its own group, "Authorizations your other accounts already gave", with Consumer, Authorizes, Function, Authorized by.
- **B. Its own section.**
  ```
  AUTHORIZATIONS 1          (only when the wallet signs one too)
  ALREADY AUTHORIZED 1
  • <A>: lets <B> move 1 USDC from <A> to 0x1e25…6fa5
  ```
- **C. A lead-in on the same line.**
  ```
  AUTHORIZATIONS 1
  • Already authorized by <A>: lets <B> move 1 USDC from <A> to 0x1e25…6fa5
  ```
- **Name or short address**: the name (recommended) reads as the person's own account and is never set by the app; the short address alone (`0x5e9d…a11c`) is exact but asks the person to recognise it.

- **Wording of the line**: "Already authorized by <A>." (the lane's words, recommended: short, and true whenever the contract checks); or "Uses <A>'s authorization, which the app attached." (exact about what the wallet saw, longer).

Recommendation: A, with the name and the lane's words. The row keeps the words of the person's own rows, so one reading covers both; the line adds only who authorized it; no new section to scan. B separates "the wallet signs" from "already given" more strongly, at one more heading. C fits on one line but makes the sentence longer than its neighbours.

What ships now: A with the name.

## OA-2. The reason when the app did not attach that authorization (execute window, refusal block)

Today the window shows the toast "Couldn't estimate fee. Try again." and the send cannot go out. After: the refusal block every refused request uses, title "Nulo won't send this", then the reason.

- **A (recommended).** "This transaction uses an authorization from another of your accounts, and the app did not include it. Nulo signs only for the account that sends, so it can't be sent. Reject tells the app."
- **B.** "This transaction needs another of your accounts to authorize it first. The app did not include that authorization, so it can't be sent. Reject tells the app."
- Naming the account inside the reason is left out: it needs the account carried on the refusal across the worker, and the person can see which accounts the app is connected to.

What ships now: A.

## OA-3. When and for which app the other account signed

Asked by the lane: should the line also say when A signed and for which app? No store holds that today. The authwit index lists public authorizations granted on chain, with no app and no time; a private authorization signed in a window or without asking is handed to the app and not recorded. Adding the line means a new record of every private authorization the wallet signs (per profile, sealed), plus its retention and deletion rules. The panel's view: not in this lane. It is persistent state, which is the owner's call, and it could never cover a witness signed outside this wallet.

What ships now: nothing. Say so if you want it; it would be its own plan.

## OA-4. The sending account's own attached authorization on an app-paid send

When the app pays its own fee, the wallet signs no authorization in that send, and today the window lists none. If the app attached an authorization the sending account gave earlier (with a window or without asking), the send uses it and the window does not name it. On every other route the wallet lists such a request as one it signs. This lane names only another account's authorization (its scope); naming the sender's own on an app-paid send would add the same line, "Already authorized by <this account>.", to app-paid windows.

What ships now: not named, as today.

## OA-5. Where the new refusal shows after Reject: History, and the app's error

After Reject, the request ends as the wallet's refusal, as every refused request does.
- **History** reads it as every scope refusal reads: "Not allowed. The app asked for more than you allowed. Nothing was sent." (today, for this send, "You rejected"). The alternative is its own row text, as the authorization-registry refusal has: for example "Not allowed. The app left out another account's authorization. Nothing was sent."
- **The app's error** is the scope refusal's public text: "This request is outside the permissions you gave this app." (code 4100). The alternative is its own text, as two other refusals have: for example "This transaction uses another account's authorization. Attach its witness." A new text is a new public contract for apps.

What ships now: both stay the scope refusal's (no new text). Recommendation: the same; give it its own text only if apps or people report the generic one misleads.
