# Owner asks: send-estimate-1

One question. OA-1 ships in its "What ships now" form; the product call lives in #863.

## OA-1: the fee row when the balance drops below the typed amount (P5)

**Surface.** Send (`popup/pages/send.vue`), the fee row, after a fee has landed, when the balance of the side being sent from falls below the typed amount while the page is open (another send or an app spends from the same account).

**Today.** The balance in the amount card's corner falls and Send turns disabled, but the fee row keeps showing the last fee. It changes to "Fee estimated after simulation" only when the person next edits the recipient, the amount, the token, the side or the fee method.

**Options.**
- **A. As today.** The last fee stays on screen until a field is edited.
- **B. As if typed.** The fee row reads "Fee estimated after simulation" at once, as it does today when a person types an amount above the balance. An estimate still running for that amount is stopped.

**Recommendation.** B. The screen then depends only on what is on it: the same amount and balance always show the same fee row, however they were reached.

**What ships now.** A. The fix asks for the fee when the amount becomes sendable and does nothing when it stops being sendable, so this row behaves as today. The arc does not wait for this answer; a B answer is one more commit on the same PR, with your sign-off quoted and a screenshot.
