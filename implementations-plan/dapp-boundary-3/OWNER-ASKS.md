# dapp-boundary-3: owner asks

Arc 1 ships each answered ask in the form recorded under it.

## OA-1: the reason a dApp reads when it asks the wallet to write the authorization registry

**Answered 2026-10-17 (orchestrator, D-orch): b**, with the History row's own wording as well: the same code path, its own reason text and History row wording. Reason: "the planner's recommendation, no UI change beyond the lane brief's budget". The PR quotes both texts as a "what ships now" the owner can flip.

- **Surface:** the answer a dApp receives, and the History row of a refused dApp send.
- **Ships now (option a):** the existing scope refusal. The dApp reads "This request is outside the permissions you gave this app." (code 4100, `SCOPE_VIOLATION`). History reads "Not allowed" / "The app asked for more than you allowed. Nothing was sent."
- **Option b:** the same code with its own text for the dApp, for example "Apps cannot set public authorizations directly. Ask the wallet with grantPublicAuthwit." History stays as in (a). dApps may show or match the text, so it becomes a public contract.
- **Option c:** (b) with its own error code as well.
- **Option d:** (b) or (c), plus a History line of its own, for example "Not allowed" / "Apps cannot change your public authorizations. Nothing was sent."
- **Recommendation:** b. The developer is the one who can act on the reason, and existing classifiers keep working on the unchanged code. The person's row in (a) stays close to true: the app asked for something the wallet never allows. Say whether (a) already answers the pick's "with a reason".

## OA-2: dApps that pay their own fee through aztec.js's public fee payment method

**Answered 2026-10-17 (orchestrator, D-orch): a.** Reason: "the planner's recommendation, no UI change beyond the lane brief's budget".

- **Surface:** a dApp send whose fee payload, built by aztec.js, adds a registry grant for the fee contract to the dApp's own calls.
- **Ships now (option a):** refused like any registry call, before any window. The dApp can leave the fee to the wallet's fee card or use a private payment method.
- **Option b:** allow that one call when it belongs to the fee payload. The wallet would classify the payload by its fee contract and the fee call after it. The grant's hash cannot be read, so the allowance trusts the payload's shape.
- **Recommendation:** a. It is the pick's text, and no dApp the wallet is tested against pays this way.

## OA-3: P38-08, the connect window's see-your-address toggle

**Answered 2026-10-18 (owner, P41-01 = B):** "Listing-only, said plainly: the row reads Let this app list all your accounts, with a line under it, It always knows the account you connect with; the app page's line follows the grant." Built in arc 2 (plan.md D20-D22); one case is OA-6.

## OA-4: the execute window when its fee estimate meets a refused request

**Answered 2026-10-17 (orchestrator, D-orch): the existing estimate-failure toast ships now (a); the window settling the typed refusal itself is its own later plan (b).** Reason: "the planner's recommendation, no UI change beyond the lane brief's budget".

- **Surface:** the execute window of a dApp send whose transaction asks the account to authorize the registry from inside another contract.
- **Ships now (option a):** in a standard send, the window's existing estimate failure: the toast "Couldn't estimate fee. Try again." and Confirm off. No discovered authorization witness is signed and nothing is sent. The person's Reject ends the request, so the dApp reads a rejection and History reads "You rejected". The existing call-binding refusal behaves the same way today. In a send with no sender account, the preview shows its existing failure toast, Confirm stays on, and Confirm ends in the scope refusal and "Not allowed".
- **Option b:** the window closes the request itself: the dApp reads the scope refusal and History reads "Not allowed". This needs a new path from the estimate to the request's owner, for both refusals.
- **Recommendation:** b, as its own small plan, since it also fixes the call-binding refusal.

## OA-5: the connect window still offers a requested registry scope

**Answered 2026-10-17 (orchestrator, D-orch): a.** Reason: "the planner's recommendation, no UI change beyond the lane brief's budget".

- **Surface:** the connect window's transaction rows when a dApp asks for a scope on the registry ("Auth registry").
- **Ships now (option a):** unchanged. The person can approve the row; the wallet refuses every grant call it would cover.
- **Option b:** the window marks the row as never honoured, or leaves it out.
- **Recommendation:** a until a dApp is seen asking for it; b needs new copy.

## OA-6: the connect window for an accounts request that does not ask to list

**Open.**

- **Surface:** the connect window when a dApp asks for accounts without `canGet` (to act as an account without listing the others). No dApp the wallet is tested against asks this way; the playground always asks `canGet: true`.
- **Ships now (option a):** no address row, as before the arc. The row in the owner's words, "Let this app list all your accounts", would be false here: without `canGet` the app cannot list.
- **Option b:** the row shows with a switch, Off when the app did not ask and On when it did; "It always knows the account you connect with." stays under it in both states, and the person decides whether the app may list. Needs the switch's accessible name and the decision to carry `canGet` from the switch.
- **Option c:** a row with the line alone, "It always knows the account you connect with.", and no listing title.
- **Recommendation:** a until a dApp asks this way; b if the owner wants the person, not the app, to decide listing.

## OA-7: the busiest first connect window no longer fits 400 × 800

**Open.** The arc's PR waits on it.

- **Surface:** the connect window on a first request for transactions on listed contracts the wallet does not recognize: the account to share, "Always asks you first", "If you allow, it can", "Without asking, it can" with three rows, the unrecognized-contracts note and Details. The window opens at 400 × 800 in both browsers.
- **What moved:** the line P41-01 puts under the address row, "It always knows the account you connect with.", adds 12 px. That window's rows were pinned to fit 400 × 800 with Details closed; they now scroll by 12 px (699 px of content in 687 px). On Firefox a scrolling area is a Tab stop, so Tab gains a stop between the rows and the buttons. The `cap-window` smoke e2e fails on both browsers until this is answered (Chrome: 1 of 5 tests; Firefox: 3 of the 4 it runs).
- **Ships now:** nothing; the arc waits.
- **Option a:** the window's sections sit 16 px apart instead of 20 px, on every connect window. Measured at retry 0: `cap-window` passes on Chrome and Firefox with no test edit.
- **Option b:** keep 20 px; the busiest window scrolls 12 px at 400 × 800, Firefox's Tab order gains the scroll area, and the two tests are re-pinned to say so.
- **Option c:** the line shows on the app page only, not under the connect window's row. Departs from P41-01's words.
- **Recommendation:** a: every row and its words stay, and the window fits as before.
