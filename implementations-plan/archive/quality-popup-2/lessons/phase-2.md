# Phase 2: the row card, the address card, the scope helper

- 2026-11-03 screenshots. A scratch smoke spec seeds one wallet (a token row, a note receipt, public receipts from an address, from the private sentinel and from the zero address, a tx and a failed journal record), then shoots Home's feed, History, the tx page, the four receipts and the journal page at 360 and 240 px, light and dark: 32 shots per build. Built twice from one spec: the phase 1 commit (before) and the phase 2 commit (after), plus a second after run to measure run-to-run noise. Compared pixel by pixel.
- Result: no change a person can see. Every difference between before and after is one of:
  - noise that two runs of the same build show too: the header's account address and the wallet's own address in the journal's To row (each run creates a new account), the fee-juice shimmer's phase on Home, the network chip's dot;
  - History at 240 px, two rows of the nav bar's underline mid-transition (before only; neither after run has it);
  - two rasterization deltas both after runs share: Home's feed fade at 360 px light (a full-width 9-px band, channel delta at most 2), and the receipt's DETAILS label at the public and Mint receipts, light (4 pixels of the first glyph's fringe, blue channel 242 and 247 swapped between neighbours).
- `TxHashRow` without the receipt's `gap="12"` (D7): no pixel moved; the receipt keeps the shared row.
- The type-role manifest: the e2e sweep asserts both address forms on the tx page (`addressForms()` equals `["address", "name"]`), so the card's one site names both tx-page instances in one selector list; one entry at `tx-from-address` alone would have dropped the outside recipient's reading.
- Gate: 154 test files, 2448 tests pass, 1 skipped (the type-role report writer, skipped on the base too); lint exit 0, no warning in a touched file; typecheck:all exit 0.
