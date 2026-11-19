# e2e-flakes-3 recon

Base: `origin/dev` at 4b250dfe4. One Explore agent (sonnet) traced the token-add toast path; the rest was read and run by the planner. Collisions: rpc-fallback-1 arc 3 holds `packages/aztec-runtime/src/pxe/*` and `apps/extension/src/wallet/services/{network,execution,…}/*`; nothing below touches them.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Count the setup tabs on both browsers from a source BiDi cannot drop | `chrome.tabs` from the spec's own control page; the spec's `trackedTab` already reads the tab this way (`tests/e2e/onboarding-tab.test.ts:367-371`). Own-extension tab URLs are readable without the `tabs` permission on both browsers (probe: Firefox 158 and Chrome list `src/onboarding/index.html#/onboarding/welcome` on the setup tab, `undefined` on `about:blank`) | reuse-as-is |
| A tab Firefox's BiDi never lists | `waitForNewTab` on the driver (classic handle diff, `fixtures/browser/firefox.ts:867`); flake ledger row 36 | not needed: the spec needs a count by URL, which handles cannot give without switching windows, and a switch moves the focus the spec asserts |
| The inclusion-safe min fee | `predictedWorstMinFees(node)` (`packages/aztec-runtime/src/fee-juice.ts:33`), used by every committed cap (`fee/fee-cap.ts:37`), tested in `fee-juice.test.ts` | reuse-as-is |
| Default `maxFeesPerGas` for a simulation | `completeFeeOptions` (`packages/aztec-runtime/src/account/fee-options.ts:60`): `getCurrentMinFees() × 1.5`; upstream `BaseWallet.completeFeeOptions` (wallet-sdk 6.0.0) uses the worst predicted slot × 1.5 | adapt: one line |
| A unit harness for the cap | `fee-options.test.ts` (`fakeNode` with `getCurrentMinFees` only) | adapt: one case with `getPredictedMinFees` |

## #1667 findings

- Every failing job failed all three attempts (`retry x2`), each attempt on a fresh browser; the job's rerun passed. Three PRs, Firefox 158.0 each time. `trackedTab` passed every time: the tab the wallet stored existed and was active.
- `NavigationManager.sys.mjs:387` (`context is null`) is logged once per toolbar panel open: twice in a green run, once in a red one (only one panel opened), never in a probe with no panel. It is the panel's, not the setup tab's.
- Firefox 158's BiDi drops a context it never sees ready (`browsingContext.sys.mjs` `#onContextAttached`: a `replace`, an `extension` remote type at attach, or `waitForTopBrowsingContextToBeReady` returning null); the suite's shim gives Puppeteer an add-on page's URL only from a `navigationCommitted` for a context it saw announced (`fixtures/browser/bidi-attach.ts:81-105`). Either gap leaves no `page` target on the setup tab's URL for good.
- Not reproduced locally: 5 plain runs, 6 pinned to two CPUs, 1 instrumented, 4 probes forcing an `extension`-remote tab and a web-to-extension switch from chrome scope. All listed the tab within 20 ms.
- Control: with the shim dropping the setup tab's BiDi events, the spec fails with CI's message (`last: 0`) and a `chrome.tabs` count passes.

## #1590 findings

- In 5 of 5 failures (4 Chrome shard 2/5, 1 Firefox; runs and jobs in lessons/phase-0.md) the node logged two `Failed to process tx …: maxFeesPerGas.feePerL2Gas must be greater…` about 1.0 s and 2.1 s after the Import click. Of 12 sampled green Chrome shard 2/5 jobs (2026-11-04/05), 2 logged one such line at the same moment and 10 none.
- Those lines are not sent transactions. The wallet's only `node.sendTx` is `ExecutionCoordinator.sendTxTask`; the import sends nothing. `node.simulatePublicCalls` runs a `PublicProcessor`, which logs exactly that line when `computeEffectiveGasFees` (`@aztec-labs/stdlib/fees/transaction_fee.js:10`) finds `maxFeesPerGas` below the simulated block's fee, and rethrows it (`aztec-node node_public_calls_simulator.js:169-173`), `skipFeeEnforcement` or not.
- `addToken` → `fetchTokenMetadata` → `batchedViewSimulation` (`token/service.ts:862-905`): the fast arm simulates name, symbol and decimals on the node with `completeFeeOptions(…forEstimation)`; a non-`SimulationError` rejection reruns everything through `pxe.simulateTx`, whose request is built by `nulo-account.buildTxExecutionRequest` with the same default (`nulo-account.ts:153`). Two refusals fail `addToken`; the popup shows its generic error and fires no toast (`NewTokenPopup.vue:264-270`). One refusal recovers on the rerun. (Inferred from the timing and the code: CI keeps no popup log.)
- The node prices the next block (`prepareNextBlock` → `NextBlockPredictor.predict`): mid-checkpoint the fee the checkpoint froze into its first block, at a boundary a cached L1 price. `getPredictedMinFees` leads with that same fee (`server.js:678-707`); `getCurrentMinFees` is the fee provider's L1-forward entry. Local sandbox fees moved from 8.66e9 to 1.04e9 and from 1.04e9 to 1.94e8 per L2 gas within minutes; a ×1.5 pad over the current minimum does not bound that. A 20-minute sampler on a Firefox shard's node saw no block whose fee exceeded the prior current × 1.5: the gap needs a fee move inside a checkpoint.
- Probe: serving the wallet a quarter of the node's current fee (`aztec_getCurrentMinFees`) reproduces the failure on both browsers, with the node's refusal line and no toast; with the fix, the add passes.
- Healthy local adds (16 instrumented, Chrome shard 2/5): click to toast 1.8-7.4 s. The balance wait's missing bound before the first `onTokenBalanceAdded` is real but no trace ties it to these failures (plan.md, D5).
