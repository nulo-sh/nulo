# Phase 5: the window that asks again

Paths are repo-relative.

- OA-F1 B as built: `apps/extension/src/popup/windows/fee/index.vue` reuses the execute window's header, identity block and `OperationCard`, which gained a `fee` slot that stands in for the fee choice; the fee block is `FeeRaisedCard.vue`. The Confirm button reads "Send for … FJ".
- Two places the mockup leaves open, decided by the tree: an app's claim to the account shows no Available row (the claim pays, not a balance the person holds) and no Priority row (no speed was picked); a balance read that fails shows "— FJ", as the fee card does.
- The JSON view (`windows/json`) reads the question's one operation, so the window's expand icon works as on the execute window.
- A new route is a new surface: `scripts/type-roles/surfaces.expected.json` needs its entry or `inventory.test.ts` reds (it did, mid-run, in phase 4's `test:all`).
- Gate: `bun run audit:vue` exit 0 (804 files, 13,001 tests, build 37.5 s; 4 min 4 s wall at load ~200).
- When the wallet picked Fee Juice with a claim, Available reads the public balance without the claim, so it can print below "Now". The row is the mockup's; whether it should add the claim is the owner's.
