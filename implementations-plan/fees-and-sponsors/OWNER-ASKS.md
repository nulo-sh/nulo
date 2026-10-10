# Owner asks: fees-and-sponsors

Eleven questions that no recorded decision answers. Each one changes a fee a person pays or sees, or how a screen behaves, so hold H3 or rule G4 keeps it from the panel. Page 6 (records P6-01 to P6-07) is asked separately and gates arc 2.

None of these blocks arc 1. Arc 1 ships the form under "What ships now" for each one.

- **OA-1 to OA-6** move a cap, a charge or which cap wins.
- **OA-7, OA-8 and OA-9** decide whether a send can go out on a fee you have not seen, and OA-7's option C would also change which cap wins.
- Under H3, each of OA-1 to OA-9 is built only if you answer it, **and** pages 6 and 9 carry recorded answers.
- **OA-10 and OA-11** cover what page 6 approves but does not spell out. Each is built only if you answer it.

**Terms used below:**
- **Fee cap** (`maxFeesPerGas`): the highest price per unit of gas the transaction accepts.
  - A fee-juice payer is charged the network's base price, not the cap, because the wallet sets no priority fee.
  - The cap decides whether the transaction is accepted, and the payer's balance must cover gas limit × cap.
- **Predicted worst minimum**: the highest minimum price the node predicts for the current slot and the next few slots under full load. The wallet already uses it for every payment method except app-chosen ones. It is a forecast, not a guarantee.
- **Speed level**: Normal, Fast or Urgent on the fee card. In a production build they multiply the cap by 2, 3 or 5.
- **Inferred**: read from the protocol's rules, not seen on a live node. The node and sequencer code are not in the installed packages.

## OA-1: the fee cap of an app-chosen payment that names none (#118)

**Surface.** An app's approval window, for a transaction whose fee the app pays through its own contract, when the app gives no fee cap. Nothing on the screen changes; what changes is whether the transaction is accepted.

**Today.**
- The wallet commits the network's current minimum price as the cap, with no margin (1.0×).
- If the base price rises between Confirm and submission, the transaction falls below the minimum. Proving takes seconds with Presto and minutes in the browser.
- The node is expected to refuse it at submission, with nothing spent (inferred). The person sees a generic failure and must try again.
- The 1.0× rule was chosen because some apps' fee contracts check their budget against exactly the current minimum:
  - the canonical payment methods of the installed Aztec 6.0.0-rc.1 check no such budget;
  - the one known contract that does (the private fee-juice claim the bridge uses) passes its own cap, so this rule does not affect it.

**Options.**
- **A. As today.** The cap stays at the current minimum. #118 closes as not planned. An app that wants a margin passes its own cap.
- **B. The predicted worst minimum, with no multiplier.**
  - When prices are flat, the cap is the same as today.
  - When the node predicts a rise, the cap follows it, so the transaction survives the predicted rise (a forecast, not a guarantee).
  - An app whose contract checks a budget of exactly the current minimum then fails. That failure comes before any proof only if the contract's check runs during simulation; otherwise it comes later.
- **C. B, plus a clear message when the network refuses a cap that is too low.** The failure reads "The network fee rose. Try again." (wording is yours) instead of the generic failure.

**Numbers.**
- **Cap, before:** the current minimum.
- **Cap, after B:** the predicted worst minimum, equal to or above the current minimum.
- **What the person pays:**
  - unchanged for an app contract that pays with fee juice, because it is charged the base price;
  - for an app contract that charges the person its full cap with no refund, up to the predicted rise more.

**Recommendation.** B. It keeps today's cap when prices are flat and survives the rises the node predicts.

**What ships now.** A. Arc 1 corrects the comments so they no longer claim the canonical methods check a budget.

## OA-2: what the private fee juice method charges, and what the speed levels do (#188, proposal 1)

**Surface.** Send and the app window, when the payment method is private fee juice (the PrivateFPC), at each speed level.

**Today.**
- The private fee juice contract charges the whole cap, gas limit × cap, and refunds nothing.
- The wallet sets that cap to the predicted worst minimum × 2 (Normal), × 3 (Fast) or × 5 (Urgent). So on this method the speed level is charged in full.
- On every other method, the level adds margin against a price rise. It also raises the balance the payer or the sponsor must hold, which can turn a sponsor that could pay into "can't cover".
- The transaction carries no priority fee, so a higher level does not move it ahead of others (inferred).

**Options.**
- **A. As today.**
- **B. Private fee juice always commits the predicted worst minimum × 1**, whatever the speed level. The charge falls. The transaction survives only the rise the node predicts.
- **C. Private fee juice commits the predicted worst minimum × 1.2, rounded up.**
  - The private fee juice library's own default margin is 1.2, but it applies that margin to the current minimum.
  - C applies it to the wallet's prediction instead, so the two are not the same rule.

**Numbers.** Let X be gas limit × predicted worst minimum for one send. The figures below are before rounding.

| Level | Today | B | C |
|---|---|---|---|
| Normal | 2X | 1X | 1.2X |
| Fast | 3X | 1X | 1.2X |
| Urgent | 5X | 1X | 1.2X |

The cost of a refusal: nothing is spent if the node refuses at submission (inferred), and the person waits for the proof again.

**Recommendation.** C. It keeps most of the saving and leaves a margin for a rise during a browser proof.

**What ships now.** A. Arc 1 pins today's rule in a test.

## OA-3: the maximum fee shown counts teardown gas twice (#188, proposal 3)

**Surface.** The fee readout on Send and in the app window, and the estimated fee stored with each activity record.

**Today.**
- The shown maximum fee is (gas limit + teardown gas limit) × cap.
- The gas limit already includes the teardown part, so the teardown part is counted twice.
- The network and the private fee juice contract use gas limit × cap.

**Options.**
- **A. As today.**
- **B. Show gas limit × cap**, the same figure the network checks.

**Numbers.**
- The shown maximum falls by teardown gas limit × cap.
- The wallet's own payment handlers add no teardown gas, but a transaction's teardown limit comes from its simulation, or from the app when the app supplies one. So the drop is zero only where that limit is zero.
- An app transaction with a teardown phase (for example, a fee contract that refunds) shows a lower maximum, including when the person pays with Fee Juice.
- The real teardown limits are read on a live run before this is built.

**Recommendation.** B. The figure then matches what the network checks.

**What ships now.** A.

## OA-4: check the balance against the maximum fee before proving (#188, proposal 2)

**Surface.** Send and the app window, when the person pays with Fee Juice.

**Today.**
- **The fee card's check.** It refuses a method only when its balance is unknown or zero.
- **Fee Juice.** A balance above zero but below gas limit × cap passes the card. The wallet proves the transaction, and the node is then expected to refuse it at submission (inferred). Nothing is spent, but the person sees a generic failure after waiting for the proof.
- **Private fee juice.** A private balance that is too low already fails during the estimate, before any proof. This ask does not change that.

**Options.**
- **A. As today.**
- **B. Refuse before proving**, with a sentence that names the shortfall, for example "This send can cost up to 0.0021 FJ. You have 0.0015 FJ." (wording is yours; the amounts are only an illustration).

**Recommendation.** B, with your wording.

**What ships now.** A.

## OA-5: reuse a prepared transaction while its cap still covers the price (#188, proposal 5)

**Surface.** Confirm on Send and in the app window. Nothing on the screen changes; Confirm is faster more often.

**Today.**
- The wallet prepares the transaction during the estimate.
- At Confirm, it reuses that preparation only if every reuse check passes. One of those checks is that the predicted price is exactly the same as at the estimate.
- Any price change rebuilds the transaction, which costs one more simulation.

**Options.**
- **A. As today.**
- **B. Reuse while the prepared cap still covers today's predicted price on both gas types**, if the other checks pass. Private fee juice is excluded, because it charges the cap.
  - When prices fell, the committed cap is above a fresh one.
  - A fee-juice payer is still charged the base price, but its balance must cover the higher cap.

**Recommendation.** A. The saving is one simulation, and B adds a case to the reuse checks.

**What ships now.** A.

## OA-6: an app's priority fee is dropped on sends (#188, found in recon)

**Surface.** An app's approval window, for an app that sets a priority fee (`maxPriorityFeesPerGas`).

**Today.**
- The wallet passes the app's priority fee only when the app asks the wallet to simulate a transaction (the app's own `simulateTx` request).
- The send itself, and its fee estimate, carry no priority fee.
- With a priority fee of zero, the protocol charges the base price. An app's own fee contract may charge separately.

**Options.**
- **A. As today**, pinned by a test.
- **B. Send with the app's priority fee.** The person may pay more than the base price, up to the cap shown. The wallet shows no separate priority figure.

**Recommendation.** A. B would let an app raise what the person pays, with no figure on the screen that says so.

**What ships now.** A. Arc 1 pins it.

## OA-7: what "falls back" means for an app-chosen payment (#113, with P6-03)

**Surface.** An app's approval window, on an operation whose fee the app pays through its own fee contract. This is `OperationCard`'s row "Fee payment method set by <app>", which shows a green check.

**Today.**
- The row shows only that line.
- If the app's contract cannot pay, the failure comes at simulation, at submission, or after inclusion, depending on the contract. If a public part fails after inclusion, a fee can be charged.

**What the wallet can know.**
- The wallet can read only the payer contract's current fee-juice balance.
- A fee contract can receive fee juice during the transaction's own setup (a claim), so a low balance does not by itself prove that it cannot pay.
- This holds even for a contract the wallet recognises. The private fee juice contract's first payment (`mint_and_pay_fee`) follows a Fee Juice claim that credits that same contract.
- A claim can also be nested inside another contract's setup, where the wallet does not see it among the calls. So a low balance is proof only for a transaction shape the wallet can validate as unable to fund the payer, nested calls included. Anything else is unproven.

**What page 6 leaves open.**
- P6-03 approves Send's sentence on this row and says "fall back the same way".
- On Send, falling back means another payment method of the person's pays, and the sentence names it.
- Here the payment is part of the transaction the app built, and the window has no control to change it. So neither the fallback nor the sentence's "<method>" has a defined form.

**Options.**
- **A. A hedged notice only.** The row shows "This app's fee contract may not cover this fee right now." (wording is yours). Confirm works as today.
- **B. A, and Confirm is disabled for that operation**, but only when the balance is short and the transaction has a shape the wallet has validated as unable to fund the payer. In every other case, including any unknown or nested call, A applies. If no shape can be validated, B behaves as A.
- **C. Replace the app's payment with the person's default method**, and show Send's sentence naming that method.
  - Only when the wallet can identify the app's fee call exactly, and none of the app's other calls depends on it. Otherwise A.
  - The transaction then differs from the one the app built.
- **D. As today.** Nothing on this row. #113's part (b) closes as not planned.

**Recommendation.** B. It blocks only when the shortfall is certain, and it saves a wasted proof there.

**What ships now.** D, until this is answered. The rest of P6-03 (Send's Confirm, and the authwit popups after OA-8) ships with arc 2.

## OA-8: the authwit popups during and after the sponsor check (#113, with P6-03)

**Surface.** The Revoke authwits and Change registry popups, which have the fee card but no fee figure.

**Today.**
- The card shows "Fee estimated after simulation" and no amount.
- Confirm needs only a payment method.
- Nothing checks the sponsor before proving.

**What page 6 leaves open.** P6-03 says these popups "check the sponsor's funding before proving, as Send does". The check needs a fee estimate. On Send that estimate also shows a readout ("Estimating…", then the amount) and holds Confirm until it lands, and page 6 names neither for these popups.

**Options.**
- **A. As Send does.**
  - The card shows the estimating state, then the fee amount, as on Send.
  - Confirm is disabled until the check lands.
  - When the sponsor is short, the notice shows and another method is selected, as on Send.
- **B. The same check, with no new figure.**
  - The card keeps "Fee estimated after simulation".
  - Confirm is disabled while the check runs. Nothing on the screen says why.
  - When the sponsor is short, the notice shows and another method is selected.
- **C. Check at Confirm.**
  - The button spins as today, and the check runs first.
  - When the sponsor is short, the popup stops before proving, shows the notice, selects the other method, and waits for a second Confirm.
  - Nothing changes before the press.

**Recommendation.** A. The person sees the fee before paying it, and the popups behave like Send.

**What ships now.** Nothing of the check in these popups until this is answered. P6-02's stage line ships with arc 2 regardless.

## OA-9: Send's Confirm when the first fee estimate fails (#113, with P6-03)

**Surface.** The Send page's Confirm button.

**Today.**
- A failed estimate shows the toast "Couldn't estimate fee. Try again."
- Confirm stays enabled, and the send estimates again during Confirm.

**What page 6 leaves open.** P6-03 says "Send's Confirm stays disabled until the first fee estimate lands". It does not say what happens when the estimate fails instead of landing.

**Options.**
- **A. Confirm stays disabled until an estimate lands.** The toast stays, and the next input change or retry estimates again. If estimates keep failing, the person cannot send until they succeed.
- **B. A failed estimate enables Confirm**, as today. The send estimates during Confirm, on a fee the person has not seen before pressing.

**Recommendation.** A. It matches the page's intent that nothing goes out on a fee the person has not seen.

**What ships now.** Today's behaviour, until arc 2.

## OA-10: the loading Sponsored row after a speed change (#115, with P6-06)

**Surface.** The fee card's Sponsored row, on Send and in the app window.

**Today.**
- A speed change or a transaction change clears only the sponsor's "short" mark, so the row is offered again and reads "free" until the next check lands.
- The last answer and the list of sponsors set aside after a short check stay.

**What page 6 leaves open.** P6-06 says the row draws as loading "after a transaction change". A speed change raises the cap the sponsor must cover, so its last "short" answer is stale too.

In both options the loading row stays selectable, as the row is today.

**Options.**
- **A. Only after a transaction change**, as P6-06 says. After a speed change the row reads "free" until its check lands, as today.
- **B. After any change that clears its answer**, a speed change included.

**Recommendation.** B. The row never claims "free" on an answer that no longer applies.

**What ships now.** Today's behaviour, until arc 2. P6-06's transaction-change case is built in arc 2 unless it is struck.

## OA-11: the fee-juice nudge in the app window when a sponsor row has not been checked (#114, with P6-04)

**Surface.** The app execute window's fee card, when Fee Juice and private balances are zero.

**Today.**
- The nudge shows only when the selected method has a confirmed zero balance.
- With no sponsor and no fee juice, nothing is selected, so the nudge never shows, and Confirm stays disabled with no reason given.
- The wallet checks a sponsor's funding only for the payment method an estimate was built with.

**Send's rule today.**
- Send picks a payer unasked by walking its payment methods in privacy order: Fee Juice, private fee juice and **Nulo's own sponsor only**. A sponsor you added by hand is never picked unasked; only your own saved pick can name it.
- Fee Juice and private fee juice count only on a positive balance read.
- Nulo's sponsor counts as able to pay until a check sets it aside. One nobody has checked counts as able.
- The nudge shows when the walk finds nothing: both balances are read as zero, and Nulo's sponsor is missing or set aside.

**What page 6 leaves open.** P6-04 shows the nudge "when no payment method can pay". In the app window a Sponsored row can exist that nobody has checked.

**Options.**
- **A. Send's rule.** The same walk. A hand-added sponsor does not stop the nudge, and the wallet makes no extra checks.
- **B. A new rule: any listed sponsor counts.** Hand-added sponsors count as able too, until a check sets them aside. While one is listed, the nudge does not show.
- **C. A new rule: check every sponsor first.** When the balances are zero, the wallet checks every sponsor row's funding, and the nudge shows only when all of them are confirmed short. This adds one funding read per sponsor row.

**Recommendation.** A. It is Send's rule, so the two screens agree, and it adds no reads.

**What ships now.** Today's behaviour, until arc 2.
