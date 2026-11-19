# p116-build-1 recon

Read at `002b76fc7` (origin/dev). One reuse sweep (Explore, sonnet) plus direct reads. Paths are under `apps/extension/`.

## Receive sheet

- `src/popup/components/popups/ReceivePopup.vue:61,132-140`: one `<canvas id="my-qr-code">`, drawn by `lean-qr` `generate(address).toCanvas(canvas)` with no size option (`:44-45`). `.qrcode { width: 100% }` stretches it over the body column, 320 px in the 360 px frame (body padding 20 + 20). The parent column (`:60`, `align="center"`) already centres a narrower canvas. No other QR code exists in the repo.
- The sheet: `components/Popup/PopupCard.vue` is content-sized and scrolls (`overflow: auto`, hidden scrollbar); the frame it gets is 558 px (prototype measure: content 591 px, so it scrolls 33 px). The prototype measured 511 px at 240 px with "Testnet" and with a 24-character name on one line.
- Network names: the New and Edit network fields cap a name at 25 characters (`NewNetworkPopup.vue:167`, `EditNetworkPopup.vue:121`); the service schema has no cap (`wallet/services/network/spec.ts:212-218`). `tests/e2e/fixtures/networks.ts:15` `LONG_NETWORK_NAME = "W".repeat(25)` is "the longest one-word name the network name field takes". `stale-network.test.ts:218` renames through `callService(..., "renameNetwork", [id, LONG_NETWORK_NAME])`. No popup code subscribes to `onNetworkUpdated`, so a service rename reaches the sheet only on a new popup page.
- `tests/e2e/type-roles.test.ts:892` sweeps the open sheet through `expectPageClean`, which also runs `expectFitsNarrow` at `NARROW_WIDTH = 240` (`fixtures/type-roles.ts:722`): nothing may pass the view or scroll sideways there.
- `tests/e2e/snackbar.test.ts:511-527` captures `sheet-receive`, then calls the spec-local `scrollToEnd` (its only caller, `:269`) with the comment "the whole address and the network line make the sheet scroll a little". `:529-550` lengthens the card by 400 px, so it does not depend on the sheet's own height. `:542-555` points at the address's last line, where the success snack opens. `contacts-import.test.ts:85-100` (`reviewFit`) is the model for "the card does not scroll": `card.scrollHeight > card.clientHeight` on `popup-card-body`'s parent.
- `ReceivePopup.test.ts:94-100` already renders a 27-character typed name whole and as text.

## Holdings header

- `src/popup/pages/holdings.vue:130-134` `summaryMeta`: `""` while the list reads or failed, `"Prices unavailable"`, else `"N tokens"` plus `" · priced assets only"` when `aggregate.partial`. `:207` the line is `Flex align="end" justify="between"`. `:147-158` `fitTotal` measures the room as the line minus the hidden ruler's meta copy at `min-content` (`:224`, `.summary_ruler_meta`), so a meta that wraps leaves the total more room. The sweep reported this as a live-element measure; it is the ruler copy (`metaRuler`).
- `Flex` (`packages/design/src/core/Flex.vue:18-23`) has no `baseline` value; seven module rules already set `align-items: baseline` locally (`SendTxSummary.vue:168`, `fee-shared.module.css:36`, `SendReviewSheet.vue:357`, …).
- `hero-ruler` consumers: `AmountCard.vue`, `SendReviewSheet.vue`, `BalanceView.vue`, `holdings.vue`. Only Holdings fits beside a sibling.
- `pages/holdings.test.ts` pins the suffix at `:180`, `:540`, `:604`, and the narrowest-word fit at `:629-653` (a `getBoundingClientRect` spy that answers the ruler's narrowest word).
- Home's hero keeps its own "priced assets only" (`BalanceView.vue:323-333`, `BalanceView.test.ts:666,675`); nothing else names the phrase.
- Real layout over seeded holdings: `type-roles.test.ts:862-900` (`listedExtensionPerTest`, `skipUnlessListPrices`) opens Holdings with one priced holding of $123,456,789,012,345.xx (`longBalance`), so its total is fitted below full size; it asserts nothing on the header. `token-list.test.ts:164-181` opens Holdings holding one flagged, unpriced token and captures `flagged-holdings`.

## Harness

- `scripts/e2e/agent.sh` runs only `vitest.e2e.network.config.ts`. Smoke runs through `bun run test:e2e`; each guarded launch claims its egress ports in `~/.agents/ports.md` (`fixtures/egress-guard.ts:199`). A local smoke run needs the armed build (`global-setup-smoke.ts`: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:<browser>`) and `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1` at run time.
- `shotSend` (`fixtures/shots.ts:19`) is opt-in under `NULO_E2E_SHOT_DIR`; it scrolls its focus testid to the centre, then shoots both themes.
