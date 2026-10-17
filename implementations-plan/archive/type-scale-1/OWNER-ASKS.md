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

## OA-6: Home's header chips, where "TESTNET" no longer fits at 11 px

Found in Phase 3 (2026-10-17) by a before/after scan of every value an ellipsis cuts, over every state the type-role specs sweep, in Chrome and Firefox: the only value the new scale newly cuts.

- **Surface**: the header on every popup page: the network chip ("TESTNET ▪") and the lock chip ("🔒 LOCK") at the right of the account name and address (`Header.vue`).
- **Today**: both chips' words in `tag`, Space Grotesk 10 px / 600 / 0.08 em. "TESTNET" is 45 px of text in a 79 px chip, whole; the network chip is about 26.8 px tall beside the lock chip's fixed 26 px.
- **At the signed caps voice** (`label-section`, 11 px / 700 / 0.1 em): "TESTNET" needs 53 px, the lock word grows about 5.5 px, and the row has no width to spare (the address column and its copy icon keep theirs, by design the network chip gives way first), so the network chip's ellipsis draws "TEST…" on every page; the chip also grows to 28 px beside the 26 px lock chip. The design composite (`vd-type-a.png`) draws both words whole in `label-section` by closing the row's 12 px gap, which would put the address's copy icon on the chip.
- **Options**:
  - **A. Keep today's look on the two chips** (what ships): the rest of the header, and every other screen, takes Scale A.
  - **B. Make room** in the row, about 8 px, at the signed voice. Honest sources: the network chip's side padding 10 → 6 px (exactly 8 px, no margin), the lock chip as an icon alone, or a narrower left padding. Widening the chip's cap does nothing: the row, not the 120 px cap, is what holds it.
  - **C. Accept the cut**: "TEST…" on every page. Not recommended: a person reads the network there.
- **Recommendation**: B with the chip padding, if the owner accepts a tighter chip; otherwise A.
- **What ships now**: A, through one compound rule in `Header.vue` (`.actions .network_chip, .network_chip .network_label, .lock_chip .lock_label`) and three `OVERRIDES` entries (font-size 10px, font-weight 600, letter-spacing 0.08em, role `label-section`). The chip itself takes the size too, since its own size sets its `1lh` and so its height. This departs from the signed Home picture on these two words; the PR says so.
- **Open as #651** (`owner-decision`), filed at close-out.

## OA-7: Manage accounts, where an imported row's address line no longer fits at 13 px

Found in Phase 4 (2026-10-17) by `account-import-export.test.ts` in Chrome and Firefox: the line may clip only inside the address's head, and at the signed 13 px the parts that never shrink outgrow it.

- **Surface**: Settings → Manage accounts, each visible row's address line (`accounts/index.vue`); an imported row reads "imported · " then the address head (it ends in an ellipsis), then the address's last 4 characters.
- **Today**: `meta` at 11 px. "imported" 52.8 px, " · " 19.8 px and the tail 26.4 px take 99 of the line's 100 px, so the head gets 1 px, less than its ellipsis (6.6 px): an imported row already shows none of its address head, only "imported · " and the tail (measured in Chrome and Firefox, 2026-10-17).
- **At the signed `meta`** (13 px): "imported" 62.4 px, " · " 23.4 px and the tail 31.2 px take 117 px of the 100 px line, so the line runs past its box (the test's one-truncation check fails) and the head has none.
- **Options**:
  - **A. Keep 11 px on the visible rows' address line** (what ships): every visible row reads as today; the hidden rows and every other screen take 13 px. As today, an imported row shows none of its address head.
  - **B. 13 px, with room made**: move the "imported" marker off the address line (to the name line, or as an icon), or put the row's four actions behind one menu. Each is a layout or copy change.
  - **C. 13 px on two lines**: the marker on one line, the address on the next.
- **Recommendation**: A for now; B or C if an imported row should show its address head, which A does not.
- **What ships now**: A, through one rule in `accounts/index.vue` (`.desc_line:has(.addr_head)`, font-size 11 px; every row's line has a head, so the `:has` only lifts the rule above the role's class) and one `OVERRIDES` entry (role `meta`, scope `[data-testid="manage-accounts-address"]`). It covers every visible row, so the list reads at one size, as today.
- **Open as #652** (`owner-decision`), filed at close-out.

## OA-8: lines the signed 13 px now wraps

Found in the review loop (2026-10-17) from the after screenshots, in both browsers. Nothing is cut, so neither the layout gate nor the ellipsis scan reads it.

- **Surfaces**:
  - The execute window's decoded arguments (`CallArguments.vue`, `meta`, every identifier at 13 px by P34-03). Beside "FROM:" a 66-character value fits 32 characters a line, so an address runs to three lines and its last two characters sit alone (the `grant` pair). Beside "TO:" it still takes two. The nonce beside "_NONCE:" also takes three. At 12 px / 500 (`data`) each took two.
  - Send's amount card in token mode (`AmountCard.vue`): "≈" sits alone above "$1,234,567.12", so the card grows a line (the `send-amount-card` pair). USD mode fits its line; token mode has no fitting.
  - A token row's dollar figure (`TokenCard.vue`, a box capped at 160 px): 20 characters fit at 13 px, against 24 at 11 px. A figure of about $1 trillion or more puts its cents on a third line (the Home and Holdings pairs, seeded at $123,456,789,012,345.68).
- **Options**:
  - **A. As signed** (what ships): the wraps stay, and every digit shows.
  - **B. Make room, site by site**:
    - the execute window puts each key above its value, so a 66-character value takes two lines of the full row;
    - the amount card keeps "≈" with its figure, so the balance moves instead;
    - the row's dollar cap goes from 160 to 190 px.
  - **C. Keep the earlier size on those lines** through `OVERRIDES`, as OA-6 and OA-7 do: 12 px on the execute window's full arguments, 11 px on the token-mode line.
- **Recommendation**: B on the execute window, where a person compares addresses and a two-character last line is the easiest to misread. A for the other two.
- **What ships now**: A, the signed size (P34-03 for the arguments, P30-14 for `meta`).
- **Open as #653** (`owner-decision`), filed at close-out.

## OA-9: a dApp transfer row's two chips, where 11 px no longer fits one line

Found at close-out (2026-10-17), when `dev` was merged after #650 (P34-08 D). It was measured at retry 0 on the built extension at 360 px, and Chrome and Firefox agree.

- **Surface**: an activity row (Home, History, a token page) for a transfer a dApp asked for. It shows the token symbol, the direction chip ("PUBLIC → PUBLIC"), the app chip, and the amount on the right (`TransactionCard.vue`).
- **#650's picture** (P34-08 D, drawn with the 10 px chips): "One line, the app chip smaller in this row only: SHI with an ellipsis; 62 px". At 2.5 USDC the app chip was 41 px, "SHI…".
- **At the signed `label-section`** (11 px / 700 / 0.1 em): at 2.5 USDC the direction chip breaks onto two lines and the app chip sits at its floor, showing "…" alone.
  - A whole "…" now needs 19.89 px, so the floor would be 20 px.
  - Under P35-08 B (#583, lane ui-leftovers-1: "from the floor the app chip drops under the direction chip keeping its name, 68 px"), the drop would start at $2.50 instead of about $1,000.
- **Options**:
  - **A. The two chips of this row keep 10 px semibold** (what ships). The row is one line at 2.5 USDC and the floor stays 19 px. The app chip is 32.4 px, not 41 px, because this scale also widens the row's dollar figure (13 px) and its separator (14 px). On #650's table that is about "SH…". Send and receive rows, and a lone app chip, take 11 px.
  - **B. The signed 11 px here too.** The direction chip breaks at any amount and, once P35-08 B lands, the app chip drops under it from $2.50.
  - **C. Make room at 11 px.** The direction words shorten (for example "PUB → PUB"), or the row's dollar figure goes back to 11 px.
- **Recommendation**: A, unless the owner prefers one chip size across all rows over the one-line row.
- **What ships now**: A, through one grouped rule in `TransactionCard.vue` (`.chips > .chip, .app_slot > .app_chip`) and three `OVERRIDES` entries (10px, 600, 0.08em, role `label-section`). They are scoped to the two-chip branch; `rows.test.ts` reads both rows' chip type.
- **Open as #657** (`owner-decision`), filed at close-out.
