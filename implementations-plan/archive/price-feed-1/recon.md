# price-feed-1 recon

Base: `origin/dev` at `c77e77f13`. Two Explore agents (sonnet) plus the planner's own reads. Paths are repo-relative.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Payload validation, both modes | `packages/token-list/src/parse.ts`: `record`, `ensure`, `isText`, `PayloadError(path)`, `checkPayload`, `checkSource` | adapt: a `priceFeeds` key in `PAYLOAD_KEYS` and in `checkSource` |
| Feed id charset | `parse.ts` `PRICE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/`, both modes today | reuse as is for the map keys |
| Wallet-side selection | `parse.ts` `selectEntries` drops a `priceId` outside `PRICE_IDS` | adapt: keep a `priceId` only when the list carries an accepted feed for it |
| Compiled table | `packages/token-list/src/price-ids.ts` `PRICE_IDS`, `isPriceId` | replace by the one fixed Fee Juice feed and the list bounds |
| Refusal tests | `parse.test.ts` builders `entry`, `payload`, `refusedAt(value, mode)` | reuse as is; add a feed builder |
| Approver digest | `packages/token-list/src/sign.ts:32` `listSha256({ tokens, flagged })` | adapt: cover the feeds; today's source keeps its digest |
| Review summary | `infra/token-list/scripts/summary.ts` `tokenDiff`, `flagDiff`, `renderDiff`, `cell` | adapt: a feed diff beside them |
| Advisory network check | `infra/token-list/scripts/live-check.ts` (injected `fetch` + deadline, fixed fault categories, `cell()` table, `## … (advisory)`), its test `infra/token-list/test/live-check.test.ts` | build new `price-check.ts` on that model |
| Capped body read | `packages/wallet-core/src/utils/read-capped.ts` `readBodyCapped`; `infra/token-list` depends only on `@nulo/token-list` | copy the cap locally (about 15 lines), no new workspace dependency |
| Workflow step | `publish-token-list.yml` `prepare` "Live check (advisory)": `continue-on-error`, `timeout-minutes: 5`, `>> $GITHUB_STEP_SUMMARY` | reuse the step shape |
| Workflow pin | `scripts/ci-cd/behavior-gating.test.ts:1815-1826` pins `prepare`'s steps after `summary` exactly | adapt: the pinned list gains the new step |
| Price lookup and request set | `apps/extension/src/wallet/services/price/price-map.ts` `entryFor`, `getPriceMapEntry`, `proxyTickerFor`, `getSanityBand`, `allCoingeckoIds`, `FEE_JUICE_ENTRY` | adapt: every function takes the table built from the list |
| Quote validation | `price/service.ts:46` `isValidQuote`, `:64` `usableQuotes` (exported, sync) | adapt: split the row-local checks from the band |
| Stored-shape decoder | `apps/extension/src/wallet/storage/stored-shapes.ts:241` `tokenPrices: described(…, usableQuotes)`; goldens `tokenPrices.minimal/full` (`goldens.json:1418-1460`) read through it at `GOLDEN_NOW` | adapt: the decoder keeps the row-local checks; see Facts |
| List snapshot | `token-list/service.ts:265` `toSnapshot` copies `sequence, keyId, entries, flagged`; spec `TokenListSnapshot` | adapt: carry the feeds |
| Stored list | `nulo:core:token-list` holds the raw envelope text, re-verified and re-parsed at each start (`adoptStored`, `token-list/service.ts:~165`) | no storage stamp for the payload field |
| Popup ticker | `popup/pages/send.vue:28,287` imports `proxyTickerFor` (compiled) into the popup bundle; `AmountCard.vue:265` renders "Priced via ${proxyTicker}, at today's rate" | adapt: the ticker comes with the snapshot |
| Popup lookup | `composables/usePrices.ts:125,132` `getPriceMapEntry` over `PriceSnapshot.pricedTokens`; `:138` `FEE_JUICE_ENTRY` | adapt (signature only) |
| Dust filter | `incoming-transfer/service.ts:726` `getPriceMapEntry(prices.pricedTokens, …)` then `prices.quotes[entry.coingeckoId]` | reuse as is |
| Test fixtures | `token-list/list.fixture.ts` `TEST_LIST_ENTRIES`, `TEST_PRICED_TOKENS = pricedTokensOf(…)`; 27 files read `pricedTokens`, every hand-built one is `{}` | adapt the fixture only |
| e2e lists | `apps/extension/tests/e2e/fixtures/token-list.ts:43-93` strict-signs `E2E_LIST_TOKENS` (`usd-coin`, `tether`); `:209` `selectEntries`; `skipUnlessListPrices` skips fiat specs when a held published list prices nothing | adapt: the source run's list carries the two feeds |
| e2e sandbox rule | `price-map.ts:41,54` `VITE_NULO_E2E_PRICE_MAP` prices chain 0 as `usd-coin` with a build stamp; `_build-extension.yml:142` greps release bundles for it | adapt: the rule brings its own feed |

No existing feed-record shape, band ceiling, ticker rule or CoinGecko id check exists. Trail: `grep -rni "coingecko\|priceId\|PRICE_IDS\|sanity\|ticker"` over `packages/`, `infra/`, `scripts/`, `apps/extension/src`, `.github/`; `grep -rn "coins/list\|/coins/"` (no hit). The only CoinGecko endpoint in use is `/api/v3/simple/price` (`price/service.ts:33,359`).

## Issue claims checked (#1605 and the lane brief)

- Compiled table, strict refusal, wallet-side drop, the price-map readers, FORMAT.md's two sentences: hold (`price-ids.ts:11-16`, `parse.ts:94-98,202-213`, `price-map.ts:26-72`, `FORMAT.md:84,87`).
- "The source list today … after #1603, cUSDC and cWETH": does not hold at the base. #1603 is an open PR; `list.source.json` at `c77e77f13` has the four Testnet tokens only. The plan does not depend on it.
- `incoming-transfer/service.ts:727` reads by `coingeckoId`: holds at `:726`.

## Facts the issue does not state

- `usableQuotes` is the stored-shape decoder of `nulo:core:token-prices` and checks the compiled band (`stored-shapes.ts:241`, `price/service.ts:58`). A decoder that needs the list cannot be called by the registry, which passes `(value, now)` only (`stored-shapes.ts:67`).
- The approver's digest covers tokens and flags only (`sign.ts:32`); a feed outside it could change between `prepare` and `sign` unseen.
- Privacy Policy § 5.2 (`legal/privacy.md:137-138`): "Nulo requests prices for the token-ID list bundled with that extension version." It stops being true. § 5.11 already says the list sets "the price each one uses".
- `SECURITY.md:489-492,745`, `ARCHITECTURE.md:100`, `packages/token-list/README.md:16,21,38-40`, `.claude/skills/e2e-testing/SKILL.md:813-816`, `price-map.ts:1-13` and `price/service.ts:75-80,232` state the compiled table or the "fixed id table" rule.
- `packages/token-list/README.md:38-40` says `token-list-pins.test.ts` ties `PRICE_IDS` to the price map; that test holds no price pin (grep `price` in it: no hit). Stale.
- `floor.ts:12-13`: "a changed field moves nothing": a `priceId` change never raises the floor today.
- `MAX_PRICE_RESPONSE_BYTES = 16 * 1024` (`price/service.ts:42`) is sized for "about 300 bytes" for four ids.
- The network e2e (agent build) seeds a `usd-coin` quote in storage (`tests/e2e/network/fiat-send.test.ts:47`, `fixtures/tokens.ts:159`); the read path must still find a band for it.

## Collisions

- Open PR #1603 edits `infra/token-list/list.source.json`; this lane does not touch that file.
- Closed known limits read: #1577, #1012, #984, #711, #512, #385, #387, #1001, #1353 (`gh issue list --state closed --label known-limit --search price`). None covers feed data from the list.
