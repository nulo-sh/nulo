# fee-copy-build-1: owner asks

The four picks (P164-01 to -04) are the whole visible budget. Two asks; the arc ships the "what ships now" form of each.

## A1. Send → Fee sheet: the readout when the amount is over the balance

- **Where.** The Fee sheet's readout, opened with Change, when the amount typed is more than the balance the wallet read (typed so, or a landed amount the balance later falls below). The field under the sheet says "More than your balance" and the button "Fix the amount", but the sheet covers the field.
- **Why it is asked.** A4 ("Enter an amount to see the fee.") would be false here, and page 164 said "an amount over the balance needs its own sentence".
- **Options.** (a) "Enter an amount within your balance to see the fee." (b) A4's sentence anyway. (c) Today's "Fee estimated after simulation".
- **Recommendation.** (a): true in this state, the same shape as A4, and it names the one thing to change.
- **What ships now.** (a), captured as `fcb1-sim-after-over` for the decision page beside A4.

## A2. The states that keep "Fee estimated after simulation"

- **Where.** Send's Fee sheet with an amount typed that the wallet cannot weigh: zero, an unreadable amount, a balance not read yet, a token whose decimals are unknown, or while the Terms are not accepted. Off Send (the approval window and the two authorization popups), the moment before the card asks its first estimate.
- **Why it is asked.** The owner said the sentence means nothing; page 164 decided only the empty amount. Each state already shows its cause elsewhere (the field's hint, the balance's state, the Terms banner) except zero.
- **Options.** (a) Today's caption. (b) A4's sentence for zero and an unreadable amount, which leave no amount the wallet can send. (c) A sentence per state.
- **Recommendation.** (b) for zero and unreadable; (a) for the rest until drawn.
- **What ships now.** (a): unchanged.
