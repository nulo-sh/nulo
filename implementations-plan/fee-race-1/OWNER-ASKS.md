# fee-race-1: owner asks

Both asks concern arc 2. Arc 1 depends on neither: its change (Confirm off while an estimate runs) is what #1335's Expected asks for, and it reads the same whatever these answers are.

## OA1. A dApp request opened while the wallet is busy with another send

**Surface.** The approval window (`popup/windows/execute/`): its Confirm and its fee row, while an earlier send holds the wallet. A dApp's second request always opens this way, because the wallet opens it as soon as the first send joins the queue.

**Today.** The second request's estimate runs behind the first send's proof. On a real prover it fails after a minute with the toast "Couldn't estimate fee. Try again.". With a sponsor, Confirm then comes on; if the request needs a private authorization, Confirm is refused ("Fee estimate did not complete"). With Fee Juice, Confirm stays off until a retry succeeds after the first send.

**If the window waits for the queue (D6).** The estimate waits until the first send has finished proving, then runs; no toast. Confirm stays off the whole time, which on a real prover can be minutes. The window still closes 10 minutes after it opened, so a request whose queue outlasts that ends unconfirmed.

**Options.**

- **A. Wait, no sentence:** the fee row shows its loading state.
- **B. Wait, with Send's existing sentence** "Queued behind your previous send" under the fee row.
- **C. Keep today's behaviour.** D6 does not ship, and the defect becomes its own issue.

**Recommendation.** B: the wait replaces a failure, and one state reads the same on both surfaces.

## OA2. Send's card says "Queued" while its estimate is already running

**Surface.** Send's fee card (`popup/pages/send.vue`).

**Today and after this plan.** Once the queue grants the estimate, the card keeps reading "Queued behind your previous send" until the fee lands or fails. The wallet does not tell the card that the run has started.

**Options.**

- **A. Keep it.** No change.
- **B. Switch to the estimating state once the run starts.** The wallet would have to report the start: the asynchronous estimate in the plan's Outline B, a protocol change of its own.

**Recommendation.** A: the card ends in the fee or a stated failure either way, and B costs a new protocol for one label.
