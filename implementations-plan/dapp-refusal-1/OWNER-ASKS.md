# dapp-refusal-1: owner asks

The lane has no no-ask budget: its whole surface is OA-1. The arc is built only after OA-1 is signed; until then today's estimate failure ships.

## OA-1: what the execute window does when the wallet refuses the request while it estimates

- **Surface**: the execute window of a dApp send the wallet will never allow, found while the window estimates the fee (a standard send) or previews authorizations (a send with no sender account). Two checks refuse there: a call whose name does not match the function it runs, and a transaction that asks the account to authorize the authorization registry (#716). Also: History's row for that send, and what the dApp reads.
- **A, today** (what ships until signed). Pictures, call-binding refusal, Chrome, 400 px:
  - `screenshots/oa1/p56-758-a-standard-light.png`, `-dark.png`: a standard send. The toast "Couldn't estimate fee. Try again.". The fee shows "Sponsored", so Confirm stays on. When the person pays the fee themselves, Confirm is off instead (by code; the test account holds no Fee Juice to show it).
  - `screenshots/oa1/p56-758-a-nosender-light.png`, `-dark.png`: a send with no sender account. The toast "Couldn't preview authorizations. Try again.", and Confirm on.
  - Then, Reject: the dApp reads "User rejected"; History reads "Transaction failed" and, in the detail, "Popup closed early" (`p56-758-a-standard-history-*.png`, `p56-758-a-standard-detail-*.png`). That label is wrong for any Reject; it is #828, outside this ask.
  - Or Confirm: the dApp reads the scope refusal; History reads "Not allowed" / "The app asked for more than you allowed. Nothing was sent." (`p56-758-a-nosender-history-*.png`).
- **B2, the window explains** (recommended). Pictures (labelled mockups drawn over the live window): `screenshots/oa1/p56-758-b-standard-light.png`, `-dark.png`, `p56-758-b-nosender-light.png`, `-dark.png`.
  - As soon as the wallet refuses, the window covers the request with the notice the window already uses for a cancelled request. The line is History's own: "Not allowed. The app asked for more than you allowed. Nothing was sent." For the registry check: "Not allowed. Apps cannot change your public authorizations. Nothing was sent." One button, OK, closes the window. Confirm is off; there is no toast.
  - OK ends the request as a refusal: the dApp reads the scope refusal (for the registry check, its own text), and History reads "Not allowed", titled by the function the call really runs (as a refusal at Confirm is today), or "Transaction" when the refusal names no function. In developer mode the row shows the refusal's message but no raw error block, as every request refused before it ran does today.
  - Any other end (closing the window, a lock, the 10-minute limit) ends the request exactly as it would end a window the wallet did not refuse: History reads "Popup closed early" (#828), and the dApp learns nothing about the refusal. Answering the dApp without your OK would let its contract learn one bit of your private data per window, without you doing anything (plan.md, S1).
- **B1, the window closes itself**: as soon as the wallet refuses, the window closes and the dApp reads the refusal at once; History reads "Not allowed". No new line. Against: the window vanishes a few seconds after it opened, with no reason shown, and the dApp hears at once (S1).
- **Keep A**: no arc; #758 closes as not planned.
- **Wording, if B2**: (i) History's two sentences, as above; or (ii) a line of your own. Recommendation: (i). The window and History cannot disagree, and both lines already ship.
- **Recommendation**: B2 with (i).
