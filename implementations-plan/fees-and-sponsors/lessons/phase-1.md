# Arc 1 build log

## Phase 1.2: precedence pins and the budget comments (2026-10-10)

- Built on `origin/dev` 4f34f56, before send-queue-activity arc 1 (#264), as D-orch-3 allows: tests and comments only.
- Pins added:
  - `fee/strategies-lifecycle.test.ts`: `fj`/`fjwc` commit an app cap below the node minimum verbatim with no multiplier; both `fpc` paths ignore an app cap (committed cap and payload `maxFee` stay the wallet's); on all five paths `buildStandard` gets no gas settings and the committed priority is the build's.
  - `fee/fee-structural-parity.test.ts`: finalize commits a below-minimum `customLimits.maxFeesPerGas` with no multiplier and no floor.
  - `tx-request-builder.pins.test.ts`: `buildStandard` reads no fee from the operation (the entrypoint gets `undefined` gas settings); NO_FROM commits zero priority whatever the app's gas settings carry. The NO_FROM helpers moved to module scope so both describes share them.
  - `operation-planner.test.ts`: the planner's Send-page `send_transaction` carries no `fee`.
- **Deviation: five comment sites, not four.** The "byte-for-byte" claim the plan placed in `account/fee-options.ts` lives in `account/nulo-account.ts`; `fee-options.ts` carries a sibling "(matches upstream)" claim. Upstream 6.0.0-rc.1 defaults to `getMinFees(Limit)` × 1.5 (`wallet-sdk/dest/base-wallet/base_wallet.js:180`), Nulo to `getCurrentMinFees()` × 1.5, so both claims were false. Both were corrected; no code changed. The embedded strategy's inline "keeps max_gas_cost within the dApp's embedded amount" repeated the budget claim and was cut with it.
- Gate: `bun run lint` ✓, `bun run typecheck:all` ✓, the phase's vitest command (8 files, 200 tests) ✓, `bun run --cwd packages/aztec-runtime test` (372 passed, 2 skipped) ✓.

## Phase 1.6: the fee reply shape (#197's in-repo half, 2026-10-10)

- Built before #264 lands: `packages/aztec-runtime/src/fee-juice.ts` and its callers are outside #264's files.
- `predictedWorstMinFees` passes every node reply (each current-min read, each predicted slot) through `checkedFees`, which refuses anything without bigint components with the fixed `Error("Malformed fee reply from the node")`. The check is structural, not `instanceof`: test nodes hand back bare `{feePerDaGas, feePerL2Gas}` objects (`transfer-estimate-reuse.ts:202-205` re-wraps for that reason).
- **Where the refusal goes (traced, read-only Explore agent):** an estimate failure reaches the popup as a plain `Error`; Send and the execute window log it and show their existing fixed toast "Couldn't estimate fee. Try again." (`send.vue:394-400`, `windows/execute/index.vue:153-156`); the reuse ladders treat a failed fee read as a miss (`operation-estimate-reuse.ts:144-148`, `transfer-estimate-reuse.ts:207-210`). The only place an error's own text can show is the execute window's processing-error detail (`windows/execute/index.vue:517`), which today would show the TypeError's text for the same reply.
- "The two reply pins": read as one refusal pin per reply source (a null-like current min; a null-like predicted slot), beside a success control. Both refusals fail against the base copy (checked).
- Not covered, by scope: the other direct `getCurrentMinFees()` reads (`embedded-fpc-cap.ts`, the NO_FROM build, `completeFeeOptions`); #197 names only `fee-juice.ts`.
- Gate: `bun run lint` ✓, `bun run --cwd packages/aztec-runtime typecheck` ✓, aztec-runtime tests (375 passed, 2 skipped) ✓, `apps/extension` execution suite (1026 passed) ✓.

## Phase 1.1: the speed level at the popup RPC boundary (#196, 2026-10-10)

- Built after #264 landed and `origin/dev` 45075a3 was merged in.
- `@nulo/wallet-bridge` `fee.ts`: `isPriorityLevel` (own key of `PRIORITY_MULTIPLIERS`), `refuseUnknownPriority`, and `refuseUnknownPriorities(readers, method, params)` with a `FeeSettingsReaders<Methods>` type, so each service declares one `satisfies`-checked reader map and its `invoke` override is two lines. The readers return `FeeSettings | undefined`, so a signature whose fee slot moves fails to compile.
- **Deviation (shape):** `refuseUnknownPriorities` takes a plain index-signature map, not a generic over `Methods`: TypeScript cannot infer `M` back through the mapped reader type at the call site.
- Tests: one table-driven file through each service's real `handleRequest` (`src/wallet/services/fee-settings-rpc-guard.test.ts`): each of the seven methods refuses `"constructor"` and runs `"fast"`; per service an unknown name, a non-string and `""` are refused; an absent level, a non-object `feeSettings`, non-array `deltas`/`operations` and a `simulate_transaction` operation reach the method; the refusal logs only at debug. `wallet-bridge/src/fee.test.ts` covers the predicate.
- Base-copy check: with the three services at `HEAD`, 17 never-happens rows fail and the 7 controls pass.
- Inner second line kept: the operation pins' describe and header and the `reuseFeeMultiplier` / `feeReadFailed` docs now name the RPC boundary as the first line.
- **"The two reply pins" (Phase 1.6), found here:** `operation-estimate-reuse.pins.test.ts`'s and `transfer-estimate-reuse.pins.test.ts`'s null-like reply rows mocked the read resolving `undefined`/`null`, which the real read can no longer do; they now answer the real read from a null-like node (commit "drive the reuse ladders' null-reply pins through the real fee read").
- Gate: `bun run lint` ✓, `bun run typecheck:all` ✓, `bun run --cwd packages/wallet-bridge test` (681) ✓, `bun --bun vitest run src/wallet/services/execution/ src/wallet/services/dapp-interaction/ src/wallet/services/auth-registry/` plus the guard file (1187 passed) ✓.

## Phase 1.3: a timed-out estimate keeps its place (#119, 2026-10-10)

- Built after #264 (send-queue-activity arc 1) merged; #264 left `withEstimateAdmission` as it was.
- **Catch audit (read-only Explore agent), all three entries down to `pxe.simulateTx`:** no catch on the path replaces or drops the simulation's rejection. Every strategy, `simulateTxTask` and `buildStandard`/`buildNoFrom` catch is `task.fail(error); throw error`; the swallows (`sponsor-funding.ts`, the reuse stashes) wrap reads after the simulation; the scope-registrar and store-key retries rethrow the original or raise the retry's own error, which the client records the same way. One residual: `task.fail` itself can throw (`Invalid task id` after a profile switch clears the registry), replacing the error with one that has no `cause`. The hold is then not found and the entry settles at once, as before: the fail-safe direction.
- **Deviation (shape):** `offscreenSettled` takes the error, not a request id. The client keeps a `WeakMap` from each `simulateTx` timeout error it raised to its request id and walks the `cause` chain (depth 8), so only an error this client made can start a hold; an `RpcTimeoutError` built elsewhere with a matching `details.requestId` cannot.
- **Deviation (where the epoch moves):** `retireDocument()` runs inside `closeOffscreen()` after `closeDocument()` resolves or an attached Firefox frame is removed, not in the `trackedClose()` link. Wrapping the link in an `async` function added a microtask and broke the existing exact-microtask pin (`probedAt` 4 → 5).
- **Deviation (harness):** the transition test builds the service on `ExecutionService.prototype` with the real registry and the real `PxeServiceClientBase` over a fake `chrome.runtime`, not through `pxeClientFactory`: a constructed service needs the whole `init` graph, and the composition harness defers the fresh-build path. The id-survives pins run per entry at the deepest existing harness: `previewOperationAuthwits` through the service RPC and the real executor to `pxe.simulateTx`; `estimateOperationFee` through the service RPC to the strategy seam; `TransferExecutor.estimateFee` at its build seam; the strategy hop (already pinned, `strategies-lifecycle.test.ts`) and `simulateTxTask` (new pin) below them.
- `dapp-send-executor.test.ts`'s RPC harness stubbed `pxeService` as `{}`; it now carries `offscreenSettled`, which the service calls on every failed estimate.
- Base-copy check: with `EX/service.ts` at `HEAD`, the transition test's two never-happens fail (the parked fifth runs at the timeout; the TTL case frees its places early) and its two controls pass.
- Gate: `bun run lint` ✓ (27 warnings, all pre-existing on `dev`), `bun run typecheck:all` ✓, extension-messaging ✓, aztec-runtime ✓, `apps/extension` `execution/` + `pxe/` + `utils/` ✓ (counts in the progress log).

## Phase 1.4: two extractions, eight declines (#222, 2026-10-10)

- Both sites re-read after #264. `fingerprintBuiltFee(txRequest)` lives in `estimate-reuse-shared.ts`; each stash computes it where it read `builtFees` before (the dApp stash before `randomUUID`, the transfer stash before `requireActiveProfile`), so no read moves. The transfer site's "exact built fee, never a refetch" comment became the helper's doc.
- `reuseFeeMultiplier` is `feeMultiplierFor`; `buildAndEstimateTxRequest` calls it, so a missing priority now passes `DEFAULT_FEE_MULTIPLIER` instead of `undefined`. Traced: `finalizeGasLimits` and both fpc reads use `?? DEFAULT_FEE_MULTIPLIER`, and the multiplier prices only the refetch an embedded payment never reaches, so nothing committed changes. An unknown name maps exactly as before (`PRIORITY_MULTIPLIERS[name]`), behind the RPC boundary's refusal.
- No test was edited in either commit. The eight declines are in the PR body draft.
- Gate after each commit: `bun run lint` ✓, `bun run typecheck:all` ✓, `apps/extension` execution suite (1051 passed) ✓.
