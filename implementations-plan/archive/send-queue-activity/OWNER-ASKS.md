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

**What ships now.** Answered 2026-10-13: P9-04's qualification says only the 60-minute string is copy. Arc 4 was re-planned on the changed P9-04 and pins nothing separately (plan D52).

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

## OA-6: "Refused by the network" cannot be proven on the default endpoint (#112, page 10 P10-05)

**Surface.** The History card and journal detail of a send the node answered with an error.

**What the page approved.** When the node refused the first attempt, the row ends at once as "Refused by the network" / "The network refused this transaction, so it won't go through. Check the details before sending it again." When the refusal came after a retried attempt, it keeps today's "Not confirmed yet" check.

**Why it is not built.** The approval rests on the wallet seeing whether its send was retried. On one node it can. The default Testnet endpoint, though, is dRPC's load balancer, and its gateway retries a timed-out request on another node, and may also send it to two nodes at once. The wallet sees one attempt either way. So this can happen: node A takes the transaction, the gateway gives up waiting for A, and node B refuses the retry with "Existing nullifier", because A's copy is already in. The row would then say "won't go through" for a send that goes through. A person who sends again pays twice. The probe record is in `lessons/phase-3a.md`.

**Options.**
- **A. As is.** A refused send reads "Not confirmed yet", then "Unconfirmed" after 30 minutes, as today. Once its expiry is provably past, it reads "Won't go through" / "This transaction expired before the network included it. No fee was paid, and you can send it again." That is #108's state, which ships in this arc. The expiry comes about a day after the send.
- **B. Refused only on a single-node endpoint.** The wallet cannot tell whether an endpoint is a load balancer. This could only key on a user-added local endpoint, which covers developers, not users.
- **C. Ship as approved anyway**, accepting that through a load balancer the row can be wrong and invite a double payment.

**Recommendation.** A.

**What ships now.** A: nothing is built for #112, and it stays open.

## OA-7: How "Won't go through" looks (#108, page 10 P10-06)

**Surface.** The History card and journal detail of a send whose expiry is provably past.

**What ships now.**
- The page's words, verbatim: card and Outcome "Won't go through", context "This transaction expired before the network included it. No fee was paid, and you can send it again."
- The existing failed look: the red cross icon, and a State row reading "Failed", the same look "Reverted" has. The page set the words, not the look.
- An "Unconfirmed" row whose post-expiry check finds the transaction on chain keeps reading "Unconfirmed". The page names only the expired move.
- The state appears once the chain's finalized blocks pass the expiry, about a day after the send. Until then the row reads as today.

**Options.** A: as shipped. B: another icon or colour (amber, as "Unconfirmed"), or a State row word other than "Failed", named by you. C: an included-after-unconfirmed row moves to "Sent", the existing word.

**Recommendation.** A for the look. C is truer than leaving "Unconfirmed" and needs no new words, but the page did not ask for it.

## OA-8: A settled send's figure for a token of unknown decimals (#103, outside page 10's list)

**Surface.** The settled transaction card on Home and History (`TransactionCard`), for a transfer of a token with no decimals getter.

**What the page approved.** #103 names its surfaces: the in-flight and journal cards, the journal page, prices, the token fold, Home's balance, the token card, arrivals and the incoming card. On those, an amount whose token's decimals are unknown now shows no figure.

**The gap.** The settled card is not on that list. It shows the amount in the decimals its transaction record stored when the wallet built the send, and for a token with no getter that count was never verified. So the same send can read "—" on its journal page and a figure on its settled card.

**Options.**
- **A. As is.** The settled card keeps the figure its record stored.
- **B. Same rule as the listed surfaces.** No figure while the wallet's token for that contract has unknown decimals.

**Recommendation.** B: one rule for every place a send's amount shows.

**What ships now.** A.

## OA-9: Where a held token of unknown decimals sorts (#103)

**Surface.** The token list on Home and Holdings, and the Send picker, which share one order.

**What changes with #103.** A funded token with no decimals getter now shows "—" for its amount, as approved. The order still sorts it among held tokens that have no price, by the amount it no longer shows.

**Options.**
- **A. As is.** It keeps its place among held, unpriced tokens.
- **B. With the rows whose balance is unknown**, at the end of the list.

**Recommendation.** B: a row that shows no amount should not be ranked by one.

**What ships now.** A.

## OA-10: Queue a send whose fee someone else pays (#217, page 9 P9-04a)

**Surface.** The Send page while an earlier send is in flight, when the fee method is a sponsor (the readout's "You pay: Nothing") or a hand-added fee contract ("You pay: —").

**The gap.** The shot shows the queue state for a fee the person pays ("You pay: About X"). For a sponsor or an unvouched contract, "You pay: About X" would be false, and no shot shows another form.

**Options.**
- **A. As is.** The fee row reads "Queued behind your previous send" and Send stays disabled until the estimate lands, as today.
- **B. Queue it too**, with a readout you design for these payers.

**Recommendation.** A. The cap protects the person's own money; with a sponsor there is nothing of theirs to cap.

**What ships now.** A.

## OA-11: No earlier send of this token to base the cap on (#217, page 9 P9-04a)

**Surface.** The Send page while an earlier send is in flight.

**The gap.** Y is "the last estimate for this token plus the margin". The wallet keeps that figure only for a send that reached the network. So there is none when this token was never sent from this account on this network, or when the only earlier send is still proving (its figure is recorded when it is submitted, usually seconds to minutes later).

**Options.**
- **A. As is** until a basis exists: "Queued behind your previous send" and Send disabled; the queue state appears once the earlier send's figure is recorded.
- **B. Another basis**, for example the fee of any earlier send of the account, which may differ a lot from this one.

**Recommendation.** A.

**What ships now.** A.

## OA-12: A re-ask nobody answers (#217, page 9 P9-04d)

**Surface.** Home's row "Fee went up. Review" and the card it becomes.

**The gap.** Option B keeps the send queued until the person sends or cancels it. Meanwhile, later sends that share its balance wait behind it, and their own 60 minutes keep running, so one queued behind a forgotten re-ask may get only seconds for its own question. The wallet already ends any waiting send after 60 minutes, and locking the wallet cancels it. Nothing tells a person with the popup closed that a send is asking: the wallet shows no badge and sends no notification today, and adding either is a new surface.

**Options.**
- **A. It ends as "Cancelled"** at the send's 60-minute limit, as a lock already ends it. Nothing was sent.
- **B. It fails** with the ratified "An earlier send of this account is still in flight", which names the wrong cause here.
- **C. No limit.** It waits until answered, locked or the browser restarts. Later sends of the same balance fail at their own 60 minutes.

**Recommendation.** A.

**What ships now.** A.

## OA-13: A cap based on a different kind of send (#217, page 9 P9-04)

**Surface.** The Send page's "About X" and "for at most Y", and how often the re-ask row appears.

**The gap.** "The last estimate for this token" can come from a send of another shape: public where this one is private, another fee method, or another speed (Urgent commits 2.5 times Normal's cap on Public Fee Juice). Those fees can differ by more than the 25% margin. Then X misleads, and the send asks again almost every time.

**Options.**
- **A. As decided.** The last send of this token, whatever its shape.
- **B. The last send of this token with the same privacy, fee method and speed.** It is offered less often (OA-11's state shows otherwise), and its cap fits.

**Recommendation.** B.

**What ships now.** A, the decision's words.

## OA-14: A pause before "Send for X" can be pressed (#217, page 9 P9-04d)

**Surface.** The re-ask sheet's "Send for X" button.

**The gap.** The usual review sheet arms its button 800 ms after it opens only when the send publishes the person's address. A quick double tap on the row could press "Send for X" at a higher fee before it is read, wherever the button sits under the second tap.

**Options.**
- **A. As the usual sheet.** The pause applies only when the review gates the send.
- **B. Always pause** 800 ms on the re-ask sheet.

**Recommendation.** B: a higher fee is the one thing this sheet asks about.

**What ships now.** B, by the orchestrator's call (D-orch-21): the usual sheet's existing 800 ms guard, with no new words and no layout change.

## OA-15: How small the derived token line may get in USD mode (#90, page 9 P9-01 A)

**Surface.** Send in USD mode: the "≈ … TST" line under the amount, beside the balance and Max.

**What ships now.** Option A as signed: the line scales down until it fits on one line, with no lower limit. Normal amounts look as today. The room it gets is what the balance and Max leave, so a long balance shrinks it hard. Measured with a 12,345,679,901.12 TST balance, an 18-decimal token, on Chrome and Firefox:
- Max in USD: the line draws at 4.6 px;
- a typed $1,234.56: "≈ 1,234.736567329128065313 TST" draws at 6 px.

Before, the same line wrapped onto three lines and pushed Max 28 px past the card's edge. Shots: `screenshots/2-usd-typed-at-rest-*`, `screenshots/2-usd-long-at-rest-*`.

**Options.**
- **A. As built.** Every figure stays whole and on one line, however small.
- **B. A floor**, e.g. 8 px. Below it the line wraps under itself, as the review sheet's amount does below 60%.
- **C. Option C of P9-01 for long lines only.** The line moves to its own row under the amount when it would draw below the floor, so it gets the card's full width.

**Recommendation.** C. It keeps the signed shrink for ordinary amounts and keeps the figure readable when it is long. The review sheet shows the full amount before anything is sent, so A is not a money risk; it is a legibility one.

## OA-20: The fee card's "Override with my method" path is never shown (#242 item 1, page 9 P9-05)

**Surface.** The fee card's banner for a payment the app sets: "Override with my method", and "Use app's payment" under the method picker.

**What ships now.** Both are buttons with the accent focus ring, as signed. No flow shows them. Whenever an app sets the fee payment, the confirm window shows "Fee payment method set by <app>" in place of the fee card, and the wallet refuses an app-paid pick when the request is approved. Nobody sees the change.

If the path were shown: pressing either button swaps it for the other control (the method picker or the banner), and focus falls to the page. The next Tab goes to the method picker on Firefox, but past it to the priority row on Chrome. Shots, from a build that shows the card for an app-paid send: `screenshots/5-fee-*`.

**Options.**
- **A. As built.** The path stays unreachable and is now keyboard-ready.
- **B. Remove the override path from the card**: the banner, both buttons and their state. Nothing visible changes.
- **C. Show it.** A person may replace an app's fee payment in the confirm window. That is a product change and needs its own security review, since an app that names a fee payer may rely on it. Focus would then move to the control that replaces the pressed button.

**Recommendation.** B, in its own PR. A path nobody can reach still costs every review that reads it.

## OA-21: How a screen reader names the recipient field (#242 item 2, page 9 P9-05)

**Surface.** Send's "Recipient Address" field and its suggestions, heard through a screen reader.

**What ships now.** The signed listbox: the suggestions are a list of options, and the field names the highlighted one as Down and Up move. The field itself is still announced as a text field, so a screen reader is not told it has suggestions until one is highlighted. VoiceOver is known to follow the highlighted option less reliably on a plain text field than on a combo box.

**Options.**
- **A. As built.**
- **B. The standard combo box pattern:** the field is announced as a combo box, says whether its list is open, and that it suggests as you type. Nothing a sighted person sees changes.

**Recommendation.** B. It is three attributes on the field, and it is the pattern screen readers are built around.
