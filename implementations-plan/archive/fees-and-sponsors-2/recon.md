# Recon: fees-and-sponsors-2

Base: `origin/dev` at d3dc4415. Two Explore agents (sonnet) and the planner's own reads, 2026-10-14. Paths are repo-relative; `X/` is `apps/extension/src/wallet/services/execution/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| One cap per payer | `X/fee/fee-cap.ts` `feeCapFor` (rules `account`, `sponsor`, `private-fee-juice`, `app`); only `account` and `app` read an app cap (`:32`) | adapt: every rule reads the app's cap; `app` also reads the app's priority |
| Sponsor and private fee juice cap | `X/fee/fpc-strategy.ts` `capRuleOf` (`:110-112`), both paths (`:182`, `:263`) | adapt: pass `ctx.op.fee?.maxFeesPerGas` |
| The app's priority on the committed settings | none: every send strategy calls `buildStandard` with 4 arguments, so `completeFeeOptions` sets `GasFees.empty()` (`packages/aztec-runtime/src/account/fee-options.ts:73-75`); `X/fee/embedded-fpc-cap.ts:17-22` copies the build's priority through | adapt `applyEmbeddedFpcGasCap`: it already rewrites the gas settings before the simulation |
| The app's fee options in a strategy | `X/operation-planner.ts:89-108` `feeOptionsOf` plumbs `maxFeesPerGas` and `maxPriorityFeesPerGas` into `ctx.op.fee` | reuse as-is |
| Fee limit (gas limits × cap) | `X/tx-fee-details.ts:12-21` `feeLimitOf`, `getEstimatedFee` | reuse; add `priorityFeeOf` beside them |
| Estimate to the popup | `X/dapp-send-executor.ts:462-474` projection; `packages/wallet-bridge/src/fee.ts` `TransferFeeEstimate` | adapt: one optional field |
| App-paid row | `apps/extension/src/popup/windows/execute/OperationCard.vue:287-309`, testid `execute-op-fee-set-badge`; the estimate is already in scope (`feeEstimate` prop) and scheduled once at open (`popup/windows/execute/index.vue:268`) | adapt |
| FJ formatting | `apps/extension/src/utils/fee-estimation.ts` `formatFeeJuice` (SW and popup) | reuse |
| Dotted term and glossary | `components/composite/DottedTerm.vue`; `utils/glossary.ts`; scan `DottedTerm.scan.test.ts:47-57`; pins `utils/glossary.test.ts`, `popup/pages/settings/glossary.test.ts`, e2e `tooltips-glossary.test.ts` | reuse once OWNER-ASKS OA-1 is answered |
| Gas breakdown | `popup/components/modules/tx/TxFeeRow.vue:67-73`; `tx-detail-helpers.ts:15-47` (`hasTeardown`, `teardown*`), test `tx-detail-helpers.test.ts:21,26-36` | adapt: remove |
| App fee inputs in the playground | none: no `gasSettings`, `maxFeesPerGas` or `maxPriorityFeesPerGas` under `apps/playground` (searched those terms and `GasFees` in ts, vue, html, md) | build new: two inputs every `sendTx` button reads |

## Protocol facts (installed `@aztec-labs/stdlib` 6.0.0-rc.1, `@alejoamiras/private-fee-juice` 6.0.0-rc.1)

- `fees/transaction_fee.js:3-18`: effective fee per gas = base + min(priority, cap − base), per dimension; it asserts cap ≥ base. The charge is gas used × effective fee.
- `gas/gas_settings.js:56-58` `getFeeLimit`: Σ gas limits × cap. Teardown sits inside the gas limits; the priority is not in it.
- The PrivateFPC contract (`fpc_lib/src/lib.nr` `get_max_gas_cost`) debits gas limits × cap, never refunds, and leaves the priority out. Its wallet handler ignores `maxFee` (`fpc/handlers/private-fpc-handler.ts:24-33`).
- No installed package checks the priority against the cap or any node ceiling (searched `maxPriorityFeesPerGas` and `priorit` across `node_modules/.bun/@aztec-labs+*`; no p2p, sequencer or validator package is installed). `aztec-node.js:217` exposes `getMaxPriorityFees()`; nothing here reads it.

## Where the issues' claims did not hold

- **"The fee row's existing `Fee up to X` form" (#400, #411).** The approval window has two fee rows and neither says "Fee up to": the app-paid row (`OperationCard.vue:287-295`) and the wallet-chosen readout `FeeCostReadout.vue` ("You pay ~X FJ (USD)"). "Fee up to" exists only in `SendReviewSheet.vue:163`. The signed form is the decision page's shot `o-188-prio-B`, drawn on the app-paid row: the green check, then "Fee up to 0.016 FJ, includes a 0.004 FJ priority fee the app asked for", with no app name.
- **C's definition (#411).** `DottedTerm.scan.test.ts:47-57` refuses a dotted term whose definition is more than one sentence; C's is two sentences, 88 characters.
- **The app-paid figure for a default-entrypoint operation (#400).** Such an operation gets no estimate (`index.vue:266`; plan D19 of the closed lane; known limit #395), so no figure exists before Confirm.
- **"Shown before Confirm" (#400).** The app window's Confirm never waits for an estimate (`index.vue:706-714`; known limit #396).
- **#401's tests.** No `TxFeeRow` component test exists and no e2e reads or counts the breakdown rows (searched `Teardown`, `hasTeardown`, `TxFeeRow`, `tx-fee`, `gasBreakdown`, `L2 gas` under `apps/extension/tests`). The helper test pins `hasTeardown`.

## Pins that move

- `X/fee/strategies-lifecycle.test.ts`: private fee juice ignores an app's cap (`:403-419`), a sponsor ignores it (`:446-456`), the app's priority never reaches a build (`:458-466`).
- `X/fee/fee-cap.test.ts:12-27` (rule table), `X/fee/embedded-fpc-cap.test.ts`.
- `popup/windows/execute/OperationCard.fee.test.ts:303-313` ("Fee payment method set by Swap" with a funded estimate).
- Stay green: `X/tx-request-builder.pins.test.ts:526-550` (the build reads no fee; a default-entrypoint build commits zero priority); the stash gate `X/dapp-send-executor.ts:589-600` (no reuse entry for an embedded payment or an app cap).

## Seams

- Lane `send-followups-1` edits `FeeSettingsCard.vue`'s override banner, `AmountCard.vue` and the queued-cap basis (`X/queued-fee-cap.ts`, `X/service.ts:627-637`). This lane meets them only if OWNER-ASKS OA-2 is answered (then `FeeCostReadout.vue`). The queued cap reads stored `estimatedFee`, never `feeCapFor`.
- `feeLimitOf` feeds the sponsor and app-payer funding probes (`X/sponsor-funding.ts:16,36`), so they follow the new caps unchanged.

## Open work and known limits read

Closed `known-limit` issues on fees: #394 to #399, #380, #381. #395 and #396 bear on this lane (above). Open near issues: #405, #406, #408, #410, #412, #117, #197.
