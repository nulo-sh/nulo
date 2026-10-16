# Recon: execute-popup-readability

Base: `origin/dev` at `d59459ab`. Two read-only Sonnet explorers (a reuse sweep over eight capabilities, an e2e/theme/a11y map), plus the parent's own read of the execute window. Paths are relative to `apps/extension/src` unless they start with `packages/`, `apps/` or `tests/`.

## What the body is today

- `popup/windows/execute/index.vue` renders, top to bottom: `SignerIdentityStrip`, `DappIdentityBlock` ("wants to execute the following"), the scope `Banner`, `SectionLabel "Requested operations" {count}` beside the JSON icon (`execute-show-json-btn`, an `Icon @click` with no button role), one `OperationCard` per operation, then `DappApprovalFooter`.
- `popup/windows/execute/OperationCard.vue`, send-like card: title (`humanizeOperationKind`, "Send tx"), "From account:", then for `aztec_sendTx` a "Payload" label and, per call, a header row (`execute-op-payload-row`: `callName` + "on" + `AddressDisplay`) and `CallArguments` (transfer/mint vocabulary rows, decoded parameters, or the "Can't read the arguments" warning, its `RAW_NOTICE` and a raw-values toggle). Then the discovered authorizations ("Authorizations the wallet will sign (found during estimation)": Consumer, Authorizes, Function, and a "Show details" toggle per authorization), or "Checking authorizations…". **The body ends at `op_divider` (line 285); everything after it is the fee block.**
- The facts come from `call-surface.ts` (`callSurface`, `callName`, `amountLabel`, `tokenAt`) and the decodes `index.vue` fetches (`decodedCalls` per operation, `decodedAuthwits` by message hash). The vocabulary applies only on a registered token whose selector and ABI roles corroborate the signature; everything else reads as the contract's own parameters or as raw fields.
- `DecodedCall` carries `contract: artifact.name` (`packages/wallet-bridge/src/decoded-call.ts:26`, filled at `wallet/services/execution/call-decoder.ts:49`). No surface renders it today, and the artifact is app-supplied.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Per-row disclosure | Two copies in this window: `CallArguments.vue:117-125` (raw toggle) and `OperationCard.vue:261-270` (authorization "Show details"), same CSS twice (`.toggle`/`.details_toggle`, `.chevron`, `.chevron_open`). `components/composite/capabilities/CapabilityDisclosure.vue` is a boxed section fold with `aria-controls` and a reduced-motion guard. | adapt: one execute-local toggle replaces the two copies; `CapabilityDisclosure` only if an option needs a whole-section fold (option A) |
| Tabs | `components/composite/AuthMethodTabs.vue`, roving tablist hardcoded to Password/Passkey; `segment` type role | build new only under option E (generalize, never fork a third copy) |
| Character budget / show more | `safeWire`, `trimAddress`, `MAX_ARG_ROWS`, `MAX_INLINE_ITEMS`, `valueTitle`; no clamp helper (searched `truncate\|ellipsis\|line-clamp\|clamp(\|shorten\|formatAddress` over `apps/extension/src`, `packages/*/src`) | build new only under option D |
| Plain-language line per call | none (searched `describe\|classify\|summarize` in the window); ingredients: `CallSurface` kinds, `amountLabel`, `callName`, `TRANSFER_LABELS`, `humanizeMethodName`, `AddressDisplay` | build new: one pure line model over `CallSurface`, so it inherits the "do not guess" rules |
| Value-moving predicate / grouping | none (searched `isValueMoving\|movesValue\|groupBy` over `src`, `packages/*/src`); `CallSurface.kind` `transfer`/`mint` is the only wallet-read movement; `FEE_METHODS` in `utils/primary-method.ts` | reuse `CallSurface.kind`; no new predicate |
| Section headers | `SectionLabel` (`packages/design/src/ui`), `Banner`, `Badge`; the capabilities window's `PermissionGroup` is the layout precedent | reuse as is |
| Glossary | `authorization`: "Lets a contract do one specific thing for you, once." (`utils/glossary.ts`); the window renders one dotted term today (`priority-fee`, embedded fee only) | reuse the existing key; no new entry |
| Test fixtures | inline per file; `OperationCard.wire.test.ts` is the wire-shaped template (real Token artifact, `FunctionCall.toJSON` shape, pinned selectors); `OperationCard.discovered.test.ts` has the authorization helpers | adapt: one shared multi-call + authorization fixture |
| Themes | `html[theme]`, set by `public/theme-boot.js` and `utils/general.ts:29`; no component test mounts a theme; static guards `design/theme-vars.test.ts` (undefined var) and `packages/design/src/theme-contrast.test.ts` | reuse the static guards; screenshots carry the visual proof |

## E2E and accessibility

- **No smoke e2e opens the execute window** (`grep -rln execute tests/e2e/*.test.ts` is empty): smoke has no dApp. The network suite reaches it through the playground (`fixtures/popups.ts`: `waitForPopup(ctx, "execute")`, `waitForExecuteContent`, `approveExecute`).
- `tests/e2e/network/tx-sendTx-multicall.test.ts:60` counts `execute-op-payload-row` (3 and 7). `tests/e2e/network/type-roles-windows.test.ts` sweeps the window, names body testids (`execute-op-decoded-param`, `execute-op-call-to`, `execute-discovered-caller`, …) and already presses `execute-discovered-authwit-toggle` before sweeping.
- The window has no heading, landmark or region. Tab stops in the body today: each raw-values toggle and each authorization "Show details" toggle, in DOM order, then the fee controls, Reject, Confirm. Confirm has no document-level Enter.

## Collisions

- **send-fees-ux (#503)** edits the fee block of the same card (`OperationCard.vue` from `op_divider` on: `execute-op-fee-set-badge`, `execute-op-app-fee`, `execute-op-app-payer-live`, `FeeSettingsCard`) and Confirm's fee gates in `index.vue` (`needsFeeSelection`, `payerShort`, `awaitsAppFeeFigure`). Nothing committed on its branch at planning time.
- **#165** (open, `lane:e2e-harness-gaps`): "No e2e shows the transfer row of a private or discovered-authwit transfer". Not taken here; any e2e this lane touches keeps its testids so #165's future scenario still reads them.
- Closed known limits near this surface (#395, #396) are fee-block matters; none concerns the body.
