# token-dash-2 recon

Base: `origin/dev` at 21eb96866. One Explore agent (sonnet) plus direct reads. Paths are under `apps/extension/src/` unless they say otherwise.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| "Blank after the sanitizer → dash" | `safeWireOrDash` in `popup/windows/execute/humanize.ts:46-48`, used only by `OperationCard.vue:474,481`; `popup/components/modules/**` may not import `@/popup/windows/**` (`biome.json`, the modules override) | adapt: the rule moves to `utils/string.ts` as `dashIfBlank`; `safeWireOrDash` becomes `safeWire(dashIfBlank(s), max)` |
| The sanitizer's strip | `stripWireControl`, `wallet/services/dapp-session/capability-meta.ts:157` (pure; `utils/tx-amount.ts` and `utils/clipboard.ts` already import it) | reuse as is |
| A fallback noun for a name inside a sentence | `sentenceName(name, fallback)`, `utils/string.ts:47` | not used here: sentences are OA-1 |
| A display cap for a symbol | `displaySymbol` (`utils/tx-amount.ts:20`, 32), `sanitizeWireString(…, 32)` in `activity.vue:130`, `tokens/[id].vue:153,158` | untouched; the dash wraps their output where they feed a title |
| A shared dash constant | none: the wallet writes "—" inline (token-dash-1 counted 24 sites); searched `"—"`, `EMPTY_VALUE`, `emptyValue` | the helper keeps one inline literal |
| Wire-shaped name fixture | `fromField` in `humanize.test.ts:52-57` (the real `getNameDescriptor` decoder) | moves with the blank-class cases |

## The stored values

- An add, a restore and a seed all store `sanitizeWireString(name, 80)` and `sanitizeWireString(symbol, 32)` (`wallet/services/token/service.ts:1070-1081`, restore `:1018`, seed `:653`; caps in `token/seeder.ts:36-37`). No trim; `TokenSchema` takes any string, so `""` and `"   "` are storable.
- A contract read is one 32-byte field (`token/functions/descriptors.ts:50`), so an add never reaches either cap.

## Render sites of a stored name or symbol

Name, title or label (the dash applies; today's expression):

| Site | Today | Blank today reads |
|---|---|---|
| `popup/components/modules/general/TokenCard.vue:77-78,82` | `{{ token.symbol }}` (`:data-symbol` raw), `{{ token?.name \|\| "unknown" }}` | no symbol line; "unknown" or a blank name |
| `popup/components/modules/general/TokenImportRow.vue:32-39,53` | `hasName` = string of length > 0; `title` = `op.title`, else the short address, else "Token" | `""` shows the address; `"   "` a 0 px title line |
| `popup/components/popups/SelectTokenPopup.vue:155,160` | `:title="tb.token.symbol"`, `:data-symbol` raw | a checkbox with no label |
| `popup/components/modules/send/SelectTokenCard.vue:104,109,110` | `token.symbol?.charAt(0)`, `token.symbol`, `token.name` | an empty initial square, no symbol, no name |
| `popup/pages/settings/tokens/index.vue:82-83` | `:title="token.symbol" :description="token.name"` | an empty, shorter row (56 px against 72) |
| `popup/pages/tokens/[id].vue:223` | `:title="token?.symbol \|\| ''"` | no header title |
| `popup/components/popups/TokenMetadataPopup.vue:108,116` | `{{ token.name }}`, `{{ token.symbol }}` | Name and Symbol with no value |
| `popup/components/modules/activity/TransactionCard.vue:100-103` | `amount.symbol` when truthy, else `getTxTitle` | no title |
| `components/composite/activity/TransactionIncomingCard.vue:52,55` | one `tokenSymbol` prop (`token?.symbol \|\| "Token"`, `utils/received-display.ts:80`) as title AND amount symbol | no title |
| `utils/journal-state.ts:456-458` (`transferTitle`, for the awaiting and terminal journal cards) | `token?.symbol \|\| "Transfer"` | no title |
| `popup/components/modules/general/RecentActivityView.vue:184` | `token?.symbol \|\| "Transfer"` (the executing Send's title) | no title |
| `popup/pages/journal/[id].vue:79` | `token.value?.symbol \|\| "Transfer"` (page title) | no title |
| `popup/pages/activity.vue:130,209` | `sanitizeWireString(filterToken.symbol, 32)` (the filter chip) | an empty chip |

After an amount (unchanged by the pick): `TransactionCard.vue:130`, `TransactionIncomingCard.vue:55`, `journal-state.ts:404`, `RecentActivityView.vue:219,394`, `BalanceView.vue:270,294`, `AmountCard.vue:248,255`, `tx/[id].vue:185,195`, `journal/[id].vue:253`, `received/[id].vue:118,258`, `SendReviewSheet.vue:125,129`, `useArrivals.ts:126,364`.

The symbol inside a sentence (OA-1): `tx/[id].vue:207` ("{symbol} is missing", shown when the transfer's token is gone), `tokens/[id].vue:158` (Home-is-full confirm), `RecentActivityView.vue:916` (the token page's empty line), `AmountCard.vue:230,471,474,529` (rate line, title attribute, unit toggle, decimals hint), `IncomingTrustPopup.vue:49,150` ("Allow {symbol}?", from the incoming record, not a stored row).

Not a site: `TokenCard.vue:115-117` (`newToken`, never bound); `tx/[id].vue`'s page title (`getTxTitle`, `utils/tx-enrichment.ts:138`, never reads a symbol); `received/[id].vue`'s header (the fixed "Received", `:242`).

## Pins and selectors

- Tests that hold today's values: `TokenCard.test.ts:283-285` (a 400-character symbol in full), `journal-state.test.ts:385` (`""` → "Transfer"), `RecentActivityView.test.ts:884-950` (`""` → "Transfer"), `activity.test.ts:661` (filter "USDC").
- Hooks a case can use: `tokens/[id].test.ts:95` and `settings/tokens/index.test.ts:56` stub `SubPageHeader` and `SettingItem` without props, so `title` and `description` fall through as attributes; `journal/[id].test.ts:236` reads the header stub's `title`; `TransactionIncomingCard.test.ts:19-27` stubs the layout with `title` and `amountSymbol` spans.
- e2e reads `data-symbol` on `token-symbol` and `select-token-row` (attribute, raw), and the text of `send-token-symbol` (`network/send-picker.test.ts:45`, "ALT"), `token-row` (`network/token-management.test.ts:16,35`, "TST"), `token-import-title` (`shipped-token-list.test.ts:89`) and `activity-token-filter-symbol` (`home-links.test.ts:101`, 32 fullwidth W). All normal values: the helper returns them unchanged.
- `apps/extension/scripts/type-roles/identifier-sites.expected.json:300-308` inventories `TokenImportRow`'s `title` (it reaches `trimAddress`); the computed keeps its name and reach.
- `src/utils/` exports are auto-imported (`vite.config` AutoImport `dirs`); the build regenerates `src/types/auto-imports.d.ts` (vitest runs with `dts: false`).

## Open work and limits

- #932 (this lane). #897 and #930 shipped the card. Closed known limits nearby: #931 (glyphs that draw nothing), #625 (a 32-character symbol is never cut in a row), #693, #794. None collides.
