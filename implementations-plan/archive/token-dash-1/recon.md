# token-dash-1 recon

Base: `origin/dev` at 817cce9d. One Explore pass (sonnet) plus direct reads. No open PR touches `OperationCard.vue`, `humanize.ts` or `capability-meta.ts`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Strip a wire string's control and format characters | `stripWireControl` (`apps/extension/src/wallet/services/dapp-session/capability-meta.ts:157`); `sanitizeWireString` adds the length cap and its `…` (`:161-166`); neither trims | reuse as is |
| The card's wire-string display | `safeWire(s, max)` (`apps/extension/src/popup/windows/execute/humanize.ts:44`), `""` for an absent value; imported by `OperationCard.vue`, `CallArguments.vue`, `OperationActionRow.vue`, `call-surface.ts` | reuse; the new helper sits beside it |
| The empty-value dash | no constant, helper or component in `apps/extension/src` or `packages/*/src`: 24 inline `"—"` literals: `publish-facts.ts:40`, `BalanceView.vue:72,76,132,273,276`, `GasBalanceCard.vue:72`, `TokenCard.vue:39`, `FeeCostReadout.vue:75`, `FeeMethodRow.vue:32,42`, `fee-helpers.ts:250,279`, `SendReviewSheet.vue:60,125,129,165,169`, `holdings.vue:103`, `received/[id].vue:367`, `presto-ui-state.ts:242,245,252,253`. Two forms: plain text, and an `aria-hidden` dash beside a hidden sentence (`SendReviewSheet.vue:165`, `FeeCostReadout.vue:75`) | reuse the idiom (an inline literal) |
| The decoder a contract's name and symbol go through | `decodeUtf8` (`token/functions/descriptors.ts:50`): one field's 32 bytes as UTF-8, NULs removed, spaces kept; exported through `getNameDescriptor.unpackResult` (`:192-199`) and `getSymbolDescriptor` (`:204-212`) | reuse in the tests, so their fixtures are the decoder's real output |
| Component harness | `OperationCard.test.ts:135-199` ("a token add": `mountTokenAdd`, pass-through `Flex`/`Text`, `Skeleton` stub, `ROWS`/`VALUES`, a `0x` + 64-hex token address) | reuse; add one case |

## The read path and the surfaces that render it

- `previewTokenMetadata` (`token/service.ts:790-801`) returns the contract's strings unchanged; with no getter it returns Fee Juice's own name and symbol, else `"<name>"` and `"<symbol>"` (`:847-851`).
- Its one popup caller is `prefetchTokenMetadata` (`execute/index.vue:329-358`), which stores the raw strings. The card renders them through `safeWire` (`OperationCard.vue:473-482`). Approve sends the raw stored read, not the card's text (`index.vue:444-452`), and the add re-reads and refuses a change (`token/service.ts:493-501`).
- No other surface renders the preview. After the add, the stored row carries the re-read through `sanitizeWireString` (`token/service.ts:1070-1082`), and these surfaces render it, each through its own code: `TokenCard.vue:78,82,117` (the name falls back to "unknown"), `SelectTokenCard.vue:104-110`, `SelectTokenPopup.vue:155`, `settings/tokens/index.vue:82-83`, `TokenMetadataPopup.vue:108,116`, `TokenSeedRow.vue:37`, `tokens/[id].vue:153-223`, `activity.vue:130`, `tx-amount.ts:20-78`. While the add runs, Home's import row takes its title from `cleanSymbol(symbol)` (`token/service.ts:509`) and treats only a zero-length title as missing (`TokenImportRow.vue:32`). None uses `safeWire`.

## Consumers of the card's rows

- `tests/e2e/network/register-token.test.ts:61-66` waits for `register-token-symbol` and asserts non-empty text; `type-roles-windows.test.ts:251,535` uses it as a ready selector. No e2e reads `register-token-name`; no smoke spec drives a `registerToken` request.
- `OperationCard.long-strings.test.ts:185-212` reads both values' text (31 and 64 `W`).
- `copy-dash-ban.test.ts:52`: a bare `"—"` has nothing before it, so `CLAUSE_DASH` passes it with no reviewed entry.

## Closed known limits searched

`token name`, `token symbol`, `register token`: #552, #625, #693, #794 and #898 concern the read's timing, a symbol's width, a journal symbol, an import title and a row's gap; none the empty value.
