# fee-method-emoji-1: owner asks

The arc's visible change is P146-04 = b, quoted in `plan.md` § UI impact. The entries below are outside it; each ships in the form under "What ships now", so neither blocks the arc.

## A1: History's "Fee method" row for an app whose name has emoji

- **Surface**: the transaction page (History, then a transaction), the "Fee method" row (`tx-detail-fee-method`, `describeFeePaymentMethod` in `popup/components/modules/tx/tx-detail-helpers.ts`).
- **Today**: it prints the app's declared name, emoji and all: "Sponsored, set by Playground ✅🚀". After this arc, the approval window reads "Playground" for the same app.
- **Options**: (a) as today, the declared name whole; (b) stripped through the same filter as the chip and the approval window: "Sponsored, set by Playground"; a name of emoji only reads "the app".
- **Pictures**: `history-set-by-a[-dark].png` and `history-set-by-b[-dark].png`, 400 px, in the lane's shots folder (the (b) frame from a capture-only flag).
- **Recommendation**: (b): the window and History then name the app alike. The same page's "App" row (`tx-detail-app`) still prints the declared name whole, as the window's press does.
- **What ships now**: (a), unchanged.

## A2: the failed fee row's "\<name\> pays" label

- **Surface**: the approval window, an app-paid operation whose fee estimate failed: the readout under "Set by \<name\>" reads "\<name\> pays" over "Couldn't estimate fee." and Try again (`FeeCostReadout`'s label in `OperationCard.vue`).
- **Why ask**: P146-04 names the "method set by" sentence. After this arc the failed row's method line reads "Set by Playground", while the label under it still reads "Playground ✅🚀 pays".
- **Options**: (a) as today, the declared name whole; (b) stripped as the line above it: "Playground pays"; a name the filter empties reads "the app pays", as a nameless app does today.
- **Pictures**: `fee-failed-stripped-400[-dark].png` shows (a), in the lane's shots folder.
- **Recommendation**: (b): one name for one app on one row; the chip's press keeps the whole name.
- **What ships now**: (a), unchanged.
