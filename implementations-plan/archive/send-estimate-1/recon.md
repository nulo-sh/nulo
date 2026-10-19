# send-estimate-1: recon

Base: `dev` @ `1531e5f9` (#855 merged). One Explore agent (Sonnet) plus the planner's probes. Paths are under `apps/extension/src/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| The amount gate | `popup/pages/send-amount.ts` `validateSendAmount`: `{ valid: true, integerized }` or `{ valid: false, reason }`, a new object per call | reuse as is |
| Scheduling and cancelling | `composables/useFeeEstimation.ts` over `composables/internal/fee-estimation-engine.ts`: `schedule` clears `result` and sets `isEstimating` at once, debounces 800 ms and never compares params; `cancel` clears `result`, aborts and remote-cancels | reuse as is |
| The estimate watcher | `popup/pages/send.vue:578-624`, `{ deep: true }`, ten sources | adapt: one source added |
| The fee row with no estimate | `popup/components/modules/send/FeeCostReadout.vue:94` "Fee estimated after simulation" when there is no estimate and none is running | reuse as is |
| Sponsor re-check on a new transaction | `composables/useSponsorVerdicts.ts:106-116`, keyed on `send.vue`'s `feeTxShape`, which already embeds `integerized` | unchanged |
| Test harness | `popup/pages/send.test.ts`: `mountSend`, `fillForm`, `feeCard`, `estimateLands`, `submit`, `BALANCE` (5 private, 3 public, 6 decimals); the `mockClear()` plus `not.toHaveBeenCalled()` form at `:537-548`; `lastClient`/`balanceUpdated` at `:918-925`, local to one describe | reuse; the two helpers move to file scope |

No other page has a validity-gated estimate watcher. Searched `useFeeEstimation(`, `useFeeEstimationMap`, `scheduleFeeEstimate`, `estimateTransferFee`, `estimateOperationFee` over `src/` (tests and services excluded): the execute window schedules imperatively (`popup/windows/execute/index.vue:293,409`), the authwit popups go through `useWalletTxEstimates` with no amount. Send is the only consumer with the gap.

## Mechanics that decide the fix

- **A `deep: true` watch runs its callback whenever its effect is dirty, whatever the values** (`@vue/reactivity` 3.5.42 `watch`, the `job`: `immediateFirstRun || deep || forceTrigger || hasChanged…`). A computed dependency makes the effect dirty when it recomputes to a value that is not `Object.is` its last. `amountValidation` returns a new object each time, so any source that reads it re-runs the handler on every recompute.
- **`balanceRaw` is value-stable.** `useTokenBalanceSnapshot.onBalanceUpdated` replaces the row object (`composables/useTokenBalanceSnapshot.ts:54-58`), so `tokenBalance` changes identity on every update, but `balanceRaw` is the balance string and stops an equal update. `amountValidation` recomputes only when the selected side's balance string, the text, the rest or `activeToken` changes.
- **`activeToken` is not value-stable.** A token re-read (`send.vue:118-134`, on any profile's or chain's token add or update) replaces `tokens.value` with new objects, and the watcher reads `activeToken.value?.id`, so today's deep watch already re-asks on every token re-read.
- **A blur rests the text.** `AmountCard.writeAmount` sets `rested` then `model` in one synchronous call (`components/composite/send/AmountCard.vue:77-82`); blurring "1234.5" writes "1,234.5", so `amountTerm` changes too. `rested` alone never changes the read in practice (recon of `utils/amount.ts:37-56`).
- **Decimals move after creation only through a restored token's refresh** (`wallet/services/token/service.ts:954`, `refreshRestoredToken`, reached from `composables/full-backup-restore.ts:744-753`). `send.test.ts:342` already sends with the new decimals.

## Probes on the base (`send.test.ts` harness, scratch copy, not committed)

| # | Path | Base | Issue's fix (`() => amountValidation.value.valid`) | Value-stable source |
|---|---|---|---|---|
| P1 | private 5, type 6, estimate cancelled; balance → 10 | 0 estimates, Send disabled | 1, enabled | 1, enabled |
| P6 | public 3, type 4; public → 6 | 0 | 1 | 1 |
| P2 | 1.5 landed; private 5 → 8 | 1, fee kept | **2, fee blanked** | 1, fee kept |
| P7 | 1.5 landed; same balance, new row object | 1 | 1 | 1 |
| P5 | 1.5 landed; private 5 → 1 | 1, fee **kept**, Send disabled | cancelled, fee cleared | cancelled, fee cleared |
| P4 | 1.5 landed; decimals 6 → 4 | 2 (re-asked 15000) | 2 | 2 |
| P3 | 1.5 landed; same token re-read | 2, fee blanked | 2 | 2 |
| P8 | real card: 1234.5 landed; blur | 2, fee blanked | 2 | 2 |

P3 and P8 are today's behaviour through `activeToken`'s identity and the blur's regrouped text; no fix here touches them.

## Closed known limits read

`gh issue list --state closed --label known-limit --search "estimate"` and `"send balance"`: #396, #397, #398, #696, #753, #569, #416, #395, #792, #399, #403, #693, #414, #444. None covers a balance, decimals or rest that changes the amount with no field edited.

## Collisions

No open lane holds `send.vue` or `send.test.ts` (#855 merged into the base).
