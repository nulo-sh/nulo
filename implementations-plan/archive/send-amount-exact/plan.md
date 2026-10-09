# Send amounts kept exact

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: exact amount handling on the Send page in `apps/extension/src/popup/pages/send-amount.ts`, `apps/extension/src/components/composite/send/amount-field.ts` and `apps/extension/src/components/composite/send/AmountCard.vue`, the shared fit in `apps/extension/src/utils/hero-fit.ts` and `apps/extension/src/utils/hero-ruler.ts`, and the review line in `apps/extension/src/popup/components/modules/send/SendReviewSheet.vue`.
- **Open items**: seven Send-page interaction and layout issues found in the work (flipped-theme captures, mouse-only controls, Max under focus, long USD amounts, the USD field's hidden tail, the review symbol indent, the fiat notice wording), tracked in #90. The flipped-theme captures were closed by a later plan before `follow-ups.md` was retired.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Make every amount path on the Send page exact, in one change:

- **Validator**: it removes every comma from a whole part grouped in threes, not just the first, so the field's own resting form of a million or more reads as valid.
- **Leaving the field**: the amount rests through `restingAmount`, grouped with every digit kept and no rounding or 8-decimal cap, instead of a float round trip.
- **Max**: token-mode Max writes the raw balance string and nothing else.
- **Balance corner**: the balance beside Max is the raw balance cut, never rounded, at 8 places.
- **Paste**: a paste keeps only digits and the point before the clamp, as typing does.
- **Fit**: at rest the token field shrinks until the whole amount fits with no floor, and returns to full size with focus. The review sheet's amount line shrinks down to 60%, then wraps before its symbol, never inside it. Both reuse the hero-amount fit, moved down to `src/utils/`.
- **Unit switch and Max**: the unit switch's label sits on the amount's baseline with a hit area filling the row. Max leaves the amount at rest, grouped and fitted, without taking focus.
- Not done: an input length cap, judged unrealistic. An amount the cap would have blocked can now be sent.

## Why

The Send page refused every typed amount of 1,000,000 or more once the field was left, with no message, and leaving the field rewrote what was typed. The two bugs hid each other: fixing the refusal alone would have sent the rewritten amount. Two more float copies came from the same code: token-mode Max filled a float of the balance (more than held for an 18-decimal balance, "1e-7" for dust) and the corner showed float digits rounded past what is held. Money paths must send exactly what the person sees, so a wrong amount from any realistic paste or balance counted as a bug.

## What shipped

- The five behaviours above, with a `data-testid` on the fee estimate row for the end-to-end specs. The comma helper, with no callers left, is deleted.
- Refresh quote in fiat mode now converts at the new quote instead of restoring the old one, which had left the notice up and Confirm off.
- Specs `fiat-send`, `send-amount-exact` and `send-amount-clamp` cover the page in both browsers, and each behaviour was written red first.
- The amount card sits below the layer that may import popup modules, so the fit and ruler moved to `src/utils/` before the card used them.

## Lessons

### Auto-imports

`src/types/auto-imports.d.ts` regenerates only under Vite and keeps a removed export's global. After deleting an auto-imported util and building, the eslint auto-import list dropped the name but the declaration file still carried its global, and because that file is not type-checked the stale global would have failed only at run time. Build before committing an auto-import change and delete a stale line by hand.
