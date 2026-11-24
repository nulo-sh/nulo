# Recon: dapp-estimation-extract-1

Base `967c626d1` (origin/dev). Two Explore agents (sonnet): a reuse sweep and a test-fixture map;
the lead checked every line cited below. Paths are under `apps/extension/src/wallet/services/execution/`
unless they name another root.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A home for the helpers the confirm shares with the estimate | `estimate-reuse-shared.ts` is scoped by its header to "what the two estimate-reuse caches share"; its importers are both caches, `preview-snapshots.ts`, both executors and `service.ts`. NO_FROM building and discovery never touch a reuse cache. `operation-fingerprint.ts` holds the fingerprint functions but carries a complexity acceptance in `scripts/complexity-baseline/manifest.json`. No other module is shared by both dApp halves (searched `estimate-reuse-shared\|shared-send-deps` importers and `execution/` names). | build new: the new module exports the four pure helpers; the issue's suggested home does not fit |
| The narrow-deps pattern | `DiscoveryAwareEstimatorDeps` (`discovery-aware-estimator.ts:47-78`), `RegistrationExecutorDeps` (`Pick<Service,…>` members), `TransferExecutorDeps extends SharedSendDeps` with `Pick<ExecutionLane,…>` and `Pick<ChainTipGate,…>` | reuse as is |
| Wiring point | `service.ts` `wireDappSendAndViewExecutors(shared)` builds `DiscoveryAwareEstimator` just before `DappSendExecutor`; `wireExecutors` builds the lane and the builder first; caches come from `wireGasBalancesAndEstimateCaches`, before `wireExecutors` | reuse: build the new class there, before the executor |
| The cache objects | `OperationEstimateReuse` (`stash`, `evict`, `tryConsume`), `PreviewSnapshots` (`stash`, `evict`, `claim`, `take`), both service-owned; `EstimateCancelRegistry.evictStash` evicts from both | reuse as is, typed through `Pick` per side |
| Shared send deps | `shared-send-deps.ts`: "Widths are the narrowest either executor reads; an executor may narrow a member further" | reuse; the new class takes a `Pick` of it, not the whole |

## Callers and reach-ins (must move with the methods)

- Production: `service.ts` `estimateSendTransactionFee` (`:796`), `estimateOperationFee` (`:810`),
  `previewOperationAuthwits` (`:824`) call the executor. No other production caller.
- Fake services stubbing `dappSendExecutor.{estimateOperationFee,previewOperationAuthwits}`:
  `estimate-hold.integration.test.ts:59-60`, `estimate-admission-order.test.ts:43`,
  `service.estimate-queue.test.ts:352`, `service.refusal.test.ts:37-49`,
  `service.composition.test.ts:1306,1338,1367`, `dapp-send-executor.test.ts:2408` (the
  service-RPC preview block).
- `apps/extension/tests/helpers/fee-race-in-process.ts:445,471-472`: replaces
  `raw.dappSendExecutor.discoverNoFromAuthwits` on the instance and parks the two entry points.
  An instance method can be replaced this way; a module function cannot.
- Deps literals: `feesettings-invariant.test.ts:28-76` (`satisfies DappSendExecutorDeps`, so every
  key moves with the type), `service.characterization.test.ts:103` (a literal into the constructor).
- `service.validated-observer.test.ts:24-26` reads `dappSendExecutor.deps.buildAndEstimateValidated`
  after `wireDappSendAndViewExecutors({})` on a bare prototype: the wiring must not dereference a
  member of `shared` or of an unset field.

## Test fixture (`dapp-send-executor.test.ts`, 3,731 lines)

- `makeHarness` (`:149-278`) builds one deps bag and `new DappSendExecutor(deps)`; 129 call sites;
  wrappers `harnessDiscovering`, `snapshotHarness`, `sponsorHarness`, `appPaidHarness`,
  `realReuseHarness`, `holding`, `parked`, `makeRealMapLane`. `realReuseHarness` reads
  `getNetwork`, `getPendingForAccount`, `sequenceEpoch` lazily through `h.deps`; `:3711` rebuilds
  the executor over `h.deps` after `Object.assign(h.deps, { sequencer })`.
- 64 calls of `executor.estimateOperationFee` / `executor.previewOperationAuthwits`.
- Estimate/preview-only blocks: `:1010-1062`, `:2512-2590`, `:2592-2665`, `:2881-3028`,
  `:3225-3322`; mixed blocks (estimate then confirm): `:453-572`, `:1439-1651`, `:1835-2510`,
  `:3362-3420`. No test reaches a private member of the executor.
- Pins that move with the methods: the `logDebug` text `"estimateOperationFee: cache write
  skipped"` (`:3011-3026`), the `sequenceEpoch` / `chainTip.unconfirmed` / pending-set reads
  (`:1463-1494`, `:2956-2960`), `captureExecutionFence` never called on a pre-aborted entry
  (`:3237`, `:3296`), the locked-wallet entry (`:1810-1831`).

## Static guards

- No `biome-ignore` in `dapp-send-executor.ts`; no complexity acceptance for it in the manifest.
- `legal/call-sites.test.ts` pins `node.sendTx` to `execution-coordinator.ts` and the guard's
  callers; neither file this lane writes holds either.
- The chaos model (`tests/e2e/helpers/profile-chaos/model.ts`) cites only profile, backup and
  onboarding files: no re-pin.
- Lane `shared-guards-1`'s pending inline guard in this file is `typeof wait === "object" && wait
  !== null` in `dappWaitOpts`, send-side; it stays where it is.
- Parked branch `authwit-grant-build-1-a1` adds a third argument to both
  `processAztecJsPayload` calls (estimate `:486`, send `:996`); the estimate one moves files, so
  that branch's merge of dev takes it to the new file. Nothing renamed that it touches.
- Docs that name the split: `execution/README.md:17` (file map row),
  `discovery-aware-estimator.ts:4` ("Owned and invoked exclusively by `DappSendExecutor`").

## Open work

`gh issue list --state open --search "DappSendExecutor OR estimateOperationFee"`: #1934 (this
lane), #1936 (`AuthRegistryService`, out of scope). Closed known limits in the area: #1358 (an
unclaimed snapshot outlives a lock until its TTL), #395, #396; this lane changes none of them.
