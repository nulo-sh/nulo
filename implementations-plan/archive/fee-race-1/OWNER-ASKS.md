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

## Answers (2026-10-28, chat)

- **OA1: B.** The owner: "I'm thinking "B" -- but random question: can't we simulate and get the private authorization while the other stuff proves / gets sent? doesnt it simulate with an anchor block or something? Allowing us to do such things? Though true, it might use notes or something that we need, for example on private fee juice". The orchestrator's answer the same day: the slot mirrors the PXE, which runs one simulation or proof at a time, so an estimate admitted during a proof waits inside the PXE past its 90 s request bound (KL1); a simulation reads mined state, so one touching notes the pending send spends would build on stale notes; one sharing nothing is blocked only by the single PXE, and concurrent estimates would need a second PXE over one note store, a plan of its own. D6 ships with Send's sentence.
- **OA2: B.** The owner: "Sounds like "B" is the most and best user experience, actually telling the user what's happening when it's happening". Once the queue grants an estimate's run, Send's card and the window's fee row leave "Queued behind your previous send" for their estimating state. The wallet reports the run's start (D15).
- **S1** (D5 in arc 1 under its own issue): accepted by the orchestrator under the owner's mandate.
