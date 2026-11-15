# fee-claim-build-1: owner asks

## A1. A claim smaller than the fee, to an account that already holds Fee Juice

**Surface.** The approval window's fee row for a request that claims Fee Juice to the account (the W1 sentence, P151-01), running and landed.

**What happens.** The wallet classes a request as a claim to the account from the claim's address, selector, flags and recipient (`classifyFeePayer` in `packages/wallet-bridge/src/fee-payer.ts`), never its amount. The Fee Juice contract adds a claim to the account's one balance, and the fee is checked against and paid from that total (`claim_and_end_setup`, `check_balance` in `@aztec-labs/protocol-contracts` 6.0.0). So an account that already holds Fee Juice, sent a request that leads with a real but small claim (it needs an L1 deposit through the Fee Juice portal), reads "You pay about ~X from the Fee Juice this app claims to your account." while most of X comes from the Fee Juice it held. "You pay about ~X" stays true, and the charge stays within what any send from the person's balance may take without asking again (the figure plus at most 10 %, `feeRiseAsks` in `fee-reask.ts`); only the source the sentence names is imprecise. Found by the Codex review of this PR, traced in source; no live run. In the common case, an account claiming the Fee Juice it just bridged, the claim covers the fee and the sentence is exact.

**Options.**
- **(a) Keep W1 as signed** for every claim. Nothing changes from the PR.
- **(b) One sentence that names no source**, for every claim: "You pay about ~X. This app claims Fee Juice to your account first." Exact in every case; two sentences where W1 has one, and it no longer says the claim pays.
- **(c) W1 when the claim covers the fee, another line when it does not**: the wallet compares the claim's amount with the estimate's limit, both known before Confirm. Below it: "You pay about ~X from your Fee Juice and what this app claims to your account." Exact at the estimate; a build may still rise up to 10 % without asking, so a claim that only just covers the estimate can fall short of the final charge unless the comparison takes that margin. One more comparison in the wallet and one more wording to sign.

**Recommendation.** (a), moderate confidence: the edge needs an account that already holds Fee Juice and a claim smaller than the fee (an older small deposit, or fees that moved since it was bridged), and the amount the person pays is right either way. (c) if the owner wants the source exact.

**What ships now.** (a): W1 exactly as signed. The PR does not wait on this ask.
