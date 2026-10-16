# Owner asks: harden-security-fixes-2

Decision page 22 (2026-10-16) set every item's direction: P22-01 A (the grant card), P22-02 B (the endpoint row, as is), P22-03 C (the passkey backup) and P22-04 A (the fee after approval). The asks below are the details those picks leave open. Each has the planner's recommendation and a "what ships now" line: what the arc builds if the ask is still open when its PR opens. Arc 2 is the exception: it waits for OA-F1 to OA-F3, because its whole surface is the ask.

## Consequences of P22-03 C that reuse existing words (no decision needed unless you object)

- **Surface:** Settings → Import, and onboarding's import, with a passkey backup.
- A passkey backup whose contents do not match its passkey shows today's refusal, "Backup Integrity Check Failed" / "The backup file appears to be corrupted or has been tampered with. Please ensure you have the correct backup file.", after the passkey prompt.
- A passkey backup exported before this change carries no check, so it shows today's "Incompatible backup" / "This backup was created by an incompatible wallet version and cannot be imported. Re-export a backup from a current version of the wallet.", before any prompt. Re-exporting from the updated wallet fixes it. Password backups are not affected.

## A consequence of P22-01 A as signed (no decision needed unless you object)

- **Surface:** the approval window for a public grant ("Authorize public spend"), its "Arguments" rows.
- The rows print every value whole, as `o-grant-a` draws it: full 66-character addresses wrapping, with no contact or account name in their place, and whole fields, strings and lists. Every other card keeps its trimmed rows.

## OA-B1. Which restored tokens ask on their first incoming note

**Surface:** after a full-backup import, the first-receipt prompt ("Allow" / "Reject") for each token the backup carried.

**Today:** every restored token is trusted, so its incoming notes show in Activity at once. P22-03 C says "no auto-trust".

| Option | After a restore |
|---|---|
| **A. Every restored token asks** | the first incoming note of each restored token, Test USDC and the other default tokens included, waits for Allow |
| **B. Default tokens stay trusted** | a restored token that the signed token list carries for that network, with the list's decimals and symbol, stays trusted as on a fresh install; every other restored token asks |

**Recommendation: B.** A fresh install trusts the default tokens without asking, because the signed list vouches for them; asking only after a restore would read as a regression. The tokens the person added by hand still ask.

**What ships now: A**, the decision's words.

## OA-B2. The restore's last step reads each token from the network

**Surface:** the import progress, its last stage, after the profile is created.

The arc re-reads each restored token's name, symbol and decimals from the network and keeps the network's values. Each read is a network round trip plus a short simulation, a few seconds per token. The reads share the time limit of the step that already registers the accounts' contracts; a token the network does not answer in that time keeps the backup's values, and the import still finishes. The wallet's other windows can show the restored profile from the start of this step, so for those seconds they may show a token with the backup's values; an open page, Send included, reads the token again the moment the network's values land.

| Option | What a person sees |
|---|---|
| **A. During the import** | the last stage takes longer by the reads; the import screen finishes with the network's values in place |
| **B. After the import** | the import ends as fast as today; for a few more seconds the wallet may show and send with the backup's values |

**Recommendation: A.** A send started from the finished import uses the network's decimals. The arc measures the added time with the default token list and reports it in the PR.

**What ships now: A.**

## OA-F1. Where the wallet asks again when a dApp send's fee rises

**Surface:** a dApp send after Confirm. The wallet builds the transaction again before proving it; when the built fee is higher than the figure the approval window showed, it holds the send and asks. The dApp keeps waiting. "Send for" accepts the new figure; closing or rejecting cancels the send, and the dApp receives "Transaction cancelled by user". Unanswered after 60 minutes, the send is cancelled, as Send's own re-ask is.

| Option | Where | What it shows | Buttons |
|---|---|---|---|
| **A. Home, as Send does** | the wallet's Home, the send's row in Recent activity | row status "Fee went up. Review" (Send's words); tapping opens a sheet: the app's name and site, the operation's title (for example "Send transaction"), "Fee is now 0.021 FJ, above the 0.016 FJ you approved." | "Send for 0.021 FJ" (arms after a short pause, as Send's); × closes the sheet and leaves the send waiting; the row's cancel cancels it |
| **B. A new approval window** | a new window opens on its own, like the first one | the same header and operation card as the first window, read-only; the fee block reads "Fee went up" over "Was 0.016 FJ · Now 0.021 FJ", the fee method and speed shown, not editable | "Reject" cancels the send; "Send for 0.021 FJ" sends |
| **C. The window stays open** | the first window, after Confirm | Confirm reads "Checking fee…" until the build passes; within the figure the window closes as today; above it the fee block reads "Fee went up" over "Was 0.016 FJ · Now 0.021 FJ" | "Reject" cancels the send; "Send for 0.021 FJ" sends |

What each one adds:

- **A** reuses Send's row, sheet and accept call; the Home row, the sheet and their checks learn a dApp send (today they read only Send's). The smallest build. The person sees the question only when they open the wallet; until then the dApp waits, up to the 60 minutes.
- **B** adds a window the wallet opens by itself after approval. The worker keeps what the window needs (the app, the operation's title, the two figures) beside the held send, in memory, until the answer, the deadline or a restart. New failure cases, each ending as a cancel: the window cannot open, the person closes it, the worker restarts.
- **C** keeps every approval window open after Confirm until the build is checked. That wait includes any earlier sends of the account and the build itself, so it can last minutes, also when the fee did not rise.

**Recommendation: B.** It is what P22-04's note says ("the approval window reopens on the fee block"), and it reaches the person where the dApp sent them, which A does not. A is the smaller build if a Home-only question is enough. C slows every Confirm to protect a rare case.

**What ships now:** nothing. Arc 2 starts after this answer.

## OA-F2. Which sends carry the figure, and a Confirm before the figure shows

**Surface:** the approval window's fee block and Confirm.

**Part 1: which payers.** The window shows a figure for every payer, but only some of them charge the person.

| Option | The ceiling applies to |
|---|---|
| **A. When the person pays** | the account's Fee Juice (with or without a claim, also when the app's own request claims it to the account) and Private Fee Juice, as Send's re-ask |
| **B. Every shown figure** | A, plus Nulo's sponsor (shown struck through, "Nothing") and an app's own fee contract ("Fee up to …") |

**Recommendation: A.** Nulo's sponsor pays from its own balance. An app's fee contract decides by itself what it charges; the wallet cannot tell from the figure what leaves the person's balance, so a question about it would claim more than the wallet knows.

**Part 2: Confirm before the figure lands.** Today the window enables Confirm before a wallet-chosen fee's estimate lands, so a quick press approves no figure.

| Option | A press before the figure |
|---|---|
| **A. As today** | the send goes out with whatever fee the build has, no ask. A press before the figure is then not bound by any figure, and the plan records that as a known limit |
| **B. Ask after** | the send is held and asked about, as in OA-F1, with "Fee is 0.016 FJ" (no "was") |
| **C. Confirm waits for the figure** | Confirm stays disabled until the figure lands, as it already does when the app sets its own fee; after a failed estimate (the toast "Couldn't estimate fee. Try again.") it stays disabled until a new estimate lands, for example after changing the fee method or speed |

**Recommendation: C.** Every approval then carries a figure, the rule already exists for app-set fees, and no question arrives after the press. Only B or C makes P22-04 hold for every press.

**What ships now:** nothing. Arc 2 starts after these answers.

## OA-F3. How the question prints the two figures

**Surface:** the question OA-F1 picks, its figures.

The wallet asks whenever the new fee is higher than the shown one, by any amount. Fees print at six decimals, so a rise smaller than 0.000001 FJ prints two equal figures ("Was 0.016 FJ · Now 0.016 FJ").

| Option | A rise from 0.0160000 to 0.0160004 FJ prints |
|---|---|
| **A. Six decimals** | "Was 0.016 FJ · Now 0.016 FJ" |
| **B. As many decimals as it takes** | "Was 0.016 FJ · Now 0.0160004 FJ": the new figure gets the decimals that show the rise, up to 18 |
| **C. A tolerance** | no question below a rise you name (for example 0.000001 FJ); the wallet then lets that much through without asking |

**Recommendation: B.** The question always shows why it was asked, and nothing is let through unasked.

**What ships now:** nothing. Arc 2 starts after this answer.

## OA-G1. The words of a grant the wallet cannot read

**Surface:** the approval window for a public grant ("Authorize public spend") whose arguments do not decode against the contract.

P22-01 A says the request "is refused with the window's existing error row". The row needs a title.

| Option | Error row | Card |
|---|---|---|
| **A. The card's own words** | "Can't read the arguments", the tooltip the card's notice line | the card's existing warning and notice under "Arguments" |
| **B. New words** | for example "This request can't be read. Reject it." | as A |

Confirm is disabled either way; Reject works.

**Recommendation: A.** No new copy; the row and the card say the same thing.

**What ships now: A.**

## A consequence of OA-F2 A: an app's own payment through Private Fee Juice (no decision needed unless you object)

- **Surface:** a dApp send whose request carries its own fee payment ("Fee up to …") naming the Private Fee Juice contract as payer, as the playground's PrivateFPC routes do.
- That payment charges the account's own Private Fee Juice, so it carries the figure as Private Fee Juice does: Confirm waits for the estimate (and shows "Couldn't estimate fee. Try again." when it fails), and a rise past OA-F3's rule asks in the window, whose fee block reads "Private Fee Juice" with no Available or Priority row, as for an app's claim. An app's own fee contract keeps today's behaviour.
