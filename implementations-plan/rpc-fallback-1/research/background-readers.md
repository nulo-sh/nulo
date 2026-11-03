<!-- Research subagent (Explore, sonnet) for the rpc-fallback-1 plan, at dev e5cffd82d plus origin/rpc-proxy-1-a1 (PR #1622). Persisted verbatim by the planner. -->

# Background readers: node source, error policy and failover hazards

Worktree `rpc-fallback-1`, base `e5cffd82d`. Read-only. `network-endpoints.ts` was never opened, and every grep excluded it.

Paths are shortened. `W` means `apps/extension/src/wallet/services`, `P` means `packages/aztec-runtime/src`.

## 0. How a node is reached today

There are four ways a node object is obtained. Failover has to cover all of them.

| Route | Code | Retries | Bound to |
|---|---|---|---|
| A. PXE in the offscreen document (`PxeServiceClient`, then `PxeService.withPxeRead` or `withPxeWrite`) | `P/pxe/service.ts:900`, `:993` | `makeFetchWithTimeout`: 60 s per request (`P/utils/fetch.ts:19`) plus the SDK backoff `[1,2,3]` s, stopped by `retryWhile` (`fetch.ts:117-146`) | The `ChainRuntime`'s `rpcUrl`, fixed at creation (`P/pxe/chain-runtime.ts:181`, `:235`) |
| B. SW-side `NetworkService.getNode(chainId)` | `W/network/service.ts:965-979` | Same retrying fetch | Cached per chainId, built from the primary endpoint. Dropped on `setPrimaryEndpoint` (`:914`). |
| C. Pinned by URL: `getNodeForUrl` and `getSingleAttemptNodeForUrl` | `W/network/service.ts:1013`, `:1029`, `:1038` | `getNodeForUrl` retries. The single-attempt variant makes one attempt with a 60 s timeout. | One URL. `reportEndpointFailure` evicts after 3 reports (`:1043`). |
| D. Probes: `probeNodeStatus`, `probeIdentityOnce`, `readPublicStorageOnce` | `W/network/service.ts:949`, `:1069`, `:984` | One attempt | The primary |

- **Endpoint rebind in route A.** `networkInfoFrom` returns only the primary endpoint's URL (`W/network/spec.ts:103-107`). `peekMatching` misses when the URL differs (`chain-runtime.ts:352-355`). `ensure` then disposes the whole runtime, including the encrypted OPFS store, under the chain write guard (`chain-runtime.ts:373-380`). So any switch of `rpcUrl` costs a full PXE runtime rebuild. A request-level switch inside one runtime is not possible today.
- **Existing hook.** `Network` already has `endpoints[]` and `primaryEndpointId`. `setPrimaryEndpoint` is the only switch path (`W/network/service.ts:900-918`, and `:1157` for reset).
- **Absence claim: no failover exists.** `grep -rniE "failover|fail over|fallback endpoint|next endpoint|endpoint health"` over `apps/extension/src` and `packages` (excluding the secret file, node_modules and tests) returned nothing.
- **Absence claim: nothing reacts to a primary change.** `onPrimaryEndpointChanged` is emitted at `service.ts:916` and `:1157`. The only other hits are its declaration in `spec.ts:371` and the UI-facing `client.ts:30`. No service subscribes to it. That includes the incoming service, whose `tipsReads`, `noteScannedAt` and `publicScannedAt` maps (`incoming-transfer/service.ts:277-281`) are not cleared on a switch.

## 1. Reader table

| Reader | File | Node source | Cadence | Error policy | Block pinning | Volume |
|---|---|---|---|---|---|---|
| Shared tips feed | `W/incoming-transfer/service.ts:1299-1317` (`sharedTips`), `P/pxe/public-events.ts:411-425` (`getPublicScanTips`) | Route A. Reader built at `service.ts:412-434`; `getScanTips` goes to the PXE's `node.getChainTips()`. | Once per network per tick, shared for 5 s (`SHARED_TIPS_TTL_MS`, `:70`) | A failure resolves `undefined`, is logged at debug, and a failed read is shared only while in flight (`:1304-1314`). Note targets then scan ungated and the public tick is `failed`. | One `getChainTips` call returns `{checkpointed hash, finalized, proposed hash}` together. The tips are internally consistent, and out-of-order tips throw (`public-events.ts:416`). | About 120 per hour per network at the 30 s tick, if one stream is active |
| Public-event scan (forward, back-fill, reconcile) | `service.ts:1262-1285` (`scanAndRecord`), `:2032-2217`, `:2340-2480`; `public-event-indexer.ts:84-135` | Route A. Pages go through `getPublicTokenTransferEvents`, then `node.getBlockNumber("checkpointed")` and `getPublicLogsByTags` (`public-events.ts:251-275`). | `setInterval` 30 s per (network, contract) (`service.ts:62`, `:1191`). Gated on the checkpoint hash (`:1272`). Every 4th tick is forced (`FALLBACK_EVERY_TICKS`, `:66`), and so is the immediate first poll. Up to 5 pages per tick (`DEFAULT_MAX_PAGES_PER_SCAN`, `public-event-indexer.ts:55`). | Per-contract episodes with backoff (30 s doubling, capped at 5 min) and a stalled flag after 2 or more failures over more than 10 min (`scan-health.ts:15-18`, `:28-43`). Episodes persist in `storage.session` (`scan-episodes.ts:5`, `:57-176`). The stall is announced once via `onIncomingSyncHealthChanged` (`service.ts:1325-1332`). A quarantined chain is skipped (`:1497`). Retry clears the backoff gate (`scan-episodes.ts:124`, `service.ts:1353`). | Yes. Every page carries `referenceBlock = checkpointedBlockHash` and `toBlock` = the checkpoint number (`service.ts:2208-2214`). The class gate is checked at `finalized` and at the exact checkpoint hash (`public-events.ts:441-458`). | One tips read, then per tick: class status (2 `getContract`), 1 ancestry probe, up to 5 pages. Each page costs 2 node calls. |
| Note scan (incoming private notes) | `service.ts:1520-1660` (`poll`, `scanNoteTarget`, `scanContract`) | Route A via `NoteService.getNotesRaw`, then `PxeService.getNotes` (`W/note/service.ts:112-130`, `P/pxe/service.ts:442-448`). `getNotes` runs under `withPxeWrite`, and the PXE syncs from its bound node first. | `setInterval` 30 s per (network, account). Gated on `proposedBlockHash` (`service.ts:1560-1563`). Every 4th tick is forced. | **No episode, backoff or stall.** `getNotesRaw` failure logs a warn and returns false (`:1596-1600`). A scan failure sets `reached=false`, so no tip mark is stored and the next 30 s tick retries (`:1566-1573`). | See section 3. The bracket reads the synced block hash on both sides (`:1698-1712`). | Per tick: one `getNotes` per watched contract, which triggers a PXE sync, plus `getBlockTimestamp` per distinct block with a new note (`:1620-1631`), plus the bracket when rows are unsettled. |
| Note bracket, reconciliation | `service.ts:1660-1760`; `incoming-transfer/note-reconcile.ts:48-75` | Route A (`getSyncedBlockHeader`, `getNotes`) | Within the note scan | A failed read returns `undefined`, logs at debug, and the target does not count as reached (`:1696-1717`) | The bracket is trusted only if both synced hashes equal `tips.proposedBlockHash` (`note-reconcile.ts:48-51`) | 2 header reads plus 1 `getNotes` per scan |
| Block-timestamp reads | `W/note/service.ts:75-84`, `P/pxe/service.ts:634-647` | Route A (`node.getBlock`) | Per scan, cached per block | Returns `undefined` on failure. A settle or move then reports not reached (`service.ts:1743`, `:1754`). | By block number | 1 per new block per scan |
| Arrival-floor tip | `service.ts:915-990` (`getArrivalState`, `readTip`); `incoming-transfer/arrival-state.ts` | Popup path: `getChainTipOnce`, which is route C (`getSingleAttemptNodeForUrl` on the primary URL, `W/network/service.ts:1038-1041`), checked for quarantine first (`service.ts:429-433`). Add-account or token path: `getLatestBlockNumber`, route A. | On demand | `readTip` returns `undefined` and logs at debug. State is returned with `sinceBlock: null` and nothing is written. | None. The floor is a symbolic latest proposed block. | On demand |
| Receipt fee | `service.ts:641-690` | Route C: `getNodeForUrl(record's own rpcUrl)` (`:656-662`) | On demand and cached | Soft null. The code comment at `:659` says a network with no primary endpoint fails soft rather than falling back to the global node. | `blockHash` compared to the record's (`:670`) | |
| Token balances | `W/token-balance/balance-job-queue.ts`, `balance-projector.ts` | Two paths in one batch. The fast path uses route B (`get-view-simulation-deps.ts:35` via `getNode`) and the slow path uses route A (`:36`, `pxe.simulateTx`). Both are called from `batched-view-simulation.ts` (anchor at `:182`, `getNodeInfo` at `:203`). | **Event-driven, not polled.** Triggers: token added, account added, tx updated (`token-balance/service.ts:497-534`, `:614-630`), user refresh, and the incoming outbox (`requestBalanceRefresh`, `:255-274`). A 1 s ticker only drains the queue (`balance-job-queue.ts:37`, `:99`). | Only `PxeStaleAnchorError` is transient (`balance-projector.ts:157-161`): 2 retries, 5 s apart, in memory only (`balance-job-queue.ts:42-43`, `:287-310`). Everything else persists `syncFailure` on the row (`:205-228`). | The anchor is the PXE's synced header, else `node.getBlock("latest")` (`P`-side `block-header-anchor.ts:1-30`). The file itself says the two arms are not atomically pinned. | Max 12 balances per batch (`BALANCE_BATCH_SIZE`) |
| Token metadata and seeder | `W/token/service.ts:865-900`, `W/token/seeder.ts` | Route B plus route A, same `batchedViewSimulation` | On add, with continuation timers (`seeder.ts:28`, `:215`) | Seeder delays are 15 s and 60 s (`SEED_CONTINUATION_DELAYS_MS`) | None | |
| Pending-tx polling | `W/transaction/service.ts:570-600` (`updateTx`), `transaction/inclusion.ts`, `operation-journal/send-check.ts` | Route C: `getNodeForUrl(tx.submittedEndpointUrl)`. Legacy rows with no recorded URL use `getNode` (`:582-587`). | Send-check tick 5 s (`send-check.ts:20`). Dropped recheck 15 s, finality read 60 s (`transaction/service.ts:62`, `inclusion.ts:13`). | `reportEndpointFailure` on a receipt error (`:593-596`). DROPPED is debounced because it can mean this replica has never seen the hash (`:563-575`). | Pinned by URL, not by hash. Finality is proven against the finalized archive (`inclusion.ts:26-37`). | Not my module; shown for contrast |
| Auth-registry proven tip | `W/auth-registry/service.ts:194-200`, `:504` | Route C, the operation's own URL | Polling for `proven.block.number >= target` | | | |
| Price | `W/price/service.ts:39-44`, `:390` | **No node.** HTTP `fetch` to a price source with an abort timeout. Alarm every 3 min (`PRICE_REFRESH_PERIOD_MINUTES`, `:32`), backoff 30 s up to the quote TTL. | Alarm | | | |
| Token list | `W/token-list/service.ts:21-26`, `:236` | **No node.** HTTP, 10 s timeout, daily plus jitter, failure backoff `[5 m, 30 m, 2 h, 6 h, 1 d]` | Alarm | | | |
| `stale-network` | `W/stale-network/classify.ts:44` | **No node.** The file states it is "deterministic and offline: reads storage and the build's seeds, never a node." | | | | |
| `network-reset` | `W/network-reset/service.ts:416` | Route D: `probeIdentityOnce(primary.rpcUrl, ..., IDENTITY_PROBE_MS)`, one attempt | On a user action | | | |
| `account-state` | `W/account-state/service.ts:100-135`, `:240-260` | Route D: `probeNodeStatus` (5 s, `SENDER_PROBE_TIMEOUT_MS` at `:39`) and `getNodeStatus` | On demand (backup or contacts export) | A probe that throws reads as not Active, and that network is skipped (`:124-127`, `:254-260`). A warn says the backup omits that network. | | |
| PXE block stream and sync | `P/pxe/service.ts`, PXE internals | Route A. The PXE's own L2BlockStream syncs from its bound node. | Whenever a PXE op runs; no timer of ours drives it. | `getNotes` swallows a failed sync (`lessons.md:44`). `withStaleAnchorRetry` handles stale anchors (below). | The PXE's anchor header | |

Absence claim, no `setInterval` or `setTimeout` loop outside this table. I grepped `getBlockNumber|getL2Tips|getProvenBlockNumber|getBlockHeader|setInterval|setTimeout|getNode\b` under `apps/extension/src` (no tests, secret file excluded). The wallet-side hits are `runtime.ts` (heartbeat), `execution/*`, `token/seeder.ts`, `operation-journal/send-check.ts`, `window-manager`, `logger/store.ts`, `incoming-transfer/service.ts`, `network/service.ts`, `price`, `token-list`, `transaction`, `auth-registry` and `wallet-sdk/verify-admission.ts`. The rest are UI composables (`apps/extension/src/composables/*`). I did not exhaustively read the execution and fee-estimation hits. Those are the send path, owned by another module.

`getL2Tips` and `getProvenBlockNumber` have no uses in the SW services. The tip feeds use `getChainTips` (`public-events.ts:412`, `auth-registry/service.ts:504`) and `getBlockNumber` (`P/pxe/service.ts:677`, `network/service.ts:1040`).

### Call volume (#143)

- The code behind #143 is `DEFAULT_POLL_INTERVAL_MS = 30_000` (`incoming-transfer/service.ts:62`). The recon at `implementations-plan/archive/incoming-transfers/recon.md:40` says the 4,000 per hour figure "is not re-measured here".
- Owner decision (issue #143): poll when a new block arrives, plus a fallback tick every 2 min.
- The code now matches. The 30 s `setInterval` stays, and a tick scans only if the tip hash moved. Every 4th tick (every 2 min, 30 per hour per target) is forced (`:64-66`, `:1191-1194`, `:1272`, `:1561`).
- Streams: one scheduler per (network, account) for notes and one per (network, contract) for public events (`:257`, `:265`).
- Idle chain cost per hour is 120 `getChainTips` per network, plus about 30 forced scans per target.
- A scan runs only on a tip change, so cost then scales with block rate times the number of streams. The repo gives no Aztec block-time figure, so I did not compute one.
- I found no code or doc that restates a post-change hourly total.

## 2. Closed known limits mapped to code

- **#1554** (alternate-page failures keep a reconciliation restarting with no stall shown)
  - The `progress` outcome ends the episode (`scan-episodes.ts:102-105`, `isScanSuccess` at `scan-health.ts:24`).
  - `stepReconciliation`'s catch restages on fresh tips with `progress: null, seen: []` (`service.ts:2410-2422`, `:2370-2380`) and returns `failed`.
  - **Failover relevance:** this is the most likely symptom of a flapping primary. A primary that answers one page and refuses the next keeps the scan restarting and never shows the stall. A failover that alternates endpoints between pages could create the same pattern by accident.
- **#784** (a hanging tip request holds the Activity feed's first paint for up to 60 s)
  - It is route C with a single attempt: `getChainTipOnce`, then `readChainTip`, then `getSingleAttemptNodeForUrl` with `DEFAULT_REQUEST_TIMEOUT_MS` (`W/network/service.ts:1029-1041`).
  - A deadline was rejected as "a timeout over a wait". A health probe with a short timeout would shorten this. A hanging endpoint stays pending rather than refusing.
- **#551** (a reset against a node that never answers waits one 60 s timeout per node call)
  - `stopRetries` stops retries but not the first attempt (`chain-runtime.ts:388-405`).
  - **Failover relevance:** the same 60 s first attempt applies to every request to a blackholed primary. A failover needs a shorter time-to-detect than `DEFAULT_REQUEST_TIMEOUT_MS`, or the first requests after a failure each burn 60 s.
- **#658** (a view simulation can reach the next profile's node when the profile switches mid-call)
  - `getNode` caches by chainId only and reads the active profile on a miss (`network/service.ts:965-979`).
  - The recorded fix when reopened is a `getNodeFor(network)` built from the captured row's primary URL.
  - **Failover relevance:** this is a precedent for "a node chosen at call time versus a node captured with the row". Any failover selection layer must keep profile isolation. A per-network health state must be keyed by profile and network so one profile's probe does not choose another's endpoint.
- **#143** (4,000 calls per unlocked hour): see the volume paragraph in section 1. Health probes add to this volume.

## 3. Block pinning and invariants

**Public scan (hash-pinned).**
- Tips are read once. Every page of the tick carries `referenceBlock = checkpointedBlockHash` and `toBlock = checkpointedBlockNumber`.
- A reorg that drops the reference makes `getPublicLogsByTags` throw. That is the reorg signal, "propagates UNCHANGED" (`public-event-indexer.ts:11-12`, `public-events.ts:219-221`).
- Persisted anchors survive ticks and SW restarts:
  - `cursor.lastSyncedBlockHash`
  - `pendingPage.upperHash`
  - `reconciling.upperBoundHash`
  - The next tick runs an ancestry probe of the stored hash against the new tip: `getBlockHashMembershipWitness(reference, ancestor)` (`service.ts:2200-2205`, `public-events.ts:329-330`). The probe is skipped when the two hashes are equal (`public-events.ts:242`).
- **A lagging or different node on a later page is handled as a reorg, not as an error.**
  - If the node does not know the pinned hash, the page throws. `handleScanFailure` then calls `beginReconciliation` whenever `cursor.lastSyncedBlockHash` exists. The comment says the throw "means the anchor was reorged out — or a transient node error; rewind + rescan is idempotent either way" (`service.ts:2170-2182`).
  - The reconciliation window is `[lastScanFinalized+1 .. checkpointed]` (`:2356-2370`). That is a rescan from the finalized floor, and it is expensive.
  - If the node's checkpoint is below the pinned `toBlock`, the page is DROPPED: "do NOT silently truncate ... would EOF early and let `finishReconciliation` DELETE the canonical records in the unscanned tail" (`public-events.ts:283-303`).
  - A dropped page leaves the marker untouched and returns `no-progress` (`service.ts:2432-2440`).
  - Orphans are deleted only after `finishReconciliation` completes with a non-dropped, full-window scan (`:2459-2480`).
- Invariants:
  - **Fail closed on a short answer.** Never advance, and never delete, on a dropped page.
  - **One fork per scan.** `seen` is deduped by height, pinned to one fork (`:2435-2441`).
  - **Order and bound validation.** Pages must be strictly increasing and no later than the checkpoint, otherwise they are dropped (`public-events.ts:252-258`, `:309`).
  - **Hostile-node model.** A compromised node is in the threat model. The class gate is checked against the exact pinned hash, not a symbolic tag, to avoid a TOCTOU (`public-events.ts:427-440`). This matches the lesson at `implementations-plan/lessons.md:40`.

**Note scan (hash-verified bracket).**
- `isVerifiedBracket` trusts a PXE read only when the synced header hash before and after equals the SW-read `proposedBlockHash` (`note-reconcile.ts:48-51`). The lesson is at `lessons.md:44`.
- Settle, strike and delete need a verified bracket (`note-reconcile.ts:66-74`). A row missing above the synced block waits.
- A delete needs two strikes (`:62-65`).
- **Cross-node behavior.** If the SW read tips from node X and the PXE is synced to node Y, the bracket is unverified. The result is `wait, reached:false`, which is safe but stalls settle and delete.
  - The tips read and the PXE's sync use the same primary and the same rebind rule, so a failover that flips both together stays coherent. If only one flips, brackets go unverified until the tips agree.

**Stale-anchor handling.**
- `isStaleAnchorMessage` documents the case "nodes behind one endpoint disagreeing on the tip" (`P/pxe/stale-anchor.ts:11-24`).
- It matches three substrings:
  - "possibly a reorg has occurred"
  - "not-yet-synchronized PXE"
  - "RewindableRegister write originates behind"
- Four chain-reading PXE ops resync once and retry once (`withStaleAnchorRetry`, `stale-anchor.ts:38-65`, applied at `P/pxe/service.ts:494`). A second stale failure becomes `PxeStaleAnchorError`.
- The balance queue treats that error as the only transient class (`balance-projector.ts:157-161`).
- A failover onto a lagging replica will most often surface here. It gets one in-op retry, then 2 queue retries 5 s apart, then a persisted `syncFailure` on the row.

**Other invariants.**
- Epoch fences: a lock, purge or profile switch bumps `serviceEpoch`, and schedulers born in an older epoch bail (`service.ts:1184-1198`, `:1262`).
- Single-flight per stream: `publicPolling` and `polling` sets (`:1243-1244`, `:1530-1532`).
- A quarantined chain is never scanned (`:1497`).
- Receipt-fee fetches stay on the record's own endpoint (`:656-662`). Pending-tx polling is pinned to `submittedEndpointUrl`.
- Pinning by URL is therefore a design goal elsewhere in the wallet. A failover layer must not silently move these pinned reads off their URL. For tx-polling, a pinned dead endpoint would need an explicit alternative path.

## 4. Pain points for a failover design

1. **A hash pinned on A is replayed on B.**
   - If B lags, the pinned `referenceBlock` or `upperBoundHash` is unknown to B, so the page throws.
   - The scan reads that as a reorg and stages a reconciliation: a rescan from the finalized floor, with `seen` and `progress` cleared (`:2410-2422`).
   - Without failback damping this wastes RPC calls and can repeat on each flip.
   - Safe design options:
     - Switch the endpoint only at a tick boundary, and take fresh tips from the new endpoint (via a new `tipsReads` entry) before using any pinned hash.
     - Or check "does B know H" with `getBlockHashMembershipWitness` or a `getBlock(hash)` before accepting B for a scan that already pinned H.
2. **One scan can span two endpoints.**
   - Tips, the class gate, the ancestry probe and 5 pages are separate PXE RPCs (`withPxeRead`) that each resolve `networkInfoFrom(getNetwork())` at call time (`service.ts:412-434`).
   - A primary change mid-tick is picked up on the very next page.
   - Failover should therefore be a per-tick snapshot or a "switch only between ticks" rule.
3. **Rebinding the PXE runtime is heavy.** The registry disposes and reopens the OPFS store under the chain write guard (`chain-runtime.ts:373-380`). That blocks behind a long proof, and the rebind path waits behind the same lock as `proveTx`. Flapping would thrash this. Hysteresis is needed.
4. **Two node objects per read path.** Balance fast-path reads use route B (SW node). The slow path uses route A (offscreen). A failover has to flip both together, or the arms disagree. The `block-header-anchor.ts` header already says they are not atomic.
5. **Note scan has no episode or stall.** A dead primary just retries every 30 s and is never surfaced. `scan-episodes` only exists for the public arm.
6. **Time-to-detect.**
   - A blackholed endpoint costs 60 s per request plus backoff of 1, 2 and 3 s (`fetch.ts:19`, `:117-146`).
   - Refused or 4xx and 5xx errors fail fast, and 4xx stops retrying immediately.
   - A health probe should use a one-shot short timeout, like route D.
7. **No hook to learn about a switch.** No service subscribes to `onPrimaryEndpointChanged`. After a switch, `tipsReads` may serve a ≤5 s old read from the old endpoint, and `noteScannedAt` and `publicScannedAt` still hold old tip hashes. The next fresh tips differ, so the targets re-run, but a same-hash tip would skip.
8. **Persisted anchors outlive the endpoint.** The cursor, pending page and reconcile marker survive restarts and endpoint changes (`scan-episodes.ts:57-176` for the episode half). They are tied to a chain fork, not to an endpoint, which is right, but they are validated against whichever endpoint answers next.
9. **Stall masking (#1554).** Alternating endpoints can produce the alternating-page pattern. Failover health should count failures per endpoint, not through the scan episode alone.
10. **Arrival floors are per-node tip reads** and are "never lowered" (`service.ts:910-990`, `arrival-state.ts:5-9`). A lagging endpoint gives a lower tip. A leading one gives a higher one, which could mute a receipt just above the old floor.
11. **Seeder, price and token-list are node-independent or have their own backoff.** They need no failover wiring, apart from the seeder's view reads, which use routes A and B.

## 5. Scheduler, heartbeat and task infrastructure

- **Heartbeat.**
  - `HEARTBEAT_INTERVAL_MS = 10_000` (`apps/extension/src/wallet/runtime.ts:143`).
  - It runs `clock.setInterval` writing `nulo:liveness` to `storage.session` (`:308-317`).
  - Its purpose is to keep the MV3 service worker alive for cross-SW calls. On Firefox it also keeps the PXE alive, because the PXE page is a frame of the background page that is suspended after 30 s without extension activity (`:309-312`).
  - The first fire is delayed by one interval, so an initial write is done immediately (`:735-748`).
  - `stop()` clears the heartbeat, reaper, send check and GC (`:201-215`).
  - A health-probe timer could use this same `clock` and `clock.setInterval` pattern. It would be killed with the SW, so any state worth keeping must persist. The scan episodes already do this in `storage.session`.
- **Alarms** wake a closed-popup SW:
  - the journal reaper every 1 min (`reaper.ts:56`)
  - the journal GC every 60 min (`gc.ts:43`)
  - price every 3 min (`price/service.ts:32`)
  - token list (an alarm; its period is not shown above)
  - Dispatch for price and token list goes through one shim (`wallet/index.ts:95-110`).
  - The reaper alarm re-arms the token seeder at boot (`runtime.ts:727-731`).
  - Incoming schedulers are plain `setInterval`s (`service.ts:1191`), so they run only while the SW is alive. They are rebuilt by `hydrateSchedulers` at startup (`:477`, `:485`).
  - Failure episodes persist for this reason: "an alarm-woken worker resumes the streak instead of starting over" (`scan-episodes.ts:50-52`).
  - The shortest alarm period in this code is 1 min.
- **`services/task/`** is not a scheduler.
  - `TaskService` is an in-memory registry of user-visible task records (`task/service.ts:24-247`, content kinds in `task/spec.ts:45-90`).
  - Retention is 60 min (`task/spec.ts:7`).
  - The balance queue uses it to mint records (`BalanceUpdateContent`, `balance-job-queue.ts:236-247`).
  - A health probe would not belong there.
- **Ticker port.** `ClockTickerAdapter` serializes and coalesces ticks and contains errors (`apps/extension/src/core/adapters/clock-ticker-adapter.ts:1-60`). Its header says an alarm-based adapter is not swap-compatible below 30 s cadence. The balance queue is its only consumer in services (`balance-job-queue.ts:99`).

## 6. Tests and fakes

**Fakes**
- `apps/extension/src/core/testing/fake-node-factory.ts:1-80`
  - Per-URL overrides via `setOverrides` and a template via `setTemplate`.
  - Unstubbed methods throw loudly.
  - Records `created` and `singleAttempt`.
  - Its header warns that it bypasses the JSON-RPC proxy's error marshalling.
  - It can express "endpoint A throws, B answers", and it records which URLs were dialed.
  - It cannot model timeouts (`timeoutMs` is not enforced).
  - Used by 6 test files.
- `makePublicReader` at `incoming-transfer/service.scenarios.test.ts:2623-2670`
  - A scriptable `PublicEventReader`.
  - Mutable `state.tips`, a `responses` queue accepting `Error`, a function or a page, and counters `tipsCalls`, `classCalls` and `fetchArgs`.
  - Injected through the `publicReader` option (`service.ts:162`, `:329`, `:412`).
  - This is the best seam for a failover test, since the reader is the whole transport.
- `FakeBrowserApi` for episode storage, and fake timers for `Date` only (`service.scenarios.test.ts:4624-4627`).
- `P/pxe/chain-runtime.test.ts` (rebind behaviour: `peekMatching` at `:360`, `ensure` rebinds on endpoint switch at `:372`).

**Failure-injecting tests (in `service.scenarios.test.ts` unless noted)**
- `:4629` node down for an hour: stall after 10 min, announced once, recovery announced once.
- `:4656` tips answer but every log page refused: restarts once per tick, backs off, stalls, and Retry runs one tick.
- `:4706` a tick inside the backoff window does not touch the node.
- `:4745` and `:4762` a worker restart mid-episode keeps the streak and the gate.
- `:3936` tips unavailable: failed, cursor untouched.
- `:4076` an anchored throw begins reconciliation, and a transient one recovers.
- `:4091` an unanchored throw does nothing to reconcile.
- `:4100` a reorged pending page hands over to a reconciliation.
- `:2974`, `:3055`, `:3230` reorg reconciliation, a mid-reconcile reorg restaging, and an intra-scan wrong-fork page.
- `:6611-6870` block-gated ticks and liveness:
  - the production 30 s cadence (`:6619`)
  - one tips read per tick (`:6628`)
  - ungated when the tips read fails (`:6653`)
  - catch-up after a gap (`:6787`)
  - reorg (`:6812`)
  - retry (`:6846`)
  - the 4th-tick fallback (`:6880`)
- `:6211` a failed block-time read is made once per block per scan.
- `:5175` and `:5245` failed tip read for arrivals.
- `incoming-transfer/public-event-indexer.test.ts:193` and `:222` a reorg throw propagates through `scan` and `probe`.
- `incoming-transfer/scan-episodes.test.ts` (backoff, restart and storage failure), `scan-health.test.ts`.
- `incoming-transfer/note-reconcile.test.ts` (bracket decisions, `verified` and `unverified` tables).
- `P/pxe/public-events.test.ts:284` (pinned `toBlock` below checkpoint), `:292` (pinned `toBlock` above the node's checkpoint is deferred as dropped), `:309`, `:449` (class gate, malicious at checkpoint), `:458`.
- `P/pxe/stale-anchor.test.ts:53-118` (the stale classifier and one-retry rule), `P/pxe/service.test.ts:155`.
- `W/token-balance/balance-job-queue.test.ts:693`, `:724`, `:748`, `:763`, `:774`, `:786` (transient retry budget and supersession).
- `P/utils/fetch.pins.test.ts` (timeout, 4xx stops at one attempt, 5xx retries).

**Gaps relevant to failover**
- No test varies the endpoint between ticks. `makePublicReader` ignores `networkId`, and the fake factory is not wired into the incoming service tests.
- No test covers a hash pinned on one node and replayed to another.

**Absence trail.** The reads for this section were `rg`/`grep` over `apps/extension/src` and `packages` for the patterns above, plus reading the files cited. I did not search `tests/e2e` for failover scenarios. I did not read `service.composition.test.ts` beyond its name list. I did not read the execution and fee-estimation hits from the timer grep. I did not trace `wallet-sdk/verify-admission.ts`, `window-manager`, or the `composables/*` UI pollers in detail.
