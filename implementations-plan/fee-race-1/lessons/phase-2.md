# Phase 2: arc 2 (#1336, F10)

## Phase 2.0, 2026-10-29: the reproduction (D11)

Base: dev after #1344, the arc's merge commit. Chrome, prover ON (`e2e:agent` without `NULO_E2E_PROVERLESS`, retry 0), developer and debug modes on, the `feeJuiceImportedExtension` fixture. A scratch spec, deleted after the runs and never committed.

- Run 1 (151 s): the playground's `sendTx` (default entrypoint, public transfer) confirmed with PrivateFPC, then Send (public to public, PrivateFPC) filled. The local proof ended before Send was filled (the dApp record read `succeeded` at +13 s); the estimate went estimating, queued for 4 s, ready. No failure. The run missed the interleaving.
- Run 2 (183 s): Send filled first (ready at +5.3 s), the dApp confirmed at +7.7 s, its record at `proving` at +7.8 s, Send's amount retyped at +7.9 s. Timeline: estimating +8.0 s, queued +9.7 s while proving, queued through `succeeded` at +24.4 s (the dApp's transaction unmined: the two share PrivateFPC fee notes), ready at +31.5 s. The SW trail: every queued poll answered in 4-100 ms, the admitted call in 1.68 s; no timeout and no error line.
- Run 3 (166 s), as run 2: queued +8.7 s through +27.3 s, ready; no timeout and no error line.

**Outcome (iii).** No failure in three runs: the local proof (about 15 s) and the admitted simulation (under 2 s) never reach the popup's 60 s deadline. The trail shows that deadline applies only to the admitted call (each queued poll is a fresh call answered at once), so the owner's failure needs an admitted run past 60 s, which a Testnet node and a browser prover can produce and the local network cannot. D8 ships on its trace (the 60 s pin, Phase 2.1); #1336 stays open with these runs (`Refs #1336`).

**The orchestrator's PXE answer (OA1) against the trace.** Agrees. The transfer estimate never ran beside the proof: it answered queued for the whole proof (the slot), then until the dApp's transaction mined (the shared fee notes, the sequencer's keys), then ran. Nothing in the trail shows two PXE operations at once.

## Phase 2.1, 2026-10-29: the estimate deadline (D8)

- Red on the base (the new tests importing the constant from its old module): `client.test.ts` 6 failed, all behavioural: each of the three methods answered at 61 s was already rejected, and each unanswered one ended at 60 s, not at the estimate lifetime. The other-method pin moved to `getGasBalances` (still 60 s) and passes on both.
- Head: `client.test.ts`, `estimate-cancel-registry.test.ts`, `estimate-hold.integration.test.ts`, `service.pxe-seam.test.ts` 42 green.

## OA2's signal: the design consult, 2026-10-29

Codex (`gpt-6.1-sol`, high, read-only) on S, a start event keyed by the estimate token, against Outline B: **agree with changes**. S is the smallest fit: the pending call exposes neither admission nor the slot's grant, and a signal-free design needs B's result collection or a timing guess. Changes accepted: the popup's listener matches the token and its attempt's live signal, and is removed on abort and in `finally` (an old call still pending after a supersede must not clear the new attempt's reading); a lost event (a port drop or a worker restart mid-call) leaves today's reading until the call ends, and a dropped port already fails the call, so no replay; the stale comments (`feeQueued`, `TransferFeeQueued`, `estimateWhenClear`) say the new exits; the wire contract is a ledger decision (D15). Its note that the broadcast reaches every execution-client page: the token is a cancellation id another trusted page of the same profile could already use; the event carries the token only, and listeners change display state only.

## Phase 2.2, 2026-10-29: the window queues (D6, OA1 = B)

- Deviation (D16): the plan read the request's network before admission. A cancel arriving during that read finds no registry entry, since the registry records nothing for an unknown token, so the estimate would then admit and run, and under D6 hold the slot a send waits for; `estimate-admission-order.test.ts` pins the order and went red on the first build. As built: admit, read, then take the slot; a queued answer settles with nothing stashed, which leaves the token fresh (`settle` without an id records nothing), so the window asks again with it and no spent form exists on this path.
- Reds on the base (the service, readout and window sources at the arc's previous commit): `service.estimate-queue.test.ts` 6 behavioural (both methods ran behind a held slot instead of answering queued, ran ahead of a waiting send, did not hold the slot while running); the cancel pins pass on both. `useFeeEstimationMap.test.ts` 1 behavioural (no signal reached the estimator). `FeeCostReadout.test.ts` 1 behavioural (a sponsor's queued row in the window read the sponsored sentence). `index.test.ts` 2 behavioural (the estimator returned the first queued answer as the estimate; a spent answer was not a requeue).
- Facade stubs gained the slot seams (`lane`, `networkService`) in `estimate-admission-order`, `estimate-hold.integration`, `service.refusal` and `dapp-send-executor`'s RPC harness; `useWalletTxEstimates.test.ts`'s exact-argument pin gained the signal.
- Gate: `src/wallet/services/execution src/composables src/popup/windows/execute src/popup/components/modules/send` 172 files, 3535 tests green; typecheck clean.

## Phase 2.2a, 2026-10-29: the run's start (OA2 = B, D15)

- Reds on the base (sources at the D6 commit): 8, behavioural 7 (the executor never reported its start; the service emitted nothing for a transfer or a window run; the watch never ran; Send's row and the window's operation stayed queued after their own token's event), structural 1 (`client.onEstimateStarted` absent). The superseded-attempt pin passes on both.
- Popup mocks of the execution client gained `onEstimateStarted` (`send.test.ts`, `scope-follow.test.ts`, `send.integration.test.ts`, `index.test.ts`); facades that run a tokened estimate stub `emit`.
- Gate: those suites plus `src/utils` and `src/popup/pages`: 267 files, 4976 tests green; typecheck clean.

## Phase 2.3, 2026-10-29: the Send queued behind a dApp send

- The case, at `65dfd1eae`: Chrome green (135.7 s with the file's burst fixture), Firefox green (152.5 s), retry 0. Estimate 90 s.

## Review round 1, 2026-10-29

- Codex (`gpt-6.1-sol`, high, read-only), 2 low, both fixed: the case's exact `["queued", "estimating", "ready"]` sampling could miss the transient estimating reading, so it asserts the landing and leaves the start to the component tests; `assertFreshToken`'s "admitted once, ever" contradicted the reusable queued token.
- Opus (`general-purpose`), 1 medium and 1 low, both fixed:
  - The medium: an estimate behind another estimate answered queued, so a window's second operation, a superseded attempt, or Send behind a window estimate read "Queued behind your previous send" with no send in flight, and Send offered its cap. The slot check was `isLocked`, which counts estimates. Fixed as D18: the mutex counts the requests holding or waiting in each lane, by origin bucket; estimates take their own bucket and wait behind each other; `isSendInSlot` answers for sends only. The admission depths were not used: they count a parked dApp send's kept place, so estimates would queue for a whole park, which `isLocked` never did.
  - The low: the window's `EstimateRequeue` branches, `lastFeeParams` and their test were unreachable (no spent answer reaches the window); removed.
- Reds on the base (sources at `65dfd1eae`): 11. Behavioural 2: both window methods behind another estimate answered queued instead of waiting. Structural 9: `isLockedOutside`, `takeEstimateSlot` and `isSendInSlot` absent.
- The Chrome gate on `65dfd1eae` (the file, `concurrent-sendtx` ×3, `fee-methods`, `tx-sendTx-sponsoredFpc`, `tx-sendTx-delegated-authwit`): 30 of 31, 1142.7 s. Red: `concurrent-sendtx-confirm` approved the second window while the first send was held at `proving`. Under OA1 = B the second window's estimate queues, so its Confirm stayed off until the proof gate's 20 s safety release; both sends then ran and the `proving` + `queued` snapshot never held. `tx-sendTx-noFrom`'s concurrent case has the same shape. Both rewritten to the new contract (D19) with one helper, `expectWindowHeldBehindProof`, whose reads fall inside the gate's hold.
- Gate: `src/wallet/services/execution src/composables src/popup/windows/execute src/popup/components/modules/send src/utils src/popup/pages`, 324 files, 6258 tests green; typecheck clean.

## Review round 2, 2026-10-29

- Codex (same session), 3 findings. The gate on `187b8d743` was stopped once the first was read, before either rewritten file ran.
  - Medium, fixed: `expectWindowHeldBehindProof` required the held send alone in the journal, but the SDK records each `sendTx` as `queued` on arrival, before approval, so the pair is always `proving` + `queued` and the helper could never pass. It now holds the pair: the held row stays `proving` under its id, the other stays `queued`; the window's Confirm is what shows the second unapproved.
  - Medium, recorded as KL6, not resized: an estimate waiting for the slot behind up to three others counts that wait against the 15-minute lifetime, so three runs ahead that each pass about five minutes get it reaped. The lifetime also bounds a dead runner's admission place and the offscreen hold, so a longer one stretches KL4; the precedent is KL4's admission wait, which I3 already excludes. I3 now excludes the slot wait too, and the lifetime's doc says it counts.
  - Low: `concurrent-sendtx-confirm`'s walkthrough cut to the constraint. The mutex header's archived plan path is pre-existing; CLAUDE.md lets it stay until that comment is rewritten.

## Review round 3, 2026-10-29

- Codex (same session): `clean`. The fixes verified; KL6 accepted as the lifetime's trade-off. The loop converged at round 3.
