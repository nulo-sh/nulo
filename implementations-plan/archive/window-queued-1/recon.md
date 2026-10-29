# window-queued-1: recon

Read at `origin/dev` `15a9bd9d3`. One Explore agent (sonnet) mapped the composition layer and the e2e; the planner traced the window, Send and the worker by hand. Paths are under `apps/extension/` unless they start at the repository root.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Clear a queued reading when new input asks a new question | Send: `clearQueued()` in `requestEstimate` (`src/popup/pages/send.vue:611-640`, "New input asks a new question: it is queued only once the wallet says so again") | reuse the pattern: one clear in the window's `handleFeeUpdate` |
| The window's queued flag, its set and its clears | `queuedOps`, `queueWatch` (`src/popup/windows/execute/index.vue:180-188`); the `[estimatingOps, previewingOps]` watcher (`:606-612`) | adapt: add the clear on a replacement; set and clears unchanged |
| A superseded attempt never sets the flag | `queueWatch.onQueued` checks `!signal.aborted` (`index.vue:184-186`); the engine aborts the old controller inside `schedule` (`src/composables/internal/fee-estimation-engine.ts:97-99, 120-125`) | reuse as is |
| The component harness for a queued window | `index.test.ts` "approval envelope": the mocked `useFeeEstimationMap` (`:60-87`), `estimateEvents.onEstimateStarted` (`:96-99`), the `OperationCard` stub's `isQueued` prop (`:201`), the two queued cases (`:817-877`) | reuse: the new case sits beside them |
| A seeded sequence over the window's queued reading | `fee-race.composition.test.ts` over `tests/helpers/fee-race-in-process.ts` | not reachable: see below |
| An e2e that switches the method in a queued window | none. Trail: `fee-estimate-queued` over `tests/e2e` (only `fixtures/proof-gate.ts`, `fixtures/send-burst.ts`, `network/same-token-concurrent-sends.test.ts`); `feeMethod\|fee-method\|selectFee\|pickFee` over the two window files that hold a window (approve-time picks only) | build nothing: the component layer proves the case (D4) |

## The bug, traced

1. An estimate is answered `{ queued: true }` while a send holds or waits for the slot: `withStoredRequestSlot` returns it when `lane.takeEstimateSlot` finds a send in the slot (`src/wallet/services/execution/service.ts:849-850`, `execution-lane.ts:491-497`). `onQueued` sets `queuedOps[index]` (`index.vue:184-186`), and `estimateWhenClear` sleeps 2 s before it asks again (`src/utils/estimate-when-clear.ts:39-55`).
2. The person switches the method. The card's `derivedSettings` watcher writes the model (`src/popup/components/modules/send/FeeSettingsCard.vue:244-264`), `OperationCard` forwards it as `updateFeeSettings` (`OperationCard.vue:445`), and `handleFeeUpdate` calls `scheduleFeeEstimate` (`index.vue:457-465`). The engine aborts the old attempt and keeps the operation estimating (`fee-estimation-engine.ts:120-125`). Nothing clears `queuedOps[index]`.
3. If the send is gone and another estimate holds the slot, `takeEstimateSlot` returns the mutex wait instead of `undefined` (`execution-lane.ts:492-493`), so the replacement gets no queued answer. `started()` fires only once it holds the slot (`service.ts:851-853`), which emits `onEstimateStarted` and clears the flag (`index.vue:187`). Until then the row reads `QUEUED_FEE_COPY` (`FeeCostReadout.vue:61-63`, shown while `estimating && isQueued`).
4. Even with the slot free, the stale reading lasts the 500 ms debounce plus the call's admission and stored-request read (`index.vue:209`, `service.ts:846-849`).

Every claim of #1360 holds. **Demonstrated** by this trace; the red-before run (plan Phase 1) reproduces it in the component.

## What the fix touches, and what it does not

- `queuedOps` is read only by `:isQueued` (`index.vue:680`). No Confirm term reads it (`:726-737`; `holdsConfirm` reads `inFlight`, `src/popup/windows/execute/fee-figure.ts:52-58`), so Confirm cannot change.
- `handleFeeUpdate` is the only call that supersedes a window attempt: init schedules each operation once (`index.vue:345-349`), and previews are scheduled only at init.
- The card re-emits on a method or priority pick, an FPC edit (`FeeSettingsCard.vue:294-299`) and a snapshot re-commit (`FeeSettingsCard.vue:244-264`; the card's snapshot has `txRefresh: false`, `src/composables/useFeeSnapshot.ts:54-60`). Each re-emit already supersedes the attempt today.

## The composition catalog (#1361)

The driver does not run `index.vue`. Its `openWindow` (`tests/helpers/fee-race-in-process.ts:706-820`) wires `useFeeEstimationMap` and `holdsConfirm` by hand, with no `queuedOps`, no `queueWatch` and no `handleFeeUpdate`; the only queued flag it keeps is Send's copy (`:831-864`). No oracle reads a window's rendered reading: O2 reads the worker's answers (`:611`, `:668-671`). The sequence can be written with the catalog's actions (`openSend`, `press`, `openWindow`, `PROOF`, `MINE`, `switchMethod`), but the driver would observe only its own copy. `tests/COMPOSITION-TESTS.md:62` keeps component behaviour in the unit and component layer.

## E2E

- Window held behind a send, its fee row read: `network/concurrent-sendtx-confirm.test.ts` (`expectWindowHeldBehindProof`, `feeRow: true`); `network/tx-sendTx-noFrom.test.ts` (`feeRow: false`). Both from `tests/e2e/fixtures/proof-gate.ts:43-90`, which needs a proverless build.
- Window picks beside a queued Send: `network/same-token-concurrent-sends.test.ts:449-532` (`approveExecute` with `feeMethod`).
- Smoke: no file opens the execute window. Trail: `execute-confirm-btn|windows/execute|approveExecute|execute-` over `tests/e2e/*.test.ts`, no match.

## Open work and known limits

- #1336 (open, outcome iii) and #1355, #1357, #1354 (closed `known-limit`) are about the worker's queue and lifetimes; none names the window's reading after a switch. #1360 is the only issue on it.
- `gh issue list --state closed --label known-limit --search "queued"`: nothing on this path.
