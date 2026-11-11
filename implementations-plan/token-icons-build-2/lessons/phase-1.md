# Phase 1: the step's chevron

- `execute-op-step-toggle` is `StepRow`'s stretched `RowTarget`, a sibling of the sentence, not its parent: the e2e reads the chevron and its last word from the step, `execute-op-summary-call`.
- Red on base (base `SendTxSummary.vue` with only the testid added, armed builds): `batch` at 400 px, step 2's chevron at 674.8 (Chrome) / 674.9 (Firefox) while its last word `0x1e6f12..7a8b` ends on the line at 652.8 / 653.1.
- Base timing of the touched smoke specs (execute-steps, type-roles, rows, home-links, token-list, shipped-token-list), retry 0: Chrome 330 s green; Firefox 472 s with type-roles' two reds, #1763 (Senders swept before its list settles; the second red is its coverage cascade), pre-existing on base.
