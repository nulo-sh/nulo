# Recon: send-fees-3

Base `origin/dev` at 993b3efc. One Sonnet explorer (reuse sweep, six capabilities) plus the planner's own reads. Every line was checked against the tree.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Classify the cap's refusal on the Send path | `failureKind` (`apps/extension/src/wallet/services/execution/mark-failed-unless-cancelled.ts:51-55`), the one classifier both send paths share; arms for `DuplicateInitializationError` and `SessionEndedError` only. Send's catch: `transfer-executor.ts:298`. | adapt: one arm |
| Render a `too_many_pending` record | `kindLabel` `apps/extension/src/utils/journal-state.ts:264`, `failedSubtitleFor` `:321`; `nothingSentLabel` (`:229`) has no arm, so a never-sent record falls to `kindLabel` | reuse as-is |
| The fee card's pending look | `readPending` (`FeeSettingsCard.vue:204`), `pending` on Selector, Row and Readout; `FeeCostReadout.vue:60` draws a bar whenever `pending` | adapt: one prop |
| "An amount is typed" on Send | `amountTerm` (`apps/extension/src/popup/pages/send.vue:228`), tested as `!amountTerm.value` by `isAllowedToSend` (`:317`); the card receives nothing that encodes it (`txShape` is a JSON string, never empty). The estimate watcher's guards (`:581-625`) are the only statement of "an estimate follows" | adapt: one binding |
| A failed read's line | `statusNotice` (`FeeSettingsCard.vue:325-329`) reads `failure` with no regard to a pending read | adapt: one condition |
| Test shapes | `mark-failed-unless-cancelled.test.ts:77-91,125-129`; `transfer-executor.test.ts:487-506` (`makeHarness`, `acquireTransferSlot` throwing); `FeeCostReadout.test.ts:48`; `FeeSettingsCard.test.ts:2317` (failed A, pending B, committed B); `send.test.ts:629` (reads a stubbed card's props; the stub lists them at `:179-193`) | reuse |
| Pictures | `shotSend` (`tests/e2e/fixtures/send-page.ts:210-248`, both themes via `html[theme]`); `seedJournalRecord` (`tests/e2e/helpers/activity-seeds.ts`, used by `send-outcome-rows.test.ts`) | reuse in a throwaway spec |

## Facts the plan rests on

- Send reaches the cap through `ExecutionLane.acquireTransferSlot`, which maps `ExecutionMutexCapacityError` to `TooManyPendingError` (`execution-lane.ts:508`), called from `acquireSlotWithin` (`transfer-executor.ts:577`) inside `execute`'s try. The record is then `queued` or `pending`, never `submitting`, so `sendOutcome` says `nothing_sent` (`operation-journal/spec.ts:283`).
- The dApp path already files the cap as `too_many_pending` in `refuseSlot` (`execution-lane.ts:455`), and no re-mark follows: its first `acquireSlot` runs before the `try` that holds `markFailedUnlessCancelled` (`dapp-send-executor.ts:339` vs `:349`), and a parked run redeems its reservation without a cap check (`execution-mutex.ts:127,206`). `failureKind`'s other callers (`mark-failed-unless-cancelled.ts:40`, `execution-lane.ts:415`) never see this error, and the SDK's session cap (`wallet-sdk/background.ts:673`) answers the dApp without a journal kind. A new `failureKind` arm changes no dApp record.
- `humanizeErrorKind` maps `too_many_pending` to "App", but nothing outside its tests calls it.
- Nothing branches on a record's origin or on `error.kind === "transfer"` for display: `RecentActivityView.vue:386,395,582` test the operation's `kind`, not the error's. No retry control keys off the error kind.
- Since #845 every guarded smoke launch answers the Testnet node with an immediate 400 (`tests/e2e/fixtures/node-stub.ts`), so a read fails fast; `interceptRpc` offers `refuse` and `redirect` only. Holding a read needs a `redirect` to a loopback that never answers (the read then fails at its 20 s `INIT_FETCH_TIMEOUT_MS`). `Header`, with `account-selector`, renders on every route (`app.vue:558`); `createSecondAccount` selects the new account.
- `useFeeEstimation`'s `schedule` sets `isEstimating` before its debounce (`apps/extension/src/composables/internal/fee-estimation-engine.ts:122`): once the read lands and an estimate follows, the row stays a bar.
- `failure` survives an identity change until the new run commits (`useFeeSnapshot.ts:108-115`) or throws (`:200`). A same-identity refresh of a committed identity keeps `snapshotCommitted` true, so `readPending` stays false for it. An identity whose init threw never committed, so a props refresh (`updateAccount` replacing the object, `app.store.ts:431`) re-runs it as pending.

## Collisions

- tx-record-1 hooks the fee strategies' build sites; this lane touches none. ui-polish-4 and copy-polish-1 touch other screens.
- E2E: no spec asserts "Fee estimated after simulation", "Refused before sending" or the cap on the Send path (grep over `apps/extension/tests/e2e`). `send-fee-privacy` reads `fee-init-degraded` once the read has failed, which this lane keeps.
- Closed known limits searched (`fee card`): #753 and #754 concern app windows and verdicts, not these states.
