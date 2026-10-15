# Owner asks: send-fees-ux

Five issues. Two carry signed words and ship in full: #316 and #340 (decision page 18, P18-09 A and P18-11 A). Four calls are open. Each has a "what ships now" line, which is what the arc builds if the ask is still open when its PR opens. An answer that lands before then ships with the arc.

## OA-1. #503: the app-set fee row in the approval window

**Surface:** the approval window (`execute`), the fee row of an operation whose fee the app pays (for example the faucet drip).

**Today:** the row reads "✓ Fee payment method set by Swap" while the fee is estimated. When the estimate lands, the legend is replaced by "✓ Fee up to 0.016 FJ, includes a 0.004 FJ priority fee the app asked for". If the app set its own fee figure, Confirm stays disabled until then, and nothing shows that a wait is running. A failed estimate leaves the legend and no figure.

| Option | While the fee is estimated | After |
|---|---|---|
| **A. As is** | "Fee payment method set by Swap", no sign of a wait | the legend is replaced by "Fee up to …" |
| **B. Keep the legend, show the wait** | line 1: "Fee payment method set by Swap"; line 2: "Fee up to" and the fee card's grey loading bar in the figure's place | line 1 stays; line 2: "Fee up to 0.016 FJ, includes a …" |
| **C. B with words** | line 2: "Estimating fee…" (new words) | as B |

With B or C, a failed estimate drops line 2 and keeps line 1, as today. An operation the wallet never estimates (an app's own entrypoint) shows line 1 alone. With B, a screen reader is told the row is busy; no new words are read. One consequence: the app's name stays on screen when Confirm enables. An app that names itself "Swap · Fee up to 0.0001 FJ" would then read beside the true figure. Today that name leaves when the figure lands.

**Recommendation: B.** It uses a loading look the fee card already has and adds no new words. It keeps the one line that stays true.

**What ships now: A.**

## OA-2. #504: Send's fee method field while the page reads balances

**Surface:** the Send page, the fee method field ("Fee · …" trigger) while the page opens.

**Today**, when no method was picked by hand on this side (a hand-picked method already shows at once): the field reads "Select method", in placeholder grey, until a fresh balance read lands. The rows under it (Available, You pay) appear only then. The arc measures where that time goes (an idle open, and an open while another send proves) and posts the numbers on #504. The code suggests that, while a send proves, the read can wait for the proof. Each attempt stops at 20 seconds, and a read can first wait out an earlier one, so the wait can pass 40 seconds before the card says "Couldn't load fee data".

| Option | What the field shows while the read runs |
|---|---|
| **A. As is** | "Select method" |
| **B. A loading bar** | the grey loading bar the method menu's rows already show while they check ("Checking" for a screen reader) |
| **C. B, plus a guess** | when the wallet has read this account's balances since it was last unlocked (on Home or an earlier Send): the method it expects, as soon as the stored sponsors and those balances are read. The field changes once if the fresh read picks another. On a private send whose balance changed since the last read, it can show "Public Fee Juice" for a moment, without its "names your address" tag, before "Private Fee Juice". With nothing to guess from, B. |
| **D. B, plus memory** | the last method shown, per profile, account and network, even after a restart. This stores a new item for each profile on the device. |

None of these makes the read itself faster. If the numbers show the wait behind a proof, its fix is a separate change.

**Recommendation: B.** "Select method" reads as a choice not yet made; the loading bar says a check is running. C saves the wait only on a repeat open and can show a wrong method for a moment. D adds stored data.

**What ships now: A.**

## OA-3. #505: queue a send that Nulo's sponsor pays

**Surface:** the Send page while an earlier send of the account is proving or waiting for its block, with Nulo's sponsor as the fee method.

**This reopens a signed call.** On 2026-10-14 (page 9, OA-10) you chose A for exactly this case: "the fee row reads 'Queued behind your previous send' and Send stays disabled until the estimate lands." The wallet runs no estimate while the earlier send holds the line. So the button stays disabled until that send has gone out, or, when both spend the same balance, until it is in a block. #505 reports that rule as a bug. The queue (#217) was built only for a fee the person pays, because its cap protects the person's own money.

| Option | Fee row | Button | Review sheet's fee line (sends that review) |
|---|---|---|---|
| **A. As signed** | "You pay" / "Queued behind your previous send" | "Confirm Transaction", disabled | not reached |
| **B. Queue it** | "You pay" / "Nothing" / "Goes out after your earlier send." (new line) | "Queue send" (the signed label), enabled | "Fee · Goes out after your earlier send." with "paid by the sponsor"; button "Queue send" |

With B, the send waits behind the earlier one and goes out without asking again. There is no cap, because the person pays nothing. Two cases change where a failure shows:

- If Nulo's sponsor cannot pay when the send's turn comes, the send can be proved and then refused by the network. Home's row shows it, and the page before the press does not.
- If Nulo's sponsor row is changed in Settings while the send waits, the wallet stops the send before building it. Its row reads "Stopped before broadcast" (existing words). Without this rule, the send would go out through a contract the wallet does not vouch for.

A sponsor you added yourself ("You pay: —") keeps A either way.

**Recommendation: B.** Nothing of the person's is at risk with the stop rule in place, and the wallet already sends a queued send with no cap without asking again.

**What ships now: A.**

## OA-4. #316: an edit that changes only the letter case of the row's own address

**Surface:** Settings → FPCs → Edit FPC, the address field.

**Today:** typing the row's own address in another letter case enables Save. Saving it stores the new case. The wallet compares sponsor addresses exactly, so it then no longer recognises the row as Nulo's sponsor and can add Nulo's sponsor again: the two rows #316 describes. P18-09 A names another row's address, not this case.

| Option | What a person sees |
|---|---|
| **A. As today** | Save enabled; saving can leave two Nulo sponsor rows on Send |
| **B. No change** | the edit counts as no change: Save stays disabled, no warning, as for an untouched form |
| **C. "Already added"** | the P18-09 warning beside the field, Save disabled |

**Recommendation: B.** The address is the same contract; a warning that it is "already added" would point at the row being edited.

**What ships now: A.**
