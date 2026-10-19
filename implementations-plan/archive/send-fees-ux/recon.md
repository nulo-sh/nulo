# Recon: send-fees-ux

Three Sonnet Explore agents at `dfdf4c31` (origin/dev): the #505 queue gate; the #503 execute window and the #504 Send fee card; #340, #316 and a reuse sweep. The parent verified every line cited in `plan.md` against the tree. Paths are under `apps/extension/src/` unless they start with a package or `tests/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Duplicate-address rule in a form | `NewFpcPopup.vue:46` (`sameFieldAddress`, from `@nulo/wallet-bridge`), the name rule in `EditFpcPopup.vue:41` (excludes the edited row by id) | reuse: the edit form's address rule copies the add form's compare and the edit form's own id exclusion |
| A shared "already stored" helper | none. Searched "Already added", "Already exist", "isDuplicate", "already stored": each form (`NewAccountPopup`, `NewTokenPopup`, `NewSenderPopup`, `ContactFormFields`, the FPC forms) rolls its own rule | no new helper: two FPC forms, one compare each |
| Refusal words for a send the cap refused | `utils/journal-state.ts:241-247` (`nothingSentLabel`), `:296-299` (`kindLabel`), `failedSubtitleFor` (default arm); the shared row at `:267-271`, `:326-327` | adapt: one kind moves between arms |
| Display-only preview of Send's method before the first snapshot | `pending.preview` in `FeeSettingsCard.vue:241-249`, `previewForPick` in `send/fee-privacy.ts` (a saved pick only) | adapt: also preview the default walk |
| Last-known gas balances without a network read | `GasBalanceReader.peek` (`wallet/services/execution/gas-balance-reader.ts:116-120`), `ExecutionService.peekGasBalances`, the store's `primeFromPeek` (`stores/balances.store.ts:394-412`) | reuse `peekGasBalances`; the store's peek path stays off for the card (`CARD_CAPS`, `FeeSettingsCard.vue:496`) |
| The default method walk | `resolveSendSelection` (`send/fee-privacy.ts`) | reuse as is |
| A loading look in the fee card | `Skeleton` in `FeeMethodRow.vue:29,38`, the menu's `checking` rows (`fee-helpers.ts` `withLoadingRows`), `FeeCostReadout.vue:50` | reuse for OA-1 B and OA-2 B |
| A queued send with no cap | `transfer-executor.ts` `buildPass`: `if (cap === undefined) return { built }` | reuse for OA-3 B: no service change |
| A persisted per-network cache of the resolved method | none. Picks are per profile and account (`utils/fee-picks.ts`, `sendFeePicksKey`), saved only on an explicit pick; no network key | not built (plan D2) |

## Issue claims against the tree

- **#505.** Not a defect. `send.vue:300` sets `queueCap` only for a self-paid method (`feePayerOf(payer) === "self"`), and `isAllowedToSend` returns false at `send.vue:304` while queued with no cap. The owner signed this on 2026-10-14 (decision page 9, OA-10, option A, on #217). `send.integration.test.ts:732` pins it. The issue's suspected cause, "a cap rule keyed on self-paid fees with no sponsored branch", is right about the code. Its premise, that #217/#402/#412 promised a queue for a sponsored send, does not hold. The current send's payer decides, not the predecessor's. Every estimate is queued while any send of the profile holds the slot (`service.ts:620`), whatever the token.
- **#505, a self-paid send behind a sponsored one.** No like-shape basis exists (`queued-fee-cap.ts` `likeShape`; a sponsored row is `EXTERNAL`), so no cap is offered. This is OA-11 A and OA-13 B, both signed.
- **#503.** Holds. `OperationCard.vue:287-297` shows the legend under `v-else` of `feeEstimate`, so the "Fee up to" line replaces it. `index.vue:174` (`awaitsAppFeeFigure`) holds Confirm only when the app set its own `maxFeesPerGas` or `maxPriorityFeesPerGas`. The app-set branch never reads `isEstimating` (declared at `OperationCard.vue:63`, passed only to the fee card at `:323`), so nothing shows a wait. The init estimate is debounced 500 ms (`index.vue:152`).
- **#504.** Partly holds. The method trigger reads "Select method" (`FeeMethodSelector.vue:57`) while `sendSelection` is `pending` with no saved explicit pick. Pending ends at the snapshot commit, after `balancesStore.ensure(scope, { legs: ["gas", "fpc"], forceRefresh: true })` (`FeeSettingsCard.vue:616-627`). The fee estimate does not gate the trigger; it gates the "You pay" row. The FPC leg reads storage in steady state (`fpc/service.ts` `getFpcs`; the slow path registers missing protocol rows only). The forced gas read runs two view simulations, one through the PXE. A forced read also waits out any read already in flight before it recomputes (`gas-balance-reader.ts:81-98`). The split between the two legs is not measured (plan phase 3).
- **#340.** The kind is stored (`too_many_pending`, since #490). The row reads "Stopped before broadcast" with "Your wallet caught this before reaching the network. Often balance, fees, or invalid call." on the detail page, and "Transaction failed" on the card (`journal-state.test.ts:692-712`). `humanizeErrorKind` has no caller outside its test.
- **#316.** The add form refuses a stored address with "Already exist" (`NewFpcPopup.vue:46`, `:175`). The edit form checks only the hex shape of an address (`EditFpcPopup.vue:46-52`) and can store a duplicate. The service checks neither (`fpc/service.ts` `addFpc`, `updateFpcAddress`).

## Collisions and closed limits

- #396 (known limit): the app window's Confirm stays live while a first Fee Juice estimate runs. Not touched.
- #380, #381 (known limits): queued-send restarts and the re-ask figure. Not touched.
- #493 (known limit): the add form flashes "Already exist" for the row being added as it closes. The same flash moves to "Already added". Not touched.
- `tests/e2e/network/fee-sponsor-funding.test.ts:257-260` reads the whole badge's text with an anchored pattern; OA-1 B changes that text.

## E2E that drive these surfaces

Smoke: `send-fee-privacy`, `send-keyboard`, `send-outcome-rows`, `settings-crud`. Network: `fee-methods`, `fee-sponsor-funding`, `same-token-concurrent-sends` (sponsored bursts expect the queued row with Send disabled), `tx-sendTx-feePayer`, `tx-sendTx-selfPay`, `tx-sendTx-noFrom`. No e2e drives the waiting-sends cap.
