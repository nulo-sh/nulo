# authwit-copy-1: owner asks

Each ask names the surface, what a person or an app sees before and after, the options, the recommendation and what ships now. **All answered A**: decision page 115, signed 2026-11-06 14:31 UTC; OA-4 settled in chat on 2026-11-06 at about 17:45 UTC. Each answer is quoted under its ask. Captures (Chrome, light, each with a `-dark` twin) travel with the orchestrator's decision page; below they are named by file, and the five that decide something are in [`screenshots/`](screenshots/). They come from real sends on a local network: the playground's Crowdfunding donation paid by the app's sponsor with the sending account's own witness (#1656), and `tx-sendTx-fields`'s send that leaves out another account's witness (#1657).

## OA-1. The sender's own attached authorization on an app-paid send (execute window): answered

- **P115-01 (the line): A, as built:** `"AUTHORIZATIONS 1 · Lets <caller> move 1 USDC from <Main> to <recipient> · Already authorized by <Main>. The name, as #1649's line for another account."`
- **P115-02 (OA-1b, its details): A, as built:** "A group of its own, "Authorizations this account already gave", with the rows Consumer, Authorizes, Function and Authorized by."

Where: the Authorizations section under "What this does", and "Show all details", on a send whose app pays its own fee and attaches a witness the sending account gave earlier. `<Main>` is the name the wallet shows for the sending account everywhere else.

- **Before.** No Authorizations section. The send uses the authorization and the window does not name it.
- **The line (the brief's direction, A).**
  ```
  AUTHORIZATIONS 1
  • Lets <caller> move 1 USDC from <Main> to <recipient>
    Already authorized by <Main>.
  ```
  Alternative B: "Already authorized by this account." (the words, not the name).
- **The details group.** A (recommended): a group of its own, "Authorizations this account already gave", with the rows Consumer, Authorizes, Function and Authorized by; the group "Authorizations your other accounts already gave" keeps its label and its rows. B: one group for both, relabelled "Authorizations your accounts already gave", which changes that label on every route.

What the line can vouch for: the transaction asks for an authorization on behalf of the sending account, and the app attached a witness with that request's hash. When the contract checks it, the account checks that witness in the wallet's simulation, and a bad one fails the estimate. A contract that names the account and never checks it would make the line say more than happened, never less; the same holds for the line #1649 shows for another account.

Also shown: an app whose fee payment spends the sender's token through the sender's own witness (a private fee payment contract) gets the same row for that payment, for example "Lets <fee contract> move <max fee> USDC from <Main> to <fee contract>" with "Already authorized by <Main>.". No playground send pays that way, so it has no capture.

Recommendation: the line A, the group A. Nothing changes on any other route.
What shipped: the line A and the group A.
Captures: before, `before-app-paid-own-at-rest.png` and `before-app-paid-own-details.png` (no Authorizations section); after, `after-app-paid-own-at-rest.png` (the line) and `after-app-paid-own-details.png` (the group). The alternatives are not rendered.

## OA-2. History, a send refused because the app left out another account's authorization: answered

- **P115-03: A, as built:** ""Not allowed" / "The app did not include an authorization from another of your accounts. Nothing was sent." Repeats the window's own words."

Where: the History row's detail (Home and History cards keep the subtitle "Not allowed").

- **Before.** "Not allowed" / "The app asked for more than you allowed. Nothing was sent."
- **A (recommended).** "Not allowed" / "The app did not include an authorization from another of your accounts. Nothing was sent." It repeats the window's own words ("an authorization from another of your accounts, and the app did not include it").
- **B (the issue's example).** "Not allowed" / "The app left out another account's authorization. Nothing was sent." Shorter; "another account's" can read as someone else's.

What shipped: A.
Captures: before, `before-unattached-history.png`; after, `unattached-history.png`. The window's refusal block, unchanged by this lane: `before-unattached-refusal.png`, `unattached-refusal.png`.

## OA-3. The app's error for that refusal (a public text apps may show or match): answered

- **P115-04: A, as built:** "Message: This transaction uses another account's authorization, and the request carries no witness for it. Attach the witness."

- **Before.** `{"code":4100,"message":"This request is outside the permissions you gave this app.","data":{"walletErrorCode":"SCOPE_VIOLATION"}}`
- **A (recommended).** Same code and `walletErrorCode`, the message "This transaction uses another account's authorization, and the request carries no witness for it. Attach the witness." It says what was missing and what to do, and names no account.
- **B (the issue's example).** Same code, the message "This transaction uses another account's authorization. Attach its witness."
- When it fires: a contract in the transaction asks for an authorization on behalf of another approved account of the session, and the request carries no witness with that request's hash. The wallet does not check who signed a witness that is attached.
- The code and `walletErrorCode` stay as the two sibling refusals keep them (the registry's and the own-account intent's): an app that matches `SCOPE_VIOLATION` still recognises the refusal. A distinct code would be a breaking change for such an app.

What shipped: A, documented in `packages/wallet-bridge/README.md` beside the sibling refusals.

## OA-4. Is Confirm held to the sender's own authorizations the window listed?: answered

- **P115-05: A.** The owner asked "wouldn't "A" be blocking our self-discovery of the needed authwits which I consider a feature?", was answered that the window's estimate is the discovery and A only moves it before the signature, and wrote: "1696 => A". Built in the same PR before merge.

Where: Confirm on an app-paid send whose app attached the sending account's own witness. Confirm rebuilds and simulates the send again. For another account's authorization it already refuses one the window did not list. For the sender's own, two paths differ:
- the estimate failed, so the window listed nothing (on this route Confirm stays live after a failed estimate, which the window treats as unknown, not a verdict);
- the estimate landed, but the rebuilt send asks for a different authorization of the sender's than the window listed (a contract whose state changed in between).

- **Today (B), the draft's state while the ask was open.** On both paths Confirm sends, and the send uses an authorization of the sender's that the window did not name.
- **A (recommended).** One rule with another account's authorization: a send never uses an authorization the window did not list. On both paths Confirm stops before anything is signed or sent; History reads "Stopped before broadcast" / "Your wallet caught this before reaching the network. Often balance, fees, or invalid call." Retrying the estimate is the way on.
- A is one line in the confirm path and its test; with B the window still names the sender's authorization whenever the estimate lands, and a later pick of B is filed as a known limit.

What shipped: A (the owner's pick); B was the draft's state while the ask was open.
