# Phase 7: #504, the fee card as a skeleton (arc 3)

## Build (2026-10-18)

- The owner's pick is P23-02 C (page 23) on top of OA-2 B (page 20). Page 23's "C" is not phase 4's guessed method (D13).
- `FeeSettingsCard.vue` holds `readPending` (an origin is set and `snapshotPending`). `FeeMethodSelector`, `FeeMethodRow` and `FeeCostReadout` take `pending`; `FeePriorityRow` renders from the first paint. `snapshotPending` is true at the first paint: `beginRun` sets `readingKey` before the run's first await, and the run's `finally` clears it on every exit.
- Gate `F`: `lint` red once on formatting only (two long lines), then 0; `typecheck:all` 0; `test` 855 files green.
- Mutation checks: `readPending` without the origin check reds the app-window control; `readPending = false` reds the three pending cases.
- The worktree's `node_modules` predated dev's new `@aztec-labs/standard-contracts` subpath import, so the first e2e build failed to resolve it. `bun install --frozen-lockfile` fixed it (1 package).

## Measure (no app probe)

A temporary network spec sampled the page every animation frame from the click on Send: the card's height, the trigger's text, and the settle (the trigger names a method). It ran phase 3's five opens, prover on: once on `origin/dev` 24c68cb4 (load1 128 at start, 301 s wall) and once on 326542b0 (load1 149, 326 s wall). It was deleted afterwards. Times are in ms after the click; heights are px at 360 px wide. Every open defaulted to Nulo's sponsor with no amount entered.

| Open | before: first paint | before: settle | after: first paint | after: settle |
|---|---|---|---|---|
| 1 | 59 (60 px, "Select method") | 412 (164 px) | 109 (220 px, bars) | 967 (164 px) |
| 2, idle | 50 (60) | 420 (164) | 57 (220) | 364 (164) |
| 3, idle | 52 (60) | 350 (164) | 63 (220) | 505 (164) |
| 4, after a send | 40 (60) | 316 (164) | 69 (220) | 390 (164) |
| 5, during a proof | 30 (60) | 4 184 (164) | 40 (220) | 5 386 (164) |

- The skeleton changes what paints, not the read. The settle times move within this host's spread from run to run: phase 3 measured 250-365 ms idle and 5.8 s during a proof on unchanged code.
- Each card changes height exactly once, at the settle. Before, it grows from 60 to 164 px (+104). After, it draws all four rows from the first paint at 220 px and shrinks to 164 px (−56): a sponsored method has no Available row, and with no amount entered "You pay" gives way to the one-line "Fee estimated after simulation". The option text's "nothing jumps" holds only for a Fee Juice payer with an estimate. OWNER-ASKS OA-6.

## Pictures

A throwaway smoke spec outside the repo, run on the armed Chrome build, captured pending (the gas read hangs with no node) and settled, in both themes. "Before" was shot on a build of `origin/dev`'s four card files, swapped in for the build only and restored before any review ran. Files: `screenshots/arc3-*`.

## Review

- Round 1. Codex (gpt-6.1-sol, high; session `01a15066`): conditional approve, 5 findings. Opus (general-purpose): conditional approve, 5 findings. Agreed and fixed in ee4235cc: (a) after a failed read, a switch to another account keeps the old notice up, and `v-if="!statusNotice"` then dropped the Available bar from the new read's skeleton. The row now shows while any read is pending, and a failed-A to pending-B to committed-B test guards it (mutation-checked). (b) The readout's pending test passed with `!props.pending` removed; it now covers queued props without an estimate, and clearing `pending` shows the cap line (mutation-checked). (c) The Priority test checks every payer emitted while pending. (d) Both failure exits now check the bar was up first. (e) Comments: the payer line corrected, the geometry comment cut to one sentence, the narration dropped. Owner's call, not changed: the height change (OA-6), and Opus's proposal to hide the stale notice while pending, which changes a screen that predates the arc (OA-7). Unverified: how screen readers announce `aria-busy` on the trigger; it matches the menu rows' existing pattern.
- Round 2. Codex resume: **approve**, no new finding; the loop converged.

## Final gates (2026-10-18, on the head merged with `origin/dev` at 767789b7; clean, no dependency change)

- `bun run test:all` green (extension 855 files); `lint` and `typecheck:all` 0.
- Smoke, retry 0, armed builds: Chrome `send-fee-privacy` 1/1, `send-keyboard` 5/5; Firefox the same. The load gate (load1 < 150) held them about 15 minutes.
- Network, retry 0, Chrome: `fee-methods` 8/8 (406 s of tests, 638 s wall).
- No e2e scenario was added or changed.
