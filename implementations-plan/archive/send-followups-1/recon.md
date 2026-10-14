# send-followups-1: recon

Base: `origin/dev` at d3dc4415. Two Explore agents (sonnet, read-only) plus the planner's own reads, 2026-10-14. Paths are under `apps/extension/` unless they start with `packages/` or `implementations-plan/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| The cap basis lookup | `queuedFeeBasis` / `queuedFeeCap` (`src/wallet/services/execution/queued-fee-cap.ts:26-46`), called by `queuedFeeCapFor` (`service.ts:627-635`) from `estimateTransferFee` (`service.ts:597-624`) | adapt: one more filter, keyed on the request's shape |
| The send's privacy on a row | `calls[0].transfers[0].type`, written from `req.transferType` by `recordTransfer` (`transfer-executor.ts:465-499`); `transfer-sequence-keys.ts:70-75` already reads rows this way | reuse-as-is |
| The send's fee method on a row | `feePaymentMethod` (`EXTERNAL` 0, `PREEXISTING_FEE_JUICE` 1, `FEE_JUICE_WITH_CLAIM` 2) plus `feeSpender`, the address `feeSpenderOf` (`transfer-executor.ts:172-177`) returns for every FPC but the protocol sponsor | reuse-as-is; the request's `feeSpender` is `sequence.feeSpender`, already computed in `estimateTransferFee` |
| The send's speed on a row | none. Searched `priorityLevel` over `src` and `packages`: hits only in the popup, request-time service code (`transfer-estimate-reuse.ts:67`, `operation-estimate-reuse.ts:139`, `fee/fee-strategy.ts`) and `packages/wallet-bridge/src/fee.ts`; none in `transaction/*` or `operation-journal/*` | build new: optional `Tx.priorityLevel` |
| A shape fingerprint | `fingerprintFeeSettings` (`transfer-estimate-reuse.ts:50-68`) keys `fpc:<id>`, `fj`, `fjwc:<claim secret>…` and `default` vs `normal` apart; pinned byte-stable; carries claim secrets | not reused: wrong equality for this match, and it must never be stored |
| The journal record as the home for speed | `createTransferJournal` (`transfer-executor.ts:652-670`) has `transferType` but no fee settings and no token contract; `succeeded` records are capped at 50 per scope (`operation-journal/gc.ts:20-30`) | rejected (also D46 of the archived send-queue-activity plan) |
| Seeding a Tx row in e2e | `seedTransaction` (`tests/e2e/helpers/activity-seeds.ts`), a finalized row written to storage; used by five smoke specs (`rows`, `navigation`, `home-links`, `send-outcome-rows`, `type-roles`) | adapt: optional fee fields, defaults unchanged |
| Fitting the derived USD line | `fitHero`, `HERO_MIN_SCALE = 0.6` (`src/utils/hero-fit.ts`), `heroRoom`, `rulerWidth` (`src/utils/hero-ruler.ts`), `fitDerived` (`AmountCard.vue:175-180`) | reuse-as-is |
| A floor below which a line changes form | `SendReviewSheet.vue:86-99` floors at `HERO_MIN_SCALE` and wraps by CSS (`overflow-wrap: anywhere`); no in-repo precedent moves a line to another row | adapt the floor idea; the row move is new |
| The derived line's type role | `.derived_type` (`font-size: calc(11px * var(--hero-scale, 1))`) is carved out by selector in `apps/extension/scripts/type-roles/exceptions.ts:91-96`; a new selector with that calc would be refused | reuse: the moved line keeps `.derived_type` inside a `.conversion` wrapper |
| Real-layout checks of the USD line | `tests/e2e/network/send-amount-exact.test.ts:205-212` (`readUsdLines`: lines, horizontal overlap with the balance, Max spill) at a 1,235,567.12 TST balance | adapt: 2D overlap, a size floor, a short-figure control |
| Screenshots | `shotSend` (`tests/e2e/fixtures/send-page.ts:224`), opt-in by `NULO_E2E_SHOT_DIR`; the archived `2-usd-*-after-*` shots came from a scratch run | reuse: scratch run, uncommitted |
| The fee card's app-payment path | `FeeSettingsCard.vue`: `isCustomMethod`, `useOwnMethod`, `useEmbeddedFee`, `showMethodSelector`, `embeddedHidden`, two watchers, two handlers, the banner (`:943-967`), the back link (`:986-1008`), `.link` (`:1119-1141`) | delete |

## Verified claims

- **#406 holds.** The card has four mounts: `send.vue:774-791`, `ChangeAuthwitsRegistryPopup.vue:152-160`, `RevokeAuthwitsPopup.vue:243-253`, `OperationCard.vue:311-322`. Only the last can see an app's payment, and it mounts the card in the `v-else` of `isEmbeddedFeePayment(op)` (`:287`), the predicate the execute window seeds `kind: "embedded"` with (`windows/execute/index.vue:368`). The card makes `embedded` itself only from `useEmbeddedFee`, which only the unreachable back link sets. `approval-delta.ts:44` refuses an embedded pick.
- **#406's wire kind is live.** `CustomPaymentMethod` (`packages/wallet-bridge/src/fee.ts:22-24`), `EmbeddedStrategy`, `materialize.ts:78,87`, `dapp-send-executor.ts:973` (a `NO_FROM` request needs `embedded` or none). Removing the card's path touches none of them.
- **#408 holds** as measured in the archived plan (OA-15, shots `2-usd-long-at-rest-*`, `2-usd-typed-at-rest-*`). The fit has no floor (`AmountCard.vue:175-180`); `AmountCard.test.ts:610-626` pins scale 0.3 for a long line.
- **#412 holds, narrower in one place.** Its `## Where` names "the journal record the basis is read from"; the basis is read from Tx rows (`getTransactions`), not the operation journal. `FeeCostReadout.vue` and `QUEUED_FEE_COPY` need no change. #412 carries no `## Decision` block: P9-12 = B is recorded in its body and on #217 (OA-13 = B, 2026-10-14).
- **Speed has no durable record.** The Send page omits `priorityLevel` for Normal (`fee-helpers.ts:98-107`: only `fast` and `urgent` are written); `undefined` prices at `DEFAULT_FEE_MULTIPLIER`, which the e2e build widens (`fee/fee-strategy.ts:69`).
- **The popup offers a cap only to a self-paid send** (`send.vue:287`, `feePayerOf(payer) === "self"`); the service computes one for any payer.

## Tests that pin the basis or will move

- `queued-fee-cap.test.ts:26-50`: newest valid row; refused rows; none. Its `row()` fixture has no shape facts.
- `service.estimate-queue.test.ts:~54-101`: the request's `feeSettings` is `{} as never`, the rows come from `sent()` with no fee facts; expects cap `4472280000000000000` over basis `3577824000000000000`.
- `transfer-executor.test.ts` (`recordedTx(deps).feeSpender` pins, `:756-791`, `:1401-1450`), `transaction/service.test.ts:213-236` (raw row bytes, so an unset field must stay absent), `storage-codecs.test.ts:~175-215` (the `full` Tx fixture).
- e2e `same-token-concurrent-sends.test.ts:649-713`: A at Fast held, B at Urgent queued against A's fee. Under the keyed rule B has no basis and the case fails at `fee-estimate-queued-cap-line` (`:663`).
- `fixtures/send-burst.ts:79-97` (`expectEstimateQueued`: Send enabled exactly while a cap shows) holds for both states.
- `send-chaos.test.ts:108-109` waits through any queued spell and confirms when Send enables: valid in both states.
- `FeeSettingsCard.test.ts`: embedded cases at `:350-368`, `:1084-1110`, `:1112-1170`, `:1515-1540`, `:1629-1690`, `:2945-2975`, `:3228-3265`. No e2e, story or script names `send-fee-embedded`, `send-fee-override` or `send-fee-back-embedded`.

## Collisions

- **fees-and-sponsors-2** (planning in parallel) edits `OperationCard.vue`, `execution/fee/*.ts`, `TxFeeRow.vue`, `glossary.ts`. This lane edits none of them. Its #400 and #411 change the cap a dApp send commits; a Send-page send passes no app cap, so the `estimatedFee` a basis reads keeps its meaning. If its #411 fee row lands inside `FeeSettingsCard.vue`, the second PR to merge takes `origin/dev` and reruns `FeeSettingsCard.test.ts`.
- Known limits searched (`gh issue list --state closed --label known-limit --search` "cap basis queued fee", "derived token line USD", "fee card override embedded"): none.
