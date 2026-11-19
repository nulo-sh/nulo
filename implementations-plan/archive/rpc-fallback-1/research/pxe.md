<!-- Research subagent (Explore, sonnet) for the rpc-fallback-1 plan, at dev e5cffd82d plus origin/rpc-proxy-1-a1 (PR #1622). Persisted verbatim by the planner. -->

# Module report: the PXE's node usage (rpc-fallback-1)

Paths are relative to the worktree root. `PXE/` means `node_modules/.bun/@aztec-labs+pxe@6.0.0+7565bf829364be07/node_modules/@aztec-labs/pxe/dest`. `STD/` means `node_modules/.bun/@aztec-labs+stdlib@6.0.0+c1edb6f0433b9698/node_modules/@aztec-labs/stdlib/dest`. I never opened the endpoint-constants file.

## Answer first: is the PXE's synced state per node URL or per chain?

**It is per chain, per profile. It is never keyed by node URL.**

- The store directory is `pxe/${profileId}/${chainId}` (`packages/aztec-runtime/src/pxe/chain-coordinates.ts:26-29`). That file calls the form PERSISTED.
- The registry key is `${profileId}:${chainId}` (`chain-coordinates.ts:17-19`).
- The in-flight-open map in `opfs-store.ts:82` is keyed by that dir. The comment at `opfs-store.ts:80` says "URL-independent".
- The on-disk stamp is `DatabaseVersion(schemaVersion 16, rollupAddress)` (`opfs-store.ts:197`). It is a chain identity (the rollup address), not an endpoint identity.
- `rpcUrl` appears only as an attribute of the in-memory `ChainRuntime` (`chain-runtime.ts:107`) and in the registry's rebind check (`chain-runtime.ts:376`).

Persisted state, all reusable across endpoints of the same chain:
- Anchor header: `AnchorBlockStore` singleton `header` (`PXE/storage/anchor_block_store/anchor_block_store.js:10,18-27`).
- Block-stream tips: `L2TipsKVStore(store,'pxe',…)` holds tips, checkpoints and per-height block hashes (`PXE/storage/open_pxe_stores.js:26`; `@aztec-labs/kv-store/stores/l2_tips_store.js:13-25`).
- Notes, with `l2BlockNumber`.
- Private events.
- Facts.
- Capsules.
- Sender and recipient tagging indexes: `highestFinalizedIndex`, `highestAgedIndex`, pending ranges.
- Keys, addresses, contracts.

In-memory state only, lost on a rebuild:
- The hash-pinned read cache (`PXE/node/caching_aztec_node.js:16-98`).
- The contract-sync "done" cache (`ContractSyncService.wipe()`, `PXE/block_synchronizer/block_synchronizer.js:142`).

## 1. How the PXE gets its node, and what a primary change does today

**Construction path**
- `ProductionPxeFactory.createChainRuntime(network, storeKey, retries)` (`chain-runtime.ts:172`) calls `nodeFactory.createNode(network.rpcUrl, retries)` (`:181`).
- The adapter wraps `createAztecNodeClient(rpcUrl, {fetch: makeFetchWithTimeout(undefined, options)})` (`adapters/aztec-node-factory-adapter.ts:69-75`). That is the one production `createAztecNodeClient` call site.
- Then, in order:
  - `assertNodeServesChain(chainId, await node.getNodeInfo())` (`:191`, skipped for chain 0).
  - `node.getL1ContractAddresses()` (`:192`).
  - `openChainStore` (`:193`).
  - `createPXE(node, config, {proverOrOptions, simulator, store})` (`:270`, or `:234` in proverless mode).
- `createPXE` itself calls `getNodeInfo` (`PXE/entrypoints/client/bundle/utils.js:26`).
- `PXE.create` then calls `getNodeInfo` again (`PXE/pxe.js:103`) and `getBlock(BlockNumber.ZERO)` (`:110`).
- It registers the protocol contracts and the three preloaded contracts (`:151`, `:197-221`).

**What the runtime is keyed by**
- `ChainRuntimeRegistry.runtimes` is keyed `(profileId, chainId)` (`chain-runtime.ts:330,337-339`).
- `ChainRuntime` holds `{chainId, node, pxe, rpcUrl, store}` (`:103-112`).
- `node` is a public readonly field. Besides handing it to `createPXE`, the service uses that same raw client for node-only reads:
  - `getContractInstance` (`service.ts:287,310`).
  - `getBlockTimestamp` (`:634-641`).
  - Public-event and scan-tip reads (`:665-686`).
  - `getBlockNumber` (`:677`).
- The PXE internally wraps the node in `withCache(withRecording(node))` (`PXE/pxe.js:116`).

**What a primary change does**
- There is no push. Nothing outside the network service subscribes to `onNetworkUpdated` or `onPrimaryEndpointChanged`.
  - Trail: `rg "onNetwork|onPrimaryEndpointChanged"` over `apps` and `packages`, non-test. Hits are only `network/spec.ts:363-371`, `network/service.ts:219-223` and its emit sites, and `network/client.ts:26-30`.
  - Also checked `PxeServiceClient` (`apps/extension/src/wallet/services/pxe/client.ts`) and `aztec-runtime/src/pxe/client.ts`. Neither subscribes.
- The new URL travels in the next request. `networkInfoFrom` (`network/spec.ts:103-107`) puts the primary's `rpcUrl` into `NetworkInfo` on every call.
- The offscreen rebinds lazily, with a read path and a write path:
  - **Read path** (`service.ts:900-967`):
    - `registry.peekMatching(network)` (`:925`) returns undefined on a URL mismatch (`chain-runtime.ts:352-355`).
    - The read is released, then `chainGuard.write(...)` runs `registry.ensure(network, storeKey)` (`service.ts:956`).
    - `ensure` finds `existing.rpcUrl !== network.rpcUrl`, awaits `existing.dispose()`, deletes the entry, and builds a new runtime (`chain-runtime.ts:372-385`).
  - **Write path:** `withPxeWrite` calls `ensure` directly under the write guard (`service.ts:1014`).
- `dispose()` runs `pxe.stop()`, which stops the operation queue and the synchronizer and closes the db (`PXE/pxe.js:965-969`). Then it runs `store.close()`, which releases the SAH-pool lock (`chain-runtime.ts:128-139`).
- **There is no node swap without a rebuild.** `ChainRuntime.node` and `rpcUrl` are readonly. `createPXE` hands the node to about seven internal services, which all hold the wrapped reference.
  - The only exit is `pxe.stop()` plus a fresh `createPXE`.
  - Trail: grep for `setNode`, `swap`, `rebind` in `chain-runtime.ts` and `service.ts`. Only `ensure`'s dispose-and-recreate exists.
- Tests pin this behaviour:
  - `packages/aztec-runtime/src/pxe/chain-runtime.test.ts:372` ("ensure rebinds on endpoint switch").
  - `apps/extension/src/wallet/services/pxe/chain-runtime.test.ts:88`.

**Cost of a rebuild.** The store directory is the same, so nothing resyncs from scratch. The cost is:
- `pxe.stop()` drains its operation queue, then closes the db. `ensure` runs under the chain WRITE guard, so a rebind waits for an in-flight `proveTx` (`service.ts:993-1026`).
- `store.close()`, then `openChainStore`:
  - A new OPFS SQLite worker, bounded at 30 s (`opfs-store.ts:49,122-129`).
  - An open that times out is quarantined as `ChainStoreWedgedError`, recoverable only by restarting the offscreen document (`:51-63`).
  - `initStoreVersionStamp` runs against the new node's rollup address.
- 3 to 4 node calls: `getNodeInfo` x3 (factory, `createPXE`, `PXE.create`), `getL1ContractAddresses`, and `getBlock(0)`.
- `registerProtocolContracts` and `registerPreloadedContracts` run again.
- The in-memory read cache and contract-sync cache are lost.
  - The sync cache is wiped on every new anchor anyway (`block_synchronizer.js:142`).
  - So the first op after a rebuild costs roughly one extra anchor change of contract and tag sync.
  - Tag cursors are persisted, so this is not a full rescan.
- Failure modes of a rebuild against the new endpoint:
  - `assertNodeServesChain` throws `Chain identity mismatch` for another chain (`utils/chain-identity.ts:83-93`).
  - `PxeStoreVersionMismatch` (`opfs-store.ts:183,215-221`) refuses a node whose rollup address differs from the stored stamp. It does not wipe.
- Anything proving in flight blocks the whole swap. The rebind also disposes the PXE that a long prove is using, but only after that prove has finished.

**Related lifecycle details**
- `PxeLifecycleCoordinator` (`lifecycle-coordinator.ts:53-79`) is a purge-epoch fence. It stops a pre-purge op from resurrecting a purged chain. It is unrelated to endpoint changes.
- Runtimes survive profile switches (`service.ts:~140-155` comment). Only profile delete or a chain purge disposes them.
- `stopRetries` (`chain-runtime.ts:393-404`) feeds `retryWhile` into the node's fetch.
- Per-op `NetworkInfo` also carries a `pxeGeneration` stamp, added by the client (`client.ts:255-266`).

## 2. Inside `@aztec-labs/pxe` 6.0.0

**Node-identity checks against the store.** There are none inside the PXE.
- `PXE.create` reads `getNodeInfo` only for `realProofs` and a log line (`pxe.js:103,106,155`).
- `createPXE` uses `l1ChainId`, `l1ContractAddresses` and `rollupVersion` only to name the default store (`bundle/utils.js:26-40`). Nulo injects its own `store`, so this path is skipped.
- The only identity checks live in Nulo code:
  - `assertNodeServesChain` (`chain-runtime.ts:191`).
  - The rollup-address stamp (`opfs-store.ts:196-225`).
- Absence trail: grep of `PXE/` for `rollupVersion`, `l1ChainId` and `instanceof` found nothing beyond `pxe.js`, the `entrypoints/*/utils.js` files and `storage/store_identity.js`. `store_identity.js:7-12` covers the default store only, whose name carries `l1ChainId-rollupAddress-vSchema`.
- A different chain with the same rollup address would not be caught by the stamp. That matters only if a custom endpoint were never identity-probed.

**Tips-only sync.** `BlockSynchronizer` builds `L2BlockStream` with `tipsOnly: true` (`PXE/block_synchronizer/block_synchronizer.js:35-41`).
- `syncChainTip` defaults to `'proposed'` (`PXE/config/index.js:27-36`). Nulo does not override it (grep of `syncChainTip|autoSync` in `packages` and `apps` found nothing).
- `autoSync` defaults to true. Every synced op therefore runs `synchronizer.sync()`, then reads the anchor once, then runs (`PXE/operation_queue.js:81-109`).

**The anchor is fixed per op.** `anchorBlockStore.getBlockHeader()` is read once at `operation_queue.js:91`. Every anchored read in that op uses `anchorBlockHeader.toBlockParameter()`, which is `{number, hash}` (`STD/tx/block_header.js:129-134`).

**What happens if the node's tip is BEHIND the stored anchor.** This is the key finding.

1. `L2BlockStream.work` reads `sourceTips = node.getChainTips()` (`STD/block/l2_block_stream/l2_block_stream.js:56`) and the local tips.
2. It walks back from the local proposed height `N` (`:78-108`). At each height it asks the source for its hash via `getBlockData({number})` (`:295-298`), which is a `node.getBlock`.
3. The source answers `undefined` for heights above its own tip `M`. `areBlockHashesEqualAt` returns false (`:272-293`).
   - The "source contradicts itself" abort at `:280-287` only fires for heights `<= sourceProposed`. A lagging node's gap heights are above its tip, so it does not abort.
4. When the walk reaches a height that both sides know, it sees `latestBlockNumber < localTips.proposed.number`. It treats that as a reorg and emits `chain-pruned` (`:109-130`).
   - The local hash history is sparse in tips-only mode (`STD/block/l2_block_stream/l2_tips_store_base.js:49-52`; `recordBlockHashes` comment). The prune target therefore lands at or below `M`, at the nearest witnessed height. It can be over-deep.
5. `BlockSynchronizer` handles `chain-pruned` (`block_synchronizer.js:96-126`):
   - If `anchor <= prune target`, it ignores the event.
   - Otherwise, inside one store transaction, it calls `rollbackToBlock(target)` on every staged store, then sets the anchor to that block's header.
6. What each store's rollback does:
   - `NoteStore` deletes every note and nullifier emission above the target (`PXE/storage/note_store/note_store.js:227-262`).
   - `PrivateEventStore` deletes events above the target (`private_event_store.js:143-165`).
   - `FactStore` retracts retractable facts above the target (`fact_store.js:137-149`).
   - `CapsuleStore` and both tagging stores are no-ops (`capsule_store.js:55`, `recipient_tagging_store.js:44`, `sender_tagging_store.js:53`).
   - So a lagging endpoint makes the PXE forget notes from blocks the real chain still has. The tagging cursors survive, so they re-discover once an up-to-date node answers.
7. Then `chain-proposed` fires with the lagging tip's header (`l2_block_stream.js:138-155`), and the anchor moves to `M`.
8. **`sync()` never throws on any of this.** `work()` catches every error (`:178-183`). Only `AbortError` returns quietly; all others are logged with `log.error`. A failed sync therefore leaves the old anchor in place and the op proceeds. The lessons file records the same thing (`implementations-plan/lessons.md:44`).
9. Cost: one `getBlock({number})` per height from `N` down to the divergence point, so O(gap) requests per sync.

**A node on a different fork** takes the same path. Hashes differ down to the fork point, and the PXE prunes to it.
- If a mismatch is at or below the local finalized tip, the walk stops at the finalized floor (`:96-106`).
- Walking back to block 0 with a mismatch throws "Genesis block hash mismatch" (`:87-95`). The error is swallowed by `work()`.

**An op anchored at `{number, hash}` that the node does not know.** The error depends on how far ahead the anchor is.
- The node's own wait settings are in `STD/config/node-rpc-config.js:53-62`:
  - `rpcUnseenBlockByNumberWaitMs` holds a query anchored exactly one block ahead of the node's tip, defaulting to twice the block duration.
  - `rpcUnseenBlockByHashWaitMs` holds a query with an unknown hash for 3000 ms by default (`:4`).
- After that wait, a still-unknown anchor fails with one of two texts:
  - `Block hash … not found when resolving query … possibly a reorg has occurred`.
  - `Reference block … not found when querying contract … possibly a reorg has occurred`.
- Absence trail: the server package that produces these is not installed client-side. `UPDATE.md:47` records this, and the texts are pinned by `stale-anchor.test.ts:28-31`. `stale-anchor.real.test.ts` exercises them against a reorged sandbox.
- One consequence: a lagging node can add up to about 3 s per unknown-anchor query before it errors.
- `ContractClassService.getCurrentClassId` returns the original class if `node.getContract(addr, anchor)` returns `undefined` (`PXE/contract/contract_class_service.js:30-34`). If a lagging node answered `undefined` instead of throwing, that would be silently wrong. The 6.0.0 node throws, per the stale-anchor strings.
- The cache never stores `undefined` for `getBlock` (`caching_aztec_node.js:33-37`, "PXE only asks for pinned blocks it has already observed, so an undefined answer means the node has not served the block yet"). A lagging node therefore cannot poison the cache.

**Does anything survive a mid-op node switch?**
- Cached answers are content-addressed by block hash, so they are valid on any endpoint that serves the same chain.
- Staged writes: a failed op discards its change set (`operation_queue.js` doc, `PXE/storage/staged_write_coordinator.js`). `service.ts:~478` states "the PXE awaits its job's staged-write abort before rethrowing the op's error, so the retry starts from the store as it was".

## 3. `proveTx` fan-out and node methods by phase

- `PrivateKernelExecutionProver.prefetchUpdatedClassIdHints` (`PXE/private_kernel/private_kernel_execution_prover.js:257-267`) runs `allToCompletion` over every unique contract in the execution tree. Each runs `oracle.getUpdatedClassIdHints`:
  - `getPublicDataWitness(anchor, slot)` (`private_kernel_oracle.js:97`).
  - Then, when the slot exists, `readFromTree` over `getPublicStorageAt(anchor, ContractInstanceRegistry, slot)` (`:105`).
  - The prefetch runs once, before the kernel loop (`:79`).
- Kernel-loop reads, all anchored with `blockHeader.toBlockParameter()`:
  - `getNoteHashMembershipWitness` (`private_kernel_oracle.js:69`).
  - `getNullifierMembershipWitness` (`:72`).
- PXE node methods, grouped by phase.

  **Create:**
  - `getNodeInfo`, `getBlock(0)`.

  **Sync (not anchored):**
  - `getChainTips`, `getBlock({number})`, `getBlock(hash)`, `getBlockData(hash)` (`block_stream_source.js:9-34`; `block_synchronizer.js:63,75,87,113,188`).

  **Simulate and prove, anchored `{number, hash}`:**
  - `findLeavesIndexes` (`contract_function_simulator.js:442-443`; `utility_execution_oracle.js:370`; `PXE/notes/note_service.js:171`).
  - `getNoteHashMembershipWitness`, `getNullifierMembershipWitness`, `getLowNullifierMembershipWitness`, `getPublicDataWitness`, `getBlockHashMembershipWitness` (`utility_execution_oracle.js:154-215`).
  - `getPublicStorageAt` (`:416`).
  - `getContract(addr, anchor)` (`contract_class_service.js:30`).
  - `getPrivateLogsByTags` and `getPublicLogsByTags`, with `referenceBlock` and `toBlock` (`caching_aztec_node.js:59-84`).

  **Not anchored, during simulate and prove:**
  - `getBlock(blockHash)` (`utility_execution_oracle.js:238,876`).
  - `simulatePublicCalls` (`pxe.js:283`).
  - `isValidTx` (`pxe.js:366`).

  **Tx-status reads:**
  - `getTxReceipt`, unanchored (`sender_sync/utils/resolve_pending_txs.js:36`; `classify_pending_txs.js:29`; `messages/tx_resolver_service.js:18`; `utility_execution_oracle.js:830`).

- `#queryWithBlockHashNotAfterAnchor` (`utility_execution_oracle.js:867-887`) compares a contract-supplied block hash against the anchor. It needs `getBlock(hash)` to know the contract's block and checks that its height is not above the anchor's.
- PXE calls only the `AztecNode` interface for all of the above.

## 4. Is the `AztecNode` interface the only coupling?

**Yes.** No client-only property is read anywhere, so an object implementing `AztecNode` could replace the client.
- Absence trail: grep of `PXE/` for `instanceof`, `.url`, `rpcUrl` and `nodeUrl` found only `PXE/config/index.js:54`. That is a CLI config mapping and is not used with an injected node.
- Grep of `packages/aztec-runtime/src` and `apps/extension/src/wallet/services/pxe` for `instanceof`, `.url` and `rpcUrl`, minus error types and `network.rpcUrl`, found only the adapter's URL parsing.
- `ChainRuntime.rpcUrl` is a registry bookkeeping string and is never read from the node.
- `withRecording` and `withCache` are `Proxy` wrappers using `Reflect.get(...)` and `value.apply(target,args)` (`benchmarked_node.js:~10-40`, `caching_aztec_node.js:86-97`). Any object with the right method set works.
- Two things the wrapper needs:
  - `startRecording`, which the recording proxy supplies itself (`caching_aztec_node.js:18-21`).
  - `wipeCache`, which the cache proxy supplies.
- The existing precedent is the test fake: `FakeNodeFactory` in `apps/extension/src/core/testing/fake-node-factory.ts:26-80` builds a `Proxy`-based `AztecNode` that throws on unstubbed methods. It also warns that fakes bypass the JSON-RPC proxy's param validation and error marshalling (`:9-16`).
- The node client coalesces one tick's calls into batches of up to `maxBatchSize`, with `batchWindowMS` 0 (`STD/interfaces/aztec-node.js:392-405`). `maxBatchSize` is what PR #1622 sets per URL (see below). A per-call router will split what a single client would batch if it picks different clients within a tick.

### PR #1622 (`origin/rpc-proxy-1-a1`) changes
These are the only changes the PR makes to these files.
- **`chain-runtime.ts`:** `ProductionPxeFactory`'s constructor takes a required `nodeFactory: NodeFactory`. The `AztecNodeFactoryAdapter` import and the `?? new AztecNodeFactoryAdapter()` default are removed.
- **`service.ts`:** `PxeService`'s constructor takes a required `factory: PxeFactory`. The `ProductionPxeFactory` default and its import are removed.
- **`offscreen/entry.ts`:** `PxeOffscreenDeps.factory` becomes required.
- **`apps/extension/src/offscreen/index.ts`:** builds `createWalletNodeFactory()` and passes it to all three `ProductionPxeFactory` constructions instead of `undefined`.
- **`AztecNodeFactoryAdapter` (not in your list, but relevant):** gets a required `maxBatchSizeFor(rpcUrl)` constructor argument and passes it as `maxBatchSize` to every client it builds.
- Net effect: the PXE's node is still one client built from one `rpcUrl`. A failover design merges into the same files, so expect conflicts in the factory constructors and `index.ts` if it also edits them.

## 5. The wallet's existing invariant about anchor vs node tip

- **Lesson** (`implementations-plan/lessons.md:44`):
  - PXE `getNotes` syncs first and swallows a failed sync, so it can answer from a stale anchor.
  - Trust a read only when the synced hash before and after it is the node's tip.
  - Cause: `L2BlockStream.work` swallows errors (`l2_block_stream.js:178-183`), as shown in section 2 above.
- **Enforcement:** `readNoteBracket` in `apps/extension/src/wallet/services/incoming-transfer/service.ts:1688-1715`.
  - It brackets `getNotesRaw` between two `getSyncedBlock` reads.
  - `isVerifiedBracket(before, after, tips.proposedBlockHash)` in `note-reconcile.ts:54-57` requires both synced hashes to equal the node's `proposed` tip hash.
  - Settling, striking and deleting need a verified bracket (`note-reconcile.ts:59-65`).
  - Tips come from `PxeService.getPublicScanTips`, which reads `node.getChainTips()` on the PXE runtime's node (`public-events.ts:411-428`; `service.ts:672`).
- **Interaction with a lagging endpoint:**
  - A node behind the PXE gives `proposedBlockHash != synced hash`, so the bracket is unverified and note rows are not deleted. That is safe.
  - After the prune in section 2, the synced hash equals the lagging tip, so `isVerifiedBracket` can pass against the lagging node's own tip.
  - The rolled-back notes then look "vanished" at a verified bracket. The strike-then-delete rule (two scans) is the only guard left.
  - So the existing invariant protects against a stale PXE, not against a stale node that the PXE has already pruned to.
- **Pinned-hash reads** (`implementations-plan/lessons.md:40`): blocks above the proven tip can be pruned, so reads pin to one hash.
  - `resolveTokenClassStatus` pins the checkpointed hash and gates with `getContract(addr, BlockHash)` (`public-events.ts:~430-465`).
  - `getPublicScanTips` reads all tips from one `getChainTips` reply and rejects out-of-order tips (`:411-428`).
  - A router that sent the tips read and the pinned-hash reads to different endpoints would break the one-instant guarantee.
- **Stale-anchor retry** (`packages/aztec-runtime/src/pxe/stale-anchor.ts`):
  - `isStaleAnchorMessage` matches three substrings (`:98-104`): `possibly a reorg has occurred`, `not-yet-synchronized PXE`, `RewindableRegister write originates behind`.
  - `withStaleAnchorRetry` runs the op, then on a stale error runs `pxe.sync()` and retries the op once (`:117-144`). A second stale error becomes `PxeStaleAnchorError`.
  - It is used by `proveTx`, `simulateTx`, `executeUtility` and `getPrivateEvents` (`service.ts:~478-494`, "four chain-reading ops").
  - A lagging endpoint's "not found" errors match, so one retry happens. The retry re-runs the whole op, which for `proveTx` is a second full prove.
  - `sync()` is again the swallowing one, so on a node that is still behind, the retry fails with the same stale text and ends as `PxeStaleAnchorError`.
  - The SW-side fast path uses the PXE's synced header as the anchor against the SW's own node (`execution/helpers/block-header-anchor.ts:23-33`; `fast-path.ts:226`). The SW node comes from `NetworkService.nodes`, evicted on primary change at `network/service.ts:871,913`. If the two nodes are on different endpoints, a lagging SW node produces stale-anchor errors outside `withStaleAnchorRetry`.

## 6. Pain points for a failover design

1. **No in-place swap.** A switch means `ensure` -> `dispose` -> a full create (section 1). It is serialised behind the chain write guard, so it waits for any in-flight `proveTx` (which can take about 10 minutes, `service.ts:123-127`) and blocks every other op on that chain meanwhile. A routing `AztecNode` created once per runtime, with the failover logic inside it, avoids the rebuild. The `ChainRuntime.rpcUrl` comparison then needs a stable value.
2. **Rebind is keyed on `rpcUrl` equality** (`chain-runtime.ts:354,376`). If the router's identity is the network (not a URL), pass a stable string. Otherwise every failover disposes the runtime, even a routed one.
3. **A switch to a lagging endpoint prunes the PXE** (section 2). It deletes notes and events above the lagging tip, re-syncs the anchor backwards, and causes O(gap) `getBlock` calls. After snap-back, the PXE re-discovers those notes at the cost of contract sync. A switch to a lagging endpoint can therefore briefly show balances as lower. That is a PXE-state regression, not just a failed call.
4. **A switch mid-prove.**
   - The anchor is fixed at op start from the old node's tip.
   - The prover fan-out issues many anchored reads across seconds to minutes, such as `getPublicDataWitness` and `getNullifierMembershipWitness`.
   - If a failover sends later reads to a node that lacks the anchor, the op fails with "possibly a reorg". The node may wait up to 3 s first.
   - `withStaleAnchorRetry` then does a sync (which prunes, if that node is behind) and a full second prove. It does not fail over to a better node.
   - A router should therefore be sticky within one op, or at least check that the candidate node knows the anchor.
5. **The router must not trust "reachable".**
   - It should compare `getChainTips().proposed` against the PXE's synced header, or at least require `tip >= anchor`.
   - Pinned-hash reads should go to a node that knows the hash, and `getPublicScanTips` tips and the reads pinned to them should go to the same node (section 5).
6. **Retry layering.**
   - `makeFetchWithTimeout` retries each failed call 3 times with exponential backoff (about 6 s total), with a 60 s per-request timeout (`utils/fetch.ts:19,132-157`). A dead endpoint therefore takes up to about 4 x 60 s + 6 s before a call fails.
   - 4xx is terminal and not retried (`classifyRpcFailure`, `:96-105`).
   - A router wanting fast failover must use `retryWhile` or single-attempt clients (`createSingleAttemptNode`, `silentSingleAttemptNode`) so the per-client retries do not delay the switch.
   - `RetryOptions.retryWhile` is the only existing hook, and it is wired to `stopRetries`, not to failover.
7. **Identity per endpoint.**
   - `assertNodeServesChain` runs only at runtime creation (`chain-runtime.ts:191`).
   - With a routed node, the router must verify `getNodeInfo` per endpoint before it takes traffic.
   - It must also never let two endpoints of one network serve different `rollupAddress` values, since the store stamp refuses mismatches only at open time.
8. **Two node holders.** The SW (`NetworkService.nodes`, `getNodeForUrl`) and the offscreen PXE each build their own clients. A failover decision made in one is invisible to the other unless the primary changes via the network row, which is the only channel today. Mixed-node anchors (PXE header against a different SW node) are the stale-anchor risk in section 5.
9. **Cache and store caveats.**
   - The PXE's read cache is safe across nodes (hash-pinned). Reads by number or tag are never cached (`pinnedReferenceOf`, `caching_aztec_node.js:162-171`).
   - Open-timeout quarantine (`ChainStoreWedgedError`) makes a failed rebuild unrecoverable until the offscreen restarts. That is another reason to avoid rebuilds on failover.
10. **Tests assume rebind.** `chain-runtime.test.ts:372` and `apps/extension/.../pxe/chain-runtime.test.ts:88` assert dispose-and-recreate on a URL change. A routed design changes what "endpoint switch" means for these.

## 7. Tests and fakes

- `packages/aztec-runtime/src/pxe/chain-runtime.test.ts`:
  - Mocks `@aztec-labs/pxe/client/bundle`, `createPXE` and `@aztec-labs/simulator/client` (`:15-24`), and `./opfs-store` (`:67-69`).
  - Defines `fakeNodeFactory` (`:71-81`) and `fakeNetwork` (`:83`).
  - Registry cases at `:310` (dispose-profile), `:349-413` (peek/ensure split, rebind), `:415-475` (`stopRetries`).
  - Identity-gate cases at `:114-134`.
  - Prove-phase cases at `:219-276`.
- `apps/extension/src/wallet/services/pxe/chain-runtime.test.ts`: a `makeFactory()` that makes a `ChainRuntime` with a `{__id}` node and a `{stop}` pxe (`:14-33`). Rebind case at `:88`.
- `packages/aztec-runtime/src/pxe/stale-anchor.test.ts`:
  - Cases (a) to (f2) at `:64-125`.
  - A `PxeService.executeUtility` integration case that builds a `ChainRuntime` from a `PxeFactory` stub, with `sync` and `executeUtility` as `vi.fn()` (`:127-168`).
- `stale-anchor.sources.test.ts` pins two of the three diagnostic strings against installed packages.
- `stale-anchor.real.test.ts`: needs a sandbox plus `NULO_E2E_REORG=1`. It uses the server PXE entrypoint (LMDB).
- `lifecycle-coordinator.test.ts`: five cases (current, bump, assertUnchanged x3).
- `incarnation-fence.test.ts`, `corrupt-store.test.ts`, `service.test.ts` build `ChainRuntime` by hand with `{}` as node or pxe.
- `FakeNodeFactory` (`apps/extension/src/core/testing/fake-node-factory.ts`):
  - Per-URL overrides via `setOverrides` and a template via `setTemplate`.
  - Records `created` and `singleAttempt`.
  - Its `createNode` signature takes no `RetryOptions`. A test of retry-through-failover would need an extension.
- No existing test exercises a `PxeService`-level URL switch. Absence trail: grep of `service.test.ts` and `incarnation-fence.test.ts` for `rpcUrl:`, `switch` and `peekMatching` found only a one-off `peekMatching` spy (`incarnation-fence.test.ts:303-308`). The rebind is covered only at the registry level.

## Open questions I could not settle from the tree
- Whether the 6.0.0 node's "block not found" is a 4xx (terminal in `classifyRpcFailure`) or a 200 with a JSON-RPC error. I did not find a node-side source locally. This decides whether the fetch layer retries a lagging answer.
- Which node versions apply `rpcUnseenBlockBy*WaitMs` on the public endpoints the wallet uses. It is the node's config, and the local tree only shows the defaults.
