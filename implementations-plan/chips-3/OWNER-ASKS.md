# chips-3: owner asks

Arc 1 depends on neither ask: it ships today's symbol and today's in-flight chip. The pictures are on page 119 (`p119-01-*`, `p119-02-*`). The orchestrator lifts the answers from the arc 1 report.

## OA-1 (arc 2): the token symbol under a row's amount (P118-01's note)

- **Surface:** the amount column of the Home, History and token-page activity rows.
- **Options:**
  - **today:** the symbol under every amount.
  - **a:** no symbol where the title already names the token. A mint keeps it under its amount.
  - **b:** as a, and a symbol that stays sits beside its amount on one line.
- **Where the symbol is still needed:** a mint only. It is titled "Mint (public)" or "Mint (private)". No activity row shows a fee or mixes two tokens. No dApp op row shows an amount (`recon.md` § A token symbol beside an amount).
- **Recommendation:** made in the arc 1 report, after the pictures.
- **What ships now:** today.

## OA-2 (arc 2): in-flight and failed transfer rows

- **Surface:** a wallet send's row on Home and History while it is queued or proving, and after it fails or is cancelled.
- **Options:**
  - **today:** the "PRIVATE → PUBLIC" chip beside the title, as now. The row changes to C2 when the send settles.
  - **C2:** the same pair and corner badge as the settled row. The spinner or the status icon keeps the top right. The send's two addresses decide ↗ or ⇄, as the settled row's do.
- **Recommendation:** C2, so a send reads the same from start to end. The cards already say they must not jump when a send settles (`TransactionCard.vue`, `activity-card.module.css`).
- **What ships now:** today.
