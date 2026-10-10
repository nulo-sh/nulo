---
plan: fees-and-sponsors
tier: mid
status: approved v3.1 (D-orch-1 to D-orch-5); arc 1 building
issues: "#196, #119, #222, #188 pin, #118 comment (arc 1); #91, #107, #113, #114, #115, #188, #118 (arc 2, waits on decision page 6, and on pages 6 and 9 for anything hold H3 covers); #117 (no arc, blocked:external)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 Explore agents (sonnet); dual audit (Codex gpt-6.1-sol high + one Opus Plan agent); one final fresh Codex pass
post_implementation_hardening: not scheduled
base: origin/dev at fd47407
trunk: dev
---

# Fees and sponsors: estimate and cap internals, sponsor checks, fee maps

Eleven issues on how the wallet estimates a fee, caps it, checks a sponsor, and keeps a person's fee choices. Two arcs and a close-out.

- **Arc 1 (decision-free, inside hold H3; ships first as its own PR).**
  - #196: the seven popup RPCs that carry fee settings refuse an unknown speed level.
  - #119: an estimate whose simulation timed out keeps its own admission place until that simulation ends offscreen (its late answer, a retired document, or the registry's existing 15-minute TTL).
  - #188 (pin only, as P6-07 says): a test pins today's precedence between an app's `maxFeesPerGas` and the wallet's cap, and the PR body writes it into #188.
  - #222: two synchronous extractions remove duplicated fee code; the other eight items close with a reason each.
  - #118: the false budget rationale is corrected in the four comments that carry it; the rule is unchanged, and #118 stays open for OWNER-ASKS OA-1.
- **Arc 2 (waits on decision page 6, reservation R4, arc 1, and the owner asks named per phase).** Planned now, built only after page 6 is signed:
  - #91 (P6-01): per-profile fee picks that every delete path removes.
  - #107 (P6-02): long proofs in the authwit popups.
  - #113 (P6-03): sponsor checks wherever a sponsor pays.
  - #114 (P6-04): the fee-juice nudge in the app window.
  - #115 (P6-05, P6-06): the sponsor notice and the loading Sponsored row.
  - #188 (P6-07): its remaining proposals.
  - #118 (OA-1).
  - Anything that moves a cap, a charge or which cap wins, and anything that decides whether a send can go out on a fee the person has not seen, also waits on recorded answers on pages 6 **and 9** (hold H3). That covers OA-1 to OA-6, OA-7, OA-8, OA-9, and Phase 2.3 as a whole.
- **No arc.** #117 waits on a funded sponsor on mainnet (`blocked:external`). Nothing is planned for it.

Recon: [recon.md](recon.md). Owner questions: [OWNER-ASKS.md](OWNER-ASKS.md). Consults: [lessons/phase-0.md](lessons/phase-0.md). Live progress: [STATUS.md](STATUS.md).

## Issue map (the arc that closes each issue)

| Issue | Arc | Waits on | Closes when |
|---|---|---|---|
| #196 | 1 | send-queue-activity arc 1 merged (shares `EX/service.ts`); no ask (SR7) | arc 1 merges |
| #119 | 1 | send-queue-activity arc 1 merged (it edits the estimate admission) | arc 1 merges |
| #222 | 1 | send-queue-activity arc 1 merged | arc 1 merges (two extractions, eight declines with reasons) |
| #188 | 1 (pin), 2 (rest) | P6-07; pages 6 and 9 (H3) and OA-2 to OA-6 for any change to a cap, a charge or precedence | arc 2 merges; arc 1 says `Refs #188` |
| #118 | 1 (comment), 2 (rule) | OA-1; pages 6 and 9 (H3) | arc 2 merges; on OA-1 = A it closes as not planned (SR3); arc 1 says `Refs #118` |
| #91 | 2 | P6-01; R4 (one at a time with account-session-life arc 2) | arc 2 merges |
| #107 | 2 | P6-02 | arc 2 merges |
| #113 | 2 | P6-03; pages 6 and 9 (H3's unseen-fee clause); OA-7 (app-chosen payment row), OA-8 (authwit popups), OA-9 (Send's Confirm on a failed estimate) | arc 2 merges |
| #114 | 2 | P6-04; OA-11 | arc 2 merges |
| #115 | 2 | P6-05, P6-06 (veto list); OA-10 | arc 2 merges (item 20 already shipped in #235) |
| #117 | no arc | a funded sponsor on mainnet | stays open (SR5) |

- The lane brief puts #118 in arc 1. Only its comment fix is decision-free, so that part ships in arc 1. The rule change waits on OA-1 and H3, so the issue closes in arc 2.
- #196 sits in arc 1, as the lane brief allows, because its files are arc 1's.

## Outcome & Quality Bar

**For whom.**
- A person who pays a fee: on the Send page, in an app's approval window, or in the authwit popups, on testnet or a local network.
- The maintainer who later reads the fee code and must see which cap wins and why.

**What excellent looks like.**
1. No change makes a person pay more without a recorded answer, or sends a transaction on a fee the person has not seen. Arc 1 changes no committed cap and no displayed number. A unit pin proves that each cap rule arc 1 touches is unchanged.
2. A malformed fee setting from the popup is refused at the port with `INVALID_PARAMS` and logged at debug. It never reaches fee math. The inner fail-closed throw stays as a second line. Tests: one refusal per refused class, beside a success control.
3. A timed-out estimate keeps its own place until its simulation ends offscreen, and admission counts nothing else new. Proved on the real service and registry, and on the real client with fake timers:
   - Never-happens test: a parked estimate stays parked while the timed-out simulation runs.
   - Control: the late answer admits it.
   - A retired document and the TTL also admit it.
   - A READY, a failed close or a negative probe admits nothing; only a successful close retires a document.
4. For arc 2, what a person sees matches the signed page and the answered asks word for word. Screenshots on both browsers and both themes.

**Good enough.**
- No rewrite of the fee strategies and no new fee abstraction.
- No change to the reuse ladders' order, and no new await boundary on a send or estimate path.
- #222 closes with two extractions; the rest are declined in writing, not forced.

## Scope

**In:** the eleven issues above, as the issue map says.

**Out:**
- **#197's in-repo half** (a `GasFees` shape check in `predictedWorstMinFees`). chain-endpoints routed it here, but it is not one of this lane's eleven issues. Ask A-1 below; nothing is planned for it unless the orchestrator assigns it.
- **Every #188 proposal that changes a committed cap, a charge, a displayed number or which cap wins** (H3). Each goes to OWNER-ASKS with before and after numbers.
- **A per-method zod schema for every ExecutionService RPC.** #196's decision names one field.
- **Anything send-queue-activity owns:** the session baton, the send sequencer and the execution lane.
- **The head of `ProfileService.deleteProfile`, `ProfileDeletionCoordinator` and the tombstone shape.** account-session-life arc 2 owns the deletion head, and #91 needs none of the three.

## Architecture & Implementation

### Arc 1, #196: the speed level at the popup RPC boundary

**Decision (recorded, no ask).** "Own-property check of priorityLevel at the popup RPC boundary; refuse with InvalidWalletArgumentsError at debug" (SR7).

**The predicate and the guard.**
- `packages/wallet-bridge/src/fee.ts` gains two helpers beside `PRIORITY_MULTIPLIERS`:
  - `isPriorityLevel(value: unknown): value is PriorityLevel` is true only for a string that is an own key of `PRIORITY_MULTIPLIERS`. It uses `Object.hasOwn`, the `operation-planner.ts:133` idiom.
  - `refuseUnknownPriority(method, feeSettings)` throws `InvalidWalletArgumentsError.forMethod(method)`. That layer already imports `@nulo/extension-messaging/errors`.

**The seven RPCs that take a `FeeSettings` from the popup:**

| Service | Method | Where the fee settings sit |
|---|---|---|
| `ExecutionService` | `executeTransfer` | its `feeSettings` |
| `ExecutionService` | `estimateTransferFee` | its `feeSettings` |
| `ExecutionService` | `estimateOperationFee` | its `feeSettings` |
| `ExecutionService` | `executeOperations` | each operation of kind `send_transaction` or `aztec_sendTx` (`packages/wallet-bridge/src/operation.ts:87,184`) |
| `DappInteractionService` | `approveInteraction` | each delta's `feeSettings` |
| `AuthRegistryService` | `revokeAuthwits` | its `feeSettings` |
| `AuthRegistryService` | `setRegistryEnabled` | its `feeSettings` |

Arc 2's new estimate RPCs join this table when they land.

**The boundary.**
- Each of the three services gets an `invoke` override, the `account/service.ts:130-133` shape. The fee settings are found by a method-keyed, typed extractor, not a positional table:
  - The extractor is a `{ [M in GuardedMethod]: (args: Parameters<Methods[M]>) => readonly unknown[] }` object, declared with `satisfies`. A changed signature is then a type error.
  - A refused call throws before the method runs. `base-service.ts` already logs a thrown call as "Request failed" at debug.
- **What is refused:** a `feeSettings` object whose `priorityLevel` is present (not `undefined`) and fails `isPriorityLevel`.
  - An absent level stays the default.
  - `""` is refused. The popup never sends it, because `fee-helpers.ts:67-70` omits the field for Normal.
- **What passes through unchanged:**
  - a `feeSettings` that is not an object;
  - a `deltas` or `operations` that is not an array;
  - every other field.
  Today's failures for these stay as they are: `applyFeeSelection` and the strategies already refuse an unknown payment kind.

**Inner layers stay fail-closed.**
- `OperationEstimateReuse.feeReadFailed` keeps its non-number rethrow. Without it, a level that reached reuse past the boundary would miss reuse, rebuild at a silent default and send.
- The pins at `operation-estimate-reuse.pins.test.ts:344-384,409-420` stay. Their "owner lead" wording is reworded to "the inner second line behind the RPC boundary".
- The `reuseFeeMultiplier` doc says that the boundary validates the level and the inner throw backs it.

### Arc 1, #188: pin today's precedence (no cap changes)

Today's precedence (recon § #188) is pinned where it is not yet pinned. The PR body writes it into #188.

| Path | Winner today | Pinned by |
|---|---|---|
| `fj`, `fjwc` fresh build | The app's `maxFeesPerGas`, verbatim, with no multiplier and no floor | Existing: `fee-structural-parity.test.ts:147`. **New:** a cap below the current minimum is still committed verbatim. |
| `fpc` sponsored fast path and two-pass | The wallet's cap; the app's is ignored | **New**, on both paths. |
| Embedded, NO_FROM | The app's cap, else the current minimum at 1.0× | Existing: `fee-structural-parity.test.ts:181-233`, `strategies-lifecycle.test.ts:391`. |
| Operation reuse | An app cap is never stashed | Existing: `dapp-send-executor.test.ts:928`. |
| A `send_transaction` the planner builds for a Send-page transfer | The wallet's cap only; the planner builds no `fee` (the operation type itself allows `fee`, `operation.ts:89`) | **New**, if `operation-planner.test.ts` lacks it. |
| An app's `maxPriorityFeesPerGas` on a send | Dropped: the strategies build without the app's gas settings, and the build's priority defaults to zero (`fee/fee-juice-strategy.ts:28-33`, `fee/fpc-strategy.ts:145`, `account/fee-options.ts:73-75`) | **New**, at two boundaries (below). |

**The two priority pins.**
- In `fee/strategies-lifecycle.test.ts`:
  - For `fj`, `fjwc`, both `fpc` paths and embedded, `buildStandard` receives no gas settings (its fifth argument is `undefined`), even when the app gives a nonzero priority.
  - The committed priority equals the built one.
- In `tx-request-builder.pins.test.ts`, the standard and the NO_FROM builds commit zero priority when the app supplies a nonzero one.
- The existing priority-preservation sentinel (the harness's 7/8 in `finalizeGasLimits`) stays.

**#118's comments.** The budget rationale is false against the installed 6.0.0-rc.1. No canonical payment method asserts `gasLimits × maxFeesPerGas ≤ budget`. The one budget-style assert is PrivateFPC `mint_and_pay_fee`, which the bridge's fuel claim calls with an explicit cap.
- The rationale is rewritten in all four places that carry it:
  - `fee/embedded-fpc-cap.ts`, where the plan path at `:63` is also dropped (CLAUDE.md § Code-comment style);
  - `fee/embedded-strategy.ts:7-12`;
  - `fee/fee-strategy.ts:286-290`;
  - `packages/aztec-runtime/src/account/fee-options.ts`, for its "byte-for-byte" claim.
- **The new rationale:** an app whose own fee contract asserts a budget against the current minimum depends on 1.0×, and an app that wants headroom passes `maxFeesPerGas`.
- No code changes (H3, OA-1).

### Arc 1, #119: a timed-out estimate keeps its place until its simulation ends

**The defect.**
1. `withEstimateAdmission` settles its registry entry in `finally`, whatever ended `run()`.
2. When the offscreen transport times out a `simulateTx` (90 s), `run()` rejects and the place frees.
3. The simulation keeps its turn in the offscreen per-(profile, chain) write guard (`pxe/service.ts:469,516`). That guard is shared with `proveTx`.
4. The offscreen service awaits the method and then posts a separate answer, with no abort on timeout (`packages/extension-messaging/src/offscreen/service.ts:39-60`).
5. While the document lives, the late answer arrives and is dropped with a warn (`core/base-client.ts:195-199`).

**The fix, as the issue proposes:** hold the estimate's own entry until its simulation ends offscreen. Nothing else is counted, so admission policy is unchanged for every other kind of work. App simulations, balance reads, sends and other chains stay exactly as they are today (decision ledger D3).

**What starts a hold.**
- The run's rejection is an `RpcTimeoutError` for `simulateTx`, found by identity or along its `cause` chain. Its `details.requestId` is already set (`base-client.ts:323-328`).
- The request is one that ExecutionService's own PXE client recorded as **sent and abandoned**. Its terminal record has status `timeout` with detail `timeout_fired`.
  - A readiness timeout creates no pending entry (`:284-300`), so it is never recorded.
  - A request sent to a document that has since been retired is never recorded either (below).
- `settle` rejects the caller and calls `onTerminal` in the same task (`:268-276`). So the record exists before the caller's `finally` runs; a pin proves this order.
- A strategy that wrapped the error without its `cause` would lose the hold and settle as today, which is the fail-safe direction. Phase 1.3 step 1 audits every catch on the estimate paths, and a test per estimate entry pins that the id survives.
- No production code disconnects a PXE client: it connects on its first request and lives with the service worker (`offscreen/client.ts:142`). A disconnect is never treated as an end of the work. If a disconnect path is ever added, its error must carry the request id before it may release a hold.

**What ends a hold.** The first of:
- **the late answer:** `onUnmatchedResponse` for a recorded request logs a fixed debug line instead of today's warn;
- **a late send failure:** the wire send failed after the timer fired, so the document never received the request;
- **a retired document:** only a close known to have succeeded. That means a `closeDocument()` that resolved without error, or a Firefox frame that was attached and is now removed. A failed close, or a probe that finds no document (Chromium's `getContexts` can miss a ghost, `offscreen.ts:218`), leaves holds to the TTL;
- **the registry's existing 15-minute TTL sweep**, the dead-man bound. It reaps a held entry like a dead runner's.
  - No horizon is a work ceiling. A simulation queued behind long proofs can outlive any bound, so expiry may release a place while that work still waits.
  - Nothing extends the TTL: neither the active TTL nor the parked one.

**The shape.**
1. **`packages/extension-messaging/src/core/base-client.ts`** gains three hooks, each defaulting to today's behaviour so every other client is unchanged:
   - `protected requestTag(method, params): unknown` is called when the pending entry is created, which is after readiness and just before the wire send. Its result is kept on the entry and handed to `onTerminal` as a second argument. `TerminalRecord` and the telemetry sink stay unchanged.
   - `protected onUnmatchedResponse(content)` fires for a response with no pending entry. Its default is today's warn.
   - `protected onLateSendFailure(requestId)` fires when a wire send fails for a request that is already terminal (`:166-176`). Its default does nothing.
2. **`packages/aztec-runtime/src/pxe/client.ts`** (`PxeServiceClientBase`):
   - `setDocumentEpochProvider(fn)` uses the `setGenerationProvider` pattern. Without a provider, nothing is recorded, which is today's behaviour.
   - `requestTag` returns the current document epoch for `simulateTx`, and `undefined` otherwise.
   - `onTerminal` calls `super`. A tagged `simulateTx` that ended `timeout`/`timeout_fired` with its epoch still current is recorded as `requestId → deferred`. One from a retired epoch is not recorded, because its work is already gone.
   - `offscreenSettled(requestId): Promise<void> | undefined` is a pure lookup.
   - `retireEpochsThrough(epoch)` resolves and drops every record sent at or before it.
   - **Every record has a bounded lifetime.** It expires `ESTIMATE_JOB_TTL_MS` after it was made, and expiry deletes it and resolves its promise. The wallet subclass sets that lifetime, and a test pins it equal to the registry's constant.
     - The estimate entry a record can hold started before the record was made. So expiry never settles an entry before the registry's own TTL would have reaped it.
     - Records that no estimate claims (a send's or a tokenless simulation's) expire the same way, so nothing accumulates across timeout cycles.
   - Each resolution deletes the record first.
3. **`apps/extension/src/wallet/utils/offscreen.ts`:**
   - `offscreenEpoch()` is a counter.
   - `onOffscreenRetired(listener)` fires after the counter moves.
   - The counter moves only on proof that a document is gone. `closeOffscreen()` reports whether its close succeeded (today it swallows a failed `closeDocument()`, `:181`), and the `trackedClose()` link (`:131-138`) moves the counter only on success.
   - It never moves on READY (a ghost document can emit READY during a close-and-retry, `:340-347`), on a failed close, or on a negative probe.
4. **`apps/extension/src/wallet/services/pxe/client.ts`** (the wallet subclass) registers the epoch provider once for every instance, the pattern its store-key and generation providers use (`:11-20`), and subscribes `retireEpochsThrough`.
5. **`EX/service.ts`, `withEstimateAdmission`:**
   - The `catch` looks up `this.pxeService.offscreenSettled(id)` for a matching timeout.
   - The `finally` then settles at once, or defers `settle` to that promise.
   - The entry stays active meanwhile, so the registry counts it with no change to its logic.
   - A `cancel` of a held token aborts nothing offscreen and frees nothing. That is the registry's existing contract: "a cancelled job does NOT free capacity" (`estimate-cancel-registry.ts:11-13`).
   - A deferred `settle` for a token the TTL already reaped is a no-op. Phase 1.3 verifies this and pins it.
6. **`EX/estimate-cancel-registry.ts`:** the header and the `ESTIMATE_JOB_TTL_MS` comment change to say that a transport timeout holds the entry until the offscreen answer, a retired document or the TTL, and that the TTL can free a place behind live queued work. No code changes.

**Alternatives (decision ledger D2):**
- **Outline B's hold until the TTL:** holds 15 minutes after a simulation that finished seconds past the timeout.
- **A longer `simulateTx` timeout:** changes when every caller fails, and still frees the place early.
- **Counting every orphaned simulation of the profile** (plan v2): widens admission to app, balance and send work and to other chains, which is an unapproved behaviour change (final Codex pass, finding 1). It also needed a process-wide ledger.
- **Ending a hold on a replacement READY:** a ghost document emits READY.

### Arc 1, #222: two synchronous extractions, the rest declined

**Prerequisite.** send-queue-activity arc 1 is merged, and `origin/dev` is merged into this branch. That arc edits `transfer-executor.ts`, the dApp estimate stash and `fpc-strategy.ts:113-132`.

**Extracted** (each with its order pin green before and after):
1. **`fingerprintBuiltFee(txRequest)`**, synchronous, in `estimate-reuse-shared.ts`. It replaces the two wrapper literals at `transfer-executor.ts:541-544` and `dapp-send-executor.ts:478-481`. No await is added and no read moves.
2. **The fresh build's multiplier** (`EX/service.ts:1122`) calls the existing `reuseFeeMultiplier`, renamed `feeMultiplierFor`. It already reads `priority ? PRIORITY_MULTIPLIERS[priority] : DEFAULT_FEE_MULTIPLIER`, so the fresh build passes `DEFAULT_FEE_MULTIPLIER` where it passed `undefined`. Every strategy read already falls back to that same constant (`fee-strategy.ts:281`, `fpc-strategy.ts:138,210`), and embedded passes 1, so the committed value is unchanged.
   - In e2e, `DEFAULT_FEE_MULTIPLIER` is 7 (`VITE_NULO_FEE_MULTIPLIER`), so the fallback is that constant, never `PRIORITY_MULTIPLIERS.normal`.
   - Pinned by the existing multiplier tables: `operation-estimate-reuse.pins.test.ts:328-342`, `transfer-estimate-reuse.pins.test.ts:260-274`, `strategies-lifecycle.test.ts:365-391`.

**Declined, each with its reason** (recorded in the PR body and the Outcome; #222 closes):
- **`withEstimateTask`:** the fpc fast path completes its task early and returns the two-pass build un-awaited (pinned at `strategies-lifecycle.test.ts:257-274`). One wrapper for all five copies would add an await to four of them.
- **`committedMaxFees` and the ladders' fee compositions:** the two reuse ladders read the multiplier and the fee in opposite orders on purpose, and each order is pinned.
- **The probe fold:** it has three different shapes, not one.
- **`resolveLiveHandles`:** the two six-line copies are each followed by path-specific checks, and send-queue-activity arc 1b re-plumbs both executors.
- **The NO_FROM recorder as a `sentTxRecorder` variant:** its missing `async` hop is deliberate (`mark-failed-unless-cancelled.test.ts`).
- **The `NO_WAIT` tail** (`dapp-send-executor.ts:728-732`, `:901-905`): an async helper adds a promise-settlement boundary inside `runInSlot` callbacks that send-queue-activity arc 1b re-plumbs. Order pins cannot prove that the microtask order is unchanged.
- **The FPC finalize tail** (`fpc-strategy.ts:178-201`, `:277-300`): a `return await` helper adds a completion boundary after the inline continuation, and the other lane edits the file.
- **`raceDeadline`:** no duplicate exists (the issue's claim did not hold).

### Arc 2 (planned, built only after page 6 is signed)

Every phase below waits on page 6. Its `UI impact` lines quote the page word for word. Anything beyond the page is in OWNER-ASKS, and the phase builds it only on an answer.

**#91 (P6-01): per-profile fee picks.**
- **Keys.** Both maps move into the per-profile UI key registry (`utils/profile-ui-keys.ts`) with the prefixes `nulo:ui:feePaymentMethods@` and `nulo:ui:sendFeePaymentMethods@`, built beside `pinnedTokensKey`. `ProfileDeletionCoordinator.purge` already removes `profileUiKeys(id)` on the normal, resumed and torn-reap paths, so no coordinator edit is needed.
- **Values.** Each value is `{ generation, picks }`. `generation` is the profile row's `pxeGeneration`: a 128-bit nonce, not a secret, already sent offscreen in `NetworkInfo`. `ProfileInfo` gains `generation`.
  - Both readers validate the value's shape the way `asRecord`/`parseAll` do. Today only the Send map is checked; `readSavedFeeMethods` returns the raw value.
  - A value with another generation reads as empty.
- **One writer, under the profile lock** (Codex S4). The popup no longer writes either map. A new `ProfileService` RPC applies one small typed update under `runExclusive`: set one pick, or drop every pick that names a removed FPC. It refuses unless the named profile's row exists, is not reserved for deletion, and has the named generation.
  - A page still open on a deleted profile is therefore refused, before or after the purge, and so is an old writer after a same-id re-import.
  - Deletion's own `runExclusive` section deletes the row and reserves the id before the purge runs.
  - **Ownership checked at the write.** `ProfileService`'s lock force-releases after five minutes while the displaced callback keeps running (`packages/wallet-core/src/utils/lock.ts:5,145-159`). So the writer issues its one `storage.set` only after checking `withLock`'s `isCurrent()` probe (`lock.ts:86`) synchronously, with no await between the check and the issue. The check also comes after any wait inside the storage call itself: a facade that awaits before writing runs the check in its `unless` callback (`utils/storage.ts:78`). `runExclusive` passes that probe through. A displaced writer refuses.
  - A write issued while the writer still owned the lock was issued before deletion's lock section, and so before the purge's remove. That ordering relies on I-5.
  - The writers that move to the RPC: `FeeSettingsCard.vue` `persistSelection`, `fee-send-selection.ts`, and the FPC prune in `settings/fpcs/index.vue`.
  - The new RPC carries no `FeeSettings`, so #196's table does not change.
- **Reset.** `settings/security/reset.vue` stops removing both maps whole, which over-wiped every other profile. The purge removes the deleted profile's keys, and a later write is refused.
- **Pre-production: no migration.** The two retired global keys are left alone; a dev install reinstalls (CLAUDE.md § Persisted-storage shape changes).
- **R4.** Phase 2.1 touches `ProfileService` (the new RPC) and the `ProfileInfo` projection (`profile/spec.ts`, `session-manager.ts:721`), which are account-session-life's files. It goes one at a time with that lane's arc 2:
  - This lane's brief says to rebase #91 onto that arc.
  - account-session-life's plan says #91 may land first if both are ready.
  - The orchestrator picks the order (report).

**#107 (P6-02): long proofs in the authwit popups.**
- **Timeout.** In `AuthRegistryServiceClient.getRequestTimeoutMs`, `revokeAuthwits` and `setRegistryEnabled` take the long send ceiling. `EXECUTE_TRANSFER_TIMEOUT_MS` is exported from `EX/client.ts` as the shared constant. The read RPCs keep the default.
- **Correlation, allocated by the service worker** (Codex C5, Opus).
  - `IExecutionHooks` gains `onJournalCreated?(journalId)`. It is called once, at the journal-creation site of `executeSendTransaction` (`dapp-send-executor.ts:~232-251`).
  - Each RPC takes a popup-minted `correlation` string (random, one per call; revoke sends one transaction for all its ids). It is used only as an echo key, never as a journal id. `AuthRegistryService` passes a hook that emits a service event `onSendStarted({ correlation, journalId })`.
  - The popup subscribes when it is shown, matches its own correlation, follows the record with `OperationJournalServiceClient.subscribeJob`, and renders `stageSubtitle(stage, backend)` under the button.
  - **Cleanup.** `subscribeJob` installs its listeners before it awaits its snapshot, and returns the unsubscribe only afterwards (`operation-journal/client.ts:55-87`). So each show captures an epoch:
    - a callback from an ended epoch is ignored;
    - an unsubscribe that arrives after its epoch ended is called at once.
    The service keeps no state.
- **Sequencing.** The hook site is in `runInSlot`'s path, which send-queue-activity arc 1b re-plumbs, so Phase 2.2 rebases on it.

**#113 (P6-03): the sponsor check wherever a sponsor pays.**
- **(c) Send.** `isAllowedToSend` (`popup/pages/send.vue:292-301`) and `canSubmitNow` also require a landed estimate for the current input. OA-9 decides what a failed estimate does to Confirm. Until OA-9 is answered, a failed estimate leaves Confirm as today.
- **(a) Authwit popups.** OA-8 decides what shows and what Confirm does while the check runs and when it fails. A fee readout appears if a full estimate is handed to the card (`FeeSettingsCard.vue:960-966`, `FeeCostReadout.vue:31-55`), and page 6 names none (Codex S2). The mechanism below is common to OA-8's options:
  - `AuthRegistryService` gains `estimateRevokeFee(networkId, account, ids, feeSettings, estimateToken)` and `estimateRegistryToggleFee(networkId, account, enabled, feeSettings, estimateToken)`. Each builds its operation in the service worker with the same private builder as its send, so the popup never supplies an operation (Opus S9).
  - Each calls a new in-service-worker entry, `ExecutionService.estimateSendTransactionFee(op, estimateToken, flowKey)`, which wraps the private `withEstimateAdmission`.
  - Both RPCs join #196's table and cancel their estimate on hide.
  - **The verdict is bound** to `(profile, networkId, account, ids or enabled, feeSettings)` and to the popup's scope epoch. A change of profile, network or account invalidates it synchronously, and a result for older inputs is dropped.
  - **The submit guard is OA-8's:**
    - Under A and B, Confirm is refused until the current inputs' verdict lands, with Send's failed-probe policy.
    - Under C, the first Confirm starts the check. Proving requires the completed, input-bound verdict, and a fallback needs a second Confirm.
  - **Tests**, for the chosen option:
    - a submit during the debounce;
    - a submit after a speed change;
    - a submit right after the fallback selects another payer;
    - a late result from network A after a switch to network B (Codex S3, final pass).
- **(b) The app-chosen payment row** waits entirely on OA-7.
  - The wallet can read only the payer contract's current fee-juice balance, and a fee contract can be funded during the transaction's own setup. Even the recognised PrivateFPC can be: `mint_and_pay_fee` follows a Fee Juice claim that credits it.
  - A claim can also be nested inside an arbitrary contract's setup (`sponsor-funding.ts:5`). So a low balance is proof only for a transaction shape the wallet validates as unable to fund the payer in setup, nested calls included. Any unknown or nested effect counts as unproven (Codex S5, final pass; `sponsor-funding.ts:1-7`, `fee-payer.ts:57-65`).
  - Phase 2.3 names the shapes it can validate. If it can validate none, OA-7's option B behaves as A.
  - Nothing of (b) is built before OA-7 is answered, so no unused probe lands.

**#114 (P6-04): the nudge in the app window.**
- The legacy branch of `feeJuiceMissing` (`originPrivacy === null`) shows the nudge when every row is confirmed unusable:
  - Fee Juice and private balances read as `"0"`, never unknown;
  - no sponsor can pay, by OA-11's rule. Send's walk picks only Nulo's own sponsor unasked, counts it as able until a check sets it aside, and never picks a hand-added sponsor unasked (`fee-helpers.ts:255-260`, `fee-privacy.ts:52-56,73-96`).
- Send's footer swap is not carried over, because P6-04 names only the nudge.

**#115 (P6-05, P6-06).**
- **The notice.** When the payer that takes over is the protocol row (`fpc.isProtocol`), the short-sponsor notice names Nulo's sponsor: "The sponsor can't cover this fee right now, so Nulo's sponsor pays it."
- **The loading row.** After a transaction change, the Sponsored row whose funding read is in flight draws as checking until the read lands (the `withLoadingRows` pipeline), unless P6-06 is struck.
  - Only the selected payer is probed (`sponsor-funding.ts:26-31`), so in practice that is the selected row. A row with no read in flight draws as today.
  - **No new row becomes unselectable.** Today `checking` disables the dropdown item (`FeeMethodSelector.vue:67`). Funding-read loading therefore gets its own state that draws as loading and stays selectable. Initialisation loading keeps today's disabled behaviour.
  - OA-10 decides whether a speed change draws it as checking too. A speed change clears only the short mark (`FeeSettingsCard.vue:792`); the last verdict and the set-aside list stay.
- `fee-sponsor-funding.test.ts:~173` changes with it.

**#188 (P6-07) and #118 (OA-1).**
- **The gas-only fee module** changes no cap, so P6-07 lets it merge. It is measured first: does the service worker load aztec.js fee code only for gas math? It is built only if so; otherwise it is recorded as not applicable.
- **OA-1 to OA-6** are built here only if both of these hold before arc 2 starts:
  - the ask is answered "approve" (not a struck or "as is" answer);
  - pages 6 and 9 carry recorded answers (H3).
  Otherwise the close-out files each as an `owner-decision` issue (dedupe first). Then #188 closes. #118 follows OA-1.

### File-level change map

**Arc 1**
- **Modified, source:**
  - `packages/wallet-bridge/src/fee.ts`;
  - `packages/extension-messaging/src/core/base-client.ts`;
  - `packages/aztec-runtime/src/pxe/client.ts`;
  - `packages/aztec-runtime/src/account/fee-options.ts` (comment);
  - `apps/extension/src/wallet/utils/offscreen.ts`;
  - `apps/extension/src/wallet/services/pxe/client.ts`;
  - `apps/extension/src/wallet/services/execution/`:
    - `service.ts`, `estimate-cancel-registry.ts`, `estimate-reuse-shared.ts`, `operation-estimate-reuse.ts` (doc), `transfer-estimate-reuse.ts`, `transfer-executor.ts`, `dapp-send-executor.ts`;
    - under `fee/`: `embedded-fpc-cap.ts`, `embedded-strategy.ts`, `fee-strategy.ts` (comments only);
  - `apps/extension/src/wallet/services/dapp-interaction/service.ts`;
  - `apps/extension/src/wallet/services/auth-registry/service.ts`.
- **Tests:**
  - `packages/wallet-bridge/src/fee.test.ts` (new, or the nearest existing fee test);
  - `packages/extension-messaging/src/core/core.test.ts`;
  - `packages/aztec-runtime/src/pxe/client-capture.test.ts`, or a new `client-abandoned.test.ts` beside it;
  - in `EX/`: `estimate-cancel-registry.test.ts`, a new `estimate-hold.integration.test.ts`, `service.estimate-queue.test.ts`, `operation-estimate-reuse.pins.test.ts` (wording only), `tx-request-builder.pins.test.ts`, `operation-planner.test.ts`;
  - in `EX/fee/`: `strategies-lifecycle.test.ts`, `fee-structural-parity.test.ts`;
  - one service-level guard test per service: `fee-settings-rpc-guard.test.ts` beside each `service.ts`, or one table-driven file.

**Arc 2** (indicative; confirmed when built)
- **Source:**
  - `utils/profile-ui-keys.ts`, `popup/constants/storage-keys.ts`;
  - `popup/components/modules/send/`: `FeeSettingsCard.vue`, `FeeMethodSelector.vue`, `fee-send-selection.ts`, `fee-helpers.ts`;
  - `popup/pages/settings/`: `fpcs/index.vue`, `security/reset.vue`;
  - `wallet/services/profile/`: `spec.ts`, `service.ts`, `client.ts`, plus the `ProfileInfo` projection;
  - `wallet/services/auth-registry/`: `client.ts`, `service.ts`, `spec.ts`;
  - `wallet/services/execution/`: `client.ts`, `service.ts`, `spec.ts`, `dapp-send-executor.ts`;
  - `packages/wallet-bridge/src/services-contract.ts`;
  - `popup/components/popups/`: `RevokeAuthwitsPopup.vue`, `ChangeAuthwitsRegistryPopup.vue`;
  - `popup/windows/execute/OperationCard.vue`, `popup/pages/send.vue`.
- **Tests:** the colocated tests of the files above, and `tests/e2e/network/`: `fee-sponsor-funding.test.ts`, `authwit-lifecycle.test.ts`, `fee-methods.test.ts`.

### Trade-offs & alternatives not taken

See the decision ledger and the competing outline.

## Competing outline (Outline B: the smallest arc 1)

Arc 1 carries only #196 and the #188 pin, both test-and-boundary work with no runtime path change.
- **#119:** fixed by a hold. A run that rejects with a transport timeout does not settle its entry, and the registry's 15-minute reaper frees it.
- **#222:** closes as not planned. No defect is named, and the timing risk sits in files send-queue-activity is editing.

**For:**
- the smallest diff;
- no transport seam;
- no executor file shared with send-queue-activity.

**Against:**
- The TTL hold keeps a place for up to 15 minutes after a simulation that finished seconds past the timeout. It is also too short behind a proof, and it is swept lazily, not on a schedule.
- Error identity is not the problem: `PXEProxy` does not wrap errors (`pxe/proxy.ts:33-41`). The duration is the problem.
- Declining all of #222 leaves the byte-identical fingerprint wrapper and a second multiplier resolution, which cost nothing to merge.

**Result.** Outline A, revised. Its #119 now keeps B's shape: hold the estimate's own entry, rather than count other work. But it ends the hold on the precise signals (the late answer, a retired document) instead of waiting out the TTL. From B it also keeps the conservatism on #222 (decline both async extractions) and the sequencing after send-queue-activity.

## Security & Adversarial Considerations

**Threat model**

- **An app** chooses its fee settings (`maxFeesPerGas`, `maxPriorityFeesPerGas`, an embedded payer). Arc 1 changes nothing an app can make the wallet commit, and the pins prove today's behaviour:
  - On `fpc`, the app cannot raise the cap.
  - On `fj`/`fjwc`, its cap is committed verbatim. A high cap does not raise what a fee-juice payer is charged, which is billed gas × base fee with priority zero, but it raises the balance the node requires.
  - Its priority fee is dropped on sends.
  - An app's own simulations hold no estimate place. #119 holds only the estimate's own entry, so a slow app cannot park the person's estimates any more than it does today (decision ledger D3).
- **The popup** is a trusted same-extension sender. #196 is robustness against a malformed internal call, not an attacker boundary. A prototype-named speed level (`"constructor"`) is the realistic hostile shape. The inner throw stays as the second line, so a level that bypasses the boundary still fails closed rather than sending at a default.
- **A slow or hostile node, or a stalled offscreen document**, can make simulations time out.
  - Each timed-out estimate holds its own place until its answer arrives, its document is retired, or the registry's existing 15-minute TTL reaps it. At most four are held per profile, the cap that already exists.
  - A retired document ends its holds at once, so a recreated document serves the next estimate as it does today.
  - A ghost READY ends nothing. A request sent to a retired document never holds.
  - The worst case is a profile's estimates parked behind work that is really running, which is the cap's purpose.
- **The wire.** No new `EventHandler` is added, so no message can end a hold (`base-client.ts:222,231-233`). A late answer ends only a hold this client recorded for that request id; an answer with any other id warns as today.
- **Stored rows (arc 2).** The fee maps are writable by anything that reaches the profile directory.
  - Every read validates both maps' shape.
  - A value with another generation reads as empty.
  - Writes go through one service-worker owner that checks the incarnation under the profile lock.

**Privacy.** #91's residue is a local list of which addresses a deleted profile used and how it paid. Arc 2 binds the list to the profile so every delete path removes it, refuses a write after deletion, and stops sibling profiles from reading each other's picks.

**Logging** (CLAUDE.md § Logging policy).
- No new log line carries an address, a fee figure, a URL, node text or a profile id.
- Refusals, holds and their ends log fixed categories at debug.
- A held request's late answer no longer produces the warn-level "Invalid response received" line, which every user's logs capture.
- The request tag (a document epoch) stays inside the client. It is never added to `TerminalRecord` or the telemetry sink.

**Other checks.**
- **Least privilege:** no CI, workflow or permission change.
- **Cryptography:** none.
- **Input validation:** #196 adds one own-property check at seven RPC entries. The `invoke` override runs before the method, so a refused call reads no storage and starts no estimate.
- **Supply chain:** no new dependency. The 7-day age gate and the frozen lockfile are untouched.
- **Domain risks (Aztec):**
  - No change to replay, ordering or nullifier handling.
  - Arc 1 moves no cap.
  - Whether a below-minimum cap is refused at submission or held is not verifiable here (I-1). OWNER-ASKS states it as inferred.

## UI impact

**Arc 1: none.** No screen, copy, row or number changes.
- The refusal reaches only a malformed internal call; a well-formed popup never sends one.
- The hold changes when a parked estimate starts, not what any screen shows. It applies only after an estimate already timed out, and a retired document ends it, so no estimate waits on dead work.

**Arc 2, quoted from page 6:**
- **P6-01** (Profile deletion; fee-method maps): "Every delete path removes the deleted profile's saved fee-method picks. They are keyed by profile incarnation, not address alone, so another profile holding the same address keeps its own picks. Nothing on a screen changes."
- **P6-02** (Revoke authwits and Change registry popups): "The two popups stop failing at the 60 s request ceiling (DEFAULT_RPC_TIMEOUT_MS, extension-messaging client.ts:17) while a proof runs, and under the spinning button they show the awaiting card's own stage line: "Simulating...", "Proving with Presto ✦" or "Proving in browser…", "Submitting..."."
- **P6-03** (Authwit popups, the app execute window's embedded payment row, Send's Confirm): "Send's Confirm stays disabled until the first fee estimate lands. The authwit popups and the embedded payment row check the sponsor's funding before proving, as Send does, and when it cannot pay they show Send's existing sentence "The sponsor can't cover this fee right now, so <method> pays it." and fall back the same way."
- **P6-04** (App execute window fee card when no payment method can pay): "When no payment method can pay, the execute window shows Send's existing nudge: "You have no fee juice yet" / "Bridge some to cover the network fee." with Get fee juice. The link's per-network gap stays #77's."
- **P6-05** (Fee card sponsor fallback notice): "Only the notice changes, when Nulo's own sponsor is the one that pays: "The sponsor can't cover this fee right now, so Nulo's sponsor pays it." Row titles stay "Sponsored"."
- **P6-06** (veto list): "After a transaction change, the Sponsored row draws as loading until its funding read lands, instead of reading free."
- **P6-07:** no screen.

**Beyond the page** (each built only on its answer):
- OA-7: how an app-chosen payment falls back.
- OA-8: the authwit popups' readout and Confirm during the check.
- OA-9: Send's Confirm on a failed estimate.
- OA-10: the loading row after a speed change.
- OA-11: the nudge when a sponsor row is unchecked.

Screenshots on both browsers and both themes go in the arc 2 PR.

## Assumptions

### Facts (verified at `fd47407`)

1. **The embedded cap** is `node.getCurrentMinFees()` at 1.0× when the app gives none (`EX/fee/embedded-fpc-cap.ts:72-74`). Finalize reuses it (`fee-strategy.ts:285-291`).
2. **The confirm rebuilds an embedded operation fresh before proving** (`dapp-send-executor.ts:~795-806`). Nothing re-checks the cap between proving and `node.sendTx` (`execution-coordinator.ts:331-356`).
3. **Budget asserts in the installed 6.0.0-rc.1:**
   - no canonical payment method or contract asserts `gasLimits × maxFeesPerGas ≤ budget`;
   - PrivateFPC `mint_and_pay_fee` asserts `amount ≥ max_gas_cost`;
   - PrivateFPC `pay_fee` debits the full cap with no refund;
   - PrivateFPC refuses an insufficient private balance during private execution ("Balance too low"), so that failure comes at estimation.
4. **Charging.** The charged fee is billed gas × (base + min(priority, max − base)), per axis (`stdlib/dest/fees/transaction_fee.js:6-14`). `getFeeLimit()` is `Σ maxFeesPerGas × gasLimits`, and `gasLimits` includes teardown (`gas_settings.js:20,56-58`).
5. **The `fpc` strategies ignore an app's `maxFeesPerGas`** (`fpc-strategy.ts:176,259,284-293`), and no test pins it.
6. **No strategy commits an app's `maxPriorityFeesPerGas` on a send.**
   - The strategies call `buildStandard` without gas settings, and `completeFeeOptions` defaults the priority to empty (`fee/fee-juice-strategy.ts:28-33`, `fee/fpc-strategy.ts:145`, `account/fee-options.ts:73-75`).
   - Only an app's own `simulateTx` request threads it (`view-executor.ts:309-318`).
7. **The displayed max fee adds `teardownGasLimits` to `gasLimits`** (`utils/fee-estimation.ts:41-50`).
   - Both wallet FPC handlers add no teardown gas of their own (`fpc/handlers/*.ts` `getTeardownGas`).
   - The transaction's teardown limit comes from its simulation or from the app's supplied limit, and finalize commits it (`fee-strategy.ts:315-327`).
8. **The estimate admission path:**
   - `withEstimateAdmission` settles on any rejection (`EX/service.ts:564-593`).
   - The offscreen default timeout is 90 s (`packages/extension-messaging/src/offscreen/client.ts:22`).
   - The offscreen service answers after the method resolves, with no abort on timeout (`offscreen/service.ts:39-60`).
   - A late response is dropped with a warn (`core/base-client.ts:195-199`).
   - A readiness timeout creates no pending entry (`:284-300`).
   - `settle` rejects the caller and then calls `onTerminal` in the same task (`:268-276`).
   - `simulateTx` and `proveTx` share the per-(profile, chain) write guard (`pxe/service.ts:469,516`).
9. **The fee-settings RPCs.**
   - `priorityLevel` crosses seven popup RPCs unvalidated (table in § #196).
   - `InvalidWalletArgumentsError` and the `invoke`-override precedent exist (`errors.ts:284-295`, `account/service.ts:130-133`).
   - A thrown call is logged at debug (`base-service.ts`).
10. **The fee maps today.**
    - Both fee maps are global and address-keyed (`popup/constants/storage-keys.ts:2-5`).
    - The coordinator removes `profileUiKeys(id)` on every delete path (`profile-deletion/coordinator.ts:135`).
    - `pxeGeneration` is set per row creation and is not in `ProfileInfo` (`profile/spec.ts:53-73`).
11. **`AuthRegistryServiceClient` has no timeout override** (`auth-registry/client.ts:14-34`).
12. **Send's `isAllowedToSend` has no estimate term** (`popup/pages/send.vue:292-301`).
13. **No caller observes `ctx.feeMultiplier === undefined`.** Every read falls back with `??` to `DEFAULT_FEE_MULTIPLIER`, and embedded passes 1 (`fee-strategy.ts:281`, `fpc-strategy.ts:138,210`).
14. **`hooks.queuedJournalId` cannot carry a fresh caller-chosen id.** An unknown id falls back to a newly generated row id (`operation-journal/service.ts:296-302`, `EX/claim-helper.ts:86-102`).
15. **`ProfileService`'s lock is the default force-releasing `Lock`** (five minutes; `profile/service.ts:114,281`; `packages/wallet-core/src/utils/lock.ts:5,145-159`). `withLock` hands its callback an `isCurrent()` probe (`lock.ts:86`).
16. **Every offscreen close goes through `trackedClose()`** (`apps/extension/src/wallet/utils/offscreen.ts:131-138`). A ghost document can emit READY during a close-and-retry (`:340-347`).
17. **`RpcTimeoutError` carries `details.requestId` and `details.methodName`** (`base-client.ts:323-328`). Neither the PXE proxy nor the fee strategies wrap a simulate error (`pxe/proxy.ts:33-41`; `fee/*-strategy.ts` rethrow it).
18. **No production code disconnects a PXE client.** It connects on its first request (`offscreen/client.ts:142`).

### Inferences (unverified; each is checked in the phase named)

- **I-1. The node refuses a below-minimum cap at `sendTx`, rather than holding it.** The node code is not installed. This matters for OA-1's wording only, and OWNER-ASKS marks it inferred.
- **I-2. With priority zero, the Normal/Fast/Urgent levels change only the cap's headroom, never inclusion order.** The sequencer code is not installed; moderate confidence. OA-2 and OA-6 state it as inferred.
- **I-3. A successful close is the only proof that a document is gone.** A crashed document, or a close that failed, leaves its holds to the TTL: too long at worst, never too short. Phase 1.3 step 1 confirms the success signal on Chromium and the Firefox frame.
- **I-5. `chrome.storage.local` applies one context's writes in the order they are issued.** Phase 2.1 relies on this for a write issued before deletion's purge; Phase 2.1 confirms it.
- **I-4. The `NO_WAIT` and FPC finalize tails are unchanged by send-queue-activity arc 1.** This no longer matters, since both extractions are declined.

### Asks

Questions for the orchestrator (a question a person would see goes to OWNER-ASKS instead):

- **A-1. #197's in-repo half.** Working assumption: not in this lane, and nothing is planned. If it is assigned, it fits arc 1 as one small phase: one shape check at `predictedWorstMinFees`'s returns, a fixed refusal, and the two reply pins updated.
- **A-2. Closing #222 with two extractions and eight written declines.** Working assumption: yes.
- **A-3. Order against send-queue-activity arc 1.** Working assumption:
  - Phase 1.2 (tests and comments) may start now.
  - Phases 1.1, 1.3 and 1.4 start after that arc merges, on a branch that has merged `origin/dev`.
- **A-4. R4 order for #91.** The two plans disagree (see § #91). Working assumption: whichever is ready first lands first, and the other rebases. The orchestrator decides.

## Phases

### Arc 1: estimate and cap internals (decision-free; ships first)

#### Phase 1.1: the speed level at the RPC boundary (#196) ✓

**Warning.** Start this phase only after send-queue-activity arc 1 has merged into `dev` and `origin/dev` is merged into this branch.

1. Add `isPriorityLevel` and `refuseUnknownPriority` to `packages/wallet-bridge/src/fee.ts`.
2. Add the `invoke` override, with its typed method-keyed extractor, to `ExecutionService`, `DappInteractionService` and `AuthRegistryService`.
3. Reword the inner pins' labels and the `reuseFeeMultiplier` doc. The inner rethrow stays.
4. Add the tests:
   - **`isPriorityLevel`:** true for the three levels; false for `"constructor"`, `"toString"`, `"__proto__"`, `""`, `"Normal"` and `2`.
   - **Per refused class:** through one method's request handler per service, an unknown name (`"bogus"`), a prototype name (`"constructor"`), a non-string (`2`) and an empty string. Each replies `INVALID_PARAMS`, and the method never runs (never-happens).
   - **Per method:** each of the seven methods with `"constructor"`, covering every delta of `approveInteraction` and every send-like operation of `executeOperations`.
   - **Pass-throughs:**
     - a non-object `feeSettings` keeps today's failure;
     - a non-array `deltas` or `operations` keeps today's failure;
     - a `simulate_transaction` operation passes unchecked.
   - **Controls:** `"fast"` and an absent level run the method.
   - **Logging:** the refusal logs at debug and at no higher level.

**Validation gate.**
- **Commands:**
  - `bun run lint`;
  - `bun run typecheck:all`;
  - `bun run --cwd packages/wallet-bridge test`;
  - `cd apps/extension && bun --bun vitest run src/wallet/services/execution/ src/wallet/services/dapp-interaction/ src/wallet/services/auth-registry/`.
- **Pass:** every command exits 0. Check once that each never-happens case fails against the base copy of the three services.
- **Layers:** lint, typecheck, unit.

#### Phase 1.2: pin the cap precedence; correct the budget comments (#188, #118) ✓

May start now (tests and comments only). Rebase on send-queue-activity arc 1 before the PR.

1. Add the pins listed in Architecture § #188 to:
   - `fee/strategies-lifecycle.test.ts`;
   - `fee/fee-structural-parity.test.ts`;
   - `tx-request-builder.pins.test.ts`;
   - `operation-planner.test.ts`.
   Reuse each file's harness.
2. Rewrite the rationale at the four comment sites and drop the plan path at `embedded-fpc-cap.ts:63`. Change no code.
3. Draft the precedence table for the arc 1 PR body.

**Validation gate.**
- **Commands:**
  - `bun run lint`;
  - `bun run typecheck:all`;
  - `cd apps/extension && bun --bun vitest run src/wallet/services/execution/fee/ src/wallet/services/execution/operation-planner.test.ts src/wallet/services/execution/tx-request-builder.pins.test.ts`;
  - `bun run --cwd packages/aztec-runtime test`.
- **Pass:** every command exits 0, and `git diff --stat` shows only test files and four comment hunks under `src/`.
- **Layers:** lint, typecheck, unit.

#### Phase 1.3: a timed-out estimate keeps its place (#119) ✓

**Warning.** Start this phase only after send-queue-activity arc 1 has merged. That arc edits the estimate admission in `EX/service.ts`.

1. **Confirm the seams.**
   - Make `closeOffscreen()` report success, on Chromium and the Firefox frame.
   - Audit every `catch` on the three estimate entries (`estimateTransferFee`, `estimateOperationFee`, `previewOperationAuthwits`) between the PXE client and `withEstimateAdmission`. Record any that drops the error and its `cause`.
   - Confirm that a `settle` of a reaped token is a no-op.
2. Add `requestTag`, `onUnmatchedResponse` and `onLateSendFailure` to `base-client.ts`. Each default keeps today's behaviour.
3. Add `setDocumentEpochProvider`, the record, `offscreenSettled` and `retireEpochsThrough` to `PxeServiceClientBase`.
4. Add `offscreenEpoch` and `onOffscreenRetired` to `offscreen.ts`. Wire them in the wallet subclass.
5. Make the `withEstimateAdmission` hold. Rewrite the registry's header and the `ESTIMATE_JOB_TTL_MS` comment.
6. Add the tests:
   - **Base client** (`core.test.ts`):
     - an unmatched response calls the hook, and the default body warns as before;
     - a send that fails after the timer fired calls `onLateSendFailure`;
     - the tag reaches `onTerminal`, and `TerminalRecord` is unchanged.
   - **PXE client**, a real client on a fake offscreen transport with fake timers:
     - a `simulateTx` that times out after its send is recorded, and `offscreenSettled` returns a pending promise;
     - its late answer resolves it, drops the record, and logs at debug, not warn;
     - never-happens: nothing is recorded for a readiness timeout, a timeout of another method, or a request sent in a retired epoch;
     - a late send failure resolves the record, and so does retiring its epoch;
     - a response with an unknown id still warns.
   - **The transition**, on an `ExecutionService` built through its `pxeClientFactory` seam (`EX/service.ts:222,229`) with the real registry. Four estimates run and a fifth is parked.
     - One estimate's `simulateTx` rejects with the real `RpcTimeoutError` shape, and its record is pending. The fifth stays parked (never-happens).
     - Resolving the record admits it (control).
     - Per estimate entry, the request id survives every hop.
   - **The dead-man.**
     - A held entry that outlives `ESTIMATE_JOB_TTL_MS` is reaped, and a newly parked token is then admitted.
     - An aged parked token is rejected as today.
   - **Retirement evidence.** Never-happens: a READY with no successful close, a failed `closeDocument()`, or a negative probe that misses a ghost retires no epoch. Control: a successful close or a removed Firefox frame does.
   - **Bounded records.** Repeated timeout and TTL-reap cycles with no answers leave no records behind, and record expiry never settles an entry younger than the TTL.
   - **Replacement before the timeout.** A request sent to document 1 times out after document 1 was closed. It is not recorded, and it does not hold.

**Validation gate.**
- **Commands:**
  - `bun run lint`;
  - `bun run typecheck:all`;
  - `bun run --cwd packages/extension-messaging test`;
  - `bun run --cwd packages/aztec-runtime test`;
  - `cd apps/extension && bun --bun vitest run src/wallet/services/execution/ src/wallet/services/pxe/ src/wallet/utils/`.
- **Pass:** every command exits 0. Check once that the transition test's never-happens case fails against the base copy of `EX/service.ts`.
- **Layers:** lint, typecheck, unit, integration (the service with the real registry).

#### Phase 1.4: two extractions, eight declines (#222) ✓

**Warning.** Start this phase only after Phase 1.1's merge of `origin/dev`. Re-read both sites before you edit.

1. Extract `fingerprintBuiltFee`. Point `EX/service.ts:1122` at the renamed `feeMultiplierFor`. Make one commit each, and run the gate's unit command after each.
2. Write the eight declines into the arc 1 PR body draft.

**Validation gate.**
- **Commands:**
  - `bun run lint`;
  - `bun run typecheck:all`;
  - `cd apps/extension && bun --bun vitest run src/wallet/services/execution/`.
- **Pass:** every command exits 0 after each extraction commit, and no existing pin was edited except for a renamed import.
- **Layers:** lint, typecheck, unit.

#### Phase 1.6: the fee reply shape (#197, `Refs #197`; D-orch-5) ✓

A shape check at `predictedWorstMinFees`'s returns refuses a reply without integer fee components with a fixed error; the estimate path shows its existing failed-estimate toast and the reuse ladders miss. Pins: a null-like current min and a null-like predicted slot are refused; well-formed replies pass. Gate: lint, aztec-runtime typecheck and tests, the execution unit suite. Log: [lessons/phase-1.md](lessons/phase-1.md).

#### Phase 1.5: arc 1 end-to-end gate

**Warning.** Until e2e-harness-gaps arc 1a (#169) merges, run one `e2e:agent` on the host at a time (gate G1). Wait for any other worktree's run to end first.

**Validation gate.**
- **Unit:**
  - `bun run lint`;
  - `bun run typecheck:all`;
  - `bun run test`;
  - `bun run test:all`;
  - `bun run check:plans`.
- **Network, Chrome, the fee and approval files:**
  ```
  NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent \
    tests/e2e/network/fee-methods.test.ts \
    tests/e2e/network/selfpay-phase.test.ts \
    tests/e2e/network/sim-from-selfpay.test.ts \
    tests/e2e/network/fee-sponsor-funding.test.ts \
    tests/e2e/network/tx-sendTx-feePayer.test.ts \
    tests/e2e/network/tx-sendTx-sponsoredFpc.test.ts \
    tests/e2e/network/tx-sendTx-selfPay.test.ts \
    tests/e2e/network/authwit-lifecycle.test.ts
  ```
- **Network, Chrome, the proverless file that exercises queued estimates:**
  ```
  NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent \
    tests/e2e/network/same-token-concurrent-sends.test.ts
  ```
- **Smoke, Chrome:** `cd apps/extension && bun run test:e2e -- --retry=0`.
- **Pass:** every command exits 0 with retry 0, and no existing case changes outcome.
  - Read a red honestly: one rerun for a known flake, a fix for real breakage.
  - When lint fails, run Biome on the changed files to see every diagnostic (the summary caps at 20).
- **Layers:** lint, typecheck, unit, network e2e, smoke e2e.

### Arc 2: sponsor checks, waiting copy, fee maps (waits on page 6)

**Warning.** Build nothing of this arc before page 6 carries the owner's signed message.
- A struck item is not built, and its issue keeps its "as is" disposition (SR3).
- A phase part that names an owner ask is built only on that ask's answer.
- Every `e2e:agent` run in this arc follows G1 until #169 merges.

#### Phase 2.1: per-profile fee picks (#91, P6-01; R4)

**Warning.** Run this phase one at a time with account-session-life arc 2 (R4); see A-4. Rebase onto it first if it has merged.

1. Add the two prefixes and builders to `profile-ui-keys.ts`. Add `generation` to `ProfileInfo`.
2. Add the `ProfileService` fee-pick RPC, with its update type, its lock, its incarnation check and the `isCurrent()` check before the write. Pass the probe through `runExclusive`. Confirm I-5.
3. Move every writer to the RPC. Move both readers to the active profile's key, with shape validation and the generation check.
4. Remove the whole-map clears from `reset.vue`.
5. Add the tests:
   - **Profile isolation.** Never-happens: a pick saved under profile A is invisible to profile B with the same address. Control: A reads it.
   - **Refused writes.** Never-happens: a write naming a deleted profile, or a profile reserved for deletion, is refused, before and after the purge. A write naming the old generation after a same-id re-import is refused too.
   - **Stale values.** Never-happens: a value stamped with another generation, or malformed, reads as empty.
   - **Reset.** Never-happens: a reset leaves another profile's picks.
   - **Concurrent writers.** Two windows writing different addresses keep both picks.
   - **Displaced writer.** Never-happens: a writer stalled past the lock's force-release, while deletion (or a same-id re-import) runs, writes nothing.
   - **The purge** removes the new keys for `p1`, not `p10` (extend `coordinator.test.ts`'s `uiKeyStore`).
   - The registry scan stays green.

**Validation gate.**
- **Commands:**
  - `bun run lint`;
  - `bun run typecheck:all`;
  - `cd apps/extension && bun --bun vitest run src/utils/profile-ui-keys src/wallet/services/profile/ src/wallet/services/profile-deletion/ src/popup/components/modules/send/ src/popup/pages/settings/`;
  - `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/fee-methods.test.ts`;
  - `cd apps/extension && bun run test:e2e -- tests/e2e/security-reset.test.ts --retry=0`.
- **Pass:** every command exits 0.
- **Layers:** lint, typecheck, unit, network e2e, smoke e2e.

#### Phase 2.2: long proofs in the authwit popups (#107, P6-02)

**Warning.** Rebase on send-queue-activity arc 1b first if it has merged (`runInSlot`).

1. Add the client timeout override.
2. Add `onJournalCreated` to `IExecutionHooks` at the journal-creation site. Add the correlation argument, the `onSendStarted` event and the hook wiring to both RPCs.
3. In each popup: subscribe on show, follow the matched job, render `stageSubtitle` under the button, and unsubscribe on hide.
4. Add the tests:
   - **Client:** `revokeAuthwits` is still pending at 61 s and refused at the long ceiling; a read RPC is refused at 60 s (the `EX/client.test.ts` fake-timer shape).
   - **Service:** the event carries the caller's correlation and the created journal id, once per send. Never-happens: no event for a call that failed before its journal was created.
   - **Popups:** each renders the stage line for each stage, and none after the job ends. Another popup's correlation is ignored.
   - **Hide before the snapshot.** Never-happens: a popup hidden before `subscribeJob`'s snapshot returns renders nothing and keeps no listener.

**Validation gate.**
- **Commands:**
  - `bun run lint`;
  - `bun run typecheck:all`;
  - `cd apps/extension && bun --bun vitest run src/wallet/services/auth-registry/ src/wallet/services/execution/ src/popup/components/popups/ src/utils/card-subtitle.test.ts`;
  - `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/authwit-lifecycle.test.ts`, then the same with `NULO_E2E_BROWSER=firefox`.
- **Pass:** every command exits 0.
- **Layers:** lint, typecheck, unit, network e2e (both browsers).

#### Phase 2.3: the sponsor check wherever a sponsor pays (#113, P6-03; OA-7, OA-8, OA-9; H3 needs pages 6 and 9)

**Warning (H3).** This phase decides whether a send can go out on a fee the person has not seen, and OA-7 C would change which cap wins. Build none of it until pages 6 and 9 both carry recorded answers.

**Warning.** send-queue-activity arcs 2 and 4 edit `send.vue` (around `:746`, and the queued-fee guard beside `isAllowedToSend`). Arc 5 edits Send's fee card. Rebase on whichever has merged, and keep `feeQueued`'s term in the guard.

1. **Send:** add the landed-estimate term to `isAllowedToSend` and `canSubmitNow`. Apply OA-9's answer to a failed estimate.
2. **Authwit popups** (after OA-8):
   - add the two estimate RPCs, `estimateSendTransactionFee`, and their #196 rows;
   - add the input-bound verdict and the submit guard;
   - render what OA-8's answer names.
3. **App-chosen payment row:** build it only after OA-7 is answered, and only in the form OA-7 names.
4. Add the tests:
   - **Never-happens, one per surface:**
     - Confirm enabled before an estimate (or, under OA-8 C, proving before the verdict);
     - a short sponsor proved without a notice;
     - a submit during the debounce, after a speed change, or right after the fallback;
     - a late result from network A accepted after a switch to network B.
   - A success control for each surface.
   - **(b)**, if it is built:
     - a probe never runs for a self-claim;
     - a short balance never blocks a transaction whose setup claims to its payer, whether directly, nested inside another call, or in the PrivateFPC cold start.
   - A wire-shaped fixture for every window that renders app data.

**Validation gate.**
- **Commands:**
  - `bun run lint`;
  - `bun run typecheck:all`;
  - `cd apps/extension && bun --bun vitest run src/popup/pages/send.integration.test.ts src/popup/components/ src/popup/windows/execute/ src/wallet/services/execution/ src/wallet/services/auth-registry/`;
  - ```
    NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent \
      tests/e2e/network/fee-sponsor-funding.test.ts \
      tests/e2e/network/authwit-lifecycle.test.ts \
      tests/e2e/network/tx-sendTx-feePayer.test.ts
    ```
    then the same with `NULO_E2E_BROWSER=firefox`.
- **Pass:** every command exits 0.
- **Layers:** lint, typecheck, unit, network e2e (both browsers).

#### Phase 2.4: the nudge, the notice and the loading row (#114, #115; P6-04, P6-05, P6-06; OA-10, OA-11)

**Warning.** send-queue-activity arc 5 (P9-05) adds Tab stops to Send's fee card. Rebase on it if it has merged.

1. Add the "confirmed no usable method" derivation for `originPrivacy === null`, with OA-11's rule for an unchecked sponsor row, and show the nudge.
2. Branch the notice on `fpc.isProtocol`.
3. Draw a Sponsored row whose read is in flight as checking after a transaction change (unless P6-06 is struck), and after a speed change on OA-10 = B.
4. Update `fee-sponsor-funding.test.ts`'s pinned sentence.
5. Add the tests:
   - The nudge never shows while a balance is unknown, and it shows when every row is confirmed unusable.
   - The notice names Nulo's sponsor only for the protocol row.
   - The row never reads "free" between a transaction change and its verdict.
   - A row with no read in flight never draws as checking.
   - A Sponsored row drawn as loading during its funding read can still be selected.

**Validation gate.**
- **Commands:**
  - `bun run lint`;
  - `bun run typecheck:all`;
  - `cd apps/extension && bun --bun vitest run src/popup/components/modules/ src/utils/copy-dash-ban.test.ts`;
  - `cd apps/extension && bun run test:e2e -- --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`;
  - `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/fee-sponsor-funding.test.ts tests/e2e/network/fee-methods.test.ts`, then the same with `NULO_E2E_BROWSER=firefox`.
- **Pass:** every command exits 0.
- **Layers:** lint, typecheck, unit, smoke e2e and network e2e (both browsers).

#### Phase 2.5: #188's rest and #118 (P6-07; H3 needs pages 6 and 9)

1. Measure the service worker's imports of aztec.js fee code. Build the gas-only module only if the service worker loads that code solely for gas math.
2. Build each of OA-1 to OA-6 only if it was answered "approve" and pages 6 and 9 carry recorded answers before arc 2 started. Update the pins it moves, and put its before and after numbers in the PR body. Before OA-3's numbers are final, check the real teardown limits on a live run.
3. Record the rest, for the close-out to file as `owner-decision` issues.

**Validation gate.**
- **Commands:**
  - `bun run lint`;
  - `bun run typecheck:all`;
  - `bun run test:all`;
  - when a cap rule changed, the Phase 1.5 network command.
- **Pass:** every command exits 0.
- **Layers:** lint, typecheck, unit; network e2e when a cap moved.

#### Phase 2.6: arc 2 end-to-end gate

**Validation gate.**
- **Unit:**
  - `bun run audit:vue`;
  - `bun run test:all`;
  - `bun run check:plans`.
- **Smoke on both browsers:** `cd apps/extension && bun run test:e2e -- --retry=0`, then with `NULO_E2E_BROWSER=firefox`.
- **Network on both browsers:** the Phase 1.5 file list, then with `NULO_E2E_BROWSER=firefox`. The list already covers `fee-methods`, `fee-sponsor-funding` and `authwit-lifecycle`.
- **Pass:** every command exits 0 with retry 0, and screenshots of every changed surface, on both browsers and both themes, are attached to the PR.
- **Layers:** lint, typecheck, unit, build, smoke e2e, network e2e.

## Delivery

One `gh stack`: one PR per arc, with a docs-only close-out on top.

| Layer | Branch | Phases | Stacks on | `/code-review` | PR title (≤ 93 characters) | Closes |
|---|---|---|---|---|---|---|
| 1 | `worktree-fees-and-sponsors` (adopted; carries the plan commit) | 1.1-1.5 | `dev` | off | `fix(fees): refuse unknown priorities, hold timed-out estimate slots, pin fee-cap precedence` | #196, #119, #222; `Refs #188, #118` |
| 2 | `fees-and-sponsors-sponsors` | 2.1-2.6 | layer 1 | off | `fix(fees): sponsor checks, long authwit proofs, the fee-juice nudge, per-profile fee picks` | #91, #107, #113, #114, #115, #188; #118 on OA-1 = B or C |
| 3 | `fees-and-sponsors-close-out` | close-out | the top built layer | off | `docs(plans): close fees-and-sponsors` | none |

- **Arc 1 ships first, alone if page 6 is late.** Its PR opens after its Codex loop converges. If page 6 is not signed when arc 1 is ready:
  - the close-out stacks on arc 1;
  - it records arc 2's work as open in its issues;
  - the plan closes, and a later run plans arc 2 again from the archived record.
- **Holds.**
  - H3 binds arc 1: no phase in it moves a cap, a charge, which cap wins, or a displayed fee.
  - Arc 2 waits on page 6.
  - Phase 2.3, and Phase 2.5's cap changes, also wait on page 9 (H3: caps, charges, precedence, and sends on an unseen fee).
  - Phase 2.1 also waits on R4.
- **Mechanics.**
  - Adopt the branch: `gh stack init --adopt worktree-fees-and-sponsors --base dev`.
  - At the arc boundary, after the loop converges: `gh stack add fees-and-sponsors-sponsors`.
  - At delivery: `gh stack sync`, `gh stack submit --auto`, then `gh pr edit` each body with:
    - what changed and why;
    - the validation runs and their outcomes;
    - `Closes #n` for each issue;
    - for arc 1, the precedence table and the eight declines;
    - for arc 2, the page records quoted, with the answered asks and the screenshots.
  - Then `gh stack add fees-and-sponsors-close-out`, its commits, and `gh stack submit --auto`.
- **Labels.** Open each PR without labels. Add `e2e:extension-network` or `e2e:extension-smoke` afterwards only when the path filter skips a suite the arc needs.
- Never merge, never `--admin`, and never force-push a branch another human touched.

## Pickup map

The orchestrator writes a `## Pickup` section into each issue. The arc that closes each one:

- **Arc 1:** #196 (Phase 1.1), #119 (Phase 1.3), #222 (Phase 1.4).
- **Arc 1, then arc 2:**
  - #188: the pin in Phase 1.2; it closes in Phase 2.5.
  - #118: the comment in Phase 1.2; it closes in Phase 2.5 on OA-1 = B or C, and as not planned on A.
- **Arc 2:** #91 (2.1), #107 (2.2), #113 (2.3), #114 and #115 (2.4).
- **No arc:** #117 (`blocked:external`: a funded sponsor on mainnet).

## Post-implementation

Run this section in order. It is the whole procedure; no other document is needed.

1. **No `/code-review`.** `code_review` is `off`.
2. **Codex audit per arc, at the arc boundary**, before `gh stack add`, while the arc is the stack tip. Run `~/.claude/skills/codex/scripts/run-codex.sh <prompt-file> <worktree> high read-only gpt-6.1-sol` with:
   - the arc's diff;
   - this plan and its decision ledger;
   - the arc map ("this is arc N of 2; arc 2 builds the page-6 surfaces on arc 1");
   - the adversarial ask ("What could go wrong? What would an attacker target? What are we trusting that we shouldn't?");
   - these two rules, verbatim:
     - *"Report bugs and small, targeted improvements only. Do not propose speculative abstractions, extra configuration surface, new layers, or rewrites — the smallest change that fixes each real problem. If code works and is clear, leave it alone."*
     - *"Audit the comments for value per character. Flag any comment that narrates what the code visibly does, restates its line, references implementation plans / phases / reviews, or spends a paragraph where a sentence works — and flag places where a non-obvious invariant or constraint deserves a comment it doesn't have. Comments are permanent context every future reader, human or LLM, pays to re-read: they must be few, dense, and exact."*
3. **Fix loop.**
   - Verify each finding against the tree first.
   - Apply the accepted fixes, commit, and log the round in `lessons/phase-N.md`.
   - Resume the same session with `resume-codex.sh` and the fix diff.
   - Stop when a round has no new material finding. If findings are still material after three rounds, stop and surface them.
4. **Final cross-arc pass** (only when arc 2 was built): a fresh Codex session over the net diff from `fd47407`, asking for seams between the arcs, duplication across them and drift from this plan, with the same two rules. Same loop.
5. **Delivery**, per the Delivery section. This is the first time any PR opens.
6. **Close-out**, as the stack's top layer:
   - **The `## Outcome` block**, directly after the front matter:
     - the date and the status;
     - what shipped, with PR numbers;
     - each dropped or declined item with its reason (the eight #222 declines);
     - an `Open items:` line;
     - a line retiring this plan's `/goal` and `/loop` seeds.
   - **Promote the generalizable gotchas** to `implementations-plan/lessons.md` (≤ 8 KiB; dedupe, retire, date tool versions).
   - **File every open item where it lives:**

     | Situation | Home |
     |---|---|
     | Work inside the implementation you are on | the active `plan.md` and the PR |
     | Actionable work that outlives the plan | a GitHub issue, with a domain label and a `Record` link to the archived plan |
     | Needs a product call, or waits on something outside the repo | an issue labelled `owner-decision` or `blocked:external` |
     | A suspected exploitable weakness | a private draft security advisory; the plan records only "tracked privately: GHSA-…" |
     | Rejected, superseded or already done | a disposition line in the Outcome block |
     | Knowledge that prevents a repeat | `implementations-plan/lessons.md` |
     | A legal or store blank with a release deadline | `BEFORE-LAUNCH.md` |

     Dedupe first (`gh issue list --state all --search "<words>"`). An issue body has `## What happens`, `## Where`, `## Impact`, `## Possible fix`, `## Record`.
   - **Check the one candidate found during planning:** a page still open on a deleted profile may write other per-profile UI keys, such as pinned tokens, after the purge. This is unverified. If it holds, file an issue.
   - **Comment on every issue the lane leaves open**, with the reason (#117; any owner ask left unanswered).
   - **Merge `origin/dev` first**, and read what changed in `index.md` and `lessons.md`. Never a union merge.
   - **Archive the plan:**
     - `git mv implementations-plan/fees-and-sponsors implementations-plan/archive/fees-and-sponsors`, in its own commit;
     - repair the links the extra directory level breaks;
     - move the index line to `archive/index.md`;
     - delete `STATUS.md`.
   - **Report and wait.** Merging is the orchestrator's call.
7. **Teardown after the merge.**
   - When `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/fees-and-sponsors/plan.md` succeeds, run `agent-worktree done fees-and-sponsors --merged --trunk dev` without asking. This session did not enter through `EnterWorktree`, so there is nothing to exit.
   - The command refuses rather than forces. Relay a refusal and stop.
   - A `/loop` session checks this on every firing. A `/goal` session arms one background wait after its wrap-up: `until git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/fees-and-sponsors/plan.md; do sleep 300; done`.

## Decision ledger

| Id | Decision | Why | Rejected alternatives |
|---|---|---|---|
| D1 | **Arc 1 carries:** #196, #119, #222, the #188 pin and #118's comment. **Arc 2 carries:** every page-6 surface and every change that H3 covers. | The lane brief's grouping. #196's files are arc 1's. Only #118's comment is decision-free. | #118 whole in arc 1 (its fix moves a cap, so H3 applies). #196 in arc 2 (no reason; same files as arc 1). |
| D2 | **#119 (v3):** hold the estimate's own entry. A run that rejects on a `simulateTx` timeout which ExecutionService's client recorded as sent, to a document still alive, defers `settle` until one of four things: the late answer, a late send failure, the document's proven retirement (a successful close only: never READY, a failed close or a negative probe), or the registry's existing TTL. Each client record also expires at that TTL, so none accumulates. | It is the issue's own fix. It changes admission only for the work the cap already counts, and needs no new counter, ledger, timer or registry logic. | Outline B's TTL-only hold (holds 15 minutes after a quick answer). A longer timeout (changes every caller). v2's per-profile orphan count (widens admission to app, balance and send work and to other chains: an unapproved behaviour change, final pass 1). Ending on READY (ghost documents, final pass 3). Ending on disconnect (the work continues, final pass 4). A horizon tied to the proof ceiling (Opus round 1; reversed: no horizon is a work ceiling, and the existing TTL needs no exemption, final pass 9). |
| D3 | **Nothing but the estimate's own timed-out simulation holds a place.** App simulations, balance reads, sends and other chains are untouched. | Admission policy outside the issue is an owner decision (final pass 1). Holding the estimate's own entry is per-profile by construction (Codex A1) and needs no origin threading (Codex C2). | v2's "every orphan of the profile counts". (Profile, chain) attribution (moot: nothing else is counted). |
| D4 | **#196:** an `invoke` override on three services, typed method-keyed extractors, seven RPCs, `""` refused, and the inner rethrow kept. | SR7's boundary, the account-service precedent, and a type error on signature drift. Keeping the rethrow keeps a bypass fail-closed (Opus S1). | A positional table (drifts silently). Deleting the inner rethrow (fail-open on a bypass). Per-method zod schemas (beyond the decision). |
| D5 | **#222:** extract `fingerprintBuiltFee` and route the fresh multiplier through `feeMultiplierFor`; decline the other eight items. | Both extractions are synchronous, with no read moved. The `NO_WAIT` and FPC-tail helpers add an async boundary, which order pins cannot prove neutral, inside code the other lane re-plumbs (Codex C3, Opus). | Four extractions (v1). Zero extractions (Outline B). |
| D6 | **Outline A, revised**, over Outline B. | Both audits: A's drain signal is precise; B's hold is wrong in both directions. | B whole. B's #222 stance is kept. |
| D7 | **#91:** per-profile keys in the existing registry; values stamped with the incarnation; one service-worker writer under the profile lock that refuses a write for a deleted, reserved or other-generation profile, and checks `isCurrent()` synchronously before it issues the write (the lock force-releases after five minutes); no migration. | P6-01's every-delete-path removal is then immediate, with no write after the purge (Codex S4). The purge and the registry already exist. Pre-production rule. | The generation stamp alone (residue on a late write, and a stale writer can overwrite the successor). Opus's per-profile clear on the writer's chain plus a startup sweep (eventual removal only). Incarnation in the key (breaks the registry's exact-key purge without a coordinator edit). Removing the old global keys (dead code at launch; pre-production rule). |
| D8 | **#107:** the service worker allocates the journal id, and the popup learns it through an `onJournalCreated` hook echoed on a service event under a popup-minted correlation string. Each show captures an epoch, so a late subscription is cleaned up at once. | `queuedJournalId` falls back to a fresh id for an unknown one (Fact 14). A correlation string never enters journal or claim logic. | A caller-chosen journal id (no such seam; it collides with claim logic). Matching "the newest UI job" (ambiguous between windows). |
| D9 | **#113(a):** estimate in the service worker from ids or `enabled`, with a verdict bound to the profile, network, account, inputs and the popup's scope epoch, and a submit guard whose shape follows OA-8's answer. What shows is OA-8. | Page 6 names no readout; a full estimate in the card renders one (Codex S2, Opus). The popup must not supply an operation (Opus S9). | Passing `feeEstimate` to the card (unapproved readout). A popup-built operation. |
| D10 | **#113(b):** nothing is built before OA-7. OA-7 states that a low balance is proof only when the transaction carries no claim to the payer, the recognised PrivateFPC included. | An app's fee contract can be funded during setup (Codex S5). | Probing on `feePayer ≠ from` and disabling Confirm (can block a valid transaction). |
| D11 | **#115, P6-06:** only a Sponsored row with a funding read in flight draws as loading, in a state that stays selectable. A speed change waits on OA-10. | Only the selected payer is probed, so an unprobed row would check forever (Codex C7). P6-06 says "a transaction change". | Every Sponsored row as checking. Folding speed changes in without an ask (Opus). |
| D12 | **H3:** wait on recorded answers on pages 6 and 9, plus the change's own ask, for any change to a cap, a charge or which cap wins, and for any change to whether a send can go out on a fee the person has not seen. This covers OA-1 to OA-9 and Phase 2.3 as a whole. | H3's own words: both clauses (Codex S1; final pass 2). | Page 6 alone (v1). Caps only (v2). |
| D13 | **Sequencing:** Phases 1.1, 1.3 and 1.4 wait for send-queue-activity arc 1; Phase 1.2 may start now; Phase 2.2 waits for that lane's arc 1b. | Shared files: `EX/service.ts` (estimate admission, registry construction), `fpc-strategy.ts`, `runInSlot` (Codex C4, Opus). | v1's A-3, which let 1.3 start early. |
| D-orch-1 | **No stack.** Arc 1 opens its own PR against `dev` (`gh pr create --base dev`) with the Delivery table's title; no `gh stack`. Later arcs branch from `dev` after arc 1 lands. | The orchestrator's call at approval. | The Delivery section's `gh stack` mechanics (superseded for arc 1). |
| D-orch-2 | **Arc 1 only, inside hold H3.** Arc 1 moves no cap and changes no screen: #188 ships as the precedence pins only, #118 as the comment fix. OA-1 to OA-11 are now decision page 6's records P6-08 to P6-18 (OA-1 to OA-9 stay under H3: built only on an answer there and on page 9); each ships its "What ships now" form. Nothing of arc 2 is built. No new user-facing words. | The orchestrator's call at approval. | — |
| D-orch-3 | **A-3, order against send-queue-activity arc 1 (#264).** Merge `origin/dev` and build Phase 1.2 first; then wait for #264 to land (poll every 2 minutes, up to 90), merge `origin/dev` again and build Phases 1.1, 1.3, 1.4 and 1.5 on top of it. If #264 does not land in time, stop at the phase reached and report blocked. | The orchestrator's answer to A-3; the shared files are #264's. | — |
| D-orch-4 | **A-2 accepted.** #222 closes with the two extractions and the eight written declines. | The orchestrator's answer to A-2. | — |
| D-orch-5 | **A-1 accepted as Phase 1.6, `Refs #197`.** A shape check at `predictedWorstMinFees`'s returns with a fixed refusal and the two reply pins; it reuses the existing failed-estimate path and adds no copy. #197 stays open for its external half; the PR says `Refs #197`. | The orchestrator's answer to A-1. | — |
| D14 | **#118's comment sites are five.** The false upstream-parity claim the plan placed in `account/fee-options.ts` sits in `account/nulo-account.ts` ("byte-for-byte"), with a sibling "(matches upstream)" in `fee-options.ts`; both are corrected. | The tree wins (upstream defaults to `getMinFees(Limit)` × 1.5; Nulo to the current minimum × 1.5). | Correcting only `fee-options.ts` (leaves the false claim where it is). |
| D15 | **An estimate hold ends on a successful `createDocument` too.** Chromium allows one offscreen document, so a create that succeeds proves the previous one is gone; v3.1 retired an epoch only on a successful close. | Opus review O3: a crash without a proven close otherwise held four places to the TTL. | Leaving crashes to the TTL. |

## Audit verdicts

### Round 1

**Codex (gpt-6.1-sol, high, read-only), session `01a123fd`.**

**VERDICT: reject.** Blocking findings: S1, the missing page-9 gate; S2, the unapproved authwit readout.

| Finding | Severity | Disposition |
|---|---|---|
| S1: H3 needs pages 6 and 9 | blocking | **Accepted.** D12; issue map, Phase 2.5, Delivery, seeds. |
| S2: an estimate in the authwit popups changes their readout | blocking | **Accepted.** D9; OA-8. |
| S3: no submit guard while the check runs | high | **Accepted.** An input-bound verdict and a guard, with its three tests (Phase 2.3). |
| S4: the generation stamp does not guarantee deletion; a stale writer can overwrite | high | **Accepted:** D7, one writer under the profile lock. **Rejected:** removing the old global keys, because of the pre-production rule (CLAUDE.md § Persisted-storage shape changes). |
| S5: a low balance is not proof for an arbitrary FPC | high | **Accepted.** D10; OA-7 rewritten. |
| F1: seven RPCs, `executeOperations` missed | high | **Accepted.** D4. |
| F2: zero handler teardown is not zero transaction teardown | medium | **Accepted.** Fact 7, OA-3, Phase 2.5 step 2. |
| F3: two more copies of the false rationale | low | **Accepted.** Four comment sites. |
| I1: late answers are normal, but transport loss needs handling | high | **Accepted.** Replacement, disconnect and late-send-failure drains; a real-lifecycle test. |
| I2: OWNER-ASKS states an unverified node behaviour as fact | medium | **Accepted.** OA-1, OA-4 and OA-7 separate admission refusal, simulation failure and inclusion failure, and mark I-1 inferred. |
| OA-1 to OA-7 corrections | low to high | **Accepted**, each as stated (OWNER-ASKS). |
| A1: a global count is a cross-profile behaviour change | high | **Accepted.** Per-profile attribution (D2). |
| C1: lazy expiry with no wake-up; emission inside admission | high | **Accepted.** Timer-driven horizon, pure reads, microtask retry, three tests. |
| C2: define which requests own capacity | high | **Accepted in part** (D3): the definition and a qualified bound. **Rejected:** estimate-only attribution, because it is cost without a fault prevented. |
| C3: two extractions are not timing-neutral | high | **Accepted.** Declined (D5). |
| C4: Phase 1.3 overlaps the other lane | high | **Accepted.** D13. |
| C5: no caller-chosen journal id seam | medium | **Accepted.** D8. |
| C6: the priority pin needs the builder boundary; narrow the `send_transaction` row | medium | **Accepted.** Two boundaries; the row reworded. |
| C7: the estimate lifecycle and the loading rows | medium | **Accepted.** Cancel on hide, input binding, D11, OA-10. |
| C8: no decisive integration test; `audit:vue` before arc 2 | medium | **Accepted.** Transition test (Phase 1.3); `audit:vue` in Phase 2.6. |
| O1: A stronger; keep B's conservatism | medium | **Accepted.** D6. |

**Opus Plan agent (round 1).**

**VERDICT: conditional approve.** Conditions:
- guard `executeOperations` or keep `feeReadFailed`'s rethrow;
- for #119:
  - a pure count;
  - clearing on replacement and disconnect;
  - a horizon tied to the proof ceiling;
  - per-profile/chain attribution;
  - the drain off the wire event path;
  - the transition and wiring tests;
- resequence Phase 1.3;
- decline #222 extraction 3;
- fix all four comment sites;
- mark OA-1's refusal as inferred;
- add the owner asks for the authwit readout and Confirm, for Send's Confirm on a failed estimate, for P6-06 on a speed change, and for #114's sponsor definition;
- a per-profile clear for #91.

| Finding | Severity | Disposition |
|---|---|---|
| S1: `executeOperations` unguarded, and the inner rethrow removed | high | **Accepted, both.** Guard and keep (D4). |
| S2: dead orphans park estimates for 15 minutes | high | **Accepted.** Replacement and disconnect drains (D2). |
| S3: cross-chain and cross-profile parking | medium | **Accepted:** per-profile. **Rejected:** per-chain (D3). |
| S4: `onOrphanDrained` dispatchable from the wire | medium | **Accepted.** A setter. |
| S5: a late send failure records a phantom orphan | low | **Accepted.** `onLateSendFailure`. |
| S6: the late answer's warn line | low | **Accepted.** A debug line for a known orphan. |
| S7: #91 residue on a late write | medium | **Accepted:** the problem. **Fix:** D7's locked writer instead of the writer-chain clear and sweep. |
| S8: only the Send map is shape-checked | medium | **Accepted.** Both readers validate. |
| S9: the new estimate RPC carries `FeeSettings` and an operation from the popup | medium | **Accepted.** Built in the service worker; joins #196's table. |
| F: "the count is global" is wrong; each service builds its own client, and token-balance's batched reads simulate too | medium | **Accepted.** One process-wide ledger fed by every client (D2). The driver's first v2 draft repeated the error ("only ExecutionService's client simulates"); `token-balance/service.ts:128-137` disproved it. |
| F: test file names that do not exist | low | **Accepted.** `core.test.ts`, `client-capture.test.ts`. |
| F: the priority pin in the wrong place | medium | **Accepted.** Strategy harness plus builder pins. |
| I-3 unsafe; I-4 verified | medium | **Accepted.** Fact 13; I-3 restated as the replacement signal. |
| D2 overstated the error-identity problem | low | **Accepted.** Outline B text corrected. |
| A-3 wrong for Phase 1.3 | medium | **Accepted.** D13. |
| #222 extraction 2 is a rename; decline 3 and probably 4 | medium | **Accepted.** D5. |
| #118: the plan path at `embedded-fpc-cap.ts:63` | low | **Accepted.** |
| #91: `ProfileInfo` touches R4 files; the two plans disagree on order | medium | **Accepted.** A-4, for the orchestrator. |
| #107: the seam resolves to "add"; subscribe on show; `runInSlot` collision | medium | **Accepted.** D8; Phase 2.2 warning. |
| #113: `withEstimateAdmission` is private; cancel on hide | medium | **Accepted.** `estimateSendTransactionFee`. |
| Gates: transition and wiring tests; Biome diagnostics cap; G1 in arc 2 | low to medium | **Accepted.** |
| OA corrections and the four new asks | low to medium | **Accepted.** OA-2 (balance effect, basis); OA-3; OA-4 (no quoted node text); OA-6 wording; OA-8 to OA-11. |

**Superseded by v3.** The round-1 dispositions that named v2's orphan ledger are now met by the entry hold (D2, D3):
- Codex A1, C1, C2 and I1;
- Opus S2 to S6 and the horizon.

The hold is per-profile by construction. It counts nothing new, emits nothing inside admission, ends on the late answer, a late send failure or a verified retired document, and has the existing TTL as its dead-man bound.

### Final pass

**Codex (gpt-6.1-sol, high, read-only), fresh session `01a12418`.** It ran on the alejo-icloud account, the script's pick, with no error.

**VERDICT: reject.** Blocking findings: 1, an unapproved orphan-capacity behaviour; 2, H3's gates incompletely encoded.

| Finding | Severity | Disposition |
|---|---|---|
| 1: v2's D3 counts app, balance and send work on every chain, an unapproved behaviour change | blocking | **Accepted.** #119 is redesigned to the issue's own fix: hold the estimate's own entry (D2, D3). No owner ask is needed, because nothing beyond the estimate's own work is counted. |
| 2: H3's unseen-fee clause is missing; OA-9 B and OA-7 C need page 9 | blocking | **Accepted.** D12; issue map; arc 2 summary; Phase 2.3 warning; Delivery; seeds; the OWNER-ASKS intro (OA-1 to OA-9 need pages 6 and 9). |
| 3: clearing on READY recreates phantom orphans; ghost READY | high | **Accepted.** The document epoch is captured at the wire send, and a timeout from a retired epoch is never recorded. Retirement happens only on a completed close or a failed probe. Tests for replacement-before-timeout and ghost READY. |
| 4: disconnect is not work completion | high | **Accepted.** Disconnect never ends a hold. No production code disconnects a PXE client (`offscreen/client.ts:142` auto-connects; no call site). A future disconnect path must carry the request id first. |
| 5: #91's lock force-releases; a displaced writer can write stale picks | high | **Accepted.** An `isCurrent()` check, synchronous with the write's issue, through `runExclusive`; I-5; a displaced-writer test. **Rejected:** a non-releasing lock shared with deletion, which would edit `deleteProfile`'s head (R4). |
| 6: #113's verdict omits the network | high | **Accepted.** Bound to the network and the scope epoch; synchronous invalidation; a late-A-after-switch-to-B test. |
| 7: OA-7 B still blocks a recognised contract that funds itself (PrivateFPC `mint_and_pay_fee`) | high | **Accepted.** OA-7 and #113(b): a low balance is proof only when the transaction carries no claim to the payer; a PrivateFPC cold-start test. |
| 8: OA-8 C contradicts the common submit guard | medium | **Accepted.** The guard and its tests follow OA-8's answer. |
| 9: the horizon is no work ceiling; the parked TTL rejects old tokens | medium | **Accepted.** The existing TTL is the dead-man, stated as able to free a place behind live work; nothing extends either TTL; a newly parked token in the expiry test, and an aged one rejected. |
| 10: OA-10 and OA-11 misstate today's sponsor rules | medium | **Accepted.** Both rewritten from `fee-privacy.ts:39-40,52-56` and `FeeSettingsCard.vue:753-757,792`. OA-11's recommendation is now Send's real rule. |
| 11: #107's subscription cleanup during `subscribeJob`'s await | medium | **Accepted.** A show epoch, plus a hide-before-snapshot test. |
| 12: `checking` disables the dropdown item | low | **Accepted.** Funding-read loading gets a selectable state; `FeeMethodSelector.vue` is in the change map, with a test. |

**Resumed pass** (same session, after v3).

**VERDICT: conditional approve.** Conditions:
- finding 3's retirement evidence;
- finding 7's funding proof;
- finding 10's OA-11 description;
- a bounded lifetime for abandoned records.

Findings 1, 2, 4, 6, 8, 9, 11 and 12 are resolved. Finding 5 is resolved at plan level, with moderate confidence.

All four conditions are **accepted and applied** in v3.1:

| Condition | Change |
|---|---|
| 3. A negative probe can miss a ghost, and `trackedClose()` resolves after a swallowed close error | Retirement happens only on a successful close (`closeOffscreen()` reports success). A failed close or a negative probe leaves holds to the TTL. Tests for both. I-3 restated. |
| 7. A nested setup claim defeats "no claim among the calls" | OA-7 B now requires a shape the wallet validates as unable to fund the payer, nested calls included; anything unknown gets A; a nested-claim fixture. |
| 10. OA-11 misdescribed Send's walk | Rewritten: Send picks only Nulo's own sponsor unasked (`fee-helpers.ts:255-260`). The all-sponsor rules are labelled as new options B and C. |
| New: abandoned client records have no bounded lifetime | Each record expires at `ESTIMATE_JOB_TTL_MS` after creation (pinned equal), which can never settle an entry earlier than the registry's TTL. A test for repeated timeout and reap cycles. |
| Note on 5: run the ownership check after any wait inside the storage facade | Added (`utils/storage.ts:78`'s `unless` callback). |

The driver closed these conditions without another Codex round. Each is a narrowing that the condition named, and no new mechanism was added.

### Arc 1 implementation review, round 1

**Codex (gpt-6.1-sol, high, read-only), session `01a12479`, on the arc's commits.** **VERDICT: changes needed.**

| Finding | Severity | Disposition |
|---|---|---|
| C1: a deferred `settle` after a TTL reap ends a later admission that reused the token | major | **Accepted.** `settle` takes the admission's signal and ends only the entry that signal names; an integration test reuses the token after the reap. |
| C2: a profile switch clears the task registry, `task.fail` throws `Invalid task id` with no cause, and the hold is lost | major | **Accepted.** `WrappedTask.fail` keeps the recorded failure as the non-enumerable `cause` of the error it throws; the message, the class and the wire (message only) are unchanged. |
| C3: a null-like first predicted slot falls back to the current minimum and skips later slots | minor | **Accepted.** The first slot is checked like the rest; pinned at both positions. |

**Opus review (general-purpose), on the same diff, with 27 mutation runs.** **VERDICT: changes needed** (no blocker or major).

| Finding | Severity | Disposition |
|---|---|---|
| O1: the first predicted slot | minor | **Accepted** (C3). |
| O2: an array-like `deltas` passes the port's speed-level check and executes | minor | **Accepted.** `approveInteraction` refuses a non-array like a count mismatch; a test with an array-like carrying an unknown level. |
| O3: the cap is per profile, so held chain-A estimates hold places against chain-B estimates; a crashed document without a proven close holds them to the TTL | minor | **Accepted in part.** A successful `createDocument` now retires the previous epoch (Chromium allows one offscreen document), which ends holds after a crash. The per-profile count stays: chain-scoped admission is a registry redesign outside arc 1. The registry header says so, and the PR body names it. |
| O4: surviving mutations (`send_transaction` reader, any-status record, `null` level, the L2 component) | nit | **Accepted.** One pin each; each now fails its mutation. The `onTerminal` order is pinned against the caller's first handler, the property the hold needs. |
| O5: the wallet subclass's record-lifetime comment overstated the bound; the registry header omitted two ends | nit | **Accepted.** Both rewritten. |
| O6: all nine PXE clients tracked timeouts and silenced warnings; `pxe/client.ts` imported from `execution/` | nit | **Accepted.** The tracking moved into `DEFAULT_PXE_CLIENT_FACTORY`; the wallet subclass is back to `dev`. |

## Seeds

Not run by this planner. For the implementing session, inside this worktree.

**Recommended: `/goal`**

```
/goal Arc 1 of implementations-plan/fees-and-sponsors/plan.md is built: Phases 1.1-1.5 marked ✓ in plan.md, each backed by its validation gate reported passing in the transcript; LESSONS_FILE=implementations-plan/fees-and-sponsors/lessons/phase-N.md printed per phase; /code-review NOT run (code_review: off); the arc-1 Codex fix loop (gpt-6.1-sol, high) converged, a resumed pass reporting no new material finding quoted in the transcript; arc 2 built only if decision page 6 is signed in the orchestrator's records (and Phase 2.3 and Phase 2.5's cap changes only if pages 6 and 9 both carry recorded answers), else not started; the PR topology in the Delivery section exists on GitHub, opened only after the loops converged (gh stack view in the transcript), including the close-out layer that archived the plan (git show --stat of the archive move); bun run test and bun run lint both exit 0 in the transcript.
```

**Fallback: `/loop`**

```
/loop 15m Drive implementations-plan/fees-and-sponsors forward. Never idle. Each firing: (1) read plan.md and lessons/ from the top stack layer; if the plan is gone, run `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/fees-and-sponsors/plan.md` — success means merged: run `agent-worktree done fees-and-sponsors --merged --trunk dev`, report, clear this loop, stop; failure means delivered: babysit CI only. (2) Pick the next unmarked phase; warnings in the phase come first (send-queue-activity arc 1 merged before 1.1, 1.3 and 1.4; one e2e:agent on the host until #169 merges; nothing of arc 2 before page 6 is signed; no cap change and nothing of Phase 2.3 before pages 6 and 9 both carry answers). (3) After each edit run bun run lint and the phase's unit command; commit. (4) Phase gate green: mark ✓, write lessons/phase-N.md, print LESSONS_FILE=…; at the arc boundary run the Codex loop per Post-implementation before gh stack add. (5) Stuck: consult Codex (gpt-6.1-sol, high) and log it; never cross a hold (H3, page 6, page 9, R4), never merge, never --admin. (6) Same step failed 5 times: stop and reassess with Codex.
```
