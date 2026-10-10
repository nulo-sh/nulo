# send-queue-activity — recon

Read at `dev` 9574a9d (643c0c9 plus #248). Three read-only Explore agents (sonnet): a reuse sweep over the whole repository, a mapper for send sequencing, a mapper for the activity feed and send outcomes. The driver read `send-sequencer.ts`, `transfer-sequence-keys.ts`, `transfer-executor.ts`, `dapp-send-executor.ts`, `execution-lane.ts`, `service.ts` and the PXE package itself. Paths are under `apps/extension/src` unless they start with `packages/`, `scripts/`, `.github/` or `implementations-plan/`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Order a send behind earlier sends of one account until inclusion | `wallet/services/execution/send-sequencer.ts` (`enter`, `waitTurn`, `externalSent`, `settled`, `SUBMITTED_HOLD_MS`, `MAX_WAIT_MS`) | adapt: an opaque ticket (`*` key) for dApp sends |
| Keys a send shares with others | `execution/transfer-sequence-keys.ts` (`transferSequenceKeys`, `recordedTxKeys`, `keysIntersect`) | adapt: `*` key; `recordedTxKeys` reads a persisted fee spender |
| Wait for dependencies outside the execution slot, re-check after the grant | `execution/transfer-executor.ts:286-306` (`takeTurn`) | reuse the shape on the dApp path |
| Slot for a send that already owns its controller | `execution/execution-lane.ts:378-401` (`acquireTransferSlot`, popup bucket) | adapt: take an origin key, so a dApp send re-queues in its own bucket |
| Heartbeat for a waiting record | `execution-lane.ts:436-450` (`beginQueuedWait`, `endQueuedWait`) | reuse |
| The fee contract a transfer may spend through | `transfer-executor.ts:145-150` (`feeSpender`) | reuse; persist its result on the `Tx` row |
| Tx row schema | `wallet/services/transaction/spec.ts:119-198` (`Tx`, `TxSchema`), `transaction/service.ts` `AddTransactionInput` | adapt: optional `feeSpender` |
| The block a predecessor landed in | `Tx.block` (`{hash, number}`), written at `transaction/service.ts:~499` | reuse |
| The PXE's chain tip | `packages/aztec-runtime/src/pxe/client.ts:410-414` `getLatestBlockNumber` (proposed tip of the PXE runtime's own node); used by `incoming-transfer/service.ts:372-373` | reuse; no runtime change |
| PXE anchor height | `pxe/client.ts:380` `getSyncedBlockHeader` (reads the anchor store, does not sync) | rejected: the PXE syncs on each operation (`operationQueue.runSynced`, Aztec 6.0.0-rc.1 `pxe.js:577`), so the lag is the node's, not the anchor's |
| A wait that is cancelled by the record's controller | `send-sequencer.ts` `waitTurn(signal)`, `abortableSleep` | reuse |
| Composition harness | `execution/service.composition.test.ts` (`makeHarness`, reuse fast path, `svc()` stubs), `wallet/services/composition-harness.ts`, `tests/COMPOSITION-TESTS.md` | adapt |
| Mining hold in network e2e | `tests/e2e/fixtures/mining-hold.ts`; `tests/e2e/network/same-token-concurrent-sends.test.ts` | reuse |
| Background restart in e2e | the driver's `stopBackground` (`tests/e2e/fixtures/browser/`) | reuse |
| Scope predicate for journal records | four near-copies: `RecentActivityView.vue:274-289`, `TokensView.vue:66-71`, `utils/activity-rows.ts:89-100` (History), `pages/journal/journal-detail-scope.ts:25-32`; `utils/activity-rows.ts` `isForeignProfile`, `incomingInScope` | adapt: one exported `journalRecordInScope` in `utils/activity-rows.ts` (arc 3) |
| Known-or-unknown decimals | `utils/token-amount.ts:22` `knownDecimals`; callers today: `received/[id].vue:101`, `utils/tx-amount.ts:44` | reuse (arc 3) |
| A third toast kind | `packages/design/src/composables/toast.ts:7,56` (two kinds, any other coerced to error), `packages/design/src/ui/ToastManagerBase.vue:132,163` | adapt only for option A of P10-01 (arc 3) |
| Snack inset | `composables/snackInset.ts` (`vSnackFooter`), six registrants; the awaiting card is not one | reuse (arc 3, P10-04) |
| Tx hash row and explorer link | `wallet/constants/explorers.ts` `getTransactionExplorerUrl`; markup duplicated at `pages/tx/[id].vue:262-276` and `pages/received/[id].vue:280-295` | adapt: extract a `TxHashRow` before a third copy (arc 3, P10-03) |
| Finality re-check | `wallet/services/operation-journal/send-check.ts` (fenced tick, generation, backoff; watches failed rows only, stops at inclusion) | adapt (arc 3, #109) |
| A transaction's expiry | none. Searched `expirationTimestamp|expiration_timestamp|includeByTimestamp|include_by_timestamp` over `apps`, `packages`, `scripts` | build new (arc 3, #108) |
| Chain time | `pxe/service.ts:646` `getBlockTimestamp(network, n)`; `execution/helpers/block-header-anchor.ts:23` | reuse (arc 3) |
| Keyboard helpers | `composables/usePopupEntity.ts` (`isRepeatOrComposing`, `refuseRepeatEnter`, `isPopupSubmitKey`); roving tablist `components/composite/AuthMethodTabs.vue`; empty-mounted polite region `FeeSettingsCard.vue:927`, `windows/verify/index.vue:268`; aria-hidden duplicate title `pages/activity.vue:178`, `settings/index.vue:118` | reuse (arc 5) |
| Listbox | none. Searched `listbox|combobox|activedescendant|role="(option|menu|menuitem|radio|radiogroup)"` | build new, modelled on `AuthMethodTabs.vue` (arc 5) |
| Contrast assertions | `packages/design/src/theme-contrast.ts` `contrast()`; tables in `theme-contrast.test.ts` (status text at `:194`, graphics at `:174`); tokens hand-written in `packages/design/src/base.css` (light `:186-188`); `fill--*` generated from `token-contract.ts` | reuse (arc 3, #243) |
| Text that fits its box | `utils/hero-fit.ts` `fitHero`, `utils/hero-ruler.ts`; `AmountCard.vue:155-163` `fieldScale` | reuse (arc 2, P9-01 A) |
| Copy pins | literal asserts beside the copy module (`transfer-failure-copy.test.ts`, `journal-state.test.ts`); `utils/copy-dash-ban.test.ts` scans everything | follow |
| Rule for promoting an advisory CI lane | CLAUDE.md § Staged-rollout switches (the Firefox network row's 30-nightly wording); `scripts/ci-cd/behavior-gating.test.ts:620-645` keeps chaos out of `status` and `publish-nightly` | reuse (arc 4) |

## Issue claims checked against the tree

- **#218 holds for its own direction.** A dApp send never consults the sequencer: its only use is `noteSent` → `externalSent` after submission (`dapp-send-executor.ts:180,601,712,882`; `service.ts:456-457`). It waits only on the slot, which every send releases at submit (`transfer-executor.ts:224`, `dapp-send-executor.ts:276`). The other direction is already ordered: a Send-page send waits behind a submitted dApp tx through `externalSent` (pinned by `same-token-concurrent-sends.test.ts:365`). dApp after dApp is unordered past submit (`concurrent-sendtx-confirm.test.ts:22-31`). The issue's `send-sequencer.ts:53,120-127` names the dApp-to-Send-page half, which exists. The "per-execution pending-nullifier cache" is upstream PXE behaviour and is not checked here.
- **#219 (a) holds.** `recordTransfer` records one transfer-only call (`transfer-executor.ts:244-281`); `Tx.feePaymentMethod` is an enum with no address (`transaction/spec.ts:182-185`). After a restart only pending rows survive (`transaction/service.ts:142-145`), and `recordedTxKeys` gives no `fpc:` key for them (`transfer-sequence-keys.ts:85`).
- **#219 (b) holds as a possibility, narrower than stated.** The receipt comes from the node the tx was sent through (`transaction/service.ts:451-468`); the PXE runtime has its own node (`chain-runtime.ts:179`). The PXE syncs to its node's proposed tip before every simulate or prove (`runSynced`; Nulo sets no `syncChainTip`, default `proposed`). So the lag is between nodes, and only on a network with more than one endpoint. Nothing guards it today.
- **#219 (c) holds.** A row's first stage is decided once (`transfer-executor.ts:187,400`); the FSM has no `pending → queued` edge (`packages/wallet-core/src/jobs/fsm.ts:43-44`). A Send-page send that found nothing in its way at creation then waits in `takeTurn` reading "Preparing..." (`utils/card-subtitle.ts:28-34`). No e2e covers it. Fixing it changes what the card reads: owner ask OA-1.
- **#152 holds, narrower.** Transactions and awaiting entries already have per-scope slices (`stores/activity.store.ts:2-12`). Journal, task and cancel state stay flat in `RecentActivityView.vue` (now `:141-142, :213, :266`). The journal events (`:512-528`) ingest with no scope check; only the render filter `journalRecordInScope` (`:274-289`) and the synchronous scope watcher (`:669-682`) contain them. No test drives a foreign record through `onJournalAdded`.
- **#90 items 3-6** still hold at the cited sites; item 6's notice is now `send.vue:746`.
- **#103 holds** at six sites plus one not listed (`RecentActivityView.vue:197`, `executingAmount`). `BalanceView.vue:67`, `TokenCard.vue:33`, `useArrivals.ts:115`, `TransactionIncomingCard.vue:39` check validity but ignore `hasDecimals`.
- **#108, #112 hold.** "Unconfirmed" is written only after 30 minutes (`send-check.ts:142`, `DROPPED_RESURRECTION_WINDOW_MS`). The transport does not tell a first-attempt refusal from a retried one (`packages/aztec-runtime/src/utils/fetch.ts:86,111-122`; `execution-coordinator.ts:302-309`). Nothing reads a tx's expiry.
- **#109 holds.** `MINED` includes Proposed and Checkpointed (`send-check.ts:20`); the transaction worker stops polling a row once it leaves Pending. The cited `incoming-transfer/service.ts:2399` drifted with #248; the incoming side's finality handling is that lane's.
- **#110 holds** for items 9, 10, 13; item 14 (the snack over Cancel) is unverified: the awaiting card's actions are absolutely placed and not a registered footer, so a covering snack is plausible.
- **#122 holds**; the characterization test is now `RecentActivityView.test.ts:962-983`.
- **#209 holds**, and the four predicates differ in more ways than the issue says (TokensView hides a stamped record when no network is active; the detail page is strict on legacy records).
- **#213 holds**; it is a deliberate characterization (`RecentActivityView.vue:346-353`, test `~:850`).
- **#217**: of the "three ordering choices", one is a string (`WAIT_LIMIT_MESSAGE`, `transfer-executor.ts:118`), one is a constant with no copy (`SUBMITTED_HOLD_MS`, the 10-minute unordered fallback), and the third (what a failed public send says about private balance) is not in the tree as copy. Searched `public send|public spend|spent private|private balance` over `apps/extension/src`, `apps/extension/tests` and the archived plan.
- **#220 holds** (`nightly.yml` `network-e2e-chaos` `:248-262`, Firefox twin `:369-381`).
- **#242, #243** hold at their cited lines.

## Conventions to match

- Ordering decisions live in the sequencer; executors only take tickets and wait outside the slot (`hd-same-token-concurrent-sends`: "The dependency wait comes before the slot, never while holding it").
- A dApp send's slot is FIFO and its session baton releases at mutex enqueue (`execution-lane.ts:17-19, 307-322`); nothing here may move that point.
- Pre-production: a new optional field on a stored row needs no migration (CLAUDE.md § Persisted-storage shape changes).
- Composition tests: real service graph, dumb fakes, no build, no simulate semantics (`COMPOSITION-TESTS.md` D1-D6); the dApp build is out of reach (D3), so a composition case ends at "the build was or was not entered".

## Collision risks

- `dapp-ingress-grants` arc 2 edits `dapp-send-executor.ts:120` (`markJournal` title), `execution/service.ts:449`, `execution-lane.ts:538`, `queued-journal.ts`, `background.ts`, `journal-state.ts`. Arc 1 here edits `dapp-send-executor.ts` `runInSlot` and `execution-lane.ts` slot methods, different hunks. Its arc 1 (not yet merged) edits `queued-journal.ts` and `background.ts`, which arc 1 here does not touch.
- `fees-and-sponsors` edits `send.vue`, `dapp-send-executor.ts`, `execution/service.ts`. Rebase after whichever lands first.
- `incoming-transfers` arc 1 (#248) has landed; `receiptFence` and `commitAddressedEvents` are its seams; #109 here must not change them.
- Branch `type-roles-arc3` edits `RecentActivityView.vue`, its test, `TransactionAwaitingCard.vue` and `send.vue` (found by `git diff --name-only`, not by entering the worktree).
- Reservations: R1 `journal/[id].vue`, R2 `usePrices.ts` and `BalanceView.vue`, R5 `RecentActivityView.vue` and `activity.vue` (lanes-v2 `holds.reservations`).
