# p126-build-1: recon

Base: `dev` at `32fd50e60`. Nothing under `apps/extension/src/popup/windows/` changed since `ccd14c85f`, the head the render lanes mapped, so their file map holds. Paths are under `apps/extension/src/` unless named.

## Reuse map

| Capability | Existing code | Verdict | Note |
|---|---|---|---|
| A row that is one press target, controls inside it | `components/ui/RowTarget.vue` (button mode, `labelledby` required, attrs fall through to the button); `components/composite/capabilities/DetailsTable.vue:102` passes `aria-expanded` through it | reuse-as-is | The row root owns the tint and the ring through `:has(> [data-row-target]:focus-visible)`; RowTarget must be its direct child. |
| A click that ends a text selection | `utils/selection.ts:25` `endsSelection` (reads `currentTarget`) | reuse-as-is | The handler sits on the row root. |
| A press on a control nested in a row | none: only `@click.stop` per control (`ContactRow.vue:41`, `AccountSelectRow.vue:101`) and `AddressDisplay`'s stop when it shows a name | build new, small | Searched `closest\(`, `isInteractive`, `stopPropagation`, `\.stop\b` over `src` and `packages/design/src`. `DottedTerm` (a `span tabindex="0"`) stops nothing, so its click reaches a row. |
| Named address in a sentence | `components/AddressDisplay.vue` | reuse-as-is | Stops its click whenever a name exists (both states); not a Tab stop. |
| Glossary term | `components/composite/DottedTerm.vue`, already inside `ArgsNotice.vue:23` | reuse-as-is | A Tab stop inside an unreadable call's row. |
| Visually hidden text | four module-local `.visually_hidden` copies (`fee-shared.module.css`, `activity-card.module.css`, `EndpointOrderList.vue`, `ImportContactsPopup.vue`) | reuse (`composes` from `fee-shared.module.css`) | No shared utility; a fifth copy is avoided by `composes`. |
| Chevron | `packages/design/src/core/glyphs.ts` `chevron` (points right), rotated by class (`DetailsToggle.vue`) | reuse-as-is | No 12 px use yet; size is a prop. |
| The window's width | `<route>` meta `fillsWindow` (`popup/windows/capabilities/index.vue:1`), read by `popup/root-flags.ts`, `popup/index.scss:32` and `components/ui/ToastManager.vue:22` | adapt: add the block to `windows/execute/index.vue` and `windows/fee/index.vue` | A toast in those two windows then spans the window, as in the capabilities window. |
| A nested value as rows | none (`JsonViewer` is CodeMirror) | build new | Searched `JsonTree`, `TreeNode`, `tree`, `indent`, `depth`, `guide`. `call-surface.ts:262` `valueText` flattens; `readValue`/`readNamed` already gate unreadable strings. |
| Raw wire fields | `call-surface.ts` `rawRows`, `MAX_ARG_ROWS = 32`, `rawToggleLabel`; `CallArguments.vue:141` | reuse-as-is | Today only an unreadable call shows them. |
| Disclosure button | `popup/windows/execute/DetailsToggle.vue` | reuse-as-is | Raw values and an authorization's "Show details" keep it. |
| Repeat Enter | `refuseRepeatEnter` (`composables/usePopupEntity`) | reuse-as-is | |
| Keyboard place after a retry | `OperationCard.vue:180` `onRetryAppEstimate` focuses the persistent `tabindex="-1"` fee row | reuse the pattern | |
| Wire-shaped fixtures | `popup/windows/execute/execute.fixture.ts` (addresses checked with `isValidAztecAddress`) | adapt: a sibling fixture for the four requests and a ten-call one | The prototype's fixtures (`src/shots/nested-tx.ts` on `proto/nested-tx-1-al3`) are reference only. |
| Captures in a PR body | `pr-captures/<lane>/` committed in one commit and removed in the next (PR #1762) | reuse the practice | |

## Constraints found

- **Complexity**: no baseline entry under `popup/windows/execute/` or `windows/fee/`; cognitive complexity 15, 80 lines per function.
- **Type roles**: `utils/type-role-ban.reviewed.json` is empty; every new SFC takes its faces only from roles.
- **Decoder bounds**: `wallet/services/execution/call-decoder.ts:33` caps a decode at 256 argument fields, 1,024 ABI nodes and type depth 32, so a hostile but decodable value is at most 32 levels deep.
- **Tests**: `vitest.config.ts` auto-imports only `vue` and `vue-router`; execute tests stub `Flex`, `Text`, `Icon` and mount the real `DetailsToggle`. Root `test` runs the extension's vitest; `test:components` covers `src/components` only.

## Selectors that move (the e2e suite selects them)

- `execute-op-details-toggle` (removed): `tests/e2e/fixtures/popups.ts:507` `openExecuteDetails`, called by `network/tx-sendTx-delegated-authwit.test.ts:88`, `network/type-roles-windows.test.ts:434,565,712` (and its `details: true` flag), `network/tx-transfer-row.test.ts:90,142`. Unit: `OperationCard.{summary,fallback,discovered,long-strings,wire,fee}.test.ts`; `facts` presses every closed `aria-expanded` button.
- `execute-op-details` (kept, one per opened panel): `popups.ts:509`, `tx-transfer-row.test.ts:50`, `type-roles-windows.test.ts:433,559`.
- The details' per-call head row goes (the step's sentence names the call). `execute-op-payload-row` moves onto each opened step's call block, absent at rest as before (`tx-sendTx-multicall.test.ts:64`, `tx-transfer-row.test.ts:91,143`). `execute-op-call-to` moves onto a span around each step sentence's contract address (plan D10); no other kind renders it in a sweep (`OperationActionRow.vue` has none; the simulate branches are unreached), so `type-roles-windows.test.ts:337,348,381` (`stretchPayload`, `callCaptions`) follow it to the sentence.
- The authorization group testids (`execute-op-{discovered,sender,consumed}-authwits`) move onto each authorization's group heading block: `type-roles-windows.test.ts:567`.

## Gaps against the lane brief

- **No smoke spec opens the execute or raised-fee window.** Every e2e on it is a network spec (`tx-sendTx-*`, `tx-transfer-row`, `type-roles-windows`, `scope-refusal`, `authwit-*`, `fee-sponsor-funding`, …), run by `e2e:agent`. The touched specs run there, on Chrome and Firefox.
- **The Playground drives only the Token contract**, so no live request carries a struct; the four fixtures reach the real window only through the armed fixture build (plan D17).

## Open work in the area

- #1655 (open): say when another account gave an authorization. Not touched: the authorization lines keep their words.
- #1675 (closed, known limit): a contact name squeezes the details' call row. That row leaves the `aztec_sendTx` card here.
- #576 (closed, known limit): the tenth call's marker. The 20 px box is proved with ten calls; nothing reopens.
