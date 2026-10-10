# send-queue-activity — owner asks

Questions only the owner can answer, for the orchestrator to put on a page. Each one says what ships now without an answer. Records already on pages 9 and 10 (P9-01 to P9-05, P10-01 to P10-13) are not repeated here; the plan builds them as the pages state them.

## OA-1 — "Queued..." for a Send-page send that starts waiting after it was created (#219 item c)

**Surface.** Home's awaiting card and the activity row of a Send-page send (`utils/card-subtitle.ts:28-34`).

**What happens today.** A Send-page send decides its first state once, when its record is created. If nothing was in its way at that moment but a dApp send then takes the execution slot, or an earlier send turns out to be still unmined, the send waits while its card reads "Preparing...". The wait is real; the words are wrong.

**Options.**
- **A.** The card reads "Queued..." (the existing words and look) whenever the send waits for an earlier send or for the slot, and "Preparing..." once it runs. Built in arc 3b: the record moves back to its queued state while it waits.
- **B. As is.** The card keeps reading "Preparing..." in that window.

**What each looks like.** A: the same card a send already shows when it is queued from the start, for the seconds or minutes of the wait. B: no change.

**Recommendation.** A. It is the state the owner chose for a waiting send in the concurrent-sends work; this window was missed.

**What ships now.** B. Arc 1 ships #219 item a (item b only on OA-5 = A) and leaves this text as it is.

**Also covered by A.** Under OA-3 A or B, a dApp send made through the silent self-paid path waits while its record already reads "Preparing...". Choosing A here also lets that record read "Queued..." while it waits: the same back-edge, used by the dApp path.

## OA-2 — Page 9, P9-04: one of the "three ordering choices" is not copy in the tree (#217)

**Surface.** Page 9's P9-04 record, which asks the owner to ratify three choices "each quoted on the page from the tree".

**Finding.** Only one is a string: "An earlier send of this account is still in flight" (`apps/extension/src/wallet/services/execution/transfer-executor.ts:118`), shown when a send has waited 60 minutes. The 10-minute rule (a later send stops waiting for an unmined one and runs unordered) has no copy; it is the constant `SUBMITTED_HOLD_MS` (`send-sequencer.ts:19`). "What a failed public send reports about private balance" is not in the tree as copy; searched `public send|public spend|spent private|private balance` over `apps/extension/src`, `apps/extension/tests` and the archived concurrent-sends plan.

**Options.** A: the page quotes the string, describes the 10-minute rule as behaviour, and says the third answer has no copy. B: the orchestrator drops the third item from the page.

**Recommendation.** A, as P9-04 itself instructs ("If either cannot be found, the page says so instead of asking").

**What ships now.** Nothing until page 9 is signed; then arc 4 pins the string and the two time limits.

## OA-3: New waits from the ordering fixes (#218, #219 item a)

**Surface.**
- The dApp send's activity card: "Queued..." while it waits, or "Preparing..." on the silent self-paid path.
- The Send page's awaiting card ("Queued...") and fee row ("Queued behind your previous send").
- The dApp's own screen, which gets its answer later.

**What happens today.**
1. A dApp send made while a Send-page send of the same account is still unmined starts at once, and can fail at the network with a conflict (#218).
2. A dApp send made after another dApp send can fail the same way.
3. After the wallet's background restarts, a Send-page send using the same private fee contract as a pending send starts at once and can fail.

Item 3 is a gap in a rule you already chose: "Order sends that share chain state, never fail them: a send that shares state with an in-flight send of the same account waits in the service worker until the earlier one's receipt settles, and a send that shares nothing is not slowed." That is the archived concurrent-sends decision. Arc 1 closes the gap. The existing Queued state shows until the earlier send's receipt settles, as the rule says.

Items 1 and 2 extend that rule to dApp sends, which you left open (#218). The wallet cannot know which balances a dApp send will spend before it builds it, so a dApp send would wait for every earlier send of the account, even one it shares nothing with. That is an exception to "a send that shares nothing is not slowed".

**Options for items 1 and 2.**
- **A.** A dApp send waits for every earlier unmined send of the account, whether made on the Send page or by a dApp. A dApp flow that sends twice from one account takes about one block more per step, and the dApp's later requests wait behind the one that is waiting.
- **B.** A dApp send waits only for your own Send-page sends (item 1). Sends after another dApp send behave as today, and item 2 can still fail as it does now.
- **C. As is.** #218 closes as not planned.

**What each looks like.**
- **A and B:** the dApp's card reads "Queued..." while it waits ("Preparing..." on the silent path; OA-1 covers that wording), and the dApp's own spinner runs longer. Nothing new appears on the Send page, and no new words, screens or errors.
- **C:** no change.

**Recommendation.** B. It fixes the case #218 reports, which only the wallet can see, since a dApp cannot know about your Send-page sends. It does so without slowing every dApp's multi-step flow. A also prevents dApp-after-dApp conflicts, but costs about a block per step even for steps that share nothing.

**What ships now.**
- Item 3: fixed in arc 1, under the existing decision. If you consider that wait a change you want to see first, say so and arc 1 drops Phase 1.1's ordering change (the fee contract is still recorded).
- Items 1 and 2: nothing until you answer. Arc 1b is built on A or B; on C nothing is built.

## OA-4: How long a dApp transaction holds your later Send-page sends (#218)

**Surface.** The Send page's fee row ("Queued behind your previous send") and the awaiting card, right after a dApp transaction.

**What happens today.** After a dApp transaction reaches the network, a Send-page send waits for it only if the dApp's direct calls name the same token and recipient. Two cases slip through, and in each a Send-page send can start before the dApp transaction is in a block and fail with a conflict:
- a dApp that works through another contract (a swap router, for example) spends tokens its direct calls do not name;
- a dApp transaction that also spent from another of your accounts ("additional scopes") holds only under its own account.

**Options.**
- **A.** Every Send-page send of the account, and of any account the dApp spent from, waits until the dApp transaction is in a block (10 minutes at most).
- **B. As is.**

**What each looks like.**
- **A:** after any dApp transaction, your next Send-page send from that account reads "Queued behind your previous send" until that transaction is in a block, usually one block, even when the two share nothing.
- **B:** no change. In the router case the send can fail; the network refuses the conflict, and no fee is charged for a refused transaction.

**Recommendation.** B for now. A slows every Send-page send after any dApp transaction, against "a send that shares nothing is not slowed". Revisit if router dApps become common on Aztec.

**What ships now.** B.

## OA-5: Wait for a lagging node after an earlier send settles (#219 item b)

**Surface.** The Send page's awaiting card ("Queued...") and fee row ("Queued behind your previous send"); with OA-3 A or B, the dApp send's card too.

**What happens today.** On a network with several nodes, the wallet can see an earlier send's receipt settle at one node while the node it simulates against has not yet got that block. A send of the same token made in that window starts at once, and can fail with a conflict. Your concurrent-sends decision ends a wait when the receipt settles, and lists this window as open (#219).

**Options.**
- **A.** After an earlier send settles, a send that shares its state also waits until the wallet's own node has that block: at most 60 seconds, usually none on a single-node network.
- **B. As is.** #219 item b closes as not planned.

**What each looks like.** A: in that window the existing Queued state shows a few seconds longer; nothing new. B: no change; a send in the window can fail as today.

**Recommendation.** A. It finishes the rule you chose ("never fail them") at a cost of seconds, only when nodes disagree.

**What ships now.** Nothing until you answer. Phase 1.2 is built only on A.
