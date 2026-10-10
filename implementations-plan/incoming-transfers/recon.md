# incoming-transfers — recon

Read at `origin/dev` `ac259a7`. Two Explore agents (sonnet) plus the driver's own read of
`apps/extension/src/wallet/services/incoming-transfer/service.ts` (2,451 lines), `repository.ts`,
`arrival-state.ts`, the epoch matrices in `service.scenarios.test.ts`, the four detail surfaces and
the Aztec 6.0.0-rc.1 sources under `node_modules/.bun/`. No open PR touches this lane's files
(`gh pr list --state open` was empty on 2026-10-09).

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Lifecycle fence against a purge during an await | `serviceEpoch` + `bumpServiceEpoch` (`service.ts:228-278`), captured before the first await and re-read before each write; the lock ticket `isCurrent` from `serviceLock.withLock`; `repo.setTrust(…, fence)` reads its fence after the stored read and before the write (`repository.ts:106-127`) | reuse as is (#144 passes the fence the receipt path omits) |
| Accepting a contract's hidden history | `setTrustAllow`: trust write → `listByContract` → `moveArrivalFloorLocked` (floor covers `maxBlock(hidden)` and the tip) → `unhideLocked` (`service.ts:635-676`); the floor rule is reused by `onTokenAdded` and `trustRestoredTokens` | adapt: the floor rule becomes a pure helper; the Allow's trust row and un-hides go out in one synchronous dispatch (#92) |
| Profile incarnation fence | `ProfileDeletionState.capture/isCurrent` (`profile/profile-deletion-state.ts`), used as `kept` (`service.ts:620-633`, `:682-697`) | reuse as is |
| Popup-connect hook into the service | `replayPendingPrompts` (`service.ts:1521-1561`), called once per popup lifetime per (profile, network, account) by `useIncomingTrustPrompts.ts:120-133`, and when visibility turns on (`:150-161`); it prompts only for an account that already has a stored record (`:1541-1544`) | reuse as is (a refused Allow relies on it to prompt again) |
| Own-send dedupe | `collectOutgoingTxHashes`, `collectInflightTxHashes` (`service.ts:2349-2389`); the public arm's short-circuit `isDedupedPublicEvent` (`:2113-2120`) | adapt: one helper for both arms (#227) |
| Receipt epoch matrices (call order pins) | `instrumentReceipt`, `runReceipt`, `bumpedAfter`, `NOTE_HEAD`/`PUB_HEAD` (`service.scenarios.test.ts:5554-5800`) | reuse as is; re-pin rows |
| Fake service graph for composition | `svc()` (`wallet/services/composition-harness.ts`), `FakeBrowserApi`, `dapp-session/service.composition.test.ts` as the shape; the service takes an injected `PublicEventReader` (ctor arg 4) | reuse as is (#92 composition test) |
| Chain tip reads | `readTip` → `reader.getLatestBlockNumber` → `node.getBlockNumber()` (`service.ts:825-833`, `aztec-runtime/src/pxe/service.ts:686-688`); `getPublicScanTips` = `getBlockData("checkpointed")` + `getBlockNumber("finalized")` (`aztec-runtime/src/pxe/public-events.ts:~392-405`) | adapt (arc 2): `getPublicScanTips` reads one `getChainTips()` and also returns the proposed tip; one read per network serves every target |
| New-block notification | none: the node client is poll-only. Searched `subscribe`, `onBlock`, `getL2Tips` in `apps/extension/src`, `packages/*/src` and the stdlib `aztec-node.ts` interface. `node.getChainTips()` is already called once, by `auth-registry/service.ts:408` (found by the Opus audit; the first sweep missed it) | adapt (arc 2): rebuild `getPublicScanTips` on one `getChainTips()` call and share it per network |
| Scheduler lifecycle | `hydrateSchedulers` → `buildSchedulerDescriptors` → `commitSchedulers` (born-epoch intervals, immediate first poll) (`service.ts:931-1067`) | adapt (arc 2): intervals stay per target, installed in one loop so they tick in phase; each reads one shared per-network tips result |
| Public reorg reconciliation | `beginReconciliation` / `stepReconciliation` / `finishReconciliation`, `orphanedByReconciliation` (`service.ts:1882-2052`, `:2399-2409`) | reuse as is; arc 2's tip-first scan keeps its window above the finalized floor |
| Note re-check against the PXE | `NoteService.getNotesRaw` → `pxe.debug.getNotes` with `status: ACTIVE` hardcoded (`note/service.ts:95-176`); `NoteStatus` has `ACTIVE` and `ACTIVE_OR_NULLIFIED` only | adapt (#140): a status parameter; nothing else |
| PXE reorg behaviour | `BlockSynchronizer` handles `chain-pruned` by `rollbackToBlock` on every store, notes included (`pxe/src/block_synchronizer/block_synchronizer.ts:115-150`, `storage/note_store/note_store.ts:~281`); `debug.getNotes` runs a synced operation and `ensureContractSynced` before reading (`pxe/src/debug/pxe_debug_utils.ts:64-88`) | reuse (#140 reads PXE truth; no hook exists) |
| Explorer URLs | one builder, `getTransactionExplorerUrl` → `${base}/tx-effects/${hash}` (`wallet/constants/explorers.ts:51-60`); one explorer (`aztecscan`), testnet only; `null` = None (`settings/privacy.vue:44,148`) | adapt (arc 3): sibling builders; paths are unverified (no block, contract or account route is known anywhere in the repo: searched `aztecscan`, `tx-effects`, `/blocks/`, `/contracts/`, `/address` over `apps/*/src`, `implementations-plan`, `apps/landing`) |
| Row-change event to the popup | `onIncomingTransferUpdated` declared (`service.ts:180`, `client.ts:24`) and consumed in place by `useIncomingTransfers.ts:139-143,164`; the service never emits it (grep of `emit("onIncomingTransferUpdated"`) | reuse (#139 emits it) |
| Open received page follows a delete | `onReceiptDeleted` + `deletedIds` (`received/[id].vue:84-93`) | adapt (#139): same for Updated |
| Lazy fee fetch | `getReceiptFee` pinned to the record's own endpoint, epoch-guarded cache keyed by block hash (`service.ts:522-556`); called on mount (`received/[id].vue:168-178`) | reuse; only the trigger moves to a tap (#141) |
| Tap-to-fetch control on a detail page | none: the fee is the only lazy fetch and it runs on mount. Searched `tap`, `click`, `lazy`, `reveal` in `received/[id].vue` and the detail pages | build new (arc 3): a button in the fee row |

## Claims checked

| Issue | Claim | Holds? |
|---|---|---|
| #92 | A displaced Allow returns at `:668` and leaves the rest hidden; the floor skips a contract with no row (`:866`) | Yes: `unhideLocked` returns false at `if (!kept()) return false` (`:668`); `moveArrivalFloorLocked` returns true with no write when no trust row exists (`:881`). Displacement needs the lock watchdog (`MAX_HOLD_MS` = 5 min, `packages/wallet-core/src/utils/lock.ts:5`) |
| #140 | A note the PXE prunes leaves its row | Yes: the note arm only inserts and back-fills (`:1400-1444`). **But "decision-free" does not hold**: the fix deletes or rewrites rows a person can see, and `getNotesRaw` reads `ACTIVE` only, so "absent" also means "spent" |
| #144 | The trust write's await at `:605-616` is unfenced | In part. `_setTrustStateLocked` (`:605-616`) passes its fence into `repo.setTrust`, which reads it before the write. The unfenced write is the receipt path's `repo.setTrust(…, "pending")` at `:1459`, with its emits after it; the cited pins (N6, N7, P6, P7 at `service.scenarios.test.ts:5670-5766`) are that path's |
| #227 | The arms differ in dedupe order, call counts and record timing | Yes. Note arm: tokens → outgoing → inflight → record, both sets read for every note including existing ones (four reads per existing note per tick). Public arm: tokens → record → outgoing → (stop on hit) → inflight. Record timing: the note arm reads the block timestamp inside the section; the event carries it |
| #143 | Every watched token is polled every 30 s | Yes (`DEFAULT_POLL_INTERVAL_MS`, `:54`; one interval per (network, account) and per (network, contract)). The 4,000 calls per hour figure is not re-measured here |
| P4-04 | "One query per block for every watched token where the node allows it" | **The node does not allow it for logs**: `getPublicLogsByTags` takes one `contractAddress` (stdlib `logs/logs_query.ts`); one `getChainTips()` read can serve every token's tip check |
| #138 | The first public scan starts at block 0 (`:1651`) | Yes: `freshCursor(0)`; `onAccountAdded` resets to `existing?.startBlock ?? 0` (`:396`) |
| #142 | Explorer links exist only for transactions | Yes. Detail rows that exist: Block (tx and received pages), From/To address cards (tx and received; tap copies), journal "To" (text). **No detail page shows a token contract row** |
| #97 | The trust prompt has no contract link | Yes (`IncomingTrustPopup.vue:147-176`) |
| #141 | The received page fetches a public receipt's fee on open | Yes (`received/[id].vue:168-178`). The fetch already goes to the record's configured node (`:536-539`), so C12-fetch C would close it as is |
| #139 | A re-mined surviving transfer never reaches open screens | Yes: the reconcile rewrite (`:2089-2098`) emits nothing; the received page listens to Deleted only |

## Facts the plan rests on

- Aztec 6.0.0-rc.1. `PublicLogsQuery`: one contract, 1 to 100 tags, `fromBlock` inclusive, `toBlock` exclusive, `referenceBlock` pins a fork; `MAX_LOGS_PER_TAG` = 20; no "more" flag (the wallet infers it from a full page).
- `getChainTips(): L2Tips` returns proposed `{number, hash}` and checkpointed, proven and finalized `{block: {number, hash}, checkpoint}` in one call. The node has no push API.
- `getL1Constants().slotDuration` gives the slot length at runtime; no block time is written anywhere in the repo.
- `NoteDao` carries no nullified flag; `ACTIVE_OR_NULLIFIED` returns both kinds unmarked.
- A same tx re-included after a prune keeps its note hash, so its `siloedNullifier` and record id are unchanged (inference from the nonce derivation; the plan does not depend on it beyond #140's "moved row" branch).
- The network e2e has a reorg lever (`NULO_E2E_REORG=1`, `tests/e2e/network/stale-anchor-recovery.test.ts`) that leaves the local network unable to mine, so a reorg proof in e2e must run alone and last.
- Network e2e files touching this lane: `incoming-transfers`, `incoming-public-transfers`, `incoming-arrival`, `token-add-auto-trust`, `receive-unregistered`, `account-switch-isolation`, `account-switch-live-session`, `profile-switch-sweeps-transfer`, `public-events-capability`, `cold-wake-discovery`. The poll gate (`src/e2e/incoming-poll-gate.ts`) parks note scans only. No smoke spec covers the received, tx or journal detail pages beyond `rows.test.ts`.

## Collision and dedup risks

- A second timer beside `startPollScheduler` would bypass the born-epoch fence. Arc 2 adds no timer: the per-target intervals stay and share one tips read.
- `persistCursorLocked` is the only cursor writer; arc 2 keeps it so.
- A note reconciler that calls `getNotesRaw` again on every tick doubles the PXE work the note arm already does; #140 reads the second status only when a recent row is missing from the first read.
- Composition tests: an incoming-transfer test that needs note or event state from the PXE breaks D4. Only the trust and storage paths (#92, #144) qualify; the scan arms (#227) stay in unit scenarios.
- Lane overlaps: `received/[id].vue` and `journal/[id].vue` are edited later by send-queue-activity arc 3 and forms-and-contacts arc 3 (reservation R1: this lane first). Nothing else in wave 1 touches `incoming-transfer/`.
