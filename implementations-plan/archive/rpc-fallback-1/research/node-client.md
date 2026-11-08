<!-- Research subagent (Explore, sonnet) for the rpc-fallback-1 plan, at dev e5cffd82d plus origin/rpc-proxy-1-a1 (PR #1622). Persisted verbatim by the planner. -->

# Node client module report (rpc-fallback-1)

I did not open the endpoint-constants file. Paths are relative to the worktree root. `FOUND` is `node_modules/.bun/@aztec-labs+foundation@6.0.0+759ce506b1ed1a42/node_modules/@aztec-labs/foundation/dest`. `STD` is `node_modules/.bun/@aztec-labs+stdlib@6.0.0+c1edb6f0433b9698/node_modules/@aztec-labs/stdlib/dest`.

## 1. Purpose and public surface

The node client is the seam between the wallet and an Aztec node over JSON-RPC.

**The `NodeFactory` port** (`packages/aztec-runtime/src/ports/node-factory-port.ts:26-58`) has four methods:
- `createNode(rpcUrl, options?: RetryOptions): AztecNode` is the retrying, 60 s-per-attempt client.
- `createSingleAttemptNode(rpcUrl, timeoutMs)` makes one attempt per call, aborts at `timeoutMs` and is silent.
- `probeChainId(rpcUrl, timeoutMs)` makes one `getNodeInfo` call and returns the composite chain id.
- `readPublicStorageOnce(rpcUrl, contract, slot, timeoutMs)` makes one `getPublicStorageAt("latest", ...)` read.

The port's doc comment (lines 8-23) states that a lint guard enforces a single construction site. I did not find the guard: `biome.json` has no `no-restricted-syntax` or `createAztecNodeClient` match, so it is likely a GritQL plugin or a script, but I did not locate it.

**The real adapter, on dev** (`packages/aztec-runtime/src/adapters/aztec-node-factory-adapter.ts`):
- The class `AztecNodeFactoryAdapter` has no constructor, and each method runs `isAllowedRpcUrl` first (https, or http only to localhost or 127.0.0.1, no userinfo; lines 52-66, check at 70, 78, 86, 98).
- `createNode` is at line 69. It calls `createAztecNodeClient(rpcUrl, { fetch: makeFetchWithTimeout(undefined, options) })` at line 74, with no `versions` and no `log` option, so the SDK logger is live.
- `createSingleAttemptNode` (line 77) goes through `silentSingleAttemptNode` (line 110). That function builds `createSafeJsonRpcClient<AztecNode>(url, AztecNodeApiSchema, { namespaceMethods: "aztec", fetch: makeSingleAttemptFetch(t), log: SILENT_RPC_LOG })`.
- `probeChainId` (line 85) calls `createAztecNodeClient(..., { fetch: makeSingleAttemptFetch(t) })` at line 92 with the default logger, then `getNodeInfo` and `walletChainId(l1ChainId, rollupVersion)`.
- `readPublicStorageOnce` (line 97) maps an `undefined` result to a thrown error (line 102-104).

**On `origin/rpc-proxy-1-a1`** (PR #1622, from the diff):
- The constructor becomes `constructor(private readonly maxBatchSizeFor: (rpcUrl) => number | undefined)`, and it is required.
- All four methods pass `maxBatchSize: this.maxBatchSizeFor(rpcUrl)`. `silentSingleAttemptNode` gets a third parameter, `maxBatchSize`.
- `apps/extension/src/wallet/services/network/node-factory.ts:7` adds `createWalletNodeFactory()`, which returns `new AztecNodeFactoryAdapter(maxBatchSizeFor)`.
- The branch uses that factory in `wallet/runtime.ts:544` (`new NetworkService(logger, browserApi, createWalletNodeFactory())`) and `offscreen/index.ts:87`.
- The plan says the default `?? new AztecNodeFactoryAdapter()` fallbacks are removed (`implementations-plan/rpc-proxy-1/plan.md:62`). The branch's `scripts/seed-preflight-node.ts:15-21` builds its own `createSafeJsonRpcClient` with `maxBatchSize: maxBatchSizeFor(url)`.

**Fakes.**
- `apps/extension/src/core/testing/fake-node-factory.ts:26` defines `FakeNodeFactory implements NodeFactory`. It keeps `created[]` (line 28) and `singleAttempt[]` (line 30) and has `setTemplate` and `setOverrides(url, partial)`.
- Its `createNode` (line 67) returns a `Proxy` over a POJO. `then`, `catch` and `finally` return `undefined`, and any unstubbed method throws `FakeNode: method "x" not stubbed for <url>`.
- `probeChainId`, `readPublicStorageOnce` and `createSingleAttemptNode` delegate to `createNode`, and the timeouts are ignored (lines 48-65). Nothing here can fail or hang a node.
- `packages/aztec-runtime/src/pxe/chain-runtime.test.ts:56` has an inline `fakeNodeFactory: NodeFactory` object. It uses `createSingleAttemptNode: () => ({}) as never` and `probeChainId: async () => 0`.
- Tests use `vi.spyOn(factory, "createSingleAttemptNode").mockReturnValue({ getNodeInfo } as AztecNode)` at `network/service.test.ts:2000, 2118, 2857, 2869` and `network-reset/service.test.ts:409`.
- Service tests fake `NetworkService` as `{ getNodeForUrl: async () => node }` (for example `transaction/service.finality.test.ts:101`, `view-executor.test.ts:115`).
- `aztec-node-factory-adapter.probe.test.ts:11` mocks `createAztecNodeClient` itself.

## 2. Every construction site

Only the adapter calls the SDK. Everything else goes through `NodeFactory`.

| Site | URL used | Called by |
|---|---|---|
| adapter `createNode`, `aztec-node-factory-adapter.ts:74` | the given `rpcUrl` | all `createNode` callers below |
| adapter `probeChainId`, line 92 | the given `rpcUrl` | `NetworkService` at `service.ts:957` (`probeNodeStatus`) |
| `silentSingleAttemptNode`, line 110 | the given `rpcUrl` | `createSingleAttemptNode` (line 82) and `readPublicStorageOnce` (line 102) |
| `NetworkService` constructor, `network/service.ts:253` | `nodeFactory ?? new AztecNodeFactoryAdapter()` | `runtime.ts` (on dev) |
| `service.ts:426` | `findPrimaryEndpoint(active).rpcUrl` | seeding the active network; fills `nodes[chainId]` |
| `service.ts:792` | the primary endpoint's URL, only if `isAllowedRpcUrl(...).ok` | active-profile change |
| `service.ts:975` (`getNode(chainId)`) | `findPrimaryEndpoint(network).rpcUrl` | lazy per-chain cache `nodes` (`service.ts:229`) |
| `service.ts:1017` (`getNodeForUrl(url)`) | the caller's URL, cached in `transientNodes` (line 230) | pinned pending-tx polling |
| `service.ts:1030` (`getSingleAttemptNodeForUrl`) | the caller's URL, 60 s timeout, cached in `singleAttemptNodes` | `readChainTip` (line 1043) |
| `service.ts:1075` (`probeIdentityOnce`) | the caller's URL, `timeoutMs` | `resolveVerifiedL1ChainId` (line 505) and network-reset |
| `service.ts:1331` (`_probeChainIdentity`) | the caller's URL, default retrying client | `addNetwork`, `update` and `_getChainId` (lines 569, 811, 849, 940) |
| `service.ts:957` | `primary.rpcUrl` | `probeNodeStatus` (the `getNodeStatus`-style check at 940 uses `_getChainId`) |
| `ProductionPxeFactory`, `chain-runtime.ts:160, 181` | `network.rpcUrl` (the primary, via `NetworkInfo`), with `retries` | the offscreen PXE; `retryWhile` comes from `chain-runtime.ts:381-382` |
| `readPublicStorageOnce`, `service.ts:1005` | `primaryEndpointUrl(network)` | background-only |

Who calls `getNodeForUrl`:
- `transaction/service.ts:586`, with `tx.submittedEndpointUrl`.
- `incoming-transfer/service.ts:662`.
- `execution/view-executor.ts:164, 220`.
- `auth-registry/service.ts:200`.

The offscreen entry builds `new ProductionPxeFactory(undefined, ...)` three times (`offscreen/index.ts:96, 98, 105`). On dev these use the default adapter, and `pxe/service.ts:183` also has a default.

E2E and test code calls the SDK's `createAztecNodeClient` directly (`tests/e2e/fixtures/aztec.ts:69`, many `tests/e2e/network/*`, `packages/aztec-runtime/src/pxe/stale-anchor.real.test.ts:102`). These talk to a local node and are not on the production path.

Absence claims:
- `silentSingleAttemptNode` is used only inside the adapter.
- There is no `createSingleAttemptNode` or `probeChainId` call outside `NetworkService` and the tests.
- Search trail for sites: `createAztecNodeClient|createNode\(|createSingleAttemptNode|silentSingleAttemptNode|probeChainId|getNodeForUrl|FakeNodeFactory|implements NodeFactory|createSafeJsonRpcClient` over `apps` and `packages`, excluding `network-endpoints.ts`.

## 3. Third-party internals (6.0.0)

### Client, `FOUND/json-rpc/client/safe_json_rpc_client.js`

**Batching.**
- Defaults are `batchWindowMS = 0` (line 10), `maxBatchSize = 100` (line 12) and a 1 MiB body size (line 15).
- Calls made in the same tick share one `setTimeout(sendBatch, 0)` (lines 161-164).
- `sendBatch` (lines 35-63) takes entries from the queue while all of these hold:
  - `rpcCalls.length < maxBatchSize`;
  - `bodySize < maxRequestBodySize`;
  - `bodySize + item.encodedLength < maxRequestBodySize` (the 1 MiB rule, line 48).
- If the queue is not empty afterwards, another timer is scheduled (lines 60-62).
- One entry with `encodedLength >= 1 MiB` throws `Request body too large: N` immediately, before queueing (lines 153-155).
- The client sends no timeout and no `AbortSignal`: its call is `fetch(host, requests, config.extraHeaders)` (line 68). Absence trail: `rg "timeout|AbortSignal|408|429"` over `json-rpc/client/*.js` found only `setTimeout(sendBatch)`.
- The `undici.js` transport is Node-only (it imports `node:zlib`) and is not used by the wallet.

**One failed entry of a batch compared with the others.**
- A JSON-RPC error on one entry of a 200 array reply: that entry gets `deferred.resolve(resp)` (line 111), and `request` then throws `new Error(response.error.message, { cause: response.error })` (lines 173-177). The other entries resolve normally.
- A transport-level failure rejects every entry of the batch. The `catch` (lines 115-137) logs `log.warn("Failed to fetch from the remote server", err)` and resolves each entry with `{ error: { code: -32000, data: err, message: err.message ?? "Failed request" } }`. Each caller then sees `Error(err.message)` with `.cause.code === -32000`.
- The exception is `ComponentsVersionsError`, which rejects every entry with the original error (lines 118-123).
- A 200 reply that is not an array, or has the wrong length: every entry gets code `-32000` and message `response.message ?? "Failed request"`, with the whole reply as `data` (lines 75-90). A single JSON-RPC error object returned for a batch lands here.
- An `id` mismatch at one index gives code `-32001`, message `RPC id mismatch`, for that entry only (lines 95-109).
- A `null` or `undefined` result resolves `undefined` (lines 179-186). Schema failures are zod errors from `parseAsync` (line 187).
- Methods are plain functions on a plain object: `proxy[method] = (...params) => Object.assign(request(method, params), { [CLIENT_ID]: id })` (lines 190-199). The object also carries two symbol keys, `CLIENT_ID` and `SEND_BATCH`, and is registered in a `WeakRef` map (line 200).

### SDK fetch, `FOUND/json-rpc/client/fetch.js` and `FOUND/retry/index.js`

The SDK defaults, which the wallet bypasses with its own fetch:
- `defaultFetch` has no timeout and no abort signal. A network error becomes `Error("Error fetching from host ${host}: ${inspect(err)}")` (lines 32-35).
- A non-JSON body that is not ok becomes `Error(resp.statusText)`. If it is ok it becomes `Error("Failed to parse body as JSON: <text>")` (lines 40-45).
- A non-ok response becomes `Error("Error ${status} from server ${host}: ${json.error.message ?? JSON.stringify(json)}")`. It is a `NoRetryError` when `noRetry` is set or the status is 400 to 499 (lines 46-52).
- `makeFetch([1, 2, 3], false)` is `retry(...)` with `makeBackoff` and `failSilently = false` (line 68).
- `retry` (retry/index.js lines 51-70) rethrows a `NoRetryError` at once. Otherwise it takes `backoff.next()` and sleeps `s * 1000` ms, and it rethrows the last error when the backoff is exhausted. `[1,2,3]` therefore means 4 attempts and 6 s of sleep in total. `log.error("Error while retrying ...")` runs on each retry, because `failSilently` is `false` and the logger is the default one.
- `createAztecNodeClient` (stdlib `interfaces/aztec-node.js:392-402`) uses `options.fetch ?? makeFetch([1,2,3], false, ...)`, `batchWindowMS: options.batchWindowMS ?? 0`, `maxBatchSize: options.maxBatchSize` (undefined falls back to 100) and `onResponse: getVersioningResponseHandler(options.versions ?? {})`.

### What a caller sees through the wallet fetch (`packages/aztec-runtime/src/utils/fetch.ts`)

For `createNode`, the fetch is `makeFetchWithTimeout`: `retry` over `fetchOnce` with 60 s per attempt (line 19) and `makeBackoff([1,2,3])` (line 152). That gives up to 4 attempts. For `createSingleAttemptNode`, `probeChainId` and `readPublicStorageOnce`, it is `fetchOnce` alone.

| Case | Error from the fetch | Retried (`createNode`) | What the caller sees |
|---|---|---|---|
| fetch throws (network, DNS, CORS) | `Error("Error fetching from host ${host}: ${err}")` (lines 79-84) | yes, 4 attempts | `Error` with that message and `.cause = { code: -32000, data: err, message }` |
| abort at `timeoutMs` | `Error("Request to ${host} timed out after ${ms}ms")` (line 81) | yes | same shape. The timer covers the body read, because `clearTimeout` is in the `finally` after the read (lines 46, 52-53, 69-71) |
| HTTP 5xx, JSON body | plain `Error("Error ${status} from server ${host}: ${json.error?.message ?? statusText}")` (lines 96-106) | yes | same shape |
| HTTP 5xx, non-JSON body | `Error(resp.statusText)` (line 91) | yes | same shape. The message has no host or status code |
| HTTP 4xx, JSON body | `NoRetryError` (line 103) | no | `Error("Error 4xx from server ${host}: ...")` |
| HTTP 408, HTTP 429 | the same `NoRetryError`, because the test is `>= 400 && < 500` (line 103) | no | `Error("Error 429 from server <host>: <message or statusText>")` |
| HTTP 4xx, non-JSON body (an HTML 404, for example) | `Error(resp.statusText)` (line 91), plain | yes, 4 attempts | the status text only |
| 200 with a JSON-RPC error entry | no fetch error | no | `Error(error.message)` with `.cause = error` |
| reply over 32 MiB | `NoRetryError(ResponseTooLargeError message)` (line 89) | no | `Error("Response body is over its N-byte budget")` |
| hang | the abort at 60 s | yes | up to 4 x 60 s + 6 s sleep, about 246 s, before the caller sees the failure. `retryWhile` is only consulted before a retry and at the start of an attempt (lines 143, 152), not during an attempt |

Notes on the table:
- `host` in the messages is the full RPC URL. Providers put API keys in the path, so these messages and the SDK's `warn` logs leak the URL. The silent logger exists for that reason (`aztec-node-factory-adapter.ts:25-44`).
- A 200 that is not valid JSON gives `Error("Failed to parse body as JSON")` (line 92). It is retried, and the body is no longer in the message.
- `retryWhile` and `NoRetryError` behaviour is pinned in `utils/fetch.pins.test.ts` (lines 47-252).
- A fallback design must treat 408 and 429 as failures that need failover. The current code treats them as terminal and will never retry them on the same endpoint.

## 4. The wallet's own fetch and `private-fetch.scan.test.ts`

- The wallet's node fetch is `packages/aztec-runtime/src/utils/fetch.ts`, as above. The comment at its top says the SDK default has no per-request timeout.
- `MAX_NODE_RESPONSE_BYTES` is 32 MiB (line 24), enforced by `readBodyCapped` from `packages/wallet-core/src/utils/read-capped.ts:15`.
- `apps/extension/src/wallet/services/private-fetch.scan.test.ts` is unrelated to the node client. It scans only `token-list/service.ts` and `price/service.ts` (line 14). It requires that every `this.fetchFn` call passes `privateFetchInit(...)` and that no object literal names `credentials`, `referrerPolicy`, `cache` or `redirect` (line 15). The node fetch is not covered by it.
- The node fetch calls the global `fetch` with `{ method, body, headers, signal }` and does not set `credentials`, `redirect` or `referrerPolicy`. I did not find a test that pins this for the node fetch (search: `credentials|redirect` in `utils/fetch*`).

## 5. Is the node object wrappable?

- `createAztecNodeClient` returns the plain object built at `safe_json_rpc_client.js:190-201`. It is not a `Proxy`. A wrapper that implements `AztecNode` with the same methods works structurally.
- The only client-specific parts are the two Symbol keys and the `batch()` helper (lines 205-223), which finds clients by `CLIENT_ID`. The wallet does not call `batch`.
- I found no `instanceof`, symbol, `CLIENT_ID`, `SEND_BATCH` or client property use on a node in wallet or PXE code (search: `instanceof.*(Node|Client)|CLIENT_ID|SEND_BATCH|\.batch\(` over `apps` and `packages`, plus `json-rpc|CLIENT_ID|\.batch\(` over `@aztec-labs/pxe` dest). The only `instanceof Node` hits are DOM nodes.
- One contract matters: `await node` must not look thenable. The fake handles this explicitly (`fake-node-factory.ts:70-75`), and a real wrapper has to do the same.
- The PXE keeps the node object it was given (`createPXE(node, ...)` at `chain-runtime.ts:234, 270`; `ChainRuntime(chainId, node, pxe, rpcUrl, store)` at line 235). A swapped node would therefore need a wrapper in place, not a new object.
- `ChainRuntime` is built with `network.rpcUrl`, a single URL, and the PXE uses the primary.

### `AztecNodeApiSchema` methods (58, from `STD/interfaces/aztec-node.js:38-391`)

This codebase has no `getL2Tips`, `getProvenBlockNumber` or `getBlockHeader`. The wallet uses `getChainTips` and `getBlockData`. A comment in `block-header-anchor.ts:10` still mentions `getBlockHeader`.

The block parameter (`BlockParameterSchema`, `STD/block/block_parameter.js`) accepts:
- a tag: `latest`, `proposed`, `checkpointed`, `proven`, `finalized`;
- a number;
- a bare block hash;
- `{number}`;
- `{hash}`;
- `{archive}`;
- `{tag}`;
- the anchored `{number, hash}`.

**Identity and config (no params):** `getNodeInfo`, `getChainId`, `getVersion`, `getNodeVersion`, `getL1ContractAddresses`, `getProtocolContractAddresses`, `getL1Constants`, `isReady`, `getEncodedEnr`, `getAllowedPublicSetup`.

**Tip and sync reads:**
- No block parameter: `getChainTips`, `getWorldStateSyncStatus`, `getSyncedL2SlotNumber`, `getSyncedL2EpochNumber`, `getSyncedL1Timestamp`.
- A tag only (not `latest`): `getBlockNumber(tag?)`; `getCheckpointNumber(tag?)` takes its own checkpoint tag.
- Block parameter: `getBlock(param, opts?)` and `getBlockData(param)`.
- Number ranges: `getBlocks(from, limit, opts?)`, `getCheckpoints`, `getCheckpointsData(query)`.
- `getCheckpoint(checkpointParam, opts?)` takes a checkpoint parameter.

**Anchored state reads (all take the block parameter as argument 1):**
- Witnesses: `findLeavesIndexes`, `getNullifierMembershipWitness`, `getLowNullifierMembershipWitness`, `getPublicDataWitness`, `getBlockHashMembershipWitness`, `getNoteHashMembershipWitness`, `getL1ToL2MessageMembershipWitness`.
- `getBlockHashMembershipWitnessAtArchive` takes an archive-only parameter.
- Storage: `getPublicStorageAt(param, contract, slot)`.
- Optional parameter: `getContract(address, param?)`.
- No block parameter, but state-dependent: `getL1ToL2MessageIndex`, `getL2ToL1Messages(epoch)`, `getL2ToL1MembershipWitness`, `getTxEffectMembershipWitness`, `getContractClass`.

**Log reads (queries, no block parameter):** `getPrivateLogsByTags`, `getPublicLogsByTags`. Their query objects carry a reference block internally. A reorg that drops it makes the call throw (`pxe/public-events.ts:219`).

**Submission and simulation:** `sendTx`, `simulatePublicCalls`, `isValidTx`.

**Tx status:** `getTxReceipt(hash, opts?)`, `getTxEffect`, `getTxByHash`, `getTxsByHash`, `getPendingTxs`, `getPendingTxCount`.

**Fees:** `getCurrentMinFees`, `getPredictedMinFees`, `getMaxPriorityFees`.

**Validators and p2p (not used by the wallet):** `getValidatorsStats`, `getValidatorStats`, `getValidatorStatsBatch`, `getPeers`, `getCheckpointAttestationsForSlot`, `getProposalsForSlot`.

Which of these the wallet calls (`rg` over `src` outside tests): `getNodeInfo`, `getL1ContractAddresses`, `getBlockNumber`, `getChainTips`, `getBlockData`, `getBlock`, `getTxReceipt`, `getContract`, `getContractClass`, `getCurrentMinFees`, `getPredictedMinFees`, `getPublicStorageAt`, `findLeavesIndexes`, `getPublicLogsByTags`, `sendTx`, `getBlockHashMembershipWitness`, `getNullifierMembershipWitness`. PXE internals add `getNoteHashMembershipWitness`, `getLowNullifierMembershipWitness`, `getPublicDataWitness` and `getBlock` (from the `@aztec-labs/pxe` dest grep).

## 6. Versions and `x-aztec-*` headers

- The wallet never passes `versions`. The `createAztecNodeClient` call at `aztec-node-factory-adapter.ts:74` has no `versions`. The silent client has no `onResponse` at all.
- With no `versions`, `getVersioningResponseHandler({})` (`STD/versioning/versioning.js`) checks nothing.
- If versions were passed, a header mismatch would throw `ComponentsVersionsError("Expected component version <key> to be <expected> but received <value>")`. A missing header would pass: `headerValue !== undefined && !== null`.
- The server side, `getVersioningMiddleware`, sets `x-aztec-<key>` on every response, even errors.
- A node on a different rollup version would answer normally, because no header check runs. The wallet detects it through `getNodeInfo` and `assertNodeServesChain` (`chain-runtime.ts:196`) or `assertLiveChainIdentity` (`packages/aztec-runtime/src/utils/chain-identity.ts`). Both compare `(l1ChainId, rollupVersion)`. `assertLiveChainIdentity` rejects a non-canonical `rollupVersion` and an `l1ChainId` mismatch, and it also checks the composite.
- `vite.shared.ts:37` has an `x-aztec-version` comment about the Presto prover. It is not the node client.

## 7. Pain points for a failover design

1. **There is no timeout in the SDK client.** The 60 s abort exists only because the wallet fetch adds it. Any new client built with `createSafeJsonRpcClient` must pass the wallet fetch.
2. **Retries multiply a dead endpoint's latency.** A hung primary costs about 246 s per call, and a connection refused costs about 6 s. The PXE node always uses the retrying client, with `retryWhile` from `chain-runtime.ts:381-382`. A health-aware failover would need the retry policy (or an immediate "this endpoint is down" signal) inside the fetch. A wrapper above the client cannot interrupt it.
3. **Batch semantics.**
   - A transport failure rejects the whole batch (up to 100 calls, or the cap), so a failover wrapper that retries on another endpoint must replay every entry.
   - Entry-level JSON-RPC errors are per entry, and are not transport failures.
   - The caller cannot tell a transport error from a server JSON-RPC error without reading `.cause.code`: both are `Error`. The transport case is `-32000` with `cause.data` holding the original error. A node that itself answers `-32000` looks the same.
   - dRPC-style caps return HTTP 500, which is retryable, so an over-cap batch is retried 4 times before failing.
4. **Status classification gaps.** 408 and 429 are terminal (`fetch.ts:103`). A 4xx without a JSON body is retried. A 5xx or 4xx with a non-JSON body loses the status code, because the message is `statusText` only (line 91).
5. **Version mismatch is not detectable by header.** Switching endpoints requires an identity re-check through `getNodeInfo`. The checks exist, but only at PXE creation and at some boundaries.
6. **Pinned endpoints.** `getNodeForUrl` caches a client per URL, and a pending tx deliberately stays on its submitted URL (`service.ts:1004-1019`). Failover must not break that pin.
7. **Connection state is spread over caches.** `nodes` (by chainId), `transientNodes` (by URL, evicted after three `reportEndpointFailure(url)` calls, and a success does not reset the count; `service.ts:1047-1051`) and `singleAttemptNodes` (never evicted). A failover has to change which URL they map to.
8. **Probe and read-once paths are separate clients.** `probeChainId` and `readPublicStorageOnce` bypass `createNode`, so a wrapper over `createNode` does not cover them.
9. **The PR's `maxBatchSizeFor` is keyed by URL.** A fallback endpoint on another origin needs its own cap. The `NodeFactory` constructor takes the function by URL, so it already works per endpoint.

## 8. Tests and helpers

- `packages/aztec-runtime/src/adapters/aztec-node-factory-adapter.test.ts`: `answering(result)` (line 24) is a `globalThis.fetch` stub that answers each batch by id. Also `reply(body, status)` (line 19) and `consoleText`. The cases cover:
  - `readPublicStorageOnce` (lines 55-120): one attempt on a 500; a non-batch body leaves no secret on the console; the abort at the deadline leaves no timers.
  - `createSingleAttemptNode` (line 125 onwards).
  - On the PR branch, a describe block "the URL's batch cap" (about lines 158-185) asserts request sizes `[3,3,2]` for 8 calls in one tick, and `[8]` with no cap.
  - The `isAllowedRpcUrl` allowlist table.
- `aztec-node-factory-adapter.probe.test.ts:11` mocks `createAztecNodeClient`.
- `utils/fetch.pins.test.ts`: reject oracle for abort, network failure, 4xx, `noRetry`, 5xx, non-JSON bodies, the timer staying armed through a body read, the 32 MiB cap, retry interaction (line 158) and `retryWhile` (line 189).
- `network/service.test.ts` (header comment at lines 2-12 says the fake bypasses the SDK proxy): the seam tests at line 305, the `getNodeForUrl` pinning tests at 382-461, and the bounded-read tests at 2000-2120 and 2857-2869.
- `FakeNodeFactory` consumers: `account-state/service.test.ts:157`, `token/service.test.ts:1361`, `network-reset/service.test.ts:111`, `network-reset/service.composition.test.ts:144`, `storage/stored-shapes.writers.test.ts:344`.
- There is no fake that simulates failures or a hang at the node level. A failover test would need either the `answering`-style `fetch` stub (the real proxy surface, as in the adapter tests) or a new fake with scriptable failures.

## 9. Search trails for the main absence claims

- No `versions` option passed: `rg "versions" packages/aztec-runtime/src apps/extension/src` found only unrelated storage and manifest matches, and the adapter's doc comment ("with no versions to check").
- No per-request timeout in the SDK client: `rg "timeout|AbortSignal|408|429"` over `FOUND/json-rpc/client/*.js`.
- No `instanceof` or client-symbol use on the node: see section 5.
- The lint guard for the single call site was not found in `biome.json`; I searched that file and not the rest of the repo's config.
