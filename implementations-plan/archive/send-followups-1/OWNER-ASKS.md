# send-followups-1: asks for the owner

Every visible change in this lane is signed on decision page 9 (#408 Decision C, #406 Decision B, #412 P9-12 B and P9-10 A). No question is open. OA-1 records the one persistence change the signed decision implies.

## OA-1: Record each Send-page send's speed (not visible; persistence)

**Surface.** None. Storage: each Send-page Tx row gains one optional field, the speed the person picked (Normal, Fast or Urgent).

**The gap.** P9-12 B bases a queued send's cap on the last send with the same privacy, fee method and speed. The row already holds privacy and fee method, but no record of the wallet keeps the speed once a send settles, so B cannot be built without storing it.

**Options.**
- **A. Store the speed** on the Tx row (`priorityLevel`), written for every new Send-page send. Older rows hold none and are never a basis: such a send waits as today, with no cap. No migration (pre-production). Backups carry the field, so a backup newly states the speed the person picked for each send (the rows' `gasDetails` do not always encode it: private fee juice commits the same margin at every speed).
- **B. Store nothing**: key the basis on privacy and fee method only. An Urgent send can then still be capped from a Normal one, the case P9-12 B was chosen to end; this departs from the signed decision.

**Recommendation.** A.

**Status.** Not an open question: P9-12 B cannot be built without A, and option B contradicts it. Recorded because persistence is the owner's to approve, so the orchestrator can confirm it with the plan.

**What ships now.** A, confirmed by the orchestrator with the plan on 2026-10-14 (D-orch-15).
