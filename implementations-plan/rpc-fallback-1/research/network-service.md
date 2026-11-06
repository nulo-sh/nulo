<!-- Research subagent (Explore, sonnet) for the rpc-fallback-1 plan, at dev e5cffd82d plus origin/rpc-proxy-1-a1 (PR #1622). Persisted verbatim by the planner. -->

# Network service and its UI: research for lane rpc-fallback-1

All paths are under `apps/extension/src/` unless they start with `packages/`. Nothing under `wallet/constants/network-endpoints.ts` was opened or quoted. Lines I printed that contained the dRPC host were filtered out of my output. The dRPC host appears nowhere in this report.

## 0. Headline findings

- **There is no failover code anywhere.** The network row is `{ endpoints[], primaryEndpointId }`. Every node the wallet builds comes from the primary's single URL.
- **Endpoint order is only the array order.** Nothing reorders it. There is no priority, health, or "live endpoint" field.
- **Status is one primary probe per UI action.** It is never polled, and it is never exposed per endpoint.
- **The wallet holds two independent node populations**, both built from the same primary URL:
  - the SW `NetworkService` caches (`nodes`, `transientNodes`, `singleAttemptNodes`);
  - the offscreen PXE's `ChainRuntime` node, which is rebuilt when `NetworkInfo.rpcUrl` changes (`packages/aztec-runtime/src/pxe/chain-runtime.ts:354,376`).
- **The issue for this lane is #1624**, "A network with several endpoints fails over to the next and snaps back to its primary". It is open, with no comments. Its body says Settings → Networks is "an owner-signed surface" and lists the open questions the plan must settle.

## 1. The network service (`wallet/services/network/`)

### Files
- `service.ts` (1347 lines): `NetworkService`.
- `spec.ts` (377 lines): types, zod schemas, `Methods` and `Events`, and the helpers `networkInfoFrom`, `primaryEndpointUrl` and `findPrimaryEndpoint`.
- `client.ts` (129 lines): `NetworkServiceClient`. It validates params and result for every call through `call()` (`client.ts:44`).
- `seeds.ts` (86 lines): `DEFAULT_SEEDS`, `seedForKind`, `SEED_L1_BY_KIND`, `LOCAL_NETWORK_RPC_URL`.
- `seed-offers.ts`: the per-profile record of which defaults were offered.
- Tests: `service.test.ts` (2872), `spec.test.ts`, `client.test.ts`, `seed-offers.test.ts`.

### Data model (`spec.ts`)
- **`NetworkEndpoint`** is `{ id, rpcUrl, label? }` (`spec.ts:22-29`).
- **`Network`** is `{ id, profileId, chainId, l1ChainId, name, primaryEndpointId, endpoints[], kind? }` (`spec.ts:31-52`). A doc comment says "Always ≥1" endpoints. The wire `NetworkSchema` enforces `.min(1)` (`spec.ts:156-158`). The storage codec `NetworkRowSchema` is deliberately laxer (`spec.ts:81-85`).
- **Order among endpoints:** the only order is `endpoints` array order, which is insertion order. `addEndpoint` does `network.endpoints.push(endpoint)` (`service.ts:~825`). `updateEndpoint` replaces in place by index (`service.ts:~862`). `deleteEndpoint` splices (`service.ts:~893`). There is no reorder method.
  - Search trail for reorder: I grepped `reorder|moveEndpoint|endpointOrder|priority` over `apps packages`, and none exist for endpoints. The `Methods` list at `spec.ts:~235-300` has no such method.
- **Primary** is `primaryEndpointId`, set by `setPrimaryEndpoint` (`service.ts:900`). `findPrimaryEndpoint` (`spec.ts:122`) returns `endpoints.find(id === primaryEndpointId)`, or `undefined`.

### Public RPC surface (`service.ts:196-216`; types at `spec.ts` `Methods`)

| Method | Line | Behaviour |
|---|---|---|
| `getOrInitNetworks` | 277 | Seeds the defaults if missing. |
| `seedDefaultsForProfile` | ~360 | Seeds a not-yet-active profile (backup import). |
| `getNetworks(chainId?)` | ~415 | Rows for the active profile. |
| `getNetwork` | ~500 | One row. |
| `addNetwork(name, url)` | ~580 | Probes identity, then creates a `custom` row. |
| `renameNetwork`, `deleteNetwork` | ~610, ~625 | `deleteNetwork` runs the purge cascade. |
| `setActiveNetwork` | 768 | Writes the pointer and primes `nodes`. |
| `getActiveNetwork`, `getPrimaryNetwork` | ~500-540 | Reads. |
| `getNetworkArrival`, `answerNetworkArrival` | ~700 | The "new default arrived" flow. |
| `setActiveForProfile` | ~560 | Backup restore. |
| `addEndpoint(networkId, label, url)` | 804 | Probes, then pushes. |
| `updateEndpoint(networkId, endpointId, label, url)` | 832 | Re-probes, replaces in place. |
| `deleteEndpoint` | 877 | Refuses `PRIMARY_ENDPOINT` and `LAST_ENDPOINT`. |
| `setPrimaryEndpoint` | 900 | Sets the primary. |
| `getNodeStatus(networkId)` | 933 | Probes the primary, retrying. |
| `probeNodeStatus(networkId, timeoutMs)` | 949 | One bounded attempt. |

Background-only methods that are not RPC:
- `getNetworksRaw` (~443).
- `getL1ChainIdStored`, `resolveVerifiedL1ChainId` (~462 and ~495).
- `isNetworkLive`, `captureLiveness`, `isChainLive`, `servesChain`, `servesLiveChain`, `isChainQuarantined`.
- `getNode` (965), `getNodeForUrl` (1013), `getSingleAttemptNodeForUrl` (1026).
- `readPublicStorageOnce` (984), `readChainTip` (1038), `reportEndpointFailure` (1043), `getNetworkInfo` (1055), `probeIdentityOnce` (1070).
- `commitResetCapture` (1085), `resetChainInPlace` (1113), `purgeChain`, `registerChainPurgeSubscriber`, `setResetRunProbe`, `purgeForProfile`.

### Endpoint CRUD details
- **`addEndpoint`:**
  - Validates params, then peeks the row unlocked (`service.ts:~807`).
  - Probes outside the lock via `_probeChainIdentity(rpcUrl, peek.kind)`, which uses `nodeFactory.createNode(url).getNodeInfo()` (`service.ts:1328-1336`). That is the retrying node, not a bounded probe.
  - Then takes the lock and calls `refuseWhileResetHolds`, which throws `ERR_RESET_PENDING` when a reset journal names the network (`service.ts:925-929`).
  - Then `assertSameChainIdentity(probed, network)` (`service.ts:120`). It checks the composite `chainId` first, then the exact `l1ChainId`, and throws `ENDPOINT_CHAIN_MISMATCH: ...`.
  - Then a duplicate check against the normalized URL (`ERR_DUPLICATE_ENDPOINT`).
  - Then `push`, `storage.set`, and `emit("onNetworkUpdated")`.
- **`updateEndpoint`:**
  - Probes even when the URL is unchanged ("the node's chain identity may have drifted", `service.ts:~840`).
  - Runs the same identity and duplicate checks.
  - Evicts `transientNodes.delete(oldUrl)`.
  - Evicts `nodes.delete(chainId)` only if this endpoint is the primary.
  - Emits `onNetworkUpdated` only. It does not emit `onPrimaryEndpointChanged`.
- **`deleteEndpoint`:** refuses the last endpoint (`ERR_LAST_ENDPOINT`) and the primary (`ERR_PRIMARY_ENDPOINT`). It evicts the transient node and emits `onNetworkUpdated`.
- **`setPrimaryEndpoint`:**
  - Runs `refuseWhileResetHolds`.
  - For chain 0, refuses a non-local target (`ERR_ENDPOINT_CHAIN_MISMATCH: Only a node on this machine can serve chain 0.`).
  - It does **not** probe the new primary. It never checks that the endpoint serves this chain; only add and update do.
  - On a change: `nodes.delete(chainId)`, emit `onPrimaryEndpointChanged`, emit `onNetworkUpdated`.
- **Invariants:**
  - Every endpoint mutation runs under `this.lock`. The lock has its watchdog disabled (`service.ts:~260`) because `deleteNetwork` holds it across the 30-minute prove-tx purge drain.
  - An unprobed primary is possible: a stored row may carry any endpoint set the user saved.
  - Endpoint ids are random 8-character hex values, except a seed's first endpoint, which is `${networkId}-ep0` (`_buildNetwork`, ~1295).

### Node caches
- **`nodes: Map<chainId, AztecNode>`** (`service.ts:228`).
  - It is keyed by `chainId` alone, so it belongs to the active profile.
  - It is filled lazily by `getNode(chainId)` (965-982), under the lock, from the primary's URL.
  - It is also primed by `setActiveNetwork` (768-798) and `activateSeededLocked` (~426).
  - It is evicted in these places:
    - `setPrimaryEndpoint`;
    - `updateEndpoint`, when the endpoint is the primary;
    - `deleteNetwork`;
    - `rewriteForResetLocked` (both chains);
    - `onActiveProfileChanged` and `purgeForProfile` (`.clear()`).
  - `seedDefaultsForProfile` deliberately never writes it.
- **`transientNodes: Map<url, {node, failures}>`** (`service.ts:230`).
  - `getNodeForUrl(url)` is used for the pending-transaction receipt pin and returns the cached node.
  - `reportEndpointFailure(url)` increments a counter. At 3 failures it evicts, and a success does not reset the counter (`service.ts:1043-1047`). The eviction only lets the next poll rebuild the same URL; it does not change which endpoint is used.
- **`singleAttemptNodes: Map<url, AztecNode>`** (`service.ts:232`). It is never evicted. It serves `getSingleAttemptNodeForUrl` (1026), used by send-check, `readChainTip`, and the auth-registry check.
- **No cache ever holds more than one URL per chain.** A failover design would need a per-chain "current endpoint" concept that does not exist.

### NodeStatus (`spec.ts:16-20`: `Active`, `Inactive`, `InvalidChain`)
- **Where it is computed:**
  - `getNodeStatus` (`service.ts:933-947`) probes the primary through `_getChainId`. That is the retrying `createNode(url).getNodeInfo()`. If `probedChainId !== network.chainId` it returns `InvalidChain`. Any throw returns `Inactive`. If there is no primary it returns `Inactive`.
  - `probeNodeStatus` (949-963) uses `nodeFactory.probeChainId(url, timeoutMs)`. That is one non-retrying attempt whose socket aborts at the budget (`node-factory-port.ts:36-43`; adapter at `aztec-node-factory-adapter.ts:85-95`). The wire clamps `timeoutMs` to 100..30000 (`spec.ts` `probeNodeStatus` schema).
  - Both check only the XOR composite chain id. They do **not** check `l1ChainId`; only add and update (`assertSameChainIdentity`) do.
- **Cached:** not in the service. The popup keeps one string, `appStore.networkStatus` (`stores/app.store.ts:60,95`). It holds a `NodeStatus` name, `"sync"` while reading, or `undefined`.
- **Emitted:** it is never emitted as a service event. It is pull-only.
- **Refreshed only on these triggers:**
  - `syncNetworkStatus()` (`stores/app.store.ts:514-529`). It is called at the start of each network-switch run (`popup/network-switch.ts:~128`) and after bootstrap (`composables/useProfileBootstrap.ts:171`).
  - `markNetworkInactive(networkId)` (`stores/app.store.ts:531-533`). It is set when default-account creation cannot reach the node (`network-switch.ts:73`, `useProfileBootstrap.ts:197`).
  - Any rejected read shows `Inactive` (`app.store.ts:522-524`). A newer read supersedes an older one via a `statusReads` counter.
- **Not polled.** The only popup interval is a 10 s `getActiveProfile()` session heartbeat (`popup/app.vue:617-621`). I grepped `setInterval` over `app.store.ts`, `useProfileBootstrap.ts` and `app.vue`.
- **Shown:** Header dot and aria-label, and the Manage Networks active row (see §4).
- **Other consumers of status:**
  - `account-state/service.ts:112` and `:125` use `probeNodeStatus(networkId, SENDER_PROBE_TIMEOUT_MS)` to skip unreachable networks.
  - `account-state/service.ts:254` uses `getNodeStatus` in the backup-export path.
  - `composables/importPreflight.ts:54-55` maps `Active` to "go" and `InvalidChain` to "wrong-network".
  - `composables/importChainSync.ts:47-48` uses a `probe` dependency.
  - `composables/full-backup-restore.ts:924` wires `probeNodeStatus`.

### Identity probe
- **`IDENTITY_PROBE_MS = 5_000`** (`spec.ts:127`) is "one identity read of the person's own node: a single request".
- **Users of the bounded probe:**
  - `probeIdentityOnce` (`service.ts:1070-1077`) builds `createSingleAttemptNode(url, timeoutMs).getNodeInfo()` and returns `{chainId: nodeChainId(...), l1ChainId}`.
  - It is used by `resolveVerifiedL1ChainId` (`service.ts:506`) for non-seeded kinds at account creation, and by network-reset's `decideEndpoint` (`network-reset/service.ts:416`).
  - **`add`, `update` and `switch` do not use it.** They use the retrying `_probeChainIdentity`. `setActiveNetwork` does no probe at all.
- **Composite rule:** `walletChainId(info.l1ChainId, info.rollupVersion)`, which is `(l1ChainId ^ rollupVersion) >>> 0` (`packages/aztec-runtime/.../aztec-node-factory-adapter.ts:94`; the pin is in `utils/chain-ids`).
- **Chain-0 rule** (`nodeChainId`, `service.ts:109-114`):
  - A loopback node counts as local when the kind hint is `local` or its URL matches `LOCAL_NETWORK_RPC_URL`. It then reports chain 0.
  - A composite of 0 from any other node throws `ENDPOINT_CHAIN_MISMATCH: This RPC reports chain 0, which only the Local Network on this machine serves.`
- **`ERR_ENDPOINT_CHAIN_MISMATCH = "ENDPOINT_CHAIN_MISMATCH"`** (`spec.ts`). It is thrown from:
  - `nodeChainId`;
  - `assertSameChainIdentity` (two messages: "This RPC reports chainId X, but this network is chain Y." and "...reports L1 chain X, but this network is L1 chain Y.");
  - `setPrimaryEndpoint` for chain 0;
  - `_buildNetwork` for chain 0.
- **UI mapping:** `popup/components/popups/endpoint-error-text.ts` maps it to `Wrong chain. This network is chain ${chainId}.`

### Network lock
- `Lock("network", logger, null)` (`service.ts:~260`). All mutators and `getNode` use `lock.withLock`.
- `getNode` takes it for the whole lookup-or-build (965-982). Other chains' `getNode` waits for any mutator. `resetChainInPlace` releases the lock before its purge to avoid that (`service.ts:~1120`).
- A failover design that does network I/O under this lock would stall every `getNode`.

### Events (all declared in `spec.ts` `Events`; mirrored on `NetworkServiceClient` at `client.ts:24-29`)

| Event | Emitted by | Consumers |
|---|---|---|
| `onNetworkAdded` | `addNetwork` | none outside tests |
| `onNetworkUpdated` | rename, add/update/delete endpoint, `setPrimaryEndpoint`, `rewriteForResetLocked` | none outside tests |
| `onNetworkDeleted` | `deleteNetwork`, `purgeForProfile` | none outside tests |
| `onActiveNetworkChanged` | `setActiveNetwork` | `token/service.ts:230` |
| `onPrimaryEndpointChanged` | `setPrimaryEndpoint`, reset rewrite | none outside tests |
| `onChainPurged` | `purgeChain` | `token/service.ts:301` (the seeder) |

- Search trail: I grepped `onNetworkUpdated|onPrimaryEndpointChanged|onActiveNetworkChanged|onNetworkAdded|onNetworkDeleted|onChainPurged` over `apps/extension/src` and `packages`, excluding tests and the network module. Only the two token-service hits remain.
- **The popup does not subscribe to network events.** Pages re-read with `getNetworks()` after each call (`[id].vue:100-106`, `EditEndpointPopup.vue:63`).
- A failover that switches the live endpoint has no event path to the popup today.

### Reset journal and stale-network (relevant constraints)
- `stale-network/classify.ts`:
  - `hasNetworkCause(row)` (line ~21) is true when a seeded `kind`'s `chainId` differs from the build's seed. It is used by `service.ts:isChainQuarantined`.
  - `classifyChains` is offline and storage-only: "never a node".
- `network-reset/service.ts`:
  - `decideEndpoint` (~403-420) probes only the user's own primary, once per `(row, endpoint, url, seedChain)`, with `IDENTITY_PROBE_MS`.
  - Any answer other than the seed identity, a timeout included, means `switchToSeedNode`.
  - `capture` writes the journal that holds `probedEndpoint = {id, url}` (`stale-network/types.ts:ProbedEndpointSchema`).
- Service hooks:
  - `refuseWhileResetHolds` blocks all endpoint edits while a journal names the network.
  - `primaryMoved` / `commitResetCapture` (`service.ts:141-150`, `1085`) refuse when the primary changed between the popup's view and the commit.
  - `applyResetEndpoint` (1165) keeps the user's primary only if it equals the probed `{id, url}`. Otherwise it sets the seed's endpoint (adding it if missing) as primary.
- **Constraint for failover:** any "current endpoint" that diverges from `primaryEndpointId` must not leak into these checks. They compare the persisted primary id and URL. They must keep reading the user's order, not the failed-over endpoint.

## 2. Consumers of `networkInfoFrom`, `primaryEndpointUrl`, `findPrimaryEndpoint`

### `networkInfoFrom`
Throws if there is no primary. It returns `{profileId, chainId, rpcUrl: primary.rpcUrl}`. The URL goes to the PXE client (`pxeService.getPXE(info)` and `getContracts(info)` and similar), and through it to the offscreen `ChainRuntime`. The runtime rebuilds when `rpcUrl` differs (`chain-runtime.ts:354,376`).

| File:line | Use |
|---|---|
| `account-state/service.ts:78,86,136,156,166,194,384` | registered accounts, senders, contracts, and the backup snapshot (384 adds `pxeGeneration`) |
| `execution/registration-executor.ts:69,76,88,93,167,190,217,220` | PXE registrations |
| `execution/view-executor.ts:108,163,186,231,302,371` | simulations. At 163-164, `info.rpcUrl` goes to `getNodeForUrl`. |
| `execution/service.ts:419,888,1134,1139` | PXE and authwit instance reads |
| `execution/tx-request-builder.ts:262,421` | `getPXE` |
| `execution/helpers/get-view-simulation-deps.ts:37` | `getPXE` |
| `fpc/service.ts:188,297,371` | `getPXE` |
| `incoming-transfer/service.ts:415,420,423,428` | PXE scan reads (the readers curry `networkId` to `NetworkInfo`) |
| `note/service.ts:84,94,181,189,241` | PXE note reads |
| `token/service.ts:779,876` | `getPXE` |
| `network/service.ts:1039` (`readChainTip`), `:1055` (`getNetworkInfo`) | single-attempt tip read and an info synth |

### `primaryEndpointUrl` (never throws; returns `undefined` if missing)
- **Stamps the URL a tx was sent to, as `submittedEndpointUrl`:**
  - `execution/dapp-send-executor.ts:749, 902, 1135, 1302`;
  - `execution/transfer-executor.ts:266, 459`.
- **Other uses:**
  - `auth-registry/service.ts:198` feeds `getNodeForUrl` and `:562` feeds `getSingleAttemptNodeForUrl`.
  - `incoming-transfer/service.ts:660` builds a node from the URL (`getNodeForUrl`, 662).
  - `network/service.ts:~986` (`readPublicStorageOnce`).
- Field name `estimate-reuse-shared.ts:76` is a snapshot field, not a call.

### `findPrimaryEndpoint`
- **Estimate-reuse snapshots (id plus URL):**
  - `execution/dapp-send-executor.ts:688,706`;
  - `execution/transfer-executor.ts:394,409`;
  - `execution/operation-estimate-reuse.ts:104`;
  - `execution/transfer-estimate-reuse.ts:151`.
  - The staleness check is `estimate-reuse-shared.ts:97-99`: stale if the current primary's id or URL differs from the snapshot.
  - Consequence: a switch of the effective endpoint, if reflected in `findPrimaryEndpoint`, silently invalidates reuse snapshots.
- **Network-reset:** `network-reset/service.ts:411`.
- **Inside the service:** `activateSeededLocked`, `setActiveNetwork`, `getNode`, `getNodeStatus`, `probeNodeStatus`, `resolveVerifiedL1ChainId`, `primaryMoved`, `applyResetEndpoint`, `retireDefaultEndpoints`.

### Node-accessor consumers
- **`getNode(chainId)`:**
  - `execution/service.ts:371,400,416,1123`;
  - `execution/tx-request-builder.ts:261,420`;
  - `execution/view-executor.ts:236,282`;
  - `execution/execution-coordinator.ts:165` (via `deps.getNode`);
  - `execution/operation-estimate-reuse.ts:121` and `execution/transfer-estimate-reuse.ts:190` (via `deps.getNode`);
  - `execution/helpers/get-view-simulation-deps.ts:36`;
  - `token/service.ts:875`;
  - `transaction/service.ts:587` (legacy rows with no recorded endpoint).
- **`getNodeForUrl(url)`:**
  - `transaction/service.ts:586` (the receipt pin), with `reportEndpointFailure` at `:598`;
  - `view-executor.ts:164,220`;
  - `auth-registry/service.ts:200`;
  - `incoming-transfer/service.ts:662`.
- **`getSingleAttemptNodeForUrl`:**
  - `transaction/service.ts:641`;
  - `operation-journal/send-check.ts:353`;
  - `auth-registry/service.ts:564`.
- **`readChainTip`:** `execution/service.ts:268`, `incoming-transfer/service.ts:432`.
- **`readPublicStorageOnce`:** `execution/service.ts:418`.

## 3. Storage and the cost of a new field

- **Network rows** are `sealedCodec(NETWORK_STORAGE_ROOT, NetworkRowSchema)` (`wallet/storage/stores.ts:193`). The root is `nulo:core:networks` (`spec.ts:9`).
  - Row keys are `nulo:core:networks@<id>`.
  - Rows are sealed per profile; the codec reads a plaintext row and seals it at the profile's next unlock (`sealLegacyRows`, `service.ts:~283`).
  - `stored-shapes.ts:219` registers `networks: fromStore("networks")`.
  - The active pointer is a separate bare-string key: `activeNetwork: { ref: root("nulo:core:active-network"), encoding: "structured", schema: z.string() }` (`stored-shapes.ts:246`).
  - Other registered related roots (`stored-shapes.ts:233-236`): `staleNetworks`, `networkReset`, `networkResetDone`, `networkSeeded`.
- **Snapshot and goldens** (`wallet/storage/stored-shapes/`):
  - `snapshot.json` has 4 stamps (stamp 0 plus 3 later). All three later stamps are same-version `additive` marks. Their reasons are, in order: a journal's optional authwits, a new `tokenIdHighWater` key, and a decoder change that leaves every row reading the same.
  - `pins.ts` holds 4 `PINNED_STAMPS` pairs `{stamp, goldens}` (lines 9-26).
  - `goldens.json` has `networks.full`, `networks.minimal` and `networks.sealed` (lines ~490-540), all pinned at stamp 0. The `full` golden holds two endpoints, one labelled and one not.
- **Cost of a new optional field** on `Network` or `NetworkEndpoint`, per CLAUDE.md § Persisted-storage shape changes:
  1. Edit `networkShape` or `NetworkEndpointRowSchema` in `spec.ts`. The `satisfies Record<keyof Network, z.ZodType>` at `spec.ts:~79` forces the type and schema to agree.
  2. Run `bun run baseline:storage -- --additive "<why every stored row still reads>"`. This appends a same-version stamp to `snapshot.json`.
  3. Add the pin it prints to `pins.ts`.
  4. Add or extend a golden that exercises the new field (`goldens.json`). CLAUDE.md says a refinement is seen only through a golden, and requires one "on the value it changes".
  5. Nothing else is needed for an additive field. No migration and no sealed-root migration (sealed roots are never migratable).
- A non-optional field, a rename, or a semantic change to existing fields needs a numbered migration. Networks are a sealed root, and "sealed roots (...networks...) take no migration", so such a change converts at unlock instead. It stops for the owner.
- **Plan approval:** the `rpc-proxy-1` plan lists "a persisted field on a network row" under "Approval boundary (a plan change; stop)" (`git show origin/rpc-proxy-1-a1:implementations-plan/rpc-proxy-1/plan.md`, ~line 143). The same boundary covers any rewrite of a row other than an endpoint whose URL digest is listed.
- **Strip behaviour:** `NetworkRowSchema` and `NetworkSchema` are plain `z.object(...)`, which strips unknown keys. A downgraded build would silently drop a new field on its next write.
- **Backups:** I found no network-specific entry in `backup-migration-registry.ts` beyond a comment (line 201). `account-state/service.ts:345` filters rows through `NetworkSchema.safeParse` for the backup snapshot. A new optional field therefore rides in backups. Check that the field is neither trusted nor dialled from a backup (privacy and trust gates).
- **Cheaper alternative:** runtime-only state, such as an in-memory "current endpoint" or "failed until" per `networkId`, needs no storage cost at all. Persisted order (for example a reorder) would need a field, or would reuse the array order.

## 4. UI: current state and copy

### Settings → Networks list (`popup/pages/settings/networks/index.vue`)
- **Page title (`:96`):** `title="Manage Networks"`, with `SectionLabel label="Networks"` and a count (`:97`).
- **Sort order (`:49-54`):** by `getChainPosition(chainId)`, then `stringCompare(name)`. Networks sort, not endpoints.
- **Each row (`:100-134`):**
  - title is `network.name`;
  - description is the status word, only for the active network (`:106`);
  - `#dot` slot (`:113-115`): a 7 px dot for the active row only, with `data-tone` of connected, unreachable, or waiting;
  - active badge `Badge variant="info"`: `Active`;
  - other rows show a `Switch` button with `aria-label="Switch to ${network.name}"`;
  - plus a chevron.
- **Add button (`:137-146`):** `Add network`, shown only with Developer Mode (`:40-41`: "Custom chains are a developer surface").
- **Status words** (`utils/network-status.ts:11-17`), verbatim:
  - Connected: `"Connected"`;
  - Unreachable: `"Cannot reach the network"`;
  - Waiting: `"Waiting for the network"`.
- **Tone mapping (`network-status.ts:5-10`):**
  - `Active` is `connected`;
  - `Inactive` and `InvalidChain` are both `unreachable` ("A node that answers for another chain is as unusable as one that does not answer");
  - everything else, including `"sync"` and unset, is `waiting`.
- **Per-network health shown is for the active network only.** No endpoint-level status exists anywhere in the UI.

### Network detail (`[id].vue`)
- **Title and sections:** `SettingsPageShell :title="network.name"` (`:247`). The sections are `Chain`, `Endpoints` (with count, `:284`) and `Danger zone` (only if `canDelete`).
- **Chain section (`:252-278`):**
  - `Active network` / `Set as active network`, with descriptions `Currently in use` / `Switch the wallet to this chain`;
  - `Name`, with an edit icon;
  - `Chain ID`.
- **Endpoint rows (`:291-323`), one `SettingItem` per `network.endpoints`, in array order:**
  - `:title="endpoint.label || endpoint.rpcUrl"`;
  - `:description="endpoint.label ? endpoint.rpcUrl : undefined"`;
  - the icon is `square-check` (primary colour) when it is the primary, else `square` (tertiary). A row carries no "Primary" text badge and no status.
  - Clicking a row calls `handleSetPrimary(endpoint)`. The click is inert while `heldReset` is set (`:299`).
  - The right slot (shown if no `heldReset`): an edit `RowAction` with label `Edit endpoint` and tooltip `Edit endpoint`, plus a delete `RowAction` with label `Delete endpoint` and tooltip `Delete endpoint`. The delete appears only for non-primary endpoints, and only if there are more than 1.
  - **Rows cannot be reordered.** Search trail: I grepped `draggable|drag|sortable|reorder|moveUp|moveDown` in `[id].vue`, `index.vue` and the two endpoint popups, with no hits. The row list is `v-for="endpoint in network.endpoints"`.
  - The `Add endpoint` button is at `:326-335`: `variant="primary_outline"`, `data-testid="endpoint-add-btn"`, and disabled while `heldReset`.
- **How the user sets the primary:** click the endpoint row, or its checkbox icon. `handleSetPrimary` (`:139-149`) calls `managers.network.setPrimaryEndpoint` and then `refreshNetworks()`.
  - Success toast: `"Primary endpoint updated"`.
  - Failure toast: `"Failed to update primary endpoint"`.
- **Held-by-reset note (`:285-288`):** `staleCopy.endpointsHeld(network.name)`, from `@/components/stale-network/copy`. I did not read the string itself.
- **Delete-endpoint confirm (`:156-161`):**
  - `confirm_text: "Yes, delete endpoint"`;
  - `title: "Delete this endpoint?"`;
  - description: `` `This RPC URL will be removed from ${network.value.name}. The chain itself stays.` ``
  - Toasts: `"Endpoint deleted"`, `"Make another endpoint primary first."`, `"Last endpoint. Delete the chain instead."`, `"Failed to delete endpoint"`.
- **Danger zone (`:350-352`):** `Delete chain`, with `Deleting wipes all accounts, balances, tokens and PXE state for this chain.`

### Popups
- **`NewEndpointPopup.vue`:**
  - title `Add endpoint` plus ` · {network.name}` (`:217-219`);
  - input `label="Label (optional)"` with `placeholder="Backup"` and `:maxLength="25"` (`:223-227`);
  - input `label="RPC URL"` with `placeholder="https://rpc.example.com"` (`:233-234`);
  - submit `Add endpoint`;
  - footer text (`:247-249`): `We'll probe the RPC and confirm it matches this chain before saving.`
  - Toast: `"Endpoint added"`. The duplicate message is `"This URL is already an endpoint of this network."` (`:185`).
- **`EditEndpointPopup.vue`:**
  - title `Edit endpoint` plus ` · {network.name}` (`:97-98`);
  - `Label` input with `placeholder="Primary"` (`:103-105`);
  - `RPC URL` input;
  - submit `Save`;
  - belowSubmit button `Reset changes` (`:127-129`);
  - toast `"Endpoint updated"`;
  - duplicate message `"Another endpoint of this network uses that URL."`.
- **Error mapping (`popup/components/popups/endpoint-error-text.ts`):**
  - the RPC URL hidden-character and IPv6 lines;
  - `Wrong chain. This network is chain ${chainId}.`;
  - the duplicate copy;
  - `"RPC didn't respond. Check the URL."` for message `"Failed to fetch node info"`;
  - fallback `"Something went wrong."`
- Popup ids are `new_endpoint` and `edit_endpoint` (opened at `[id].vue:130,136`), with state in `cacheStore.endpointEditNetworkId` / `endpointEditId`.

### Header chip (`components/Header.vue`)
- **Chip (`:229-242`):** a `<button>` with `data-testid="network-button"` and `:data-status="networkStatusKey"` (the lower-case `NodeStatus` name).
  - `:aria-label="\`Manage networks (currently ${appStore.network.name}, ${networkStatusText})\`"`.
  - The network name span shows only when `showNode` is on.
  - The status dot (`network-status-dot`) has class `$style[networkStatusKey]`.
  - Clicking it routes to `/popup/settings/networks` (`handleOpenNetworks`, `:140-142`).
- **Status word:** `networkStatusWord(appStore.networkStatus)` (`:51`), the same three strings as above.
- **Display toggle:** `Show network name` / `Always show network name in the header` (`utils/settings-search.ts:270-276`). Search synonyms for the Networks hub row are `["chain", "rpc", "node", "endpoint", "testnet"]`, with description `Aztec networks and RPCs` (`settings-search.ts:88-94`).
- **"The chip says its status":** the chip text is the name plus a dot. The status words exist only in the aria-label and in the Manage Networks active row's description.
- **No Home-page chip.** I grepped `NodeStatus|networkStatus|isNodeActive|network_chip|networkchip` in `.vue`, and `Header.vue` and `networks/index.vue` are the only render sites.
- **No separate "header network picker".** The chip goes to the Manage Networks page, and switching is the `Switch` button on that page. Add-network is behind Developer Mode.
- **chips-1 plan** (`implementations-plan/archive/chips-1/plan.md`) records the chip as "ALPHA / TESTNET sit whole in the chip" with a `status_dot`.

### Glossary (`utils/glossary.ts`)
- The only network entry is `network`: term `Network`, definition `"The Aztec chain Nulo talks to; each network keeps its own balances and history."`, where `"Header · Settings"` (`glossary.ts:~23-27`).
- A second one: `alpha`, definition `"Aztec's main network, also called Mainnet; Testnet and local networks are for trying things out."`, where `"Network menu"`.
- Nothing about "node", "endpoint" or "RPC". Search trail: I grepped `node|endpoint|rpc` case-insensitively in `glossary.ts`, and only fee-related "network fee" lines matched.

### Legal copy that constrains design (`legal/privacy.md` § 5.1, lines 109-128)
- "Nulo ships with default endpoints operated by a third-party provider so the wallet works on first run."
- **Your control:** "Settings → Networks lets you replace any endpoint... **Pending transactions may continue to be checked through the endpoint used to submit them, including after you change or remove that endpoint.**"
- The text says one provider and one endpoint. Issue #1624 notes the privacy text must be updated once the proxy is seeded as a fallback.

## 5. Remnants of failover or health code (absence claims with search trail)

- **Command:** `grep -rniE "failover|fail-over|fallback endpoint|liveEndpoint|secondary endpoint|endpointOrder|NodeStatus\.Inactive|endpoint health|endpointHealth|rpc.?health" --include=*.ts --include=*.vue --include=*.md --exclude=network-endpoints.ts apps packages ARCHITECTURE.md CLAUDE.md implementations-plan`
- **Result:** no product code. The hits were:
  - the Firefox proxy prefs `network.proxy.failover_direct` (`apps/extension/scripts/e2e/firefox-driver.test.ts`, `tests/e2e/fixtures/browser/firefox.ts`, `tests/e2e/FIREFOX.md`);
  - the archived `chain-endpoints` and `followups-6` plans about the e2e egress guard;
  - `NodeStatus.Inactive` uses (the service's status function, app.store, and test fakes).
- **`health`:** the only matches are the offscreen PING and PONG check (`wallet/utils/offscreen.ts:16,203`), which is the document's liveness and unrelated to RPC.
- **`secondary`, `backup endpoint`, `snap back`, `round-robin`, `rotate`:** searched `apps/extension/src packages ARCHITECTURE.md`, and none exist for RPC.
- **`reportEndpointFailure`** (`network/service.ts:1043`) is the closest thing to a failure counter. It only evicts a cached node after 3 failures, applies to pending-tx pins only, and never switches endpoints.
- **Closed or open issues visible with `gh`** (searched "rpc failover OR fallback endpoint OR endpoint order"):

| Issue | State | Relevance |
|---|---|---|
| #1624 | open | The failover feature (this lane). |
| #1607 | open | Alpha Mainnet: default node does not serve the full node API; the trigger. |
| #570 | closed | The default Testnet endpoint's provider key ships in every bundle and prints on its Settings row. |
| #551 | closed | A reset against a node that never answers still waits one request timeout per node call. |
| #658 | closed | A view simulation can reach the next profile's node when the profile switches mid-call. |

- **`implementations-plan/rpc-fallback-1/`** does not exist in this worktree, though #1624 names it as the plan home.

## 6. PR #1622 (`origin/rpc-proxy-1-a1`): summary of the diff to the network service

Diff stat against `origin/dev`: 34 files, +810 / -107. Network-module parts:

- **`service.ts`:**
  - The `nodeFactory` constructor argument is now **required**. The default `new AztecNodeFactoryAdapter()` is gone, along with its import. `runtime.ts:543` (`new NetworkService(logger, browserApi)` today) must pass `createWalletNodeFactory()`; the PR touches `runtime.ts`.
  - `init()` now chains a second sealing step after `sealLegacyRows`: `runSealing(warn, "moving the profile's endpoints off a retired default failed...", () => this.retireDefaultEndpoints(profileId))`.
  - New `retireDefaultEndpoints(profileId, retired = RETIRED_DEFAULT_ENDPOINTS)` runs under the network lock:
    - It skips the network a reset journal names (so the reset's captured primary still matches).
    - For each other row of the profile, it calls `retireEndpoints`, then `storage.set`.
    - It evicts the old URL from `transientNodes` and `nodes.delete(chainId)` if the primary's URL changed.
    - It emits `onNetworkUpdated`.
  - It imports `RETIRED_DEFAULT_ENDPOINTS` from `./seeds` and `retireEndpoints` from `./retired-endpoints`.
- **`retired-endpoints.ts` (new):**
  - `RetiredEndpoint = {sha256, replacement}`.
  - `retireEndpoints(network, retired)` keeps each endpoint's id, label and primary role and swaps only the URL, matched by the SHA-256 of the stored URL.
  - An endpoint whose replacement the network already holds is left alone. So no endpoint disappears and no row holds one URL twice.
  - It returns `undefined` when nothing moves.
- **`seeds.ts`:** adds `RETIRED_DEFAULT_ENDPOINTS` (one digest entry whose replacement is `TESTNET_RPC_URL`), and `maxBatchSizeFor(rpcUrl)` with a per-origin `BATCH_CAPS` map.
- **`node-factory.ts` (new):** `createWalletNodeFactory()` returns `new AztecNodeFactoryAdapter(maxBatchSizeFor)`. It is used by the background and the offscreen PXE.
- **Other touched files:** `packages/aztec-runtime/.../aztec-node-factory-adapter.ts` (takes the batch-cap function), `pxe/chain-runtime.ts`, `pxe/service.ts`, `offscreen/entry.ts`, `apps/extension/src/offscreen/index.ts`, `wallet/runtime.ts`, `core/adapters/index.ts`, `network-endpoints.ts` (not read), `scripts/*`, tests, and `implementations-plan/rpc-proxy-1/*`.
- **The plan's stated fence** (`plan.md:~143`): "a persisted field on a network row" and "a rewrite of any row but an endpoint whose URL digest is listed" are approval boundaries. The plan also says `rpc-fallback-1` "adds the fallback" and "tunes [the proxy rate limit] against measured traffic".

## 7. Pain points for a failover design

1. **There is no single choke point.** The wallet builds nodes from a URL in about eight places. The first three cache by chain or URL:
   - `getNode(chainId)` (`service.ts:965`);
   - `getNodeForUrl` and `getSingleAttemptNodeForUrl`;
   - `readChainTip`, `readPublicStorageOnce`, `probeIdentityOnce` (direct `nodeFactory` calls with the primary URL);
   - the offscreen PXE's `ChainRuntime`, built from `NetworkInfo.rpcUrl` (`chain-runtime.ts:181`, `235`, `271`). It is a separate process with its own factory, so the network service cannot swap it, and `ensure` disposes and rebuilds the runtime on a URL change (`chain-runtime.ts:371-379`) under the chain write guard.
2. **`networkInfoFrom` is a pure function of the stored row** (`spec.ts:103`). A "live endpoint" must come from somewhere stateful (a service method) or be baked into `NetworkInfo.rpcUrl`. The twenty-plus `networkInfoFrom(network)` call sites in §2 would all need it. The estimate-reuse snapshots compare primary id and URL (`estimate-reuse-shared.ts:97-99`), so an effective-URL switch invalidates them.
3. **Submitted endpoint pin.** Pending txs are polled at `submittedEndpointUrl` (`transaction/service.ts:585-598`), taken from `primaryEndpointUrl(network)` at send time (`dapp-send-executor.ts:749,902,1135,1302`, `transfer-executor.ts:266,459`). Privacy § 5.1 and #1624 both require a pending tx to be checked where it was sent, and a submission to never be replayed on another endpoint. If failover changes the "send" endpoint, `primaryEndpointUrl` would no longer name where the tx was sent. The stamp would need to come from the endpoint actually used.
4. **There is no per-endpoint status primitive.** `getNodeStatus` and `probeNodeStatus` look only at the primary. Neither checks `l1ChainId` (add and update do), and `setPrimaryEndpoint` probes nothing. A failover target is probed only at add or update time. A fallback that has not been probed since may now serve a different chain, so failover must re-run an identity check before it routes (`assertSameChainIdentity` is the existing helper, `service.ts:120`; `probeIdentityOnce` is the bounded form).
5. **Probe and retry timing.**
   - `_getChainId` and `_probeChainIdentity` go through `createNode`, the retrying fetch, so `getNodeStatus` can take minutes on a dead node. The popup's `syncNetworkStatus` catches rejections at the popup deadline (`app.store.ts:510-524` and its comment).
   - The bounded forms (`probeChainId`, `createSingleAttemptNode`, `readPublicStorageOnce`) exist and are the right primitives for a health check (`node-factory-port.ts:25-52`).
   - #551 and `chain-runtime.ts` `retryWhile` and `stopRetries` show prior pain from retry chains during teardown.
6. **The network lock** serialises `getNode` against all mutators, including a long purge. Health checks and failover decisions must stay off the lock, as the reset flow does (`resetChainInPlace` releases it before its purge).
7. **Reset journal coupling.** `refuseWhileResetHolds`, `primaryMoved`, `applyResetEndpoint` and `decideEndpoint` all key on `primaryEndpointId` and its URL. The user's primary must stay the stored fact; the live endpoint must stay out of them.
8. **The UI has no place for ordering or status.**
   - Order is array order. A reorder method plus a UI would be needed, and the order is currently only implied by the primary icon.
   - The user's explicit order ("the user's endpoint order in Settings wins") has no representation beyond the array and the primary flag.
   - The endpoint row shows no status or "in use" indication.
   - The Header and active-row copy has three states with no "using backup" nuance. `Inactive` and `InvalidChain` collapse to the same tone.
   - The Settings → Networks page is an owner-signed surface (#1624), so UI copy changes need the owner.
9. **No push channel to the popup.** Network events are not subscribed to, and status is pull-only. A failover or snap-back that should update the chip needs a new event or a status read on a timer (none exists).
10. **Seeds and URL secrecy.**
    - `seeds.ts` imports `MAINNET_RPC_URL` and `TESTNET_RPC_URL` from `network-endpoints.ts` (a secret-bearing file).
    - Seeds create exactly one endpoint per network (`_buildNetwork`, ~1288-1315).
    - A fallback seed would need `DefaultSeed` to grow an endpoint list.
    - Existing profiles get new endpoints only through a rewrite path. PR #1622's `retireEndpoints` shows the owner-approved narrow rewrite shape (digest match, id and label kept).
    - The seeded endpoint's label is used as the Settings row title (`seeds.ts` `endpointLabel`, "Provider label stamped on the seeded endpoint; Settings titles the endpoint row with it").
11. **Chain 0 (local) invariant.** The local network must stay on loopback (`nodeChainId`, `_buildNetwork`, `setPrimaryEndpoint`). A failover must never route chain 0 to a non-local endpoint.

## 8. Tests and helpers

### `network/service.test.ts` (2872 lines)
- **Header and fakes:**
  - `ROW_KEY_FAKE = await rowKeysForEveryProfile()` (`:51`).
  - `harness(seeded)` (`:60-106`) builds a `NetworkService` with `new LoggerStore(new ConfigStore())`, a `FakeNodeFactory` whose `getNodeInfo` is stubbed per URL, a `FakeBrowserApi`, a stub `ProfileService` (profile `p1`, a shared `ProfileDeletionState`, `captureExecutionFence`), and sets `(service as any).profileService`.
  - `FakeStorageArea` (`:507`), `setupServiceWithStorage` (`:539`) and `nodeInfoForChain` (`:595`) give a real sealed `storage`, so tests seed rows with `(service as any).storage.set(...)`.
  - `storeRow(local, over)` is at `:2143`.
  - Tests reach into `transientNodes`, `nodes` and `initialized` through `as any`.
- **Describe blocks (line numbers):**
  - `addNetwork creation fence` 108
  - `seedDefaultsForProfile` 174
  - `resolveVerifiedL1ChainId single-snapshot` 256
  - `NodeFactory seam` 305
  - `transient-node cache` 381
  - `purgeChain coordinator` 602
  - `public API` 674, with inner blocks:
    - RPC URL scheme allowlist 680
    - `http://[::1]` endpoint 735
    - addNetwork 820, renameNetwork 875
    - addEndpoint 920, updateEndpoint 983, setPrimaryEndpoint 1129, deleteEndpoint 1177
    - setActiveNetwork 1216, deleteNetwork 1302
  - `liveness reads overlapped by a reservation` 1342
  - `default seeding` 1438
  - `Mainnet, the default this build adds` 1452
  - `servesChain` 1833
  - `onProfileDeleted cascade` 1896
  - `probeNodeStatus (bounded probe)` 1951
  - `readChainTip` 1988
  - `readPublicStorageOnce` 2010
  - `lock configuration` 2057
  - `resolveVerifiedL1ChainId's live check` 2068
  - `node status: getNodeStatus and probeNodeStatus` 2169
  - `endpoint identity guard (add and update)` 2245
  - `chain 0` 2270
  - `endpoint labels` 2400
  - `missing-primary policies` 2421
  - `isChainQuarantined` 2479
  - `in-place reset` 2519
- **Other tests:** `spec.test.ts` (for `networkInfoFrom` and the helpers), `client.test.ts`, `seed-offers.test.ts`, `popup/pages/settings/networks/{index,[id]}.test.ts`, `switch-toast.test.ts`, `EditEndpointPopup.test.ts`, `NewEndpointPopup.test.ts`, `components/Header.test.ts`, `header-layout.test.ts`, `stores/app.store.test.ts` (status reads), `composables/importPreflight.test.ts`, `importChainSync.test.ts`, `tests/e2e/endpoints.test.ts` (popup UX and form validation; the full add, set-primary and delete cycle "lives in the network suite" per its header comment), and `tests/e2e/network/*`.

### Fakes and helpers
- **`core/testing/fake-node-factory.ts`:**
  - `FakeNodeFactory` records `created[]` and `singleAttempt[]`.
  - It uses per-URL overrides (`setOverrides`) and a `setTemplate`.
  - An unstubbed method throws loudly. `then`, `catch` and `finally` return undefined so the node is not accidentally thenable.
  - `probeChainId` reuses the stubbed `getNodeInfo`, and `timeoutMs` is not enforced.
  - Doc warning: a POJO node does not exercise the production proxy's error surface; use `*.integration.test.ts` against the production adapter for that.
- **`wallet/services/composition-harness.ts`:** it does **not** wire the network service. It exports `svc(name, methods)` (a service stub builder), `profileKeysStub(...ids)` and `tokenListStub(snapshot?)`.
  - `new NetworkService` is built directly in `cross-profile-isolation.test.ts:349` (no factory arg today) and `account-state/service.test.ts:161` (with a factory).
  - Adding a required `nodeFactory` (as PR #1622 does) breaks the first.
- **Production constructor:** `wallet/runtime.ts:543`, `new NetworkService(logger, browserApi)`.
- **Popup clients:** `NetworkServiceClient` is built in `utils/core.ts:203`, `composables/full-backup-restore.ts:881`, `useFullBackupImport.ts:477`, and `popup/windows/execute/operation-display.ts:47`.
- **Storage-shape tests:** `wallet/storage/stored-shapes/snapshot.test.ts`, `stored-shapes.scan.test.ts`, `wallet/storage/root-census.test.ts`.
