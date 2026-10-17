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

**Open:** re-asked on decision page 41; arc 2 stays held.

- Re-asked on the next decision page. Both forms are costed in [plan.md](plan.md) § Arc 2. Nothing is built until the pick.

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
