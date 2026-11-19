# rpc-fallback-1 recon

Base `3b845ef02` (origin/dev, where #1622, lane `rpc-proxy-1` arc 1, merged). The research read `e5cffd82d` plus #1622's branch before it merged. Six read-only research agents (Sonnet) mapped the modules; their reports, with file:line for every claim, are in [research/](research/): [node-client.md](research/node-client.md), [pxe.md](research/pxe.md), [network-service.md](research/network-service.md), [execution.md](research/execution.md), [background-readers.md](research/background-readers.md), [test-infra.md](research/test-infra.md). No URL that carries a provider key is quoted anywhere in this folder.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Ordered endpoints per network | `Network { endpoints[], primaryEndpointId }` (`services/network/spec.ts`); order is the array order, no reorder method | reuse as is: preference is the primary, then the rest in stored order |
| Per-attempt transport with timeout and status classes | `packages/aztec-runtime/src/utils/fetch.ts` (`fetchOnce`, `classifyRpcFailure`, 60 s abort, `[1,2,3]` backoff, `retryWhile`) | adapt: tag each thrown error with a typed failure kind; keep every retry rule |
| Endpoint-bound clients with the per-origin batch cap | `AztecNodeFactoryAdapter` (`createNode`, `createSingleAttemptNode`, `probeChainId`) and #1622's `maxBatchSizeFor` | adapt: one client per endpoint under a routed node |
| Routing between endpoints, health, snap-back | none (searched `failover`, `fallback`, `health`, `liveEndpoint`, `secondary`, `endpointOrder`, `snap back` over `apps`, `packages`, `ARCHITECTURE.md`, `CLAUDE.md`) | build new: `packages/aztec-runtime/src/routing/` |
| Chain identity of an endpoint | `walletChainId`, `assertSameChainIdentity`, `nodeChainId` (chain 0 loopback rule), `assertNodeServesChain`, `assertLiveChainIdentity`, the store's rollup-address stamp | reuse as is inside admission |
| Bounded probe | `createSingleAttemptNode`, `probeIdentityOnce`, `IDENTITY_PROBE_MS` (5 s) | reuse: the router's probe is one single-attempt batch |
| "This row's node, not the active profile's" | `getNodeForUrl(primaryEndpointUrl(network))` at `view-executor.ts:164,220`, `auth-registry/service.ts:198,562`, `incoming-transfer/service.ts:660` (#658's fix shape) | adapt: `getNodeFor(network)` |
| Pending-transaction pin | `getNodeForUrl(submittedEndpointUrl)`, `getSingleAttemptNodeForUrl`, the send check, finality | reuse as is (privacy § 5.1, Terms § 7.1) |
| Offscreen runtime identity | `ChainRuntimeRegistry.peekMatching` / `ensure` compare `rpcUrl` and rebuild the PXE on a mismatch | adapt: compare the ordered endpoint list, so a failover never rebuilds |
| Lag and reorg safety nets | the PXE's `chain-pruned` handling, `withStaleAnchorRetry`, the public scan's dropped page and reconciliation, the note bracket | reuse as is; the router's floor keeps a lagging endpoint from triggering them |
| Local relay with faults | none forwards; terminal stubs only (`fixtures/node-stub.ts`, `helpers/rpc-stub.ts` `planBatchReplies`, the egress guard) | build new on `listenClaimed` and `planBatchReplies` |
| Port claims and teardown | `listenClaimed` (`fixtures/egress-guard.ts:167`), `port-registry.ts`, `process-group.ts` | reuse as is |
| Editing a stored network row in e2e | `rewriteActiveNetwork` (`fixtures/networks.ts:37`) | reuse as is |
| Holding a send in proving | `holdProofGate` / `releaseProofGate` (`fixtures/proof-gate.ts`) | reuse as is |
| A real PXE without a browser | `stale-anchor.real.test.ts` (server entrypoint, LMDB on real disk, a genesis account) | adapt for the integration suite |
| CI on routing changes | the network lanes' filters already hold `apps/extension/**` and `packages/aztec-runtime/src/**`; the shard pool takes any new `tests/e2e/network/*.test.ts` | reuse as is: no new workflow or required check |
| Seeds with one URL | `DefaultSeed.rpcUrl`, `_buildNetwork`, the `SeedOffers` record (kinds only) | adapt in arc 5 |
| A privacy-only legal version | `packages/legal/README.md` § Shipping a new version | reuse as is |

## Open work and closed limits

- #1624 (this lane's spec, filed at the start of planning). #1607 and #1609 are context and close with #1622.
- Closed known limits that touch this area: #551 (a reset against a silent node waits one 60 s request per call), #658 (a view call can reach the next profile's node; reopening fix is a node built from the captured row, which `getNodeFor(network)` is), #784 (a hanging tip read holds the feed's first paint for 60 s), #1554 (alternating page failures keep a reconciliation restarting with no stall shown), #143 (poller volume; now block-gated). This plan reopens none: it does not change their 60 s first attempt and does not shorten any timeout.
- Searched `gh issue list --state all` for `failover`, `multiple endpoints`, `several endpoints`, `fallback rpc`, `snap back`, `endpoint health`: only #1607 and #143.
