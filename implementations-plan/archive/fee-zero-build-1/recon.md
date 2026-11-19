# fee-zero-build-1: recon

Read directly at `3017f1928` (no recon agents: the prototype names its files, and each claim below is one read).

## The two reads

- Available: `wallet/services/execution/gas-balance-reader.ts`. `get(networkId, account, force?)` serves a five-minute cache (`GAS_BALANCE_TTL_MS`) or computes `balance_of_public` through `batchedViewSimulation` (node `simulatePublicCalls`), each leg retried once on a throw (`legWithRetry`, 1.5 s). A failed leg caches the snapshot already stale (`fetchedAt: 0`), so the next unforced `get` recomputes. `peek` returns the last figure without fetching, `null` when never read in this worker's life.
- The refusal: `sponsor-funding.ts` `probeOwnFeeJuice` reads the payer's slot once through `readPublicStorageOnce` (`network/service.ts`: `route.singleAttempt(timeoutMs)` at the active endpoint, `getPublicStorageAt("latest", …)`, bounded by `SPONSOR_PROBE_TIMEOUT_MS`), and returns `{ maxFee, balance }` when short, `undefined` when covered or unread. Called from `dapp-send-executor.ts` and `transfer-executor.ts` right after the sponsor and app-payer probes, before `throwIfAborted(signal)`.

## Who refuses on a shortfall

`git grep feeJuiceShortfall` outside tests: the window's `isShortEstimate` (`popup/windows/execute/index.vue`, also feeding `lastLandedShort`), Send's `feeAllowsSend` (`popup/pages/send-fee-gate.ts`), Send's `submitLabel` (`send.vue`, `feeRefused` → "Fix the fee", `send-labels.ts`), and `useWalletTxEstimates`' `short` (the authwit registry popups). The card (`FeeSettingsCard.vue`) draws the row; `fee-helpers.ts` `shortfallFigures` formats it. No zod schema covers `TransferFeeEstimate` on the popup boundary.

## The card's balance

`FeeSettingsCard.vue` reads Fee Juice through `useFeeSnapshot` over the balances store (`stores/balances.store.ts`). `ensure(scope, { legs: ["gas"], forceRefresh })` always calls the worker's `getGasBalances(…, forceRefresh)` (deduped per flight); unforced, the worker answers from the reader's cache. A zero public balance withdraws the Fee Juice settings, so the window cancels the estimate and the "You have no Fee Juice yet" nudge shows (the agreed-zero frame).

## The relay and the scenario

- `tests/e2e/fixtures/rpc-relay.ts`: rules match by bare method, `carrying` (request body) and `after`/`times`; faults `reply` (fixed body), `blackhole`, `delay`, `kill`, `hold`; `patchFrozen` already rewrites chosen entries of an upstream answer by id. The aztec.js JSON-RPC client batches calls made in one tick (`safe_json_rpc_client.js`, `batchWindowMS`), so a matched request can carry other entries.
- `fixtures/networks.ts` `rewriteActiveNetwork` points the active network's primary at a relay (used by `route-send.ts`). `fee-methods.test.ts` "transfer with public Fee Juice" drives Send to Public Fee Juice on `feeJuiceImportedExtension`. `rpc-failover-send.test.ts` is `@requires-proverless`.
- E2E readers of the shortfall: `network/tx-sendTx-default.test.ts:202` asserts the estimate carries none (unchanged by this work); no spec reads the sentence.

## Fixtures and captures

- `src/e2e/execute-fixture-gate.ts` decides at module scope on the build flag, so release bundles drop `execute-fixture.ts`; `_build-extension.yml` greps release bundles for `nulo:e2e:execute-fixture`. `src/e2e/config.test.ts:156` imports the gate (the armed-gate test the lane brief times).
- fee-zero-2's kit (lane cache, read-only): a scratch spec on `registeredExtension` that pins the Fee Juice quote at $0.01274, opens `#/windows/execute?fixture=<name>` at 400 × 800, picks Public Fee Juice and `shotSend`s the card.

## Prototype drift

`git diff --stat 612d2809d HEAD` over the prototype's 20 files: only `FeeSettingsCard.vue`, one line (#1813).
