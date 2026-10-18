# fees-display-1 recon

Base: `093fa10d` (origin/dev). One Explore agent (sonnet) swept every fee-to-text site; the planner read each site and verified #515's claims. Paths are under `apps/extension/src/` unless they start with `packages/` or `apps/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Fee amount at 6 dp, half-up | `utils/fee-estimation.ts` `formatFeeJuice` (default 6) | reuse inside the one helper; precision becomes a named constant |
| Fee USD, 3 dp, `<$0.001` hint, omitted without a live quote | `utils/fee-estimation.ts` `feeToUsd` + `feeJuicePricingFromUsd` | reuse inside the one helper |
| `{amount, usd}` pair and `~X FJ ($Y)` string | `popup/components/modules/send/fee-helpers.ts` `FeeDisplay`, `feeDisplay` (reads the wire's preformatted `maxFeeFormatted`), `feeAmountDisplay` (raw-in), `feeInWords`, `feeLine` | adapt: move to `utils/fee-estimation.ts`, make raw-in only, one marker rule |
| Balance at 4 (Send) / 2 (Home), truncated | `formatGasBalance(raw, maxDecimals = 4)`; `GasBalanceCard.vue:71,88` pass a literal `2` | adapt: name both precisions once, pass them explicitly |
| Shortfall cost rounded up at 6 | `fee-helpers.ts` `shortfallSentence` (own `SHORTFALL_DECIMALS = 6`, calls `formatBaseUnits` directly) | adapt: round up, then format through the helper |
| Queued cap cut to the readout's 6 dp | `wallet/services/execution/queued-fee-cap.ts:16` `READOUT_UNIT = 10n ** 12n` | adapt: derive from the named fee precision |
| USD price in a surface | `composables/usePrices.ts` `feeJuiceQuote`; each consumer owns a `PriceServiceClient` and calls `dispose()` | reuse; the execute and fee windows gain one client each |
| Value-slot markup (figure + styled `($Y)` span with `title="At today's AZTEC price"`) | written inline in `FeeCostReadout.vue`, `TxFeeRow.vue` (twice), `received/[id].vue` | build new: one L3 component; no existing component renders a fee |
| Generic `~X SYM ($Y)` for tokens | none. Searched `formatTokenAmount|tokenFiatLabel|export (const|function) format` in `utils/`, `wallet/services/price`, `packages/*/src`; `` `~${`` and `` `≈ ${`` repo-wide | build new on the fee primitives (token fiat uses `≈ $x` at cents, a different grammar) |

## Every site that prints a fee today

| Site | Today | Kind |
|---|---|---|
| `send/FeeCostReadout.vue:76-80` self-paid | `~X FJ` + span ` ($Y)` (`fee-estimate-usd`) | estimate |
| `FeeCostReadout.vue:66-72` sponsor | `Nothing` + struck `~X FJ ($Y)`; spoken "The sponsor covers about X FJ / about $Y" | estimate |
| `FeeCostReadout.vue:36-44` queued | `About X FJ ($Y)`; line "for at most {feeInWords(cap)}" | basis, cap |
| `FeeSettingsCard.vue:299-301` shortfall | "This send can cost up to X FJ. You have Y FJ." (cost up, balance down, both 6 dp) | bound + balance |
| `SendReviewSheet.vue:165-168, 66` | "Fee · ~X FJ ($Y)"; "Fee up to X FJ ($Y), based on your last send…"; "Fee is now X FJ ($Y), above the X FJ you accepted."; submit "Send for X FJ" | estimate, cap |
| `general/reask-review.ts:36-41` | builds the review's `now` / `nowAmount` / `capAmount` (drops the cap's USD) | data |
| `windows/fee/index.vue:111-112, 292` + `send/FeeRaisedCard.vue:49` | "Was X FJ · Now X FJ"; Confirm "Send for X FJ"; no price client | approved, new max |
| `windows/execute/OperationCard.vue:371-373` app-paid | "Fee up to X FJ" from `maxFeeFormatted` in `Text variant="name"` (body face); ", includes a X FJ priority fee…" | max, priority |
| `OperationCard.vue:397-409` person-paid | `FeeSettingsCard embedded` → the readout above | estimate |
| `tx/TxFeeRow.vue:47-50` header | paid `X FJ` / estimated `~X FJ`, USD a separate span without parens (`tx-fee-usd`) | paid, estimate |
| `TxFeeRow.vue:59,63,70` breakdown | L2/DA `X FJ`; "Estimated X FJ ($Y)" (`tx-estimate-usd`) | limit × price, estimate |
| `tx/tx-detail-helpers.ts:28-29` | `l2Cost`/`daCost` preformatted | data |
| `pages/received/[id].vue:166-167, 367-370` | `X FJ` (`received-fee-value`) + bare USD span in `type--meta` | paid by sender |
| `wallet/services/execution/transfer-executor.ts:816`, `dapp-send-executor.ts:545-549` | `maxFeeFormatted`, `priorityFeeFormatted` on `TransferFeeEstimate` (`packages/wallet-bridge/src/fee.ts:80-90`); only `OperationCard` and `feeDisplay` read them | wire |

Absence (searched, nothing found): no Activity or Home row prints a fee amount (`grep -i fee` over `modules/activity/*`, `components/composite/activity/*`, `utils/activity-rows.ts`, `pages/activity.vue`, `journal/[id].vue`; the only hit is "Fee went up. Review"); no toast, notification, aria-label or title carries a fee amount.

## Tests that pin fee strings

Unit/component: `fee-helpers.test.ts`, `utils/fee-estimation.test.ts`, `FeeCostReadout.test.ts`, `SendReviewSheet.test.ts`, `FeeRaisedCard.test.ts`, `windows/fee/index.test.ts`, `windows/execute/OperationCard.fee.test.ts` (`:345` "Fee up to 3.577824 FJ", `:378` priority clause), `pages/send.integration.test.ts` (`:649`, `:726`, `:851`), `FeeSettingsCard.test.ts:2801`, `pages/received/[id].test.ts:198,268`, `RecentActivityView.test.ts:1340`, `dapp-send-executor.test.ts:2037-2038`, `tx-detail-helpers.test.ts:23`. `TxFeeRow.test.ts` pins no fee string; `pages/tx/[id].test.ts` stubs `TxFeeRow`.

Network e2e: `tests/e2e/network/tx-sendTx-default.test.ts:192-195` (imports `formatFeeJuice`; exact Was/Now/Confirm), `fee-sponsor-funding.test.ts:261` (app-paid line regex), `same-token-concurrent-sends.test.ts:722-723` (re-ask regexes, USD already optional). No smoke e2e reads fee text. The e2e egress guard allows `api.coingecko.com`, so a network run may hold a live quote; `price-fixture.test.ts:35` seeds one.

## Roles and guards

Value figures render in `type--meta` (mono), USD in `type--fiat` (mono, 11 px override); the app-paid line is the exception (`name`, body face). `type-role-ban.reviewed.json` is empty; its identifier rule covers `trimAddress(` only. `copy-dash-ban` has no entry in these files.

## Collisions

PR #692 (storage-privacy-1) edits `pages/received/[id].test.ts`; PR #691 (execution-integrity-1) touches no fee display file; onboarding-3 adds a Presto line to `FeeSettingsCard.vue`'s template; sheet-1 reworks the Send review sheet. P38-03 A ("the card says About X") targets the app-paid label; no open PR carries it yet.
