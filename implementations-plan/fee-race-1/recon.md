# fee-race-1 recon

Base: `origin/dev` at `b036edbff`. Two Sonnet explorers (test infrastructure; the Send estimate's timeline), the planner's own trace, and one Codex root-cause consult (gpt-6.1-sol, high), recorded in [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/src/` unless they start with `apps/`, `packages/` or `tests/` (`tests/` = `apps/extension/tests/`).

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Per-op Confirm gating in the dApp window | `popup/windows/execute/fee-figure.ts` `waitsForFeeFigure` (pure, tested in `fee-figure.test.ts`); `index.vue` `awaitsFeeFigure`, the `:confirm-disabled` binding and `approve()`'s early returns | adapt: one pure per-op rule beside `waitsForFeeFigure`, read by both the binding and `approve()` |
| Estimate state per op | `composables/useFeeEstimationMap.ts` over `composables/internal/fee-estimation-engine.ts`: `estimating[key]` is true from `schedule()` (debounce included) to settle | reuse as-is |
| Queued estimate protocol | `utils/estimate-when-clear.ts` (2 s polls on one unspent token, `EstimateRequeue` on a spent one); worker side `ExecutionService.estimateTransferFee` (`isSlotBusy` / chain tip / sequencer → `TransferFeeQueued`) and `TransferExecutor.estimateFee` (`tryTakeSlot`, `QUEUED_SPENT`) | reuse for the window's estimates; adapt the map adapter to pass the engine's signal |
| Popup RPC deadline per method | `wallet/services/execution/client.ts` `getRequestTimeoutMs` (precedent: `executeTransfer` → `EXECUTE_SEND_TIMEOUT_MS`); the worker's own estimate bound `ESTIMATE_JOB_TTL_MS` (`estimate-cancel-registry.ts:43-47`, "~5 sequential PXE RPCs × their 90 s timeouts") | adapt |
| Preview snapshot lifetime | `wallet/services/execution/preview-snapshots.ts` over `SingleShotTtlCache(ESTIMATE_REUSE_TTL_MS = 120 s)`; consumed inside the slot (`dapp-send-executor.ts` `takeStandardPreview`, `enforcePreview`) | adapt (D5) |
| Composition harness for execution | `wallet/services/execution/service.composition.test.ts` and `send-order.composition.test.ts` each build a local `makeHarness` (real journal over `FakeBrowserApi`, real `ExecutionService`, `svc()` stubs from `wallet/services/composition-harness.ts`, `ControllableGate`, seeded reuse entry for the send fast path) | adapt: extract one shared builder, never a third copy |
| Seeded sequence pattern | `tests/e2e/helpers/profile-chaos/model.ts` (pure catalog, `plan(seed)`, `planFromList`), `tests/helpers/profile-chaos-in-process.ts` (`runPlan`, `describeRed`), `profile-chaos.composition.test.ts` (fixed seed list, hand lists, coverage test, `redAt`/`faultAfter` break fixtures, long mode on `NULO_PROFILE_CHAOS_RUNS`/`_SEED`); `tests/e2e/fixtures/chaos-seed.ts` `prng` (mulberry32, pinned by `scripts/e2e/chaos-seed.test.ts`) | reuse `prng`; copy the shape, never the profile code |
| E2E driving | `tests/e2e/fixtures/popups.ts` `approveExecute` / `waitForExecuteApprovable` (button enabled only, default 10 s), `fixtures/send-burst.ts` `startSend` / `readEstimateState` / `waitForEstimate` / `expectEstimateQueued`, `fixtures/proof-gate.ts` `holdProofGate` (SW-side, before `pxe.proveTx`, self-releases at 20 s), `fixtures/mining-hold.ts`, playground `pg-btn-sendTx-delegated` + `deployDelegatedPullRig` (the only dApp send with a private authwit found at confirm) | reuse |

Absences, with their search trails:

- No composition test lands a real fee estimate: `estimateTransferFee|estimateOperationFee` in `wallet/services/execution/*.composition.test.ts` hit only the queued branch (`send-order:245`) and a rejected-simulate stub (`service.composition:1237-1303`).
- No in-process chaos for execution: `grep -ril chaos` hits profile, chaos-session and the e2e `send-chaos` only.
- No e2e helper reads the execute window's estimate state; no e2e picks a private FPC (`FeeMethodSubtitle` is `sponsored | public | private`, `fixtures/transfers.ts:241`).
- No unit-suite runtime budget assertion (`slowTestThreshold`, reporters, `performance.now` in vitest configs and chaos files).

## Facts the plan rests on

Bug 1 (#1335), demonstrated by trace:

1. The worker holds every popup approval of a standard `aztec_sendTx` to the snapshot of authorizations the card showed: `executeAztecSendTx` pops it (`takeStandardPreview`) and `standardPass` runs `assertWithinPreview` (`wallet/services/execution/dapp-send-executor.ts:1015-1058`). A missing snapshot passes only when confirm finds no private authorization (`preview-snapshots.ts:73-85`); else `ESTIMATE_INCOMPLETE_MESSAGE`.
2. Only a landed estimate writes that snapshot (`estimateOperationFee` → `writePreview`, `:551-560`), or, for `default_entrypoint`, a landed authorization preview (`:604-625`, enforced at `:1389-1399`). Embedded app payments skip discovery at both ends (`:1184`), so they never meet the refusal.
3. The window holds Confirm on the fee figure only (`index.vue:217`, `fee-figure.ts:40-45`); `payer?.type !== "fpc"` exempts a sponsor, and nothing waits for `previewingOps`. The approval sends the ids that have landed at the press (`index.vue:471-481`); an estimate landing after it cannot repair the approval.
4. The sponsor exemption is a recorded decision: D38 in `implementations-plan/archive/harden-security-fixes-2/plan.md` (a failed sponsored estimate leaves Confirm on, so a request the estimate refuses still reaches its answer). `index.test.ts:1135` pins it.
5. The snapshot expires 120 s after the estimate (`SingleShotTtlCache`, `estimate-reuse-shared.ts:24,155-188`; the TTL is the owner-set bound on signed requests). It is consumed at the operation's turn in the slot, after earlier sends and earlier operations of the same interaction (`service.ts:906-946` runs them in order). An interaction's window closes 10 min after it opens (`dapp-interaction/service.ts:83,595-612`).

Bug 2 (#1336):

6. Send asks `estimateTransferFee` every 2 s with one unspent token while the worker answers queued; each ask is its own RPC with the default 60 s deadline, set at the call (`popup/pages/send.vue:409-449`, `utils/estimate-when-clear.ts`, `wallet/services/execution/client.ts:23-25`, `packages/extension-messaging/src/core/base-client.ts:117`). So the slot queue's wait is not counted by any deadline; admission parking and the PXE line are, inside one ask.
7. A granted transfer estimate holds the slot and runs the build: for the PrivateFPC, up to three full private simulations (`wallet/services/execution/fee/fpc-strategy.ts:224-266`) plus network probes (`transfer-executor.ts:744-829`). The PXE runs one job at a time per profile and chain (`packages/aztec-runtime/src/pxe/service.ts:455,502,992-1012`); the worker ends each PXE request at 90 s (`packages/extension-messaging/src/offscreen/client.ts:22`) and then answers the call, keeping only the admission place until the simulation ends offscreen (`service.ts:691-728`). `ESTIMATE_JOB_TTL_MS` (15 min) is the registry's dead-man reaper, declared above "~5 sequential PXE RPCs × their 90 s timeouts" and swept only on admission; it is not a ceiling on the work (`estimate-cancel-registry.ts:42-47`). The popup's 60 s is shorter than one request's 90 s.
8. The card keeps "Queued" for the whole granted run: `feeQueued` clears only on error, on `isEstimating` false, or on new input (`send.vue:307-320,430-446,554-557,606-607`).
9. The dApp send's pending row carries `fpc:<PrivateFPC>`: the strategy prepends `pay_fee` to the actions (`fpc-strategy.ts:252`, `fpc/handlers/private-fpc-handler.ts`), which `txCalls` records, and `recordedTxKeys` keys it (`transfer-sequence-keys.ts:87-103`). So a private-Fee-Juice Send is ordered behind the pending swap (Codex corrected the planner here).
10. The window's `estimateOperationFee` and `previewOperationAuthwits` take no slot and never answer queued (`service.ts:788-819`): an approval window opened while another send proves simulates behind that proof, past the 90 s request bound on a real prover.
11. CI proves with the prover off for most network files (`CI.md:83`), and the proof gate holds the slot before `pxe.proveTx` and releases itself after 20 s (`src/e2e/chrome-storage-proof-gate.ts:19`), so no proverless file holds a busy PXE behind a granted estimate. The prover-ON canaries run one send at a time.
12. The registry's settled handle lets a cancel evict a finished estimate's stash for `SETTLED_STASH_TTL_MS` (120 s); its sweep, run by any later admission, then evicts the stash itself through `evictStash`, which includes the preview snapshot (`estimate-cancel-registry.ts:48-49,276-281`, `service.ts:396-402`). So a snapshot dies at 120 s by this path even if its own TTL is longer.

## Collisions

- `index.test.ts:1135` and `fee-figure.test.ts:56-63` pin the sponsor exemption; arc 1 rewrites the in-flight half of `:1135` and keeps D38's failed-estimate half.
- `ESTIMATE_INCOMPLETE_MESSAGE` is pinned at `dapp-send-executor.test.ts:1678,1795` and `preview-snapshots.test.ts:64`; the refusal stays.
- 24 `approveExecute` callers use the 10 s approvable default with a sponsor; after arc 1 the button waits for the estimate.
- `send-picker-1` works on `send.vue`'s token card and `AmountCard`; this lane touches `send.vue` only in arc 2's fee wiring, if at all.
- Closed known limits nearby: #396 (Confirm live during a first Fee Juice estimate; arc 1 covers it), #998, #999, #398, #380.
