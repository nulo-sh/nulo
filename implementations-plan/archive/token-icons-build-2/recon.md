# Recon: token-icons-build-2

At `52e2099ad`. Two Explore passes (the token rows and their guards; the fee-raised window and its reads), then a read of each file named here.

## The approval window's step sentence (#1789)

- `apps/extension/src/popup/windows/execute/SendTxSummary.vue`: the step head (no amount) ends `</span>&nbsp;<Icon name="chevron">` and the call line ends `to <AddressDisplay/>` (or `. Caller: none`) then `&nbsp;<Icon name="chevron">`. `Icon` draws an inline `<svg>`; `AddressDisplay` renders a `Text`, an inline `<span>`. The authorizations node's chevron sits in `.node_label`, an inline-flex box, which does not wrap.
- `#1789`'s probe (Chrome, `#/windows/execute?fixture=one` at 400 px): with the 16 px mark the chevron sits at top 297 under a line whose recipient ends at 357 of 371; without the mark it ends the line (top 277); a sender four characters longer wraps it alone again.
- `tests/e2e/execute-steps.test.ts` opens every fixture at 400 and 240 px and checks no text leaves the card (`textPastCard`); nothing reads the chevron's line.

## Token rows (`TokenCard`, Home, Holdings, Send's picker)

- `apps/extension/src/popup/components/modules/general/TokenCard.vue`: `.row` is flex, space-between, padding 8 px; the left column (symbol, then the flag, the priced figure or the name) starts at the row's edge; `.fiat_figure` caps the figure at 190 px with `overflow-wrap: anywhere`. It owns its `usePrices` (`isFlagged` used, `iconFor` not), so its three hosts pass nothing.
- Arc 2 of token-icons-build-1 built the mark here (`df103d395`, `f18f7f96c`: `TokenMark` 32 px in a `Flex gap=12` with both wrappers `min-width: 0`) and took it out (`2bffd89f9`), with the tests and mocks it touched.
- `apps/extension/tests/e2e/type-roles.test.ts`: `longBalance` (line 470) seeds 123,456,789,012,345.x of the scope token at a $1 quote; lines 921-924 hold the row's figure at two lines (`readTokenFiat` counts distinct rect tops, 544-551); the hero assertions (`expectHero`, 746-780) need the figure drawn below full size.

## Home's other rows

- `TokensView.vue:348-366`: user imports (`TokenImportRow :op`), each slot (`TokenCard`, `TokenImportRow :op` for a default's import, `TokenSeedRow :entry`), then two ghost rows (`tokens-skeleton-row`: `Skeleton` 52×14 and 84×11 left, 64×13 and 92×11 right) after 300 ms while nothing is known. `TokensView` holds `usePrices` (line 93) for ordering only.
- `home-slots.ts`: a default holds one slot from placeholder through its own import to its token row; a seed slot and a default's import slot carry the list's `entry` (`chainId`, `contract`, `symbol`); `userImports` are imports of anything but a listed default.
- `TokenSeedRow.vue`: an inert `div`, symbol (dimmed when stopped), then the display name or the reason; the loading block or RETRY on the right. `TokenImportRow.vue`: title (`op.title`, else the shortened contract, else "Token"), subtitle, spinner or the failed glyph; a failed row is `opacity: 0.7`; padding 16 px with a bottom border.
- `packages/design/src/ui/Skeleton.vue`: width and height props only, square.
- `tests/e2e/rows.test.ts:1180-1231` holds a working seed row at a loaded card's height.

## A dApp's transfer row

- `apps/extension/src/popup/components/modules/activity/TransactionCard.vue`: `titleMark` is null when `originLabel` is set; the app chip sits in `.app_slot` (`flex: 1 1 0`, `min-width: 20px`), shrinking from its 96 px cap.
- Journal rows of a dApp call are titled by the call (`journal-state.ts`, `journalCardTitleNamesToken`), so only the settled card titles a dApp's transfer by its token.
- `rows.test.ts`: `expectDirectionRows` (754-795) waits for the marks on rows without a chip, holds the large dApp transfer's chip at its cap (`toBeCloseTo(96, 0)`) and expects no mark on the two dApp rows; the dApp-rows test (1082-1162) holds a dApp transfer's chip between its floor and its cap and the 16-letter one at its 20 px floor (`expectFloorChip`).

## The fee-raised window

- `apps/extension/src/popup/windows/fee/index.vue`: root `v-if="appStore.isLogined"`; `OperationCard` under `v-if="operation && question"`, with no `marks`, so `SendTxSummary` draws no mark. `FeeRaisedCard.vue` owns the window's quote (its own `PriceServiceClient` and `usePrices`, a cached read in a window document).
- `useDappApprovalWindow.ts:138-151`: `start` connects, waits for the session check, sends a locked window to `/popup/auth`, and only then runs `init`.
- `useTokenFlags(priceService)` (`usePrices.ts:202-221`) reads `getQuotes` at once and on every `onConnected`, adopts broadcasts, and never asks for a fetch; `execute/index.vue:152-153,377-385,774` creates it at setup, connects it with the window's services and passes it as `marks`.
- `fee/index.test.ts`: [reads, refreshes] = [0, 0] while the operation resolves (235-244) and while the session is checked or locked (246-261, then [1, 0] signed in); [1, 0] then [2, 0] after a reconnect (223-233). `tests/helpers/price-client-fake.ts` sums every client's `getQuotes`.
- No fixture route opens the window; `tests/e2e/network/tx-sendTx-default.test.ts` reaches it on the sandbox (TST, which no list names).
