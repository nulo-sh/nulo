# fee-call-match-1: recon

Read at `origin/dev` `58e2b01b` by the planner and one Sonnet explorer (reuse sweep). Paths are relative to `apps/extension/src` unless they start with `apps/`, `packages/` or `implementations-plan/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Recognise the PrivateFPC by address, in the popup | `wallet/services/fpc/private-fpc-address.ts:3-9`: `PRIVATE_FPC_ADDRESS` (pinned by `protocol-fpcs.test.ts`) and `isPrivateFpc` (lower-cased compare), already imported by `tx-detail-helpers.ts:4` | reuse as-is |
| Recognise the protocol SponsoredFPC by address, in the popup | none: `deriveSponsoredFpc()` (`protocol-fpcs.ts:19-22`) is async and loads the upstream artifact; `fpc/service.ts:92-114` derives it in the worker only. Searched `SPONSORED_FPC\|SponsoredFPC\|SPONSORED\|sponsored.*address` in `src` (`.ts`, `.vue`) | absent; not built (D2) |
| Tell from a stored `Tx` whether the wallet or the app chose the fee | none. `feeSpender` (`transaction/spec.ts:147`) is written only by `recordTransfer`; `detectEmbeddedFeePayment` (`execution/utils/fee-detection.ts:10`) reads the incoming payload, never a row. Searched `feeSpender`, `embeddedFeePayment`, `detectEmbeddedFeePayment`, `appPayer` | absent; not built (D2) |
| Fee-method label | `popup/components/modules/tx/tx-detail-helpers.ts:46-64` (`describeFeePaymentMethod`, `describeExternalFee`) | adapt |
| Unit tests of the label | `tx-detail-helpers.test.ts:52-135`: calls are `{ method }` only, a `popupSend(feeSpender)` builder, `PRIVATE_FPC_ADDRESS` imported | adapt |

## What records which calls (the fee row's input)

| Send | Recorded `calls` | `feePaymentMethod` | `origin` |
|---|---|---|---|
| dApp send, the person picks the method (FpcStrategy) | the wallet's fee call first (`fee/fpc-strategy.ts:152,201,276,301` put `fpc.getFeePayload` at index 0; `tx-request-builder.ts:196-205` records `contract: fpc.address`), then the app's calls | `EXTERNAL` | DAPP |
| dApp send that embeds its own fee (EmbeddedStrategy, `from` path) | the app's calls only, its own fee call included (`fee/embedded-strategy.ts:36-55`) | `EXTERNAL`, or `FEE_JUICE_WITH_CLAIM` for a claim | DAPP |
| dApp send with no `from` | the app's calls (`tx-request-builder.ts:460-464`) | `EXTERNAL` (`dapp-send-executor.ts:1240`) | DAPP |
| Popup Send (`recordTransfer`) | the transfer only (`transfer-executor.ts:445-480`); the FPC is `feeSpender`, none for Nulo's sponsor (`:172-175`) | from the build | UI |
| Auth-registry toggle and revoke | the wallet's fee call first, then `set_authorized` (`auth-registry/service.ts:389,438` through the dApp-send path) | `EXTERNAL` when an FPC pays | UI |

So the first two rows carry the same `feePaymentMethod` and origin: the record cannot say who chose an `EXTERNAL` fee on a dApp send with `from`.

## Fee calls the wallet emits

- `sponsor_unconditionally`, no arguments, on any sponsor row: the protocol sponsor or one a person adds in Settings → FPCs (`fpc/handlers/default-sponsored-fpc-handler.ts:19-27`, `popup/components/popups/NewFpcPopup.vue`).
- `pay_fee`, no arguments, on the PrivateFPC only: `getFpcImpl` refuses any other PrivateFPC row (`fpc/service.ts:410-412`; handler `private-fpc-handler.ts:24-33`).
- `fee_entrypoint_private`: never. Its only appearances are `FEE_METHODS` (`utils/primary-method.ts:17`), the label (`tx-detail-helpers.ts:58`) and two comments that call it the default FPC's (`transfer-executor.ts:435,699`; stale, since that handler emits `sponsor_unconditionally`).

## Other readers of fee-call names (out of scope)

`FEE_METHODS` also picks titles (`utils/primary-method.ts:48-49`, `utils/tx-enrichment.ts:96`, `stores/app.store.ts:634`) and hides fee calls in the Calls box (`popup/pages/tx/[id].vue:143-147`). Those decide what is the person's intent, not who paid; they stay.

## Tests and e2e

- `popup/pages/tx/[id].test.ts` mounts the page with wire-shaped rows (`field(n)`, `0x` + 64 hex); its fee describe (`:134-161`) covers the paid fee only. No test reads the Fee method row there.
- No e2e reads the row: `Fee method`, `Set by`, `External FPC`, `Private Fee Juice`, `tx-detail-` and `feePaymentLabel` searched under `apps/extension/tests/e2e`. The row has no testid (`[id].vue:278-281`).

## Collisions

- p42-followups-1 A2 (running) edits the journal and the transaction page's call rows (`[id].vue`, `[id].test.ts`). This lane touches neither file.
- Closed limit #775: a popup Send recorded before `feeSpender` existed reads "Sponsored". Unchanged here (no fee call, UI origin).
- #760's plan (`implementations-plan/archive/owner-feedback-1/plan.md` § Decision ledger D1) refused a fee-method field on `Tx`.
