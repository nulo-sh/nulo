# type-scale-1: owner asks

The signed budget is P30-14 A and P30-15 B (decision page 30, 2026-10-16): Scale A's two role edits and Home's small caps folded into one caps role, on every screen at once. Each ask below is a change beyond those words. The arc ships each entry's "what ships now" and takes the answer if it arrives before the PR opens.

## OA-1 (conditional): a site that no longer fits at its new size

- **Answered, 2026-10-17 (decision page 34, P34-02): B.** "The name at 13 px with the cap widened to 102 px; Local Network whole; the strip 38 px." (#589)

Phase 3 fills in each site with its screenshots (light and dark, Chrome and Firefox) and measured widths.

- **Surface**: an element in a fixed track or a fixed box whose text runs past it at the new size, or a value newly cut by an ellipsis on an approval window or at an address. Known in advance:
  - The capabilities window's permission table heads ("Simulate", "Add", "Transact" in 54, 34 and 54 px columns, `DetailsTable.vue:148`) and function labels (58 px, `:259`): estimated to run past their columns at 11 px; unmeasured.
  - The identity strip on every approval window cuts the network name at 96 px (`IdentityStrip.vue:93`). By arithmetic (not yet rendered), "Local Network" fits at 11 px (about 86 px) and is cut at 13 px (about 101 px). "Testnet" fits either way.
- **Options**:
  - **A. Keep today's look on that element.** Everything else on the screen takes Scale A.
  - **B. Give the text room**: widen the column or the cap to the measured text. The table's columns or the strip's cap move by a few pixels.
  - **C. Accept the cut** (a newly cut value only): the value keeps its new size and the ellipsis cuts it. A run-past cannot take C: the layout gate refuses it.
- **Recommendation**: B for a run-past (it keeps one voice everywhere); B for the identity strip too, since a person reads the network name there before approving. A fixed box that no longer matches its neighbour (the Header's 26 px lock chip beside the network chip) is the same ask, with both heights.
- **What ships now**: A, through `OVERRIDES` entries (`apps/extension/scripts/type-roles/exceptions.ts`) on that element alone: a compound selector, one entry per property that differs from today, each citing this ask. The answer B removes them; for a newly cut value, the answer C removes them and keeps the new size.

## OA-2: retire `data` into `meta` on every screen?

- **Answered, 2026-10-17 (decision page 34, P34-03): A.** "Retire data: every identifier in mono 13 px at 400, as Home gets." (#589)

- **Surface**: every address, hash, id, function name and inline amount outside Home: 72 sites, including the execute and capabilities windows, Settings rows that show an address, the transaction and receipt pages.
- **Options**:
  - **A. Retire `data`**: these become `meta`, JetBrains Mono 13 px at weight 400 (today 12 px at 500). One mono voice for identifiers and figures, as Home gets.
  - **B. Keep `data`**: they stay at 12 px, 500. After the signed `meta` edit, a small hash or count (13 px) is then larger than a full address beside it (12 px).
- **What it looks like**: A is a slightly larger and lighter mono line on the windows and detail pages; the design lead drew it only for Home's Fee Juice amount.
- **Recommendation**: A.
- **What ships now**: B. Only Home's Fee Juice amount moves to `meta`, as drawn.

## OA-3: the dollar figures off Home's rows

- **Answered, 2026-10-17 (decision page 34, P34-04): B.** "Keep 11 px." (#589)

- **Surface**: the dollar figure in Home's Fee Juice card (`GasBalanceCard.vue:240`), under the amount on the transaction and receipt pages (`detail-page.module.css:2`), beside Send's fee (`FeeCostReadout.vue:104`) and in the transaction's fee row (`TxFeeRow.vue:100`). All are 11 px today.
- **Options**: **A.** 13 px, as Home's token and activity rows get. **B.** Keep 11 px.
- **Recommendation**: A: a dollar figure is then never smaller than the `meta` conversion beside it.
- **What ships now**: B.

## OA-4: Send's publish strip

- **Answered, 2026-10-17 (decision page 34, P34-05): C.** "Keep the strip's facts at today's 10 px semibold: the strip reads as today and fits." (#589)

- **Surface**: the strip under Send's review (`PublishStrip.vue`): three cells, each a name ("YOU", "TO", "AMOUNT") and a fact ("PRIVATE", "HIDDEN", …).
- **Today**: names in `tag-name` (Space Grotesk 10 px, 700, 0.08 em) stand out from facts in `tag` (10 px, 600) by weight and colour.
- **After the signed fold**: facts become `label-section` (11 px, 700, 0.1 em); names stay `tag-name` (10 px). Names are then smaller than their facts at the same weight, and only colour separates them.
- **Options**:
  - **A. As it falls** (above).
  - **B. Fold `tag-name` into `label-section` too**: names and facts at 11 px, 700, told apart by colour alone.
  - **C. Keep the strip's facts at today's look** (10 px, 600) through overrides.
- **Recommendation**: B, the one caps voice the scale asks for. Phase 3 measures the worst row ("FEE PAYER / HIDDEN / HIDDEN") at 11 px first; a run-past joins OA-1.
- **What ships now**: A.

## OA-5: the capabilities window's permission table, whose "TRANSACT" head already runs past its column

- **Answered, 2026-10-17 (decision page 34, P34-01): A.** "Size the columns to their words at 11 px: Simulate, Transact and the function-label column at 66 px; the contract column gives up 24 px and still fits the address and its copy glyph." (#589)

Found by the layout gate on today's wallet, before any type-scale change; it stops the arc (plan § Phase 1, Warning).

- **Surface**: the capabilities window (a dApp's connect request) with Details open: the permission table's head row, "CONTRACT · SIMULATE · ADD · TRANSACT" (`DetailsTable.vue:71-76`). The three right columns are fixed at 54, 34 and 54 px with 4 px gaps.
- **Today**: "TRANSACT" is 58 px in its 54 px column, in Chrome and Firefox. Centred, it spills about 2 px into each gap and touches nothing (screenshot `capabilities-details`, before set).
- **At Scale A's caps voice (11 px)**: "TRANSACT" about 64 px in 54 (past the 4 px gaps too), "SIMULATE" about 60 px in 54, and a contract row's function label column (58 px, `DetailsTable.vue:256-270`) holds "TRANSACT" at about 64 px. The sweep opens the fold but no row, so that last column is unmeasured.
- **Options**:
  - **A. Size the columns to their words at 11 px**: Simulate and Transact about 66 px each, the function label column about 66 px; the contract column gives up about 24 px (the contract address still fits, about 120 px with its copy icon in about 140 px; a contract name already ends in an ellipsis there).
  - **B. Accept the spill**: the words run into the gaps, and at 11 px past them. The layout gate then needs a reviewed exception for this row, which the plan does not allow without your say.
  - **C. Shorter words** (a copy change, for example "SEND" for "TRANSACT").
- **Recommendation**: A. It is the same answer as OA-1 B for this table, and it is the only option that keeps the gate free of exceptions.
- **What ships now**: nothing. The arc stops at Phase 1 until this is answered, since today's look itself fails the gate, so OA-1's "keep today's look" cannot cover it.
