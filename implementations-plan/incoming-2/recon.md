# incoming-2 recon

Two Sonnet explorers, read-only, at `51ea220b1`, plus the planner's own reads. Paths are relative to `apps/extension/src/` unless they start at the repo root.

## #1429: the public-scan arm (`wallet/services/incoming-transfer/service.ts`)

- **The loop.** `stepReconciliation`'s catch (`:2404-2424`) logs at `warn`, reads `indexer.getTips` (not `sharedTips`), and on an answer awaits `beginReconciliation` (`:2414`), which persists a marker (`:2374`) and awaits `stepReconciliation` again (`:2375`). A page read that rejects every time never leaves the catch. Entries: `handleScanFailure` (`:2178`), the reorged pending page (`:2078`), and a resumed marker (`:2072`).
- **What the loop blocks.** `scanAndRecord` reaches `episodes.record` (`:1285`) only after `scanPublicContract` returns (`:1274`). `pollPublic`'s `publicPolling` flag (`:1240`, cleared at `:1257`) makes every other caller, `retryIncomingScan` (`:1353-1362`) included, return at once.
- **Health.** `scan-episodes.ts`: a `failed` or `no-progress` outcome opens or extends an episode with a 30 s doubling backoff capped at 5 min; `scan-health.ts:41-43`: stalled after two failures over ten minutes. `announceHealth` (`:1325-1332`) logs the single `warn` of a stall, `{ networkId }` only. ARCHITECTURE.md:103 states one `ScanOutcome` per tick, backoff on failure, "any anchored throw still begins a reconciliation immediately", and "transient scan failures log at `debug`".
- **Where a person sees it.** `composables/useIncomingSyncHealth.ts` feeds `popup/components/modules/general/RecentActivityView.vue:836-845`: "Older incoming transfers may be missing · Retry" (`incoming-sync-stalled`, `incoming-sync-retry`). No e2e reads them.
- **Scalar signatures (F-10).** `PublicTarget` (`:113`) is taken by `forwardScanOnce`, `commitForwardPass`, `backfillAfter`, `backfillOnce`, `backfillWindowPages`. Positional `profileId, networkId, contract`: `resolvePublicClassGate` (`:1989`), `persistCursorLocked` (`:2017`, nine callers), `scanPublicContract` (`:2038`), `beginReconciliation` (`:2353`), `stepReconciliation` (`:2381`), `finishReconciliation` (`:2467`), `deleteOrphansLocked` (`:2514`), `commitPublicEvent` (`:2558`). `handleScanFailure` (`:2170`) and `commitAddressedEvents` (`:2536`) restate the type inline.
- **Logs on the path.** `:2407` `warn` with the contract in a template string; `:2431` (dropped page) the same form; `:2180` and `:1276` are `debug` with `{ contract }`.
- **Tests.** `service.scenarios.test.ts`: `makePublicReader` (`:2623`, a FIFO of page answers; an `Error` entry rejects, an empty queue serves an empty page), `bootPublic` (`:2689`), `seedCursor` (`:2964`), `anchored`, `scanPublic` (`:2669`). The health suite (`:4553`) has `poll`, `failTwice`, `nodeDown`, fake `Date`. No test makes every page read reject while tips answer; `:4050` recovers only because the queue empties. `service.composition.test.ts` has no reconciliation case.
- **#750.** Closed on P47-05: split the public arm when "a PR schedules a substantial public-arm change and #540 has landed".

## #1431: the received page (`popup/pages/received/[id].vue`)

- **Reuse.** `popup/app.vue:677-678` renders `<component :is="Component">` with no key; the page loads only in `onMounted` (`:188-218`); no popup page watches `route.params`. The arrival snack's View (`composables/useArrivals.ts:366`) pushes `/popup/received/<id>` from any route but Home, History, the auth entries and windows, so from a receipt too.
- **Updates.** `onReceiptUpdated` (`:101-110`) drops an update unless it names `route.params.id` and the shown record; one that races the first load is held (`heldUpdate`) and wins over the load's snapshot; `deletedIds` tombstones a delete that races it.
- **Failure.** `:194` turns a rejection into `null`, so `loaded` (`:199`) shows "RECEIPT NOT FOUND" (`:407-410`, no testid). `:204` turns a failed network read into `recordChainId = null`, which skips the token read and hides the amount and the explorer links.
- **Client** (`packages/extension-messaging/src/background/client.ts`). A port that drops after Ready rejects every pending request with `Client disconnected`, fires `onDisconnected` and reconnects; one that closes before Ready retries after 250 ms and rejects nothing. `onConnected` fires on every Ready, the first included, a task after the waiting requests post. Requests time out after 60 s (`RpcTimeoutError`). Each client has its own port.
- **Patterns.** `composables/useConfigRead.ts`: reads again on every connect after the first, and on the first when the newest read failed; only the newest read lands (`createRunFence`, `composables/runFence.ts`). `pages/journal/journal-detail-scope.ts:39-50` reloads on every connect, the first included; a failed reload keeps what the page shows.
- **Service.** `getIncomingTransferById` (`wallet/services/incoming-transfer/service.ts:627-635`) resolves `undefined` for an unknown id or another profile's record; it rejects on a storage or profile-read error.
- **Tests.** `[id].test.ts` mocks `vue-router` with a plain object (`:36`), so a param change cannot be driven; `makeIncoming` (`:79-88`) has no `onConnected`. No test covers a rejected read, a reconnect or "not found".
- **E2E.** Smoke: `tests/e2e/received-fee-privacy.test.ts` seeds a public receipt (`helpers/activity-seeds.ts`), opens it and counts fee lookups (a second lookup on open would fail it); `type-roles.test.ts:765` sweeps the page. Network: `incoming-arrival.test.ts` opens a receipt through the snack's View; `incoming-public-transfers.test.ts`, `incoming-transfers.test.ts`.

## Reuse map

| Need | Reuse |
|---|---|
| Bound the restart | the existing marker field, scheduler, episodes and backoff; no new state |
| Show the stall | `useIncomingSyncHealth` and the Activity line, unchanged |
| Newest read wins | `createRunFence` |
| Reconnect read rule | the rule `useConfigRead` states |
| Captures | the history-1 method: scratch smoke specs under the lane's cache dir, one Chrome run on base and one on head |
