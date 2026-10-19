# tx-record-1: owner asks

A1 (#820) depends on neither. A2 (#828, #821) waits for OA-2 and ships OA-1's A.

## OA-1: an app that pays its fee through your own Fee Juice

- **Surface.** The transaction page's Fee method row, for a dApp send whose app paid the fee in one of two ways that draw on your own Fee Juice: a Fee Juice claim to your account (`FeeJuicePaymentMethodWithClaim`), or the PrivateFPC's `mint_and_pay_fee` (Fee Juice claimed into your private balance, then paid privately).
- **Why it is open.** The call's table names the method for an app's pick only for `pay_fee` on the PrivateFPC and `sponsor_unconditionally` on the protocol sponsor; both cases above fall under "anything else". Today the claim reads "Public Fee Juice (with claim)" and `mint_and_pay_fee` reads "Set by {app}".
- **Options.**
  - **A (ships now): "Set by {app}" for both**, the table as written. The claim's row changes; `mint_and_pay_fee`'s stays.
  - **B: name the method, set by the app**: "Public Fee Juice (with claim), set by {app}" and "Private Fee Juice, set by {app}". The wallet's own entrypoint makes the claim, and the PrivateFPC's address proves the second, the proofs the table asks for.
- **Recommendation.** B: in both cases your own Fee Juice pays, and the wallet or the PrivateFPC's address proves it.
- **What ships now.** A, in A2. B is two lines in the label and two test rows.

## OA-2: a dApp send ended by the window, not by its Reject button

- **Surface.** The History row, the Home card and the journal page of a dApp send that ended while its approval window was open, before you approved it, in three ways: you closed the window with its X; the wallet locked (your lock, or the auto-lock); you switched profile. The app's answer is not what this ask decides; A leaves it as it is, and B and C change the button's, as they say.
- **Why it is open.** P58-02 signs "Cancelled" / "You rejected" for a send you reject. Every ending sends the window's Reject (the X through `beforeunload`, a lock or a switch through the profile watch), so the wallet cannot tell them from the button by the Reject alone. The X and the button also race the window's close: whichever reaches the wallet first settles the request. Today:
  - **The journal** reads "Transaction failed" / "Popup closed early" for all four, whichever settled first.
  - **The app** reads 4001 "User rejected" when the Reject settles first, the wallet's generic "The wallet could not process the request." when the close settles first (`error-envelope.ts:214`), and nothing at all after a profile switch, whose response is suppressed (`background.ts:963`).
  The button's own Reject can lose that race (the one #832 handles for a refused send), so classifying the Reject alone would leave the button reading "Popup closed early" whenever the close wins.
- **Options.**
  - **A (recommended): every ending reads "Cancelled" / "You rejected" / "You stopped this transaction."** The journal classifies the Reject and the close alike, so the row is the same whichever settles first. One line beside the Reject's; no new code path.
  - **B: Reject and the X read "You rejected"; a lock reads "Stopped when the wallet locked" (the label a lock already has); a profile switch keeps "Popup closed early".** The window must name how it ended and the wallet must hold that reason before the window closes, or the close wins the race and the row falls back. That is a new field on an internal call, the window waiting for the wallet to take it, and tests forcing both settlement orders. Taking the Reject also settles the app's request, so the Reject button would answer the app 4001 "User rejected" every time, where today it sometimes answers the generic error.
  - **C: only the Reject button reads "You rejected"; the X, a lock and a switch keep "Popup closed early".** Same new field and the same wait as B, for the button only, with the same change to the button's answer to the app.
- **Recommendation.** A: it is the only option the race cannot split, and it needs no new handshake. It leaves the app's answer as it is today; making that answer the same for every ending would change what the wallet promises dApps, a separate decision.
- **What ships now.** Nothing: #828 waits in A2 for this answer. A1 ships #820 alone.
