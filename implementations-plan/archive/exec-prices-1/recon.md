# exec-prices-1 recon

At `e7192fa8d` (origin/dev, carries #981). Two Explore agents (sonnet) plus direct reads. `X/` = `apps/extension/src`.

## Who asks for a price refresh

- `X/composables/usePrices.ts:82-95` is the only UI caller of `refreshIfStale` (grep over `X/**/*.{ts,vue}`, tests aside). It calls it at setup (`resnapshot()`) and on every `onConnected`. `useTokenFlags` (`:174-190`, #981) reads the list half through `getQuotes` only.
- `PriceService.getQuotes` (`X/wallet/services/price/service.ts:167-170`) reads config and the storage cache; it never fetches. `refreshIfStale` (`:173-190`) fetches when the cache is incomplete and the watermark allows. A fetch, by `refreshIfStale` or the 3-minute alarm, broadcasts `onQuotesUpdated` to every client on success (`:409`) and on failure (`:440`). Unlock refreshes on its own (`onActiveProfileChanged`, `:239-250`).
- Requests auto-connect: `AppFeeLine` and `FeeRaisedCard` never call `connect()` (`packages/extension-messaging/src/core/base-client.ts:105-125`, `ensureTransportReady`).

## What mounts in a dApp window document

- Windows and popup pages share one shell. `X/popup/app.vue:559-613` renders `PopupManager`, the managers and barriers, then a bare `RouterView`, for every route. No layout exists only for windows or only for popup pages. Routes come from vite-plugin-pages: `src/popup/windows` → `baseRoute: "windows"` (`apps/extension/scripts/pages-options.ts`), so names are `windows-*` and paths `/windows/*`.
- Every dApp window URL is built by the worker as `src/popup/index.html#/windows/<name>?…`: `X/wallet/services/dapp-interaction/service.ts:104`, `passkey/service.ts:151`, `wallet-sdk/session-established.ts:76`.
- A locked window leaves its route: `useDappApprovalWindow.start` stores `pageAwaitingAuth` and pushes `/popup/auth` (`X/composables/useDappApprovalWindow.ts:147-150`); after unlock `auth.vue:100-106` pushes back. So in a window document the route is `popup-auth` at the moment `appStore.isLogined` turns true. `X/popup/index.ts:41-42` already reads the first hash before the router for the same reason (`captureOwnWindow`, `X/utils/own-window.ts:1-6,37-53`).
- Paths to `usePrices` in a window document, all traced:
  1. `windows/execute/OperationCard.vue:396-402` mounts `send/AppFeeLine.vue` (`usePrices` at `:31`) for an app-paid fee while estimating or estimated.
  2. `OperationCard.vue:429-441` mounts `send/FeeSettingsCard.vue` (`usePrices` at `:181`) in the last `v-else` (no `fee` slot, not app-paid).
  3. `windows/fee/index.vue:270` mounts `send/FeeRaisedCard.vue` (`usePrices` at `:49`) in `OperationCard`'s `fee` slot.
  4. **Not in #982**: `components/popups/PopupManager.vue:96-97` mounts `SelectTokenPopup` under `v-if="appStore.isLogined"` in every route, windows included; its setup calls `usePrices` (`SelectTokenPopup.vue:50-51`) whether or not it is shown. No window opens `select_token`.
- `FeeSettingsCard`'s children (`FeeMethodRow`, `FeeCostReadout`, `FeePriorityRow`, `FeeMethodSelector`, `FeeAmount`) take prices as props only. No other `usePrices` caller (11 sites, all under `X/popup/components/**` or `X/popup/pages/**`) is mounted by a window or by the shell.

## Hosts that must keep the refresh

- Send: `X/popup/pages/send.vue:263-264` calls `usePrices` itself at setup; `FeeSettingsCard` at `:847`.
- Authwit popups: `ChangeAuthwitsRegistryPopup.vue:152`, `RevokeAuthwitsPopup.vue:243` mount `FeeSettingsCard`; their hosts make no other price read, so the card's refresh is theirs.

## Tests that count refreshes today

`tests/helpers/price-client-fake.ts` counts `refreshIfStale` calls (`refreshes()`); `onConnected` is a bare `{ add, remove }` spy, so no test reconnects a window. Counts that encode the window refresh: `AppFeeLine.test.ts:30` (1), `FeeRaisedCard.test.ts:55` (1), `OperationCard.fee.test.ts:355-359` (0 then 1), `windows/fee/index.test.ts:220,231,242,248` (1, 0, 0, 1). `windows/execute/index.test.ts:758` pins 0 for the flag read. `OperationCard.fee.test.ts` mounts the real card, `FeeSettingsCard` and `AppFeeLine` over the real `usePrices` with wire-shaped `sendTx` arguments (`field(...)`); the fee window test mounts the real `FeeRaisedCard`.

## Real-browser coverage that already exists

`tests/e2e/network/tx-sendTx-default.test.ts:132-203` seeds a Fee Juice quote in the cache (`fixtures/fee-quote.ts:35-50`), refuses CoinGecko, opens the fee window and expects its figures priced (`settledText`). `fee-sponsor-funding.test.ts:260-348` does the same for the execute window's card. A cache read prices both, so these specs prove the cached read in Chrome and Firefox CI unchanged. No smoke spec opens a dApp window (grep for `windows/execute`, `execute-op`, `dapp-approval-confirm` under `tests/e2e/*.test.ts`).

## Closed limits

`gh issue list --state closed --label known-limit --search price`: #711, #724, #512 (none about windows). #672 (refresh while locked) is fixed in the service.
