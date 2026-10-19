# tx-record-1: recon

Read at `origin/dev` `993b3efc` by the planner and three Sonnet explorers. Paths are relative to `apps/extension/src` unless they start with `apps/`, `packages/` or `implementations-plan/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Fail a still-queued dApp record by the error's class | `wallet/services/wallet-sdk/queued-journal.ts:251-298` (`failQueuedIfUnclaimed`, `QueuedFailureKind`, `queuedFailureKind`); the only caller that can see a Reject is the ingress catch, `wallet/services/wallet-sdk/background.ts:951` | adapt: one arm, one title rule |
| "Cancelled" / "You rejected" for a rejected record | `utils/journal-state.ts` (`journalTerminalDisplay` routes `error.kind === "user_rejected"` to Cancelled; `kindLabel` gives "You rejected" / "You stopped this transaction."), pinned by `utils/journal-state.test.ts:89-90,707-708,804-808` | reuse as-is |
| `user_rejected` as a job error kind | `packages/wallet-core/src/jobs/types.ts:139,173` (already a `KnownJobErrorKind`; its comment at `:135-136` calls it not produced on HEAD) | reuse; the comment goes stale |
| The window's close as a sentinel | `wallet/services/window-manager/window-manager.ts:44` `WINDOW_CLOSED_BY_USER` (a string); `wallet/services/passkey/service.ts:165` already maps it to `UserRejectedError` | reuse |
| Name the journal record by a build's primary call, class included | `wallet/services/execution/execution-lane.ts:671-685` `recordBuiltCall` (best-effort, never throws), bound per slot as `SlotRun.recordCall` (`wallet/services/execution/dapp-send-executor.ts:375`) | reuse as-is |
| A build's calls with their class before any simulation | `BuiltStandardTx.txCalls`; the class comes from `calledClassId` inside `buildStandard` (`wallet/services/execution/tx-request-builder.ts:576-584`), before the strategy simulates | reuse as-is |
| A per-call hook into the fee strategies | none. `FeeStrategyContext` (`wallet/services/execution/fee/fee-strategy.ts:119-155`) carries `probe` (called after a sim, folded runs only); searched `onBuilt\|hook\|callback\|recordCall` in `fee/*.ts` | build new: one optional field |
| The protocol SponsoredFPC address | `wallet/services/fpc/service.ts:103-115` `getOrComputeProtocolAddresses(chainId)` (async, derived, cached per chain); `fpc/protocol-fpcs.ts:19-22` `deriveSponsoredFpc`; `protocol-fpcs.test.ts:27-31` pins the derivation to the canonical address | reuse; one dep into the dApp send executor |
| The PrivateFPC address | `wallet/services/fpc/private-fpc-address.ts` (`PRIVATE_FPC_ADDRESS`, `isPrivateFpc`) | reuse as-is |
| "The first fee call" rule | inline in `popup/components/modules/tx/tx-detail-helpers.ts:56` (`calls.find(c => FEE_METHODS.has(c.method))`); `FEE_METHODS` in `utils/primary-method.ts:15` | adapt: one shared helper, so the write-time match and the page read the same call |
| Who chose a transaction's fee, on the stored row | none. `Tx` (`wallet/services/transaction/spec.ts:111-167`) holds `feePaymentMethod`, `origin`, `calls`, `feeSpender`; searched `feeChosen\|chooser\|setBy\|embeddedFeePayment` on `Tx` | build new: one optional field (#821's decision) |
| An optional enum field that reads as absent when unknown | `priorityLevel: z.custom(isPriorityLevel).optional().catch(undefined)` (`transaction/spec.ts:208`, pinned at `wallet/services/storage-codecs.test.ts:421-430`); conditional spread in `addTransaction` (`transaction/service.ts:240-241`) | reuse the pattern |
| Fee method label | `popup/components/modules/tx/tx-detail-helpers.ts:46-64`, rendered once at `popup/pages/tx/[id].vue:278-281` (no testid) | adapt |

## #828: the path from Reject to the record (verified)

Reject (`popup/windows/execute/index.vue:479-487`, reason "User rejected") → `rejectInteraction` → `windowManager.cancel(handle, new UserRejectedError(reason))` → the same instance reaches `interaction()`'s catch (`dapp-interaction/service.ts:634-639`; a recorded refusal replaces it, which `scope-refusal` covers) → the dispatcher → the ingress catch (`background.ts:951`) → `failQueuedForError`. `queuedFailureKind` has no arm for it, so `popup_bound`; `popup_bound` keeps the title (`:265`), any other kind retitles to "Transaction". The issue's trace holds at HEAD; #832 changed only the refused case.

Other ends of the same window: closing it with its X races the page's `beforeunload` Reject (`composables/useDappApprovalWindow.ts:91,130`, the same `UserRejectedError`) against `chrome.windows.onRemoved` (`WINDOW_CLOSED_BY_USER`, a bare string); the window's timeout settles with the string "Timed out waiting for window"; a profile switch calls the same Reject (`useDappApprovalWindow.ts:115`); a Home-feed cancel settles with `JobCancelledError` on a record already `cancelled`, which `transitionIfStage(["queued"])` leaves alone. `cancelInteraction(cancellationToken)` has no production caller (the dispatcher leaves the token unset).

## #820: build sites (verified)

Nine `buildStandard` calls in the four strategies: `fee/fee-juice-strategy.ts:36,54`, `fee/fee-juice-with-claim-strategy.ts:29`, `fee/embedded-strategy.ts:42`, `fee/fpc-strategy.ts:153,185,229,263,283`. Five are a pipeline's first build (`:36`, `:29`, `:42`, `:153`, `:229`); the other four are rebuilds of the same calls (with a fee payload or discovered witnesses added). The simulation that can fail is the strategy's `simulateTxTask`, always after its first build. The classic discovery route (`fjwc` picks, ops with a pre-attached private authwit) builds and simulates once more before the strategy: `service.ts:479-489` (`buildForDiscovery`), run by `discovery-aware-estimator.ts:122-125`.

Callers: the send's own builds are `dapp-send-executor.ts:848` (`send_transaction`), `:1164` (embedded `aztec_sendTx`) and `:1172` (the estimator, standard `aztec_sendTx`); each records after the build returns (`:849`, `:1037`). The window's estimates are `:589` and `:592` (`buildForEstimate`), through the same estimator and the same dep. So the hook must be a per-call argument. An estimate reuse (`:1133-1157`) runs no build and records the window's calls at `:1037`. No-from records before its simulation with no class (`buildNoFrom`), unchanged. A failed send keeps the record's `call` (`operation-journal/service.ts:388-391`), so an early write survives the failure.

## #821: writers of a transaction row (verified)

`TransactionService.addTransaction` (`transaction/service.ts:181-244`) is the only creator. Its callers: `sentTxRecorder` (`dapp-send-executor.ts:759-779`, for both `proveStandardSend` and `proveSendTransaction`, the auth-registry toggle and revoke included), the no-from writer (`:1253-1266`, fee kind always `embedded`), and the popup Send's `recordTransfer` (`transfer-executor.ts:439-480`). Restore writes `TxSchema.parse(tx)` (`transaction/service.ts:597-632`); `TxSchema` is a non-strict `z.object`, which strips an unknown key on restore and on every read. The materializer sets `feeSettings.paymentMethod.kind = "embedded"` exactly when the request embeds its fee (`dapp-interaction/materialize.ts:59`).

| Writer | Who chose | Calls recorded | `feePaymentMethod` |
|---|---|---|---|
| dApp send, the person's pick (fj, fjwc, fpc) | the person | the wallet's fee call first (`fee/fpc-strategy.ts:152,201`), then the app's | from the build |
| dApp send, embedded | the app | the app's, its fee call included | `EXTERNAL`, or `FEE_JUICE_WITH_CLAIM` |
| no-from | the app | the app's | `EXTERNAL` |
| popup Send | the person | the transfer only; the FPC is `feeSpender` | from the build |
| auth-registry toggle and revoke (through `send_transaction`) | the person (wallet defaults) | the wallet's fee call, then `set_authorized` | from the build |

Only two FPC row types exist (`fpc/spec.ts:16-19`): `DefaultSponsoredFpc` (emits `sponsor_unconditionally`) and `PrivateFpc` (emits `pay_fee`, canonical only, `fpc/service.ts:410-412`).

## Tests and e2e

- Unit pins that move: `wallet/services/wallet-sdk/queued-journal.test.ts:437` (Reject → `popup_bound`, the bug); `popup/components/modules/tx/tx-detail-helpers.test.ts:77-155` (stay green for a row with no record of who chose).
- Fakes a new strategy field must satisfy: `fee/strategies-lifecycle.test.ts`, `fee/strategies-structural.test.ts` (both cast `makeCtx` to `FeeStrategyContext`; `:164` pins `result.txCalls` by identity); `dapp-send-executor.test.ts:2516-2568` ("every build names its record before the send", reuse included) and `:1645`.
- e2e: `tests/e2e/network/tx-sendTx-reject.test.ts` rejects a plain `sendTx` and asserts only the dApp's error; `tests/e2e/network/scope-refusal.test.ts:117-150` reads a rejected-refusal record with `fixtures/journal-page.ts` (`readErrorKind`, `readTerminalCard`, `readJournalDetail`, opt-in shots under `NULO_E2E_SHOT_DIR`, both themes). `tests/e2e/network/fee-sponsor-funding.test.ts` sends an app-sponsored transfer through the canonical SponsoredFPC (`sponsorSalt` 0) to admission, and an app's own sponsor (`sponsorSalt` 1) to its refusal. No e2e reads the Fee method row; it has no testid.

## Collisions

- Closed limit #775 (a popup Send recorded before `feeSpender` reads "Sponsored"): unchanged.
- `implementations-plan/archive/owner-feedback-1/plan.md` D1 and `implementations-plan/archive/fee-call-match-1/plan.md` D2 refused a fee field on `Tx`; #821's decision (issue comment 6264886733) reverses that on the owner's read.
- Sibling lanes: send-fees-3 (may touch the fee strategies: the hook stays additive, one line per first build), execute-window-3 (the execute window: untouched here), ui-dedupe-2 (History rows: this lane changes no row component).
