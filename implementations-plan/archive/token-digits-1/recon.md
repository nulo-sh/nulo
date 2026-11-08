# token-digits-1 recon

Base: `origin/dev` at 002b76fc7. Two Sonnet explorers (a reuse sweep; an e2e and seed mapper), each claim re-read by the planner. Paths are under `apps/extension/src/` unless they start with `apps/`, `tests/` or `scripts/`. The research note the lane started from was written at 7eed331bb; every line it cites still holds at 002b76fc7 except where this file says so.

## Reuse map

| Capability | Existing code | Verdict | Why |
|---|---|---|---|
| Width cut, K/M/B/T, `<0.0…1` floor | `balanceFormatted(units, decimals, length, { compact: true })`, `utils/amount.ts:98-137` (`compactCut` :69-87) | reuse as-is | Takes `bigint \| string`; a pre-truncated bigint feeds it directly; `compactCut` reads the whole part from the units, so truncating the fraction first moves no K/M/B/T tier. |
| Truncation never rounding up, trailing zeros trimmed | `formatBaseUnits` (`utils/amount.ts:242-282`) through `balanceFormatted` | reuse as-is | A truncated bigint re-trims through `formatBaseUnits(u, decimals)` at :109, so no trailing zero comes back. |
| Decimal count from magnitude (whole digits; significant digits below 1) | none | build new | Searched `significant\|sigDigit\|toPrecision\|toSignificant\|decimalPlaces\|wholeDigits\|magnitude\|digitCount` over `apps/extension/src` and `packages/*/src` (non-test): one unrelated comment (`utils/account-name.ts:12`). |
| Truncate a bigint to N decimals, staying bigint | inline `10n ** BigInt(…)` in `amount.ts`, `hero-fit.ts:56`, `price/convert.ts:75` | build new (one line) | Nothing exported; `u - (u % 10n ** BigInt(decimals - keep))`. |
| Fixed decimals for a balance | `BALANCE_DECIMALS` (`utils/fee-estimation.ts:19`) | not reused | Fee Juice only, fixed count, out of scope. |
| Fiat rounding | `formatUsdMicro` (`wallet/services/price/convert.ts:88-93`) | untouched | Half-up to cents; the fiat lines keep it (lane brief). |
| Decimals and side validation | `knownDecimals`, `parseRawBalance`, `parseSide`, `isValidDecimals` (`utils/token-amount.ts`) | reuse as-is | Callers gate before formatting today; the new helper keeps their order. |
| Locale separators in tests | local `useSeparators` in `utils/amount.test.ts:414-431` | reuse as-is | The new table lives in the same file, so it calls the same helper. |
| Census of capped calls | `utils/amount.callers.test.ts` with `callsTo` (`apps/extension/scripts/type-roles/source-code.ts:191`) | adapt | Counts `balanceFormatted` calls per file under `apps/extension/src` (tests skipped; `amount.ts` is scanned). Adapt to count the list helpers too, so each surface's tier is pinned. |

## Call sites (non-test) and the surface each draws

| Call | Width | Surface | In the rule? |
|---|---|---|---|
| `popup/components/modules/general/TokenCard.vue:55,69,70` | 10 (`FIGURE_WIDTH`) | Token row total and split, on Home (`TokensView.vue:351`), Holdings (`holdings/TokenList.vue`) and Send's picker (`SelectTokenPopup.vue:153` → `TokenList`) | yes |
| `popup/components/modules/general/BalanceView.vue:75,79` | literal 10 | Token page split lines (`private-balance-value`, `public-balance-value`); Home's `BalanceView` has no token, so no split | yes (P116-13 B) |
| `popup/components/modules/activity/TransactionCard.vue:131` | 8 (`ROW_AMOUNT_LENGTH`) | Settled tx row: Home, History (`TransactionsList` → `ActivityRowCard`), the token page | yes |
| `components/composite/activity/TransactionIncomingCard.vue:43` | 8 | Received row, same three screens | yes |
| `popup/components/modules/general/RecentActivityView.vue:202` | 8 | The executing UI send's in-flight card (Home, the token page) | yes |
| `utils/journal-state.ts:80` (`journalCardAmount`) | 8 | In-flight journal card: Home, the token page (`RecentActivityView.vue:627`), History (`activity.vue:249`) | yes |
| `utils/journal-state.ts:461` (`transferCardFields`) | 8 | Terminal journal row, same three screens | yes |
| `utils/snack-amount.ts:12,13` (`formatSnackAmount`) | full, and 8 | Arrival chip and "Received" snack (`composables/useArrivals.ts:118`); "Transaction submitted" and "Sending X to …" toasts (`utils/send-summary.ts:12` → `send-submit.ts:91`, `useSendsInProgress.ts:65`) | yes |
| `popup/pages/tx/[id].vue:89`, `journal/[id].vue:93`, `received/[id].vue:136` | 8 (`DETAIL_AMOUNT_LENGTH`) | Detail heroes | no (P116-13 C not picked) |
| `utils/hero-fit.ts:57,59,76` | 20 and shorter | Token page hero; fiat hero | no |
| `formatBaseUnits` in `AmountCard.vue`, `amount-field.ts`, `fee-helpers.ts`, `call-surface.ts`, `fee-estimation.ts`, `price/convert.ts` | — | Send corner, field, Max; execute window; Fee Juice; fiat | no |

## Tests that pin strings on the surfaces in scope

Strings computed by a scratch run of the proposed helper over the real `balanceFormatted` (bun 1.4.2, en-US), not by hand.

| Test | Pinned today | Under the rule |
|---|---|---|
| `TokenCard.test.ts:386-391` (999.999 all public, 18 dec) | `999.999`; sides `0` / `999.999` | `999.99`; `0` / `999.99` (title changes) |
| `TokenCard.test.ts:393-403` (0.0005 + 999.9985) | `999.999`; `0.0005` / `999.9985` | `999.99`; `<0.01` / `999.99` (the P116-13 addition) |
| `TokenCard.test.ts:381-383` | `123.45M`; `123.45M` / `1,234.5` | unchanged |
| `snack-amount.test.ts` "whole digits that end inside the cut" | `1,234,567.890123` | `1,234,567.89` |
| `snack-amount.test.ts`, other six rows | `1.5`, `12,345.6`, `123,456`, `123,456,789`, u128, `<0.000001`, `0` | unchanged |
| `TransactionCard.test.ts` (`1`, `1.23M`, `125`), `TransactionIncomingCard.test.ts` (`+500`, `+1.5`, `+42`, `+123.45M`, `+999,999`), `journal-state.test.ts` (`1.5`, `10`, the hex BUG PIN), `RecentActivityView.test.ts` (`1.5`, `2`), `activity.test.ts`, `incoming-row-parity.test.ts`, `useSendsInProgress.test.ts`, `send-submit.test.ts`, `BalanceView.test.ts` split (`1,000` / `250`, `—`) | — | unchanged |
| `utils/amount.test.ts` (`balanceFormatted`, `formatBaseUnits` tables) | — | unchanged; the primitives do not move |
| Detail-page and hero tests (`tx/[id]`, `journal/[id]`, `received/[id]`, `hero-fit`, `holdings`) | — | unchanged; out of scope |

`journal-state.test.ts:383-389` is a BUG PIN (closed known limit #1593): the terminal card hands the stored string to `BigInt`, which reads hex. The new helper must convert a string the way `balanceFormatted` does, so the pin holds.

## E2E

No e2e assertion compares an amount string the rule changes (the e2e mapper read every smoke and network spec and fixture; the planner re-read the ones below).

- **Smoke.** `rows.test.ts` logs its row amounts and asserts only presence, cut and overlap, except the receipt chip: "Received privately" beside `+28.43950` (`28439501`, 6 dec, `:813-819`) wraps at 360 px, and `expectReceiptFitsFromItsWidth` (`:749-770`) computes the width it fits from. `+28.43` frees the amount column, so the chip would fit and the check stop testing a wrap: reseed it. `send-outcome-rows.test.ts:146` asserts `1.5` (unchanged). `token-list.test.ts:161-205` seeds balance rows, restarts, then visits Home, Holdings, the token page and Send's picker with `shotSend`: the pattern for the captures.
- **Network.** `waitForTokenCardAmount` (`fixtures/tokens.ts:405-420`) reads `1,000` with a digit-boundary regex; `waitForTxConfirmation` (`fixtures/transfers.ts:179-209`) matches `data-tx-amount-display` exactly (`1`, `3`, `5`, `7`, `10`, `50`, `100`); `unlockUntilIncomingRow` (`fixtures/auth.ts:351-366`) `+7`, `+9`; `incoming-public-transfers.test.ts` `+10`, `1010`; `transfers.test.ts:169-176` `950` / `50`; `store-captures.test.ts:334` `1,250`. All whole numbers, so all unchanged (the rule trims zeros). `incoming-arrival.test.ts:538-576`'s hostile chip is 10^38 raw of an 18-decimal token, a whole number: unchanged. No test reads an amount from a toast.
- **Running.** `agent.sh` runs only the network config (`scripts/e2e/agent.sh:16,265`); a smoke path makes its guard exit 2. Smoke runs through `bun run test:e2e` after the armed build (`global-setup-smoke.ts:20`), and claims its egress ports in `~/.agents/ports.md` per launch (`fixtures/egress-guard.ts:176-186`). Captures: `shotSend` (`fixtures/shots.ts:19-52`), opt-in with `NULO_E2E_SHOT_DIR`, writes light and dark.
- **Seeding sample balances on smoke.** `VITE_NULO_E2E_TOKEN_SEEDS` seeds only the sandbox TST; balances are written as rows (`token-list.test.ts:75-92`, `rows.test.ts:1163-1177`) after `refuseTestnet` (`helpers/contacts.ts:68`), then a background restart. The fixture list holds USDC and USDT at 6 decimals (`fixtures/token-list.ts:46-53`); an 18-decimal row comes from `seedTokenRow`'s `token` override.
- **The prototype** (branch `worktree-shots-p116`, read only): `listTierUnits` truncates then calls today's `balanceFormatted`, wired into `TokenCard` only, each side truncated alone; its capture spec seeded the three sample balances on Home only. Nothing is taken from it but the computed strings it confirmed.

## Complexity

`noExcessiveCognitiveComplexity` ≤ 15 (`biome.json`); `amount.ts` has one accepted entry, `formatBaseUnits` at 22 (`scripts/complexity-baseline/manifest.json`). `balanceFormatted` is near the budget: the rule goes in new functions, never a branch inside either primitive.

## Collision and dedup risks

- Routing only one of `journal-state.ts`'s two calls, or leaving `RecentActivityView.vue:202`, would make an in-flight card and its settled row disagree on one send.
- `formatSnackAmount`'s whole-digit comparison stays valid when its full form is truncated: truncation never shortens the whole part.
- `balanceFormatted` and `formatBaseUnits` serve the detail heroes, the token hero, Send and the execute window: their contracts must not move.
- Open issues: none collides (searched open issues for `decimals`, `balanceFormatted`, `token amount`, `split line`, `snack`, `chip`; only #1702, this lane's, matches). Closed known limits read: #1593 (hex journal amount, above), #106, #414 (neither touched).
