# exec-window-1: recon

Base: `origin/dev` at c17dfc1bc. One Sonnet reuse sweep, then a read of the load-bearing files. Paths are under `apps/extension/src/` unless they name a package or `tests/`.

## The signed picks and their prototypes

| Item | Pick | Frames (decision pages) | Prototype (local branch, never merged) |
|---|---|---|---|
| #1494 | P95-03 → P97-02 **D**, 2026-11-02 18:34 UTC | `p95-03-d`, `p95-03-d-owncap` | `worktree-shots-p95c` at ff7e2d04e, `OperationCard.vue` branch `P95_03 === 'd'` |
| #1495 | P95-08 → P97-03 **C**, 2026-11-02 18:34 UTC ("though I don't love") | `p95-08-c` | same branch, `SendTxSummary.vue` branch `P95_08 === 'c'` |
| P93-70 | page 93 → P96-10 **F**, 2026-11-02 18:55 UTC | `p93-70-f`, `p93-70-f-foot` | `worktree-shots-p93f` at 121d335b4, `OperationCard.vue` `shotF`, `shots/totals.ts` |

What the frames show:
- **D, person pays (Private Fee Juice).** Under the call list: a block on the low surface, `FEE` over "Private Fee Juice · set by Playground"; a hairline; `YOU PAY` over "Couldn't estimate fee." in danger red and `TRY AGAIN` in accent; a hairline; the existing notice "Your Private Fee Juice must cover this fee." The snack "Couldn't estimate fee. Try again." stays as today. Confirm held.
- **D, own cap.** `FEE` over "Set by Playground"; `PLAYGROUND PAYS` over the same failed words. No snack, as today. Confirm held.
- **C.** Under the calls, before "Show all details": one boxed line (border, low surface), "Authorizations couldn't be previewed" in danger red, `TRY AGAIN` at its right. The snack "Couldn't preview authorizations. Try again." stays. Confirm live.
- **F.** After the card's divider: `LEAVES YOUR ACCOUNT`, then one row per token, "2 transfers" (body, secondary) left and "6 TST" (amount, mono) right, then "1 transfer" / "10 USDC"; an inset rule; then the fee section (`FEE` / "Select method"). The foot frame is the same scrolled to Confirm.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| The fee card's failed state | `popup/components/modules/send/FeeCostReadout.vue:81-88` (`fee-estimate-failed`, `fee-estimate-retry`, "You pay" hard-coded in all six branches) | adapt: a `label` prop |
| Keyboard focus when a retry button leaves | `FeeSettingsCard.vue:291-299` `onRetryEstimate` | reuse the rule |
| Re-asking an app-paid estimate | `popup/windows/execute/index.vue:470` `retryFeeEstimate` → `handleFeeUpdate(i, op.feeSettings)`; an app-paid op carries `feeSettings: embedded` from `operation-display.ts:86-93` | reuse as-is |
| Which failure holds Confirm | `popup/windows/execute/fee-figure.ts:39-44` `waitsForFeeFigure` | reuse as-is |
| A failed preview's flag | `composables/useFeeEstimationMap.ts:65-112` `failed` (set before `onError`, refusals included; cleared by `estimate`/`cancel`); not destructured at `index.vue:272-282` | reuse as-is |
| Re-asking a preview | `scheduleAuthwitPreview(index, { index })`, as at `index.vue:358` | reuse as-is |
| Closing a failure's snack once it no longer stands | `index.vue:204,237-241` `retireFeeFailureSnack` | adapt for the preview snack |
| Boxed line with an action | `packages/design/src/ui/Banner.vue` (`action` prop) | rejected: always draws an info icon and `value`/`primary` text; C's frame has neither |
| Per-token sums of call amounts | none: searched `bigint`, `sum`, `total`, `aggregate`, `groupBy`, `reduce(` over `src/`; `utils/token-aggregate.ts` is a fiat total over holdings, `utils/tx-amount.ts` reads one settled call | build new, small |
| Amount with symbol or "base units" | `call-surface.ts:178` `amountLabel`; `SendTxSummary.vue:56-60` `amountOf` (local) | reuse; move `amountOf` beside `amountLabel` |
| Count words | `utils/plural.ts` `pluralize` | reuse as-is |
| Same address, two spellings | `packages/wallet-bridge/src/field-address.ts:25` `sameFieldAddress` | reuse as-is |
| Accent text button CSS | `FeeCostReadout.vue` `.retry`; no shared rule (searched `retry`, `Try again` over `src/**/*.vue`, `packages/design/src/ui`) | see plan D7 |

## Facts the plan rests on

- **Retry already re-asks the same app-paid estimate.** The sweep reported that `retryFeeEstimate` cancels an app-paid estimate because its `feeSettings` is undefined. It did not hold: `resolveForProfile` pre-fills `{ paymentMethod: { kind: "embedded" } }` (`operation-display.ts:93`), so the retry schedules exactly the init's parameters.
- **A refusal sets `failed` too** (`useFeeEstimationMap.ts:82-84`, before `holdRefusal` runs). The fee block is then replaced by the `#fee` slot's refusal (`OperationCard.vue:394`), but the authorization summary is above that slot and is not.
- **`TransferSender`** (`call-surface.ts:30-32,85-98`): `account` (the account is the caller), `explicit` (the dApp's `from`, any address), `none` (default entrypoint). The prototype counted every sender but `none`, so another address's `from` would count as leaving this account.
- **`OperationCard` also renders in the fee window** (`popup/windows/fee/index.vue:245-268`), always with a `#fee` slot.
- **No smoke e2e file opens the execute window.** Searched `windows/execute`, `execute-op-`, `execute-confirm` over `tests/e2e/*.test.ts`: none. Every execute-window e2e is under `tests/e2e/network/`.

## Issue claims, checked

- **#1494** holds. Person pays: `reportsEstimateFailure` opens the snack (`index.vue:225-237`), `holdsConfirm` holds (`fee-figure.ts:52-58`), and the row shows the legend with nothing to press (`OperationCard.vue:405-412`). Own cap: same hold, no snack.
- **#1495** holds. After a failure `authwitSurface` returns `hidden` (`OperationCard.vue:198-209`); nothing calls `scheduleAuthwitPreview` again; `holdsConfirm` waits only while the preview runs.

## Tests and e2e to build on

- `popup/windows/execute/OperationCard.fee.test.ts` (app-paid block, `appPaid()`, `mountWith`), `OperationCard.summary.test.ts` (`tokenCall`, `CLAIM`), `index.test.ts` (`describe("execute window — a failed fee estimate's retry")`, `opened`, `fail`, `ownCap`; `feeMapInstances[1]` is the preview map), `call-surface.test.ts` (`ctx`, `OWNER`, `TO`, `TOKEN`), `execute.fixture.ts` (`field(n)`, real Token decodes), `FeeCostReadout.test.ts`.
- Network e2e that reach the window: `tx-sendTx-feePayer` and `fee-sponsor-funding` (app-paid), `authwit-lifecycle` (public grant), `tx-sendTx-noFrom` and `tx-sendTx-default` (the preview path), `tx-sendTx-multicall` (several calls), `type-roles-windows` (the window's type roles), `snack-placement` (the fee snack).
- Capture specs on the prototype branches: `tests/e2e/network/p95-captures.test.ts` (`worktree-shots-p95c`), `tests/e2e/p93f-captures.test.ts` with `tests/e2e/helpers/p93c-*.ts` (`worktree-shots-p93f`).

## Collisions

- #1472 (open, enhancement): the execute and fee windows restate their rules. This lane edits `OperationCard`, which both share; it adds no restatement.
- Closed known limits near the area: #396 (Confirm live during a first Fee Juice estimate), #395 (no funding check for an app-paid default-entrypoint op). Neither is touched.
