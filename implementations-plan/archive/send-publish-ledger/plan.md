# Send publish ledger

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: a publish strip and a review sheet on the Send page, built from `apps/extension/src/components/composite/send/publish-facts.ts`, `apps/extension/src/components/composite/send/PublishStrip.vue`, `apps/extension/src/composables/useSendReview.ts` and `apps/extension/src/popup/components/modules/send/SendReviewSheet.vue`, with the fee card's old warning row reduced to a tag.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Tell the sender at the Send button, in one constant line, what a send puts on the public chain, and make the one send that names their account against their intent pass through an explicit review.

- **Strip**: whenever a transfer is possible, a one-line button above Send with three cells (You, To, Amount), each a square mark and one word. You reads sender, fee payer or hidden; To and Amount read public or hidden. Hollow grey is hidden, filled is public by choice, filled orange is public against a private origin. Shape and word carry the meaning, colour only reinforces.
- **Honest unknown**: hidden is a claim the wallet makes, so it is shown only for a payer the wallet can vouch for. While no fee source is resolved, or when the payer is a contract the user added by hand, the cell reads a dash.
- **Review sheet**: opened from the strip in any state, and mandatory when the origin is private and the account's own fee juice pays. Public rows carry one sentence each, and the sheet names who pays the fee. Its Send now button is disabled for a short delay when the sheet is the mandatory step.
- **One decision site**: a single `submit(source)` is the only caller of the send. Consent is not a flag the caller passes. It is the click coming from the sheet, the sheet being open and on top of the popup stack, and the delay having passed, all checked in the handler.
- **Fee card**: the "your address pays this fee" warning row is replaced by a zero-height tag, NAMES YOUR ADDRESS, beside the fee source label, in the same state only. It ships in the same change as the gate, never before it.
- With no sendable token there are no facts: no strip, no tag, no review.

## Why

The earlier fee-privacy warning sat inside the fee card, below the fold of a small popup, while Confirm is sticky, so the warning could be off screen at the moment of commitment. A constant strip in a fixed slot is harder to habituate to than an element that appears, and moving from a warning to an assertion raises the bar, which is why unknown reads as a dash and not as hidden.

## What shipped

- The strip, marks and sheet are presentational at the composite layer with a story. The facts function owns the copy and the payer reading, and the page passes the tag shape down so the tag, the gate and the strip agree by construction.
- The send's fire-and-forget half moved into `send-submit.ts` behind characterization tests written first, so the gate did not push `handleSend` over the function-length budget and no complexity suppression was added.
- The review sheet takes a slot in the popup stack and composes the popup primitives. `Popup.vue` gained lifecycle fixes that a page-rendered popup makes reachable and an opt-in `closeOnEscape`. A covered sheet disables its Send button and authorises nothing, and re-arms once it is uncovered.
- Tests run at every layer that can stage the behaviour: pure facts, component, a real-card integration test as the workhorse, and end-to-end sends in both themes with hit-tested clicks and a DOM invariant checked on every send, namely that a fee-juice send under a private origin never goes out unless the gate authorised it. A mutation pass over the gate killed every non-equivalent mutant.
- Registry popups that had not opted into Escape released their focus trap but stayed visible; that was taken up in [popup-escape-closes](../popup-escape-closes/plan.md).
