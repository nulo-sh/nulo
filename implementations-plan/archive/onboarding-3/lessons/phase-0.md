# Phase 0: planning log

## Recon

- Three Sonnet explorers (reuse sweep; onboarding flow and its tests; Home, backup and the phrase). Every load-bearing claim re-read by the planner; findings in [recon.md](../recon.md).
- Two findings changed the design: `createProfile` returns no words and `exportMnemonic` needs the password (so the phrase step lives inside Create, D1); the profile-create composable and the method tabs are shared with the popup (so the first method is per caller, D5).
- The lane brief's fee-card line did not hold: the P29 note and the operative-reading comment on #585 and #588 rule it out.

## Consults

### Round 1, 2026-10-17 14:2xZ to 14:3xZ

- **Codex** (gpt-6.1-sol, high, read-only; default `~/.codex` login): **reject**, 11 findings (2 High). **Opus Plan leg** (opus): **conditional approve**, 12 findings (2 High). They ran in parallel on the same packet: the plan, outline B, recon, the asks, the repo rules.
- Both found the same two High defects on their own:
  - A failed first gas read keeps `display` undefined (`stores/balances.store.ts:189`), so the plan's "unknown" never settled, and the card and banner would never show.
  - `isPriceableHolding` is price-gated (`BalanceView.vue:207`), so a wallet holding only unpriced tokens would lose the banner.
  - Lesson: classify a balance by the raw value and the slice status, never by a display helper.
- Opus alone found that the planned key names fail `profile-ui-keys.scan.test.ts`, which pins `nulo:ui:<letters>@` and one builder per prefix. It also found that `storageLocalSet` awaits `migrationIdle()`, so a write issued just before `window.open` may die with the popup.
- Codex alone found that the store-captures gate skips without `STORE_CAPTURES=1`, and that Settings' reveal would mask a broken "I saved it" in the planned e2e order.
- Every claim was checked against the tree; all were accepted, two in part. The dispositions are in plan.md § Audit verdicts. Two new asks resulted: OA-11 (a failed export) and OA-12 (the tab's clipboard warning).

### Final fresh pass, 2026-10-17 14:3xZ to 14:5xZ

- **Codex** (new session, gpt-6.1-sol, high): **conditional approve** with three conditions. All three were verified and taken:
  - The fence must cover `onCreated`'s entry and its fallback routing. A handler-local `begin()` mints a valid generation after unmount (`composables/runFence.ts:19-24`), so the fence is page-lifetime.
  - Flag writes must not block the action they ride on. A rejected write inside `full.vue`'s download `try` would toast "Failed to download backup" for a download the browser had accepted.
  - The network config retries twice unless `NULO_E2E_RETRY=0` is set (`vitest.e2e.network.config.ts:26`). The phase 3 and 4 network gates also need the Firefox twin.
- Lesson: an `e2e:agent` command without `NULO_E2E_RETRY=0` is not a retry-0 gate.
- Confirmation round (resumed): conditional approve, one condition. The plan kept bootstrap after unmount "as today", but bootstrap publishes shared store state, which the fence promised to prevent. Taken: a departed page now returns at `onCreated` entry.
- Second confirmation: **approve**.
