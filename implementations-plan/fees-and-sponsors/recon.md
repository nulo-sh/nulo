# fees-and-sponsors: recon

Base: `origin/dev` at `fd47407`. Three read-only Explore agents (sonnet) plus the driver's own reads, 2026-10-10. Paths are repo-relative; `EX` is `apps/extension/src/wallet/services/execution`, `SEND` is `apps/extension/src/popup/components/modules/send`. Upstream facts were read from the installed `@aztec-labs/*` 6.0.0-rc.1 packages under `node_modules/.bun/`.

## Reuse map

| Capability the lane needs | Existing code | Verdict |
|---|---|---|
| Refuse malformed popup RPC params with a typed error, logged at debug | `account/service.ts:128-133` (`invoke` override + `AccountMethodSchemas`), `InvalidWalletArgumentsError.forMethod` (`packages/extension-messaging/src/errors.ts:284-295`), `base-service.ts:110-116` logs a thrown call as "Request failed" at debug | **reuse** the `invoke`-override shape; a full per-method zod schema for every RPC is out of scope (#196's decision names one field) |
| Own-property lookup guard | `Object.hasOwn(TRANSFER_FN_BY_TYPE, …)` at `EX/operation-planner.ts:133` | **reuse** the idiom; no `isPriorityLevel` exists (searched `isPriorityLevel`, priority `z.enum`, `PRIORITY` in `packages/wallet-bridge/src`) → **build new** one predicate beside `PRIORITY_MULTIPLIERS` (`packages/wallet-bridge/src/fee.ts:26`) |
| Estimate admission cap + cancel | `EX/estimate-cancel-registry.ts` (`MAX_ACTIVE_ESTIMATES_PER_PROFILE = 4`, park/supersede, 15-min TTL reaper), `EX/service.ts:564-593` (`withEstimateAdmission`) | **adapt**: occupancy must include offscreen work the SW stopped waiting for |
| Know when timed-out offscreen work ends | `BaseServiceClient.handleResponse` drops a late response with a warn (`packages/extension-messaging/src/core/base-client.ts:195-199`); `onTerminal` hook (`:361`); offscreen default timeout 90 s (`offscreen/client.ts:22`) | **adapt**: the late response is the completion ack, today discarded |
| Per-request profile/chain attribution offscreen | `NetworkInfo { profileId, chainId, … }` (`packages/aztec-runtime/src/pxe/chain-runtime.ts:79`), first param of `PxeServiceClient.simulateTx` (`pxe/client.ts:354-361`) | **reuse** |
| Embedded fee cap | `EX/fee/embedded-fpc-cap.ts:70-81`, `fee-strategy.ts:282-300` (embedded branch reuses the committed cap) | unchanged in arc 1 (hold H3); comment corrected |
| Inclusion-safe basis | `predictedWorstMinFees` (`packages/aztec-runtime/src/fee-juice.ts:18-46`) | **reuse** (arc 2 / asks) |
| Precedence pins | `fee-structural-parity.test.ts:140,147,191,208,226`, `strategies-lifecycle.test.ts:365,372,391`, `operation-planner.test.ts:288,301`, `dapp-send-executor.test.ts:928,1901`, `fast-path.test.ts:493,511` | **extend**: the two gaps below |
| Strategy test harness | `strategies-lifecycle.test.ts:41-174` (`makeBuilt`, `harness`, `feesOf`, `FOLD_MATRIX`) | **reuse** inside that file |
| Per-profile UI key purge on every delete path | `utils/profile-ui-keys.ts` (`PROFILE_UI_KEY_PREFIXES`), `profile-deletion/coordinator.ts:135` (`storage.remove(profileUiKeys(id))`), `profile-ui-keys.scan.test.ts` | **reuse** for #91 (arc 2): re-key the two fee maps into the registry, no coordinator edit |
| Incarnation id | `Profile.pxeGeneration` (`profile/profile-row.ts:37,60`; `profile/spec.ts:67-73`); not in `ProfileInfo` (`spec.ts:53-65`) | **adapt** (arc 2) |
| Sponsor funding probe | `EX/sponsor-funding.ts:21-40` (`balance >= getFeeLimit()`), `SponsorFunding` wire type (`packages/wallet-bridge/src/fee.ts:84-88`), card watcher `FeeSettingsCard.vue:767-790`, notice `:272-276`, live region `fee-sponsor-live` `:927` | **reuse** (arc 2) |
| Long-RPC client override | `EX/client.ts:11,23-25` (`EXECUTE_TRANSFER_TIMEOUT_MS`), `passkey/client.ts:23-25`, `pxe/client.ts:119-128` | **reuse** (arc 2, #107) |
| Stage copy | `utils/card-subtitle.ts` (`stageSubtitle`), journal `progress.stage/backend` | **reuse** (arc 2, #107) |
| Fee-juice nudge | `FeeSettingsCard.vue:251-258` (`nudgeCopy`), `:947-959` (`send-fee-nudge`), `FEE_JUICE_BRIDGE_URL` (`SEND/fee-helpers.ts:318-319`) | **reuse** (arc 2, #114) |
| Loading fee row | `FeeMethodOption.checking`, `withLoadingRows` (`SEND/fee-helpers.ts:216-229`), `FeeMethodSelector.vue:66-83` | **reuse** (arc 2, #115) |
| Composition layer | `apps/extension/tests/COMPOSITION-TESTS.md` | **not used**: every arc-1 change is a unit concern; #118/#119/#196 fail D2/D4 |

Absence trails: no fee-specific classification of a node refusal (searched "insufficient fee", "fee per gas", "min fee", "too low", "InsufficientFee" in non-test code); no `withEstimateTask`, `committedMaxFees`, `resolveLiveHandles`, `raceDeadline` in `apps/extension/src` or `packages/*/src`; no abort or ack on the offscreen simulation (searched "abort", "cancel" in `aztec-runtime/src/pxe/{service,client}.ts`, `offscreen/entry.ts`); no SW balance preflight for self-pay (searched "preflight", "insufficient" in `apps/extension/src/wallet`); no "refund" in fee code.

## Upstream semantics (installed 6.0.0-rc.1)

- **Charge.** `computeEffectiveGasFees` (`stdlib/dest/fees/transaction_fee.js:6-14`) charges `baseFee + min(maxPriorityFeesPerGas, maxFeesPerGas − baseFee)` per axis on billed gas (teardown billed at its limit). With priority 0, raising `maxFeesPerGas` does not change what a fee-juice payer is charged; it raises `getFeeLimit()` (`gas_settings.js:56-58`, `Σ maxFeesPerGas × gasLimits`), which the fee payer's balance must cover at admission (FeeJuice `check_balance`).
- **`gasLimits` already includes teardown** (`gas_settings.js:20`: "Total gas the tx may consume across all phases, teardown included").
- **Node refusal text**: `TX_ERROR_INSUFFICIENT_FEE_PER_GAS = 'Insufficient fee per gas'` (`stdlib/dest/tx/validator/error_texts.js:2`); the node packages are not installed, so whether a below-min tx is refused at `sendTx` or held is not verifiable here.
- **Upstream wallet** (`wallet-sdk` `BaseWallet`): `maxFeesPerGas = gasSettings?.maxFeesPerGas ?? getMinFees(Limit).mul(1.5)`; `feePayer` never changes the cap. Nulo's `account/fee-options.ts` mirrors an older form (`getCurrentMinFees() × 1.5`); only the estimation stage uses it.
- **Embedded budgets.** No installed canonical payment method or contract asserts `gasLimits × maxFeesPerGas ≤ budget` (`FeeJuicePaymentMethodWithClaim`, `SponsoredFPC`, reference `FPC` all checked). The one budget-style assert is PrivateFPC `mint_and_pay_fee` (`amount ≥ max_gas_cost`), which the bridge's fuel claim calls with an explicit cap since the private-fuel fix.
- **PrivateFPC charges the full cap, no refund** (`fpc_lib` `get_max_gas_cost`, teardown excluded). The wallet's private-FPC cap is `predictedWorstMinFees × multiplier` (2 default; 3 fast; 5 urgent), so the multiplier is charged 1:1 on that path.
- **JSON-RPC null**: `safe_json_rpc_client.js:173-182` returns `undefined` for a null-like result before schema parsing (#197's upstream half).

## Issue verdicts

### #118 (embedded cap, no `maxFeesPerGas`): holds
- Cap = `node.getCurrentMinFees()` 1.0× (`embedded-fpc-cap.ts:72-74`); finalize reuses it (`fee-strategy.ts:285-291`); NO_FROM fetches it twice (`tx-request-builder.ts:425`, `dapp-send-executor.ts:935`).
- The confirm rebuilds an embedded op fresh, before proving (`dapp-send-executor.ts:~795-806`), so the exposure window is prove + submit (proof ceiling 30 min, `pxe/client.ts:74`). Nothing re-checks the cap between proving and `node.sendTx` (`execution-coordinator.ts:331-356`); changing it after proving needs a re-prove.
- The node's refusal is unclassified: it reaches a dApp as `UNCLASSIFIED_ERROR_MESSAGE` (`wallet-sdk/error-envelope.ts:62`).
- **The helper's stated rationale does not hold against the installed code** (see Upstream). The 1.0× rule itself was an owner-era decision (`archive/private-fuel-fee-fix/plan.md`: "the general embedded cap stays at 1.0 times the current minimum, since other dApps budget against it").
- Any fix changes how a cap is computed → hold H3 → owner ask (OWNER-ASKS OA-1).

### #119 (estimate slot freed on timeout): holds
- `withEstimateAdmission`'s `finally` settles on any rejection, including the offscreen transport's 90 s `simulateTx` timeout (`base-client.ts` timeout → `settle`), while the offscreen simulation keeps running inside the per-chain FIFO write guard (`packages/wallet-core/src/utils/rw-guard.ts`; `aztec-runtime/src/pxe/service.ts:979-1010`).
- Effect: the orphan lengthens the offscreen queue past what the cap bounds; the registry's header comment (`estimate-cancel-registry.ts:38-45`) assumes a transport rejection means the job ended, which a timeout disproves.
- The late response arrives and is dropped with a warn (`base-client.ts:195-199`): it is the completion signal the fix needs.
- dApp estimates take no lane slot (`transfer-executor.ts:477-497` is transfer-only).

### #188 (six fee-cap proposals): mixed; precedence undocumented
Today's precedence of a dApp `maxFeesPerGas` against the wallet cap:

| Path | Winner |
|---|---|
| `fj`, `fjwc` fresh build | dApp, verbatim, no multiplier, no floor (`fee-juice-strategy.ts:55-62`, `fee-strategy.ts:283-284`) |
| `fpc` (sponsored fast path and two-pass) | **wallet**; the dApp cap is ignored (`fpc-strategy.ts:176,259,284-293`; header says deliberate). **Unpinned.** |
| embedded, NO_FROM | dApp verbatim, else current min 1.0×, multiplier ignored (pinned) |
| operation estimate reuse | a dApp cap is never stashed (`dapp-send-executor.ts:456`, pinned) |
| Send-page transfer, `send_transaction` | wallet only; the planner builds no `fee` (`operation-planner.ts:~143-157`) |

- **Side finding:** a dApp's `maxPriorityFeesPerGas` is parsed and fingerprinted (`operation-planner.ts:94-103`, `operation-fingerprint.ts:152`) but no strategy commits it; only simulation threads it (`view-executor.ts:314`). Sends commit priority 0. **Unpinned.** With priority 0 the Normal/Fast/Urgent levels change only the cap's headroom, never inclusion order.
- Proposal status: (1) tighter private-FPC cap: not done; (2) balance preflight: popup fails closed on unknown/zero only, no fee comparison; (3) displayed max fee counts teardown twice: **present** (`utils/fee-estimation.ts:41-50` adds `teardownGasLimits` to `gasLimits`); both wallet FPC handlers report zero teardown (`fpc/handlers/*:getTeardownGas`), so the overstatement shows only on txs with a teardown phase (dApp payloads); (4) precedence: exists, inconsistent across kinds, partly unpinned; (5) component-wise reuse check: not done (DA/L2 independent in `predictedWorstMinFees` only); (6) gas-only fee module: not present, meaning unclear in code.

### #196 (unknown `priorityLevel`): partly holds
| Input | Fresh build | Operation reuse | Transfer reuse |
|---|---|---|---|
| `"bogus"` | silent default (2×) | `RangeError` (`.mul(undefined)`) | soft miss |
| `"constructor"` | throws (`.mul(fn)`) | throws (pinned `operation-estimate-reuse.pins.test.ts:357`) | soft miss |
| `""` | default | default | default |

Entry points from the popup: `ExecutionService.executeTransfer`, `estimateTransferFee`, `estimateOperationFee` (`EX/spec.ts:39,78,92`); `DappInteractionService.approveInteraction` deltas (`dapp-interaction/approval-delta.ts:14,33-48`); `AuthRegistryService.revokeAuthwits`, `setRegistryEnabled` (`auth-registry/service.ts:253,330`). None validates `priorityLevel`. The popup never sends one for Normal (`SEND/fee-helpers.ts:67`).

### #222 (duplicated fee helpers): partly holds
- The issue's own correction stands: `withEstimateTask`, `committedMaxFees`, `resolveLiveHandles`, `raceDeadline` are proposals, not code; **`raceDeadline` has no duplicate at all** (no fee-path `Promise.race`).
- Real duplicates: the estimate-task try/complete/fail wrapper (5 copies; the fpc fast path differs: an extra `complete` and an un-awaited two-pass return, pinned `strategies-lifecycle.test.ts:257-274`); the FPC finalize tail (2 copies, tails identical, `maxFee` and `baseFees` read points differ); live-handle resolution (2 copies, same order, pinned `dapp-send-executor.test.ts:~1067-1095`); the `NO_WAIT` tail (2 byte-identical copies, `dapp-send-executor.ts:728-732`, `:901-905`); the built-fee fingerprint wrapper (2 copies, `transfer-executor.ts:541-544`, `dapp-send-executor.ts:478-481`); the multiplier resolution (`service.ts:1122`, `estimate-reuse-shared.ts:110-112`, `?? DEFAULT_FEE_MULTIPLIER` at `fee-strategy.ts:281`, `fpc-strategy.ts:138,210`).
- Deliberate differences, not duplication: the two reuse ladders' base-fee reads (order pinned differently), the probe fold per strategy, the NO_FROM recorder (no `async` hop, `EXTERNAL`, `Fr.ZERO` nonce).

### #197 (null node reply into fee math): holds in-repo; not in this lane's eleven
`predictedWorstMinFees` returns `getCurrentMinFees()` unchecked at four points (`fee-juice.ts:19,31,34,38`). chain-endpoints' planner routed its in-repo half here. Plan-level Ask only.

### #91 (fee maps survive delete): partly holds; cites off
- Two address-keyed maps, both global: `nulo:ui:feePaymentMethods` (`popup/constants/storage-keys.ts:2-5`; writer `FeeSettingsCard.vue:362-365`, no queue) and `nulo:ui:sendFeePaymentMethods` (`SEND/fee-send-selection.ts:80-95`, per-document serial queue). `FeeSettingsCard.vue:368-371,849` are the in-memory pinia cache, not storage.
- Every background delete path funnels into `ProfileDeletionCoordinator.purge`, which removes only `profileUiKeys(id)`; neither map is registered, so no path removes them.
- `reset.vue:86-88` removes both maps **whole**, wiping every other profile's picks too; and two same-seed profiles share one address (`account/service.ts:776-779`), so their picks overwrite each other today.

### #107 (authwit popups, 60 s ceiling): holds
`AuthRegistryServiceClient` (`auth-registry/client.ts:14-34`) has no `getRequestTimeoutMs` override; `revokeAuthwits` and `setRegistryEnabled` span prove, submit, mined, up to 120 s waiting for proven, and a sync. The popups show only a spinning button; the RPC returns no journal id, so the stage line needs a correlation (`OperationJournalServiceClient.subscribeJob` exists with no production consumer).

### #113 (sponsor unchecked on three surfaces): holds
(a) the authwit popups run no estimate, so the card never gets a verdict; (b) `EmbeddedStrategy` sets no `sponsor` and `OperationCard.vue:287-295` shows a static badge for an embedded payment; a self-claiming payer (`fjwc`) reads short by design (`sponsor-funding.ts:1-7`); (c) Send's `isAllowedToSend` (`popup/pages/send.vue:292-301`) has no estimate term.

### #114 (no route to fee juice in the app window): holds
The nudge's legacy branch (`originPrivacy === null`) needs a selected method with a confirmed zero (`FeeSettingsCard.vue:310-329`); with no sponsor and no fee juice nothing is selected, so no nudge, and Confirm stays disabled silently.

### #115 (sponsor notice): (a) holds, (b) shipped in #235 (`fee-sponsor-live`), (c) holds
(a) `FeeSettingsCard.vue:792` clears `shortSponsorIds` on a priority or tx-shape change, so the row reads "free" until the next verdict; (c) the protocol row and an unnamed hand-added row both title "Sponsored" (`SEND/fee-helpers.ts:213,237`); `isProtocol` distinguishes them (`fpc/service.ts:106-115`). The e2e pins the current sentence (`tests/e2e/network/fee-sponsor-funding.test.ts:~173`).

### #117: confirmed, no work
`SEND/fee-privacy.ts:62-82` (`walkPrivateOrigin`): private Fee Juice before Fee Juice before Sponsored.

## Collisions

- **send-queue-activity arc 1** (in flight): edits `EX/service.ts` (settle handler, estimate admission at `:~553` only with its OA-5), `operation-estimate-reuse.ts` and the dApp estimate stash (epoch), `transfer-executor.ts`, `send-sequencer.ts`. Arc 1 here rebases on it once merged.
- **send-queue-activity arc 1b** (later): `dapp-send-executor.ts` `runInSlot`.
- **account-session-life arc 2** (R4): `ProfileService.deleteProfile` head only; its plan reserves the coordinator for #91. #91's design here needs no coordinator edit.
- **`FeeSettingsCard.vue`**: #91, #113, #114, #115 all edit it (arc 2, one PR).
- **Open PRs at planning time:** #255 (forms-and-contacts), #254 (dapp-ingress-grants): no shared file found.

## Corrections from the round-1 audits

Recon claims that did not hold, as corrected in plan v2:

- **#196.** There are seven popup RPCs, not five. The two missed:
  - `ExecutionService.executeOperations`: each `send_transaction` / `aztec_sendTx` operation carries `feeSettings` (`packages/wallet-bridge/src/operation.ts:87,184`; RPC-exposed, `EX/service.ts:136`).
  - `previewOperationAuthwits` takes no fee settings.
  - Removing `feeReadFailed`'s non-number rethrow would make a bypass fail open, so it stays.
- **#119, which clients simulate.** "The count is global" and "the transport cannot see a request's profile" were wrong.
  - Every service builds its own `PxeServiceClient`, and the token-balance projector's client issues `simulateTx` too (`token-balance/service.ts:128-137` → `batchedViewSimulation`'s slow arm).
  - The request override reads `NetworkInfo.profileId` (`pxe/client.ts:164`).
- **#119, how the work ends.**
  - `simulateTx` shares the per-(profile, chain) write guard with `proveTx` (`pxe/service.ts:469,516`), so an orphan can wait behind a proof of up to 30 minutes.
  - The offscreen service answers after the method resolves, with no abort (`offscreen/service.ts:39-60`). A replaced document or a restarted service worker loses the answer.
- **#118.** The false budget rationale also sits in `fee/embedded-strategy.ts:7-12` and `fee/fee-strategy.ts:286-290`, not only in the helper and `account/fee-options.ts`.
- **#188, the dropped priority fee.** The strategies call `buildStandard` without gas settings, and `completeFeeOptions` defaults the priority to empty (`account/fee-options.ts:73-75`). A finalizer-only pin cannot show this.
- **#222.** The `NO_WAIT` tail and the FPC finalize tail are byte-identical but not timing-neutral to extract: an async helper adds a settlement boundary.
- **#107.** `hooks.queuedJournalId` cannot carry a fresh caller-chosen id: an unknown id falls back to a newly generated one (`operation-journal/service.ts:296-302`, `EX/claim-helper.ts:86-102`).
- **#113.**
  - Handing a full estimate to the authwit popups' fee card renders a readout (`FeeSettingsCard.vue:960-966`, `FeeCostReadout.vue:31-55`).
  - An app's fee contract can be funded during setup, so a low balance is not proof that it cannot pay.
- **#91.** Only the Send map is shape-checked today; `readSavedFeeMethods` returns the raw value (`FeeSettingsCard.vue:78`).
- **Collisions this recon missed:**
  - send-queue-activity arcs 2 and 4 edit `send.vue`, and arc 5 edits Send's fee card.
  - That lane's arc 1 edits `fpc-strategy.ts:113-132`.

## Corrections from the final pass

- **#119.**
  - Counting every orphaned simulation would change admission for work the issue does not name. The issue's own fix is to hold the estimate's own entry.
  - READY is not proof that a document was replaced: a ghost document can emit it during a close-and-retry (`offscreen.ts:340-347`).
  - A client disconnect does not end offscreen work.
- **#91.** `ProfileService`'s lock force-releases after five minutes, and the displaced callback keeps running (`lock.ts:145-159`). A write needs the `isCurrent()` probe.
- **#113.**
  - The recognised PrivateFPC can be funded inside the transaction (`mint_and_pay_fee` follows a claim that credits it).
  - An authwit verdict must also be bound to the network.
- **#114 and #115.**
  - Send counts an unchecked sponsor as able to pay (`fee-privacy.ts:39-40`).
  - A speed or transaction change clears only the "short" mark (`FeeSettingsCard.vue:792`).
  - `checking` disables a dropdown item (`FeeMethodSelector.vue:67`).
