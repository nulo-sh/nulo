# dapp-boundary-1: recon

Base: `origin/dev` at `13d5f8d0`. Two Sonnet explorers (a reuse sweep over six capabilities, and a map of every consumer of the two results), then a direct read of the installed `@aztec-labs/*` 6.0.0-rc.3 sources under `node_modules/.bun/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Serialise a dApp result | `wallet-sdk/to-json-safe.ts` (`toJsonSafe`, the only non-test caller is `background.ts:1478`) | reuse as is; it filters nothing and stays the last step |
| Reduce a result to an app-facing shape | none. Searched `sanitize|redact|scrub|allowlist|project[A-Z]` over `apps/**/*.ts` and `packages/**/*.ts`; the hits are contacts, backup, the logger and `capability-negotiation.projectRequestedCapabilities` | build new: one module beside `view-executor.ts` |
| Logger redaction (`trim`, `REDACTED_KEYS` in `wallet/logger/utils.ts`) | a lossy, depth-capped denylist for log lines, owned by the logging-policy skill | do not reuse: a dApp result must stay schema-valid |
| Rehydrate results across the offscreen boundary | `pxe/client.ts:440-452` re-parses `TxProfileResult` / `TxSimulationResult` through the upstream schemas | reuse as is: the reduction runs after it, in the service worker |
| Typed refusal of one value of a dApp option | `InvalidWalletArgumentsError.forMethod` (`extension-messaging/src/errors.ts:286`), mapped to -32602 with a constant message (`error-envelope.ts:59`) and logged at debug (`background.ts:1532-1541`); precedents `wallet-bridge/src/fee.ts:47` `refuseUnknownPriority` and `view-executor.ts:361` (executeUtility on a non-utility function) | reuse as is |
| Stub-account override | `pxe/service.ts:523-596` (`stubAccountAddresses`, forces `skipKernels: true`); used by `view-executor.ts:332`, `dapp-send-executor.ts:1317`, `authwit-discoverer.ts:121` | cannot carry `profileTx` (see Facts) |
| Deep "never contains" test helper | none. Searched `walk|deepKeys|collectKeys|assertNoKey|keyPaths` and titles `never contains|at any depth`; the idiom found is `JSON.stringify(x)).not.toContain(SENTINEL)` (`logger/utils.test.ts:42-145`) | build new, test-local |
| Result fixtures from real classes | none shared; hand casts in `fast-path.test.ts:120`, fee tests, `batched-view-simulation.test.ts:515`; no `TxProfileResult` fixture | build new, test-local, from the upstream classes |

## Where results leave the worker

- One response line for every top-level call: `background.ts:1477-1478` (`dispatcher.dispatch` then `toJsonSafe`).
- `batch` legs re-enter `dispatcher.dispatch` (`dispatcher.ts:465`) and their raw results ride inside the batch array, so a reduction keyed on `message.type` at the response line misses them.
- Only the dispatcher builds `aztec_simulateTx` and `aztec_profileTx` operations (`dispatcher.ts:1063-1090`); the extension calls them only from `execution/service.ts:998-1005`. `DappInteractionService` can also run these kinds (`dapp-interaction/service.ts:111-113,677,739-741`). The wallet's own simulations (fees, balances, authwit discovery) call `pxe.simulateTx` directly and never reach these two methods.
- The fast path (`fast-path.ts`) merges a standard arm into a `TxSimulationResultWithAppOffset`; the merge reads the full object, so a reduction runs after the merge.

## What the consumers read

- **The dApp SDK** parses each response with the upstream return schema (`wallet-sdk/dest/extension/provider/extension_wallet.js:127`): `TxSimulationResultWithAppOffset.schema` for simulateTx (requires `privateExecutionResult` and `publicInputs` in full), `TxProfileResult.schema` for profileTx (every step needs `bytecode`, `witness` and `vk`, which may be empty).
- **aztec.js** (`contract_function_interaction.js:113-140`, `batch_call.js:127-138`, `deploy_method.js:273-276`): per-call `returnValues` and the nested tree, per-call `offchainEffects` with `publicInputs.callContext.contractAddress`, the tail's `constants.anchorBlockHeader.globalVariables.timestamp` and `gasUsed`, `publicOutput.publicReturnValues`, `stats`, `appCallOffset`.
- **The playground** (`apps/playground/src/lib/simulation-summary.ts:38-80`), read by the network e2e `selfpay-phase` and `sim-from-selfpay`: per frame `publicInputs.callContext.{contractAddress, functionSelector}`, `argsHash`, `minRevertibleSideEffectCounter`, `publicCallRequests`, and `nestedExecutionResults`; `privateExecutionResult.publicFunctionCalldata`; the tail's `feePayer` and `forPublic` call requests; `gasUsed`. Its profile button sends `profileMode: "full"` (`sections/simulation.ts:96`) and reads nothing back.
- **e2e:** `sim-methods` accepts `ok` or `error` for both methods; `delete-after-prove` needs a dApp `profileTx` to return `ok` and to load bb.js's CRS cache (a gate count does); it runs in CI's prover-on canary job (`CI.md:84`).

## Collisions

- Lane dapp-boundary-2 edits `packages/wallet-bridge/src/dispatcher.ts` in parallel; this plan does not edit it.
- #612 (open): `sim-profileTx` timed out once at 30 s on a Chrome shard. This plan does not close it; its own reopening rule stands.
- No closed `known-limit` issue covers what a dApp's simulation or profile result carries (searched "simulate", "profile", "simulation", "dApp result", "witness").
