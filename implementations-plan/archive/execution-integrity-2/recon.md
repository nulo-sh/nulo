# execution-integrity-2 · recon

Read at `origin/dev` `f55b7b4e`. One Explore agent (sonnet), one batched reuse sweep, plus the lead's own reading of the files below. Paths are relative to `apps/extension/src` unless they start with `apps/`, `packages/` or `implementations-plan/`; `X` = `wallet/services/execution`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| The +10% rise rule | `X/fee-reask.ts:20-28`: `FEE_RISE_ASKS = { percent: 10n, atLeast: FEE_READOUT_UNIT }`, `feeRiseAsks(fee, ceiling)`; one production caller, `overCeiling` in `X/dapp-send-executor.ts:1448-1459`. Tested in `X/fee-reask.test.ts` | reuse as-is |
| Who pays: the person or not | `X/fee-reask.ts:37-54` `personalPayerOf(built)`, by the route the build took (Fee Juice, claimed or not; the PrivateFPC row; an app payer at the PrivateFPC's address). Popup twin: `feePayerOf` (`popup/components/modules/send/fee-helpers.ts:13-18`) | reuse as-is |
| The question loop | `X/transfer-executor.ts:310-387`: `buildWithinCap` → `buildPass` (over the cap: give the slot back, stash the build, return `OverCap`) → `askAgain` → `askFeeAgain` (`X/fee-reask.ts:78-98`); `QueuedFeeAnswers` (`X/queued-fee-cap.ts:109-160`); `ExecutionService.acceptQueuedFee` (`X/service.ts:754-762`) checks the record only (`kind: "transfer"`, `stage: "queued"`, `reask.fee`), never how the send entered | reuse as-is |
| The question on Home | `RecentActivityView.vue:404` "Fee went up. Review" for any transfer at `queued` with `reask`; `popup/components/modules/general/reask-review.ts` builds the sheet from the record alone; `SendReviewSheet.vue:166` "Fee is now X, above the Y you accepted." | reuse as-is |
| Figure travel, popup → worker | `popup/pages/send.vue:494-519` `snapshotTransfer`; `popup/pages/send-submit.ts` (`TransferSnapshot`, `SubmitDeps.executeTransfer`); `X/spec.ts:43-54` `executeTransfer(…, precomputedEstimateId?, feeCap?)`; validation `X/service.ts:630` (`isFeeAmount`, `packages/wallet-core/src/jobs/types.ts:70`); client is a passthrough (`X/client.ts:29`) | adapt: one more positional argument |
| The figure on screen | `feeEstimate.value.maxFee`, a base-unit string = `getEstimatedFee(txRequest)` (`X/transfer-executor.ts:781,813`), the same measure a rebuild is compared in (`X/tx-fee-details.ts:13-17,34-36`); drawn by `FeeSettingsCard.vue:183` | reuse as-is |
| The queued cap | `X/queued-fee-cap.ts:12,87-91`: basis × 1.25, cut to the readout unit; shown as "Fee up to X, based on your last send. If it comes out higher, we ask again." (`SendReviewSheet.vue:167`) | keep as-is |
| A figure that binds two rules | none. Searched `feeCap\|precomputedEstimateId\|feeRiseAsks\|overCeiling\|ceiling` over `apps/` and `packages/` non-test source | build new: `SendFeeFigure` + `figureAsks` beside `feeRiseAsks` |

## Tests to extend

- `X/transfer-executor.test.ts:1692` "a queued send against a fee cap" (`capHarness`, `request(l2Gas)`): its fees are below one readout unit, so an estimate-rule case scales them.
- `X/service.composition.test.ts:1376` "a send queued against a fee cap asks again above it": real journal, real `QueuedFeeAnswers`, a stashed reuse entry (fee 800, Nulo's sponsor).
- `popup/pages/send.integration.test.ts:765-800`, `send.test.ts:336,405`, `send-submit.test.ts`: the positional arguments `executeTransfer` receives.
- E2E: `apps/extension/tests/e2e/network/same-token-concurrent-sends.test.ts:692-767` (the queued re-ask, answered from Home); `fee-methods.test.ts:88,147` (Send paid with public and with private Fee Juice, not queued).

## Collisions and limits

- Open issues: none on this path (`gh issue list --state open --search "fee re-ask OR fee cap OR queued send"`). Closed known limits: #380 (a send waiting at `queued` is lost on a worker restart; this change adds one more way to wait there, same disposition), #381 (closed by `FEE_RISE_ASKS.atLeast`), #416 (the approval window's rebuild, since bound on the dApp path).
- Sibling lanes: refused-send-1 touches `operation-journal/send-check.ts` and `SendCheckOutcome` in `packages/wallet-core/src/jobs/types.ts`; this lane touches neither, and `QueuedFeeReask` keeps its shape.
- `fee/fee-cap.ts` (`feeCapFor`, `committedCapCovers`) is the per-gas cap a build commits, not the RPC's `feeCap`; the names stay apart.
- No stored shape changes: the record keeps `{ stage: "queued", reask: { fee, cap, payer } }`.
