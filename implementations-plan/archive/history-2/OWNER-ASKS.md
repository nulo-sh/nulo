# history-2 owner asks

## OA1: an app-paid operation's fee row after a failed estimate

- **Surface**: the execute window's fee row for an operation whose app pays through its own payload (`AppFeeLine`, the "Fee payment method set by <app>" line). The owner's pick P94-13 names the fee readout Send uses; this row does not render it.
- **What happens today** (code trace, [recon.md](recon.md) T6): when the person pays all the same (the app claims Fee Juice to the account, or pays through the PrivateFPC), a failed estimate shows the snack "Couldn't estimate fee. Try again." and holds Confirm, with nothing to press. When the app set its own cap and pays itself, the failed estimate holds Confirm with no snack. The only way out is Reject.
- **Options**:
  - A. Keep today's row (what ships now).
  - B. Under the app's line, show the readout's failed words, "Couldn't estimate fee." with TRY AGAIN, which asks the same estimate again. The own-cap case gets the same row, and so its first failure report.
  - C. B for the person-paid cases only; the own-cap case keeps its silent hold.
- **Recommendation**: B. Every row that holds Confirm on a failed estimate then offers the same way out.
- **What ships now**: A. Nothing in the arc depends on the answer.
