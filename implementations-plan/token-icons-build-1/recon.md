# Recon: token-icons-build-1

Read at `dev` `32fd50e60`. Two read-only sweeps (a reuse sweep over eight capabilities, a map of the six surfaces against the prototype branch `proto/token-icons-1-b2`, base `ccd14c85f`) plus the planner's own reads. No wiring path changed between `ccd14c85f` and `32fd50e60` (`git diff --stat` empty on every surface file).

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Icon field and its validation | `packages/token-list/src/parse.ts` (`checkEntry`, `checkSource`, `wallet`/`strict` modes); no data-URL or SVG check anywhere (searched `atob\|btoa\|base64`, `image/(png\|svg)`, `svg\+xml`, `89504e`, `DOMParser` over `apps`, `packages`, `infra`, `scripts`) | adapt `parse.ts`; build new `icon.ts` beside it (the import-closure test, `import-closure.test.ts`, lets `sign-cli.ts` import only same-directory files, and the worker has no `DOMParser`) |
| Base64 decoding | `envelope.ts:47` `decodeBase64Url` (base64url, unpadded only); `wallet/utils/lenient-base64.ts` (accepts garbage, `Buffer`) | build new: a canonical standard-base64 check in `icon.ts` (`atob` + re-encode round trip) |
| Publisher rule and tree checks | `infra/token-list/scripts/check.ts` (`treeFindings`, `keyFindings` keeps `FORMAT.md`'s key table equal to `keys.ts`); `test/tree.test.ts`, `test/publish.test.ts` | adapt: the required icon (L3) and the provenance table check go in `sourceFindings`, following the key-table precedent |
| Approver's summary | `infra/token-list/scripts/summary.ts` `row()`, `tokenDiff` (JSON compare) | adapt: an icon column (media type, bytes, digest prefix) |
| Floor rule | `scripts/floor.ts` keys on `chainId:address` only | reuse as-is (an icon change raises no floor) |
| List to popup channel | `PriceSnapshot.flaggedTokens` (`price/spec.ts:52`), built in `price/service.ts` `snapshotOf`; `listState`, `usePrices`, `useTokenFlags` (`composables/usePrices.ts`) | adapt: one more field on the same snapshot; no second channel |
| Row-to-list match | `utils/token-flag.ts` `keyOf` over `tokenKey` (`parse.ts:163`, a stored shape) | reuse `keyOf` (export it); never change `tokenKey` |
| Initials | `utils/string.ts:31` `getInitials` (feeds the persisted contact `abbr`; no letter filter, UTF-16 slicing); `AccountAvatar.vue` (grey square) | build new sibling `tokenInitials`; do not touch `getInitials` |
| Mark component | none (`*Avatar*`, `*Mark*`, `*Logo*`, `<img` searched; only `AccountAvatar` and `DappIdentityBlock`'s 40 px `<img>`) | build new `TokenMark.vue` (L3 composite) |
| Corner badge | `SelectTokenCard.vue:191` `.type_icon` (warning, 10 px, `--app-bg` pad, -4 px); Activity's round `.badge` is a different recipe | adapt: the mark owns the `.type_icon` recipe and Send's row stops copying it |
| Type roles | `type--row-title` (size `null`); scale `[8,10,11,12,13,14,…]`; `type-role-ban.test.ts` refuses a size off the scale, under 10 px, or with no role carrier | reuse: one class per size step composing `type--row-title` (10, 12, 13 px) |
| CSP | `manifest.config.ts:51` `img-src 'self' data: blob:`, one string for both browsers, pinned by `manifest.test.ts:132` | reuse as-is; no change |
| Header leading slot | `packages/design/src/ui/SubPageHeaderBase.vue:54` renders `leadingIcon` with no slot; `SubPageHeader.vue` forwards `title` and `trailing` only | adapt: a `leading` slot whose fallback is today's icon |
| Activity title slot | `TransactionCardLayout.vue:125` title row; `title-trailing` slot exists | adapt: a mark before the title, given by the four cards that name a token |
| Component tests | `AccountAvatar.test.ts` (10 cases), `TokenCard.test.ts`, `TransactionCard.test.ts` (stubs the layout), `SelectTokenCard.test.ts` (asserts `token_initial`), `tokens/[id].test.ts`, `OperationCard.*.test.ts` + `execute.fixture.ts` (no `SendTxSummary.test.ts`), `SubPageHeaderBase.test.ts` | reuse their helpers; update the `getQuotes` mocks |
| Smoke captures | `tests/e2e/fixtures/shots.ts` `shotSend` (opt-in `NULO_E2E_SHOT_DIR`, Chrome only), called from `home-links`, `send-picker-add`, `holdings-add-token`; `network/store-captures.test.ts` (opt-in `STORE_CAPTURES=1`); held list via `launchExtension({ tokenList: "held" })`, signed by `signTestList` → `signList` → `checkSource` (strict) | reuse; the fixture tokens gain an icon |
| Network list at run time | `network/register-token.test.ts` signs and serves a list naming a sandbox address (`signTestList`, `serveTokenList`) | reuse for the approval-window capture with a logo |

## Surfaces at `32fd50e60`

| Surface | Where the token renders | In scope there | Prototype (`b2`) |
|---|---|---|---|
| Home, Holdings, Send's picker | `TokenCard.vue:96-103` (symbol column) | full token; `prices.isFlagged` | 32 px mark before the column, gap 12 |
| Send's asset row | `SelectTokenCard.vue:104-107` (36 px accent square, `charAt(0)`, no-transfers badge) | token; not the flag (`send.vue:861` has it) | 36 px mark; no flag passed |
| Activity | `TransactionCardLayout.vue:125` title; `TransactionCard.vue:103` `titleNamesToken`; `TransactionIncomingCard.vue` (symbol only); `TransactionAwaitingCard`, `TransactionTerminalCard` (journal rows, `titleNamesToken` from `journal-state.ts:524`) | contract from the call or the resolved token; chain from `appStore.network.chainId` | 16 px mark in a new `title-leading` slot, settled and incoming rows only; no flag |
| Approval window transfer line | `SendTxSummary.vue:88` (`execute-op-line-amount`) | `tokens`, `chainId`; `tokenAt` (`call-surface.ts:76`) matches chain and contract; the flag reaches only `register_token` ops (`execute/index.vue:135`) | 16 px mark before the amount, contract-only match; no flag |
| Token page | `tokens/[id].vue:225` `SubPageHeader leadingIcon="holdings"` | token, `isFlagged` | 20 px mark in a new `leading` slot |

Send's amount card and review sheet were not touched by the prototype and stay out (no frame shows them).

Proto-only, never carried over: `apps/extension/src/shots/token-icons.ts`, `pages/ti-sheet.vue`, `tests/e2e/ti-captures.test.ts`, `tests/e2e/network/ti-execute.test.ts`, every `v-if="ti !== 'today'"` guard, the treatment switch, the address map, the recolour filters.

## The list today

`infra/token-list/list.source.json`: six entries. Testnet (`685146337`): Test USDC, USDT, EURC, GBPC. Mainnet (`2070860441`, formerly Alpha): `cUSDC`, `cWETH`, both bridged. The wallet stores the signed envelope as one string (`nulo:core:token-list`) and keeps the parsed snapshot in memory; `seedsFromList` (`token/default-tokens.ts:31`) copies named fields only, so an icon reaches no stored token row.

## Issuer marks, fetched 2026-11-10

| Mark | Source | File | Bytes | data URL | SHA-256 |
|---|---|---|---|---|---|
| USDC (Circle) | `https://www.circle.com/pressroom` → `usdc.zip` | `Token Logo/USDC Token.svg` | 1,309 | 1,774 chars | `fe4f9d5f…c57d` |
| EURC (Circle) | same page → `eurc.zip` | `Token Logo/EURC Token.svg` | 1,678 | 2,266 chars | `6ae03397…3e2d` |
| USDT (Tether) | `https://tether.io/en/media` | `tether_USDt_token_v2@3x.svg` (colour, no background) | 1,145 | 1,554 chars | `7bde6a7d…de74` |

Elements used: USDC and USDT `svg`, `path`; EURC `svg`, `g`, `path`, `defs`, `clipPath`, `rect` (with `clip-path="url(#…)"`, a same-file reference). No file holds `&`, `\`, `<!`, `<?`, script, `href`, a `<style>` or an animation element. Tether's file draws the diamond inside a transparent 165 px box, so it reads smaller than Circle's discs at one size; it is used as published. Terms on record: `token-icons-1/research-web.md` § B4 (Circle: approved logos as provided, unaltered, 24 px and 32 px minimums; Tether: copy from Tether's materials, unaltered).

## Open work

`gh issue list --state all --search "token icon"` and `"token logo"` (all states, 2026-11-10): no matching issue, so no PR carries `Closes` or `Part of`. Closed known limits in the area: #385 (a leaked signing key verifies until a release unpins it), #386, #1610, #661, #1353.
