# fee-claim-build-1: recon

Read at `dev` `a763870d4` by the planner; no Explore sweep (three files, already mapped by the fee-claim-words-1 prototype and its notes).

## The row today

| Site | Today | This lane |
|---|---|---|
| `AppFeeLine.vue`, the `v-else` branch | "About \<figure or skeleton\>; payment method set by \<slot\>" for every app payment but the PrivateFPC | the claim route takes its own branch (W1) |
| `OperationCard.vue`, the `appFeeFailed` block | "Fee / Set by \<app\>" over `FeeCostReadout failed`, label "You pay" when `personPaysAppPayment` | unchanged |
| `OperationCard.vue`, `feeSealed` | the seal only for a pinned paying contract (`payingContract`, undefined when the account pays) | unchanged: no mark on the claim route |
| `fee-figure.ts`, `claimsToAccount` | module-local, read by `personPaysAppPayment` | exported, read by `OperationCard.vue` |

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| The claim classification | `classifyFeePayer` / `isClaimAndEndSetup` (`packages/wallet-bridge/src/fee-payer.ts`); `claimsToAccount` wraps it for both operation kinds | reuse as is |
| Component fixtures | `OperationCard.fee.test.ts`, the "fee the app pays" describe: `appPaid()`, `mountWith`, the failed `test.each`, the seal describe; `OperationCard.selfpay.test.ts` builds a claim call from the wallet-bridge constants | add the claim cases to the fee describe |
| The window's fixture route | `src/e2e/execute-fixture.ts`, armed by `VITE_NULO_E2E_EXECUTE_FIXTURE` (`execute-fixture-gate.ts`); fee-claim-words-1's `fixtures.patch` adds `claim`, `claim-long-names` and `?estimate=running\|failed`, and applies cleanly at `a763870d4` | keep (D7) |
| Capture kit | fee-claim-words-1's `scripts/capture.sh` and scratch spec `fcw1-captures.test.ts`: armed smoke build, `bun run test:e2e`, crop from the last "Leaves your account" row to the card's bottom | adapt in scratch, never commit |

## e2e reading the row

`git grep` of `execute-op-app-fee`, `-app-name`, `-app-legend`, `-fee-set-badge` under `apps/extension/tests/e2e`: `network/fee-sponsor-funding.test.ts` (an app's own sponsor, the `fpc` route; reads the sentence and `execute-op-app-name`), `network/tx-sendTx-feePayer.test.ts`, `tx-sendTx-noFrom.test.ts`, `tx-sendTx-selfPay.test.ts` (badge present or absent). None drives the claim route. `execute-steps.test.ts` opens named fixtures only, never the claim ones. No smoke spec sweeps the row's type roles.

## Open work

`gh issue list --state all --search "claim fee row"`: #1804 only. Closed `known-limit` "claim fee": none adjacent.
