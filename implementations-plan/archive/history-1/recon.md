# history-1 recon

Base: `origin/dev` at `13bb2133c`. Two Sonnet explorers (one per issue) plus the planner's own reads. Paths are under `apps/extension/src/` unless they start with `apps/`, `packages/` or `implementations-plan/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| The tx row's sort key, shared by History and Home | `utils/activity-rows.ts:84` `scopedTxRows` (`sortKey: tx.updatedAt`); History sorts at `:64`, Home's `recent-activity-rows.ts:38,50` takes the same rows and sort | adapt: `createdAt` |
| The store's "newest first" read | `stores/activity.store.ts:163` (`b.updatedAt - a.updatedAt`) | adapt: `createdAt` |
| When a send was made | `Tx.createdAt`, stamped once by `addTransaction` (`wallet/services/transaction/service.ts:313-318`) after the node accepted the broadcast; never rewritten (`commit()` at `:654-658` moves only `updatedAt`); `restore()` keeps the backup's value (`:694-735`) | reuse as-is |
| History's day headers | `popup/components/modules/activity/TransactionsList.vue:31` groups by `row.sortKey` | reuse; the header follows the new key |
| Home's in-flight cards and slot budget | `RecentActivityView.vue:379` (journal `createdAt` desc), `recent-activity-rows.ts:27` `remainingRowSlots` | reuse as-is |
| Re-ask the current form's estimate | `popup/pages/send.vue:611-640` `requestEstimate` (guards, `clearQueued`, `scheduleFeeEstimate`) | reuse as-is |
| A failed-estimate state | none: the engine nulls `result` and drops `isEstimating` (`composables/internal/fee-estimation-engine.ts`); the readout falls to its idle hint (`FeeCostReadout.vue:82-86`). Searched `failed|error` refs in `useFeeEstimation.ts`, `send.vue`, `FeeCostReadout.vue` | build new: one page ref, set where `feeQueued` is set |
| A retry control | `Banner` `:action` (`components/composite/AsyncListStatus.vue:15`, `send.vue:810`); the inline text button `incoming-sync-retry` (`RecentActivityView.vue:839-848`); the snack action (`packages/design/src/composables/toast.ts:12-16`, `data-testid="snackbar-action"`) | adapt the inline-button pattern |
| Page-level tests with the real fee card and row | `popup/pages/send.integration.test.ts` (`mountSend`, `fillForm`, `estimateLands`, `realFeeRow`) | reuse |

## #1394 trace

- Both lists read one store: `appStore.transactions` (`stores/app.store.ts:589`) → History `popup/pages/activity.vue:109-118` → `buildActivityRows`; Home `RecentActivityView.vue:88-102,131` → `buildRecentActivityRows` → `slice(0, remaining)` (`:142`). The detail page finds by hash (`popup/pages/tx/[id].vue:67`).
- `commit()` sets `updatedAt = Date.now()` on every status move (mined, finalized, a pruned block, a resurrection), so a row's key moves each time.
- `updatedAt` has other readers that must keep it moving: the dropped-resurrection window (`transaction/service.ts:525`). `createdAt` readers that must keep its meaning: the dropped grace (`:560`), the submitted hold (`execution/send-sequencer.ts:193,213-214`), the fee-cap basis (`execution/queued-fee-cap.ts:84-85`). The fix changes neither field.
- `createdAt` is recorded right after `node.sendTx` resolves (`execution/execution-coordinator.ts:354-355`), so it is when the send reached the node, after its build and proof. Popup sends wait in the sequencer before the execution slot (`execution/send-sequencer.ts:1-9`) and a dApp send can hand its slot on and re-enter at the tail (`execution/execution-lane.ts:357-380`), so reaching the node is not always Confirm order.
- Not changed, not named by the issue: journal rows sort by `terminalAt`, incoming rows by block time (`activity-rows.ts:122,147`).
- Tests that pin the old key: `stores/activity.store.test.ts:149-156`; `utils/activity-rows.test.ts:7-9` (helper sets only `updatedAt`), `:69-77`, `:352-358` (read order ends in `updatedAt`); `popup/components/modules/general/recent-activity-rows.test.ts:14-15,169-209`; `popup/pages/activity.test.ts:536-600` (`txOn` sets only `updatedAt`). No e2e asserts row order; `tests/e2e/helpers/activity-seeds.ts:87-101` sets both fields equal.

## #1392 trace

- The card's line (`FeeSettingsCard.vue:321,331-335`) speaks for the gas and FPC read (`composables/useFeeSnapshot.ts`, `stores/balances.store.ts:129-133`: 20 s per fetch, backoff 5/10/20/30 s, repeating while the card is mounted). Its recovery commits a new `gasBalances` (`useFeeSnapshot.ts:99`), `derivedSettings` recomputes a new object (`FeeSettingsCard.vue:244-250`), the watch at `:262` re-emits it, and `send.vue`'s deep watcher re-asks the estimate (`:645-660`). Inferred by trace; no test pins it.
- The estimate failure (`send.vue:450-458`): requeue → reschedule; `ImportedAccountUnusableError` → leave; anything else → `console.error` and the error snack, nothing scheduled. Result `null`, not estimating, so the readout shows "Fee estimated after simulation" and Send stays off by design (`popup/pages/send-fee-gate.ts:31`).
- A new estimate starts only from a watcher source: an input, the fee settings, the balance flipping the amount's validity (`send.vue:268`), terms, token, network, account. `send.integration.test.ts:954-969` pins "the next input estimates again" as the only way back.
- Self-paid methods never estimate with an unknown balance (`fee-helpers.ts:116-139`), so the lab's pair (card line and failed estimate together) needs a sponsored method, as the lab had.
- The same snack without a retry sits in the execute window (`popup/windows/execute/index.vue:215`) and the two authorization popups (`ChangeAuthwitsRegistryPopup.vue:63`, `RevokeAuthwitsPopup.vue:64`). The issue names Send only.
- E2E that read the snack: `tests/e2e/network/snack-placement.test.ts:403-411` drives Send to a failed estimate and waits for it; `tests/e2e/fixtures/send-burst.ts:53-59` and `network/type-roles-windows.test.ts:390` read it. None reads the card's line. (The explorer's grep missed these; the Opus leg found them.)

## Issue claims that did not hold

- #1394 "while its page shows `createdAt`": the detail page shows `updatedAt` (`popup/pages/tx/[id].vue:98-101`), unlabelled. The page's times in the lab (3 TST 15:14, 5 and 100 TST 15:13) are last status changes.
- #1394 "each holds a copy of the rows read at a different moment": both lists are live computeds over one store slice. They disagreed because the key moved between the two looks, and Home cuts the list at its slot budget.

## Collisions

- `activity-rows.test.ts` and `recent-activity-rows.test.ts` pin the property read order (`... "hash", "updatedAt"`), so they change with the key.
- Closed known limits searched (`fee estimate`, `history order`): #1354-#1359 bound the estimate's deadlines (out of scope); none covers a retry or the row order.
