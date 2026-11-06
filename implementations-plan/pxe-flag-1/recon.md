# pxe-flag-1 recon

Base: `origin/dev` at 002b76fc7. Two Sonnet explorers (the lab's mechanics; the extension on Testnet plus the unleashed faucet and bridge) and the planner's own reads of the installed `@aztec-labs/pxe` 6.0.0 and `@aztec-labs/wallets` 6.0.0 builds. `PXE6/` is `node_modules/.bun/@aztec-labs+pxe@6.0.0+7565bf829364be07/node_modules/@aztec-labs/pxe/dest/`. Paths are repo-relative.

## The flag, checked against the installed build

| Claim (research note) | Holds? | Evidence |
|---|---|---|
| `concurrentContractSyncEnabled`, env `PXE_CONCURRENT_CONTRACT_SYNC_ENABLED`, default false | yes | `PXE6/config/index.js:42-46` |
| Read once, in `ContractSyncService`'s constructor | yes | `PXE6/contract/contract_sync_service.js:35-43` (it builds `new ContractCallGraph(enabled)`) |
| A call is predicted from confidence 2; a first callee enters at 1; cap 5 | yes | `PXE6/contract/contract_call_graph.js:3-4, 71`; a committed operation adds 1 to an observed callee and takes 1 from an unobserved one (`:54-75`) |
| It learns only from committed operations; a discarded one learns nothing | yes | `contract_sync_service.js` `onOperationEnd` (`learn` on `committed`, `discard` otherwise) |
| Edges are per (address, selector); a self-call is never recorded | yes | `contract_call_graph.js:30` |
| A top-level request records no edge; only a nested call does | yes | `PXE6/pxe.js` `executeUtility` passes `triggeredBy: undefined`; the nested utility call passes `{ address, selector }` of the running function (`PXE6/contract_function_simulator/oracle/utility_execution_oracle.js:711-720`), as the private oracle does (`private_execution_oracle.js:493`) |
| Speculation fires from `sync_state` and from the invoked function | yes | `contract_sync_service.js` `#startSyncIfNeeded` calls `#speculativelySync` with `SYNC_STATE_SELECTOR` (`0x418ef5da`) and with the invoked selector |
| The sync cache is keyed per (contract, scope) and wiped when the anchor moves | yes | `syncedContracts` map; `wipe()` |
| A failed speculative sync fails the whole operation (`AggregateError`) and logs a warning naming the contract | yes | `settle()` throws `AggregateError(…, 'Speculative syncs failed, …')`; `log.warn(\`Speculative sync of ${callee.address} failed\`)` |
| Stats come back on `simulateTx`, `proveTx`, `profileTx`, `executeUtility` | yes | `PXE6/pxe.js:398-402, 437-440, 778-781, 916-920` |
| The returned stats cover the whole operation | **no** | the stats are a snapshot taken inside the operation's callback (`PXE6/pxe.js:400-402, 918-920`); `runOperation` then awaits every contributor's `settle`, which waits for the speculative syncs, and only then commits (`PXE6/operation_lifecycle.js:19-27`). Node calls a speculation makes after the snapshot are missing from it, so the on arm's returned stats understate its cost |

**What the stats measure.** `PXE6/node/benchmarked_node.js` wraps the PXE's node in a recording proxy. `perMethod[m].times` holds one entry per call of node method `m`. A round trip is one span in which at least one call is in flight; `roundTrips.roundTrips`, `totalBlockingTime`, `roundTripDurations` and `roundTripMethods` describe them. The recording opens before the operation's block sync (`PXE6/operation_queue.js` `runSynced`), so it covers that sync, the contract syncs and the execution. It counts calls as the PXE issues them, not HTTP requests: Nulo's node client folds concurrent calls into JSON-RPC batches inside the SDK (`packages/aztec-runtime/src/adapters/aztec-node-factory-adapter.ts:81`, `maxBatchSize`; `BATCH_CAPS = {}` in `apps/extension/src/wallet/services/network/seeds.ts:126-135`, so the SDK default of 100 applies). No batch-size or per-method log exists today.

**PXE caches hash-pinned reads itself.** `PXE6/node/caching_aztec_node.js` serves repeated reads that name a block by hash from its own cache, and the recording sits below that cache, so a node call either instrument counts is one the PXE's cache did not answer. A wallet-side cache can only save calls beyond that one.

**The wallet drops the stats.** `apps/extension/src/wallet/services/execution/app-facing-results.ts:26, 42` strips `stats` from what a dApp sees; no wallet code reads `nodeRPCCalls`, `roundTrips` or `timings` (the only hits are fixtures and tests).

**The local pxe patch** (`patches/@aztec-labs%2Fpxe@6.0.0.patch`) changes one branch of `PXE6/pxe.js` near line 496 (an idempotent address write for keys stored without their address). It touches neither the sync service nor the stats.

## The wallet's reads that repeat

| Read | Path | Repeats per refresh |
|---|---|---|
| Public token balances | `BalanceProjector.projectChunk` (`apps/extension/src/wallet/services/token-balance/balance-projector.ts`) builds 12 tokens per chunk (`token-balance/spec.ts:14`); `balance_of_public` goes on the fast arm, one direct node `simulatePublicCalls` (`execution/helpers/batched-view-simulation.ts:12-16`) | one node call per chunk; no PXE |
| Private token balances | `balance_of_private` is a utility; the batch launches one `pxe.executeUtility` per token at once (`batched-view-simulation.ts:207-213`); the wallet wraps each in `withPxeWrite` (`packages/aztec-runtime/src/pxe/service.ts:585-591`) and the PXE's queue runs them in turn, each with its own block sync | N PXE operations, each with a block sync and, at a new anchor, the token's contract sync |
| Fee juice | `GasBalanceReader` (`execution/gas-balance-reader.ts`): a cache of up to 5 minutes (`:28`) with single-flight dedup, invalidated by an epoch bump (settlements) and bypassed by a forced refresh (`:63-106`); the public leg is `balance_of_public` on the FeeJuice address (fast arm), the private leg `balance_of` on the PrivateFPC | up to once per refresh when invalidated; otherwise cached |

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A PXE plus a funded account, no wallet | `packages/aztec-runtime/src/pxe/stale-anchor.real.test.ts:101-140` (`createPXE` from `@aztec-labs/pxe/server`, LMDB under `~/.cache/nulo-e2e/`) | reuse the shape |
| A wallet whose PXE takes the flag | `FrozenArtifactWallet.create(node, { pxe: { … } })` (`apps/extension/tests/e2e/fixtures/aztec.ts:137-158`); `EmbeddedWalletPXEOptions = Partial<PXEConfig> & PXECreationOptions` (`@aztec-labs/wallets` 6.0.0 `embedded_wallet.d.ts`), so `concurrentContractSyncEnabled` passes through; it takes the node object, so a counting proxy fits | reuse |
| Tokens, mints, transfers | `deployTestToken` (`fixtures/aztec.ts:174`), `mintPrivateTokens` (`:283`), `transferPrivateTokens` (`:311`), `createSponsoredFeeOptions` (`:211`), `E2E_FEE_GAS` (`:166`) | reuse |
| A local stack with claimed ports | `agent.sh` (ports from `scripts/e2e/resolve-ports.ts` into `~/.agents/ports.md`, `ANVIL_URL`/`AZTEC_NODE_URL` exported, `global-setup.ts` boots anvil and `aztec start --local-network`); it runs only vitest files of `vitest.e2e.network.config.ts` and builds the wallet first | reuse with the proverless build |
| A live Testnet session | `tests/e2e/shipped-token-list.test.ts:125-170`: `launchExtension({ live: true })`, `createProfileAcceptingTerms`, `switchToNetwork(page, "Testnet")`; `launchExtension` takes `extensionPath` and `userDataDir` (`fixtures/extension.ts:97-124`) | reuse |
| The egress guard | direct hosts = CRS + Testnet node + token list when `live` (`fixtures/extension.ts:135`); the proxy's port comes from the registry (`fixtures/egress-guard.ts:14-16`); the tools app host is refused | scratch patch: one extra direct host for the faucet and bridge sessions |
| Phrase out, phrase in | `revealSeedPhrase` (`fixtures/profiles.ts:317`), `gotoOnboardingImport` and `importSeed` (`helpers/import-drivers.ts:186, 198`) | reuse |
| Settled balances | `[data-testid="tokens-list"][data-settled="true"]` (`src/popup/components/modules/TokensView.vue:348`); per row `token-balance-loading`; `captureBalanceBaseline` and `waitForFreshBalanceRow` (`fixtures/tokens.ts:237, 312`); refresh `tokens-menu-refresh`; import `importToken` (`fixtures/tokens.ts:15`) | reuse |
| Log lines | `callService(page, "log-viewer", "getLogs", [n, lastId])` (`fixtures/session.ts:95`); warn lines are captured with every toggle off | reuse, count only |
| Prior probe method | prover-warm-1 (scratch patches, a CDP drain of the PXE page, paired runs with alternating order) | reuse |

## unleashed, read for the faucet and the bridge

Read from its clone at `main` 7de51e7; nothing here imports it.
- **Faucet:** route `/faucet` (`apps/tools/src/composables/useShell.ts:28`), view `DripView.vue`. `useDrip.ts` calls `drip_to_public` or `drip_to_private` on a Dripper contract through the wallet's `sendTx`, with the SponsoredFPC embedded. SIGNAL (6 decimals, 1,000 per drip) and NOISE (18 decimals, 1 per drip) (`packages/bridge-core/src/faucet-catalog.ts`, `apps/tools/src/constants/tokens.ts`). No cooldown in the app; the contract's own limit is unverified. "Add to wallet" calls the wallet's `registerToken`. Testids: `tl-btn-connect`, `tl-btn-drip-public`, `tl-btn-drip-private`, `tl-drip-status`, `tl-btn-add-to-wallet` (`apps/tools/src/lib/testids.ts`). No create-token flow.
- **Bridge:** the Send wizard (`components/send/SendWizard.vue`) uses an injected EIP-1193 wallet for L1 writes and reads; Sepolia USDC, USDT, EURC and GBPC are `permissionless-mint` `MintableERC20` (`apps/tools/public/testnet-bridge.json`), minted 100 per click (`MintStrip.vue:30`); a bridge journal resumes a claim. Its browser tests answer `window.ethereum` from Node with a viem wallet (`apps/tools/tests/browser/fixtures/l1-wallet.ts`, Playwright). The CLIs in `packages/bridge-core/scripts/` refuse any L1 signer but the pinned one, and none targets an arbitrary L2 recipient. Its keyed templates name `op://Keyed-Runs/Unleashed-Testnet/SEPOLIA_RPC_URL` (`packages/bridge-core/testnet-rpc.env.example`).

## Fees on Testnet

A fresh Testnet account pays nothing for a drip: the dApp embeds the SponsoredFPC (`src/wallet/services/execution/fee/embedded-strategy.ts`), the sponsor pays for the account's deployment too (`fee/fee-strategy.ts:228`), and the SponsoredFPC is offered on Testnet (`src/wallet/services/fpc/sponsored-fpc-chains.ts:6`). The PrivateFPC needs private fee juice, so it needs a bridge first.

## The keyed-run pin

`env-exec request` refuses a dirty tree or a HEAD that is not a remote branch tip; at run time it re-checks both and that HEAD equals the approved commit (`keyed_pin`, `cmd_receive`). The run executes in the request's work tree. So a harness filed from the lane worktree would freeze it for up to six hours; a detached worktree at the pushed commit leaves the lane worktree free, provided the branch tip does not move on the remote.
