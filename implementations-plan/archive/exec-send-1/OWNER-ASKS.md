# exec-send-1: owner asks

## OA-1 (#1432, arc 2): Send's corner for a token with no balance row, after a refused re-read

**Answered: A.** Decision page 95, P95-01, signed 2026-11-02 at 17:02 UTC, no note: "The corner keeps its loading skeleton through the refused re-read, as it showed before it and as Home and Holdings keep their list. No blank flash." Arc 2 ships it.

- **Surface**: Send, the balance shown beside Max, for a selected token the wallet has no balance row for yet (a token added before its first sync), at the moment a re-read of the balances is refused (the worker restarted). It lasts up to 2 s, until the automatic retry.
- **Why it is asked**: the #1432 fix makes Send's first balance read go through the same reader Home and Holdings use, so it counts as a read. Under that reader's rule, a refused re-read keeps what the read showed. P44-02 = B converged seven named rows onto that rule; this one was not shown, so the panel does not decide it.
- **Options**
  - **A (recommended)**: the corner keeps its loading skeleton through the refused re-read, as it showed before it, and as Home and Holdings keep their list. No blank flash.
  - **B**: the corner goes blank until the retry answers, as today. Today's blank exists only because Send's first read bypassed that reader; keeping it needs a Send-only rule for the corner, a new piece of state that says "the last re-read was refused".
- **What shipped**: arc 1, the cancel fix (#1426), first; arc 2 (#1432) after this answer.

## Signed already (no answer needed)

- **Send's balance corner and Max in the first-load race** show the newest balance (arc 2). Signed: P94-01 (2026-11-01) under the owner's rule of 2026-10-30; the PR body carries before and after captures.
- **A dApp send whose queued row cannot be read ends as failed** instead of running under a new card (arc 1). Signed: P94-01; #1426's "Expected" says an unreadable queued row ends the send.
- Send's failure card, the owner's kept difference in P44-02 = B, shows when and as it does today.
