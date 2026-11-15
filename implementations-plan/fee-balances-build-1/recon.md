# fee-balances-build-1: recon

Read directly at `612d2809d` (no recon agents: three files and their tests).

## What draws the rows

- `apps/extension/src/popup/components/modules/send/FeeMethodRadios.vue`: the `send-fee-payers` radio group. Each row is a `<label>` of an invisible radio, `.main` (title over definition) and `.spend` (a Skeleton while `checking` or `verifying`, else `m.disabledReason` on a disabled row, else `m.spend`). `.spend` composes `type--meta`.
- `fee-helpers.ts`: `buildFeeMethods` builds the rows; `feeJuiceOption` / `privateFeeJuiceOption` set `spend` from `formatGasBalance` (4 decimals) and disable on a `"0"` leg ("no balance"), a `null` leg ("couldn't check balance") or a missing PrivateFPC ("not available"). `loadingRow` keeps only type, title, subtitle, fpc and `checking`.
- `FeeSettingsCard.vue:468` mounts the radios with `menuMethods`; `prices = usePrices(priceService)` is already there (`:202`), and `prices.feeJuiceQuote.value?.usd` already feeds the fee figures.

## Dollars

- `wallet/services/price/convert.ts`: `tokenAmountToUsdMicro` (half-up; throws on a negative amount or a rate under micro-USD precision) and `formatUsdMicro` ("$1,249.38", "<$0.01" under a cent). Home's `GasBalanceCard.vue:69-75` uses the pair with an "≈" prefix.
- The Fee Juice quote is banded at write by `FEE_JUICE_PRICE_FEED` (`min: 0.0001`, `max: 100`) and validated finite and positive (`price/service.ts` `isWellFormedQuote`).
- `utils/token-amount.ts` `parseSide`: a non-negative integer literal of at most 80 digits, else `undefined`.

## Type roles

- `packages/design/README.md` § Type roles: `value` Inter 12/600 ("Values in key/value rows, Settings trailing values"), `caption` Inter 11/400 ("A row's secondary line"), `fiat` mono, "Every dollar value". `type-role-ban.test.ts` takes `composes: type--<role> from global` first in a single-class rule.
- `tests/e2e/type-roles.test.ts` sweeps the Fee sheet in its "Send's person step…" case (`expectPageClean(page, "Send, the Fee sheet")`).

## E2E readers of the rows

- `send-fee-privacy.test.ts`, `fixtures/send-page.ts`, `send-keyboard.test.ts`: `data-fee-method`, `input:checked`, `data-fpc-id`, testids only.
- `network/fee-methods.test.ts:56-63`: the chosen label's text contains "Sponsored".
- `network/fee-sponsor-funding.test.ts:93-102`: the chosen label's first `span span` (the title).
- `network/send-chaos.test.ts:106`: every label's text, for a failure message only.

## Capture kit

- fee-balances-1's scratch spec (`zz-fb1-balances.test.ts`, in the lane's cache, never committed): `feeJuiceImportedExtension` (1,000 FJ public and private), `refusePrices` then `seedFeeJuiceQuote` ($7), `shotSend` on `send-fee-sheet` at 360 and 240, a per-span measure (lines, `overflowX`, `outside`).
