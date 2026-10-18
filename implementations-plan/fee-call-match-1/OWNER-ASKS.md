# fee-call-match-1: owner asks

A1 depends on none: it ships under either answer.

## OA-1 (#796's sponsor half): should a transaction record who chose its fee?

**Surface.** The transaction page's Fee method row, for a dApp call whose fee went through a contract function named `sponsor_unconditionally`.

**Why it is open.** Today that row reads "Sponsored" whether you picked a sponsor in the approval window or the app embedded its own fee contract. The stored transaction cannot tell the two apart: both record the same fee method and the same app origin, and your sponsor can be any contract you added in Settings → FPCs. So an app can name its own fee function `sponsor_unconditionally` and the row reads "Sponsored", even if that contract charged you. Telling them apart needs the wallet to save, on each transaction, who chose the fee: new stored data, which is your call.

**Options.**
- **A (ships now): keep "Sponsored" for every `sponsor_unconditionally` call.** Nothing is stored. A1's Private Fee Juice fix ships either way. An app's own sponsor keeps reading "Sponsored".
- **B: record who chose the fee on each new transaction.** Your own pick reads as today ("Sponsored", "Private Fee Juice"); an app's own fee contract reads "Set by {app}" whatever its function is called. Rows saved before the change keep today's reading. A later arc: a new field at every place the wallet records a transaction, accepted by backup restore.

**Recommendation.** B, before launch: it is the only option that makes the row say who chose, and before launch no migration is needed. A ships now, and A1 does not wait. This ask is also filed as an `owner-decision` issue before A1's PR opens, so it outlives this plan.
