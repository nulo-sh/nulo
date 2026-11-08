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
- **Bridge:** the Send wizard (`components/send/SendWizard.vue`) uses an injected EIP-1193 wallet for L1 writes and reads; Sepolia USDC, USDT, EURC and GBPC are `permissionless-mint` `MintableERC20` (`apps/tools/public/testnet-bridge.json`), minted 100 per click (`MintStrip.vue:30`); a bridge journal resumes a claim. Its browser tests answer `window.ethereum` from Node with a viem wallet (`apps/tools/tests/browser/fixtures/l1-wallet.ts`, Playwright). The CLIs in `packages/bridge-core/scripts/` refuse any L1 signer but the pinned one, and none targets an arbitrary L2 recipient. Its keyed templates name the existing Sepolia RPC reference (`packages/bridge-core/testnet-rpc.env.example`).

## Fees on Testnet

A fresh Testnet account pays nothing for a drip: the dApp embeds the SponsoredFPC (`src/wallet/services/execution/fee/embedded-strategy.ts`), the sponsor pays for the account's deployment too (`fee/fee-strategy.ts:228`), and the SponsoredFPC is offered on Testnet (`src/wallet/services/fpc/sponsored-fpc-chains.ts:6`). The PrivateFPC needs private fee juice, so it needs a bridge first.

## The keyed-run pin

`env-exec request` refuses a dirty tree or a HEAD that is not a remote branch tip; at run time it re-checks both and that HEAD equals the approved commit (`keyed_pin`, `cmd_receive`). The run executes in the request's work tree. So a harness filed from the lane worktree would freeze it for up to six hours; a detached worktree at the pushed commit leaves the lane worktree free, provided the branch tip does not move on the remote.

## Probe (Phase 1, 2026-11-06; bridged stages 2026-11-08)

Instrument as in D5. The recorded config shows the flag `true` for Testnet (chain 685146337) in every on session and `false` in every off session. The node wrapper sits on the runtime's node, which the PXE and the wallet's own readers share, so its counts include the wallet's polling. Deltas are on minus off, so negative means the on arm was faster (D2's saving is the negation). Medians weight every pass or send equally. Speculative syncs: no operation failed with `Speculative syncs failed` (instrument, lab and Testnet), and the 13 Testnet log buffers read held no `Speculative sync of` warning; the fourteenth session lost its browser before its buffer was read.

### Lab: local network, proverless, `createPXE` direct (blocks 44-81, load1 95-203)

| Workload (N) | Pairs | Median on / off (ms) | Paired deltas (ms) | On faster | Node calls on / off | Outside spans on / off |
|---|---|---|---|---|---|---|
| (b) one pass of 12 `balance_of_private` | 6 | 1888 / 2407 | -642, -29, -244, +29, -1378, -395 (median -319) | 5/6 | 103 / 103 in every pair | 51 / 51-52 |
| (a) one private transfer, SponsoredFPC | 5 | 4703 / 5320 | -194, -798, +280, -87, -617 (median -194) | 4/5 | 50-53, equal in every pair | 31 / 31 on send 1; 22-24 / 28-30 after |
| (c) a new PXE's first pass, 12 tokens | 3 | 3273 / 4240 | -2024, +2141, +100 (median +100) | 1/3 | 116 / 116 | 66 / 66 |

Per operation, sends 2-5: `simulateTx` 717 / 909 ms with 13 / 20 round trips, `proveTx` 857 / 976 ms with 3 / 3. The flag changes one thing: a trained send's simulation folds seven round trips. A refresh pass or a first sync folds at most one, and the number of node calls never changes.

### Testnet: the built-in network, one throwaway profile restored per session (blocks 21163-21236, load1 29-379, 19:36-20:47 UTC)

Setup, off build: the four defaults, SIGNAL and NOISE added through the tools app, then each dripped private and public (1,000 SIGNAL and 1 NOISE each way). Eight drips in all; two failed setup attempts used four (`lessons/phase-1.md`). Tokens per workload: (c4) the four defaults and fee juice, (c6) those plus SIGNAL and NOISE, (b) six per pass, (a) SIGNAL.

| Stage | Pairs | Median on / off (ms) | Median paired delta (ms) | Sign agreement | Node calls | Spans on / off |
|---|---|---|---|---|---|---|
| (c4) first sync | 4 | 17862 / 19586 | -1437 (+3725, -3112, -1433, -1441) | 3/4 | -9.4 % | 62-71 / 63-74 |
| (c6) two custom tokens | 4 | 10890 / 9846 | +1140 (+2645, -83, +110, +2171) | 3/4, on slower | +28 % | 45-70 / 40-45 |
| (b) refresh, trained passes | 12 | 6156 / 6564 | -364 | 7/12 | -1.2 % | 28 / 28-29 |
| (a) estimate, send 1 | 3 | 3585 / 3478 | +94 | 2/3 | equal (22) | 19 / 19, once 28 off |
| (a) estimate, send 2 (D3: still training) | 3 | 2338 / 2606 | -137 (-339, -137, +65) | 2/3 | equal (17) | 11 / 13 in every send |
| (a) estimate, send 3, unpaired | 0 | 2270 / 2718, 2651 | none | - | equal | 11 / 13 |
| (a) proof, send 1 | 3 | 17591 / 12757 | +4831 (+4906, -186, +4831) | 2/3, on slower | 35-37 / 11 where re-synced | 19-23 / 4 in two on sessions |
| (a) proof, send 2 | 3 | 9323 / 7955 | +1241 (+2144, +51, +1241) | 3/3, on slower | equal (11) | 4 / 4 |
| (a) proof, send 3, unpaired | 0 | 8286 / 8892, 7958 | none | - | equal | 4 / 4 |

Every (b) delta, pair/pass: 1/1 -2016, 1/2 -545, 2/1 -881, 2/2 +568, 2/3 -242, 2/4 -546, 2/5 -1025, 2/6 -994, 3/1 -87, 3/2 +19, 3/3 -486, 3/4 -612, 3/5 +23, 3/6 -488, 4/1 -1544, 4/2 +567, 4/3 +66, 4/4 +1077, 4/5 +609, 4/6 +3. These are 20 pass comparisons nested in four session pairs, one of them cut to two passes. They are consistent with an order effect: with on second (pairs 2 and 3) on led in 9 of 12; with on first (pair 4) it trailed in 5 of 6. The c4 deltas do not follow order (pair 4 favoured on with on first). The (a) sessions' own first syncs, before their sends: c4 -2217, -1567, +278; c6 +3111, +1614, +481.

Losses. Pair 1's off session lost its browser connection after two passes, so its passes 3-6 have no pair. Three (a) sessions lost one send each to a stale "Transaction submitted" toast that ended the wait early. The stage rows take each completed send's own `simulateTx` and `proveTx` timing and pair sends by their order in the session: 15 of 18 planned sends completed (on 2, 3, 2; off 3, 2, 3 in pairs 1-3), so send 2 has three pairs and send 3 none. Ordinal pairing does not prove the arms had matching anchor histories. The first proof's extra round trips in two on sessions are a block and contract re-sync inside `proveTx` (`getContract` 4, `findLeavesIndexes` 6, `getPrivateLogsByTags` 11) that no off proof made. Whether a block landed between estimate and proof only in those sessions was not recorded, so the cause is open.

Offscreen JS heap, MB, before and after six passes: on 186→95, 152→90, 144→89, 116→93; off 115→90, 136→96, 144→95. No retained-heap increase was observed at these endpoints.

Lab spans saved times Testnet's mean span (149 ms), a magnitude, not a measured saving: (a) estimate 7 × 149 ≈ 1.0 s, against the 0.14-0.32 s measured, because Testnet's off arm needed 13 round trips, not the lab's 20; (b) 1 × 149 ≈ 0.15 s; (c) 0.

### Testnet, bridged tokens: funded run 3 (blocks 23319-23330, load1 10-43, 13:45-13:59 UTC on 2026-11-08)

Run 3 (§ Bridge leg) left the four defaults each holding a private balance. The on build then ran six refreshes on the profile that had just bridged EURC and GBPC; the off build restored the same account into an empty browser profile, timed its first sync and ran six refreshes. One session per arm, in a fixed order (on first), with different histories, so nothing here is a pair: deltas are by pass ordinal. The on build's first sync over bridged tokens was not measured, by the run's design: it restored its profile before bridging. The recorded config shows the flag as built in every row. Tokens per workload: the four defaults, plus fee juice for (c4); (c6) is a no-op on this profile (no custom token: 158 ms, no PXE operation).

| Stage | Pairs | Median on / off (ms) | Ordinal deltas (ms) | On faster | Node calls on / off | Spans on / off |
|---|---|---|---|---|---|---|
| (c4) first sync, four funded tokens | 0, off only | not measured / 21837 | none | - | - / 129 | - / 87 |
| (b) refresh, passes 1-6 | 0 | 5040 / 5292 | +3092, -502, -1501, -590, +362, +501 (median -70) | 3/6 | 36, 31, 59, 31, 31, 31 / 8, 31, 38, 31, 31, 31 | 19-28 / 6, then 20-23 |
| (b) passes 2-6 | 0 | 5040 / 5542 | median -502 | 3/5 | equal (31) in four of five | 19-28 / 20-23 |
| (b) trained passes (D3: 3-6) | 0 | 5038 / 5336 | median -114 | 2/4 | equal (31) in three of four | 19-28 / 20-23 |

- Each pass sat at its own anchor, one block apart. Off pass 1 shared the first sync's anchor (block 23325), so its contract syncs were cached: 2024 ms, 6 spans.
- On pass 1's record also holds a `simulateTx` (1.1 s, 5 calls) that began just before the press. On pass 3's four reads began about 3 s after the press and made 8 calls; the other 51 calls fell outside them, 39 before the first.
- load1 was 10-18 for the on passes and 34-43 for the off passes and the off first sync (34). Host load moves CPU-bound time (I5), which here favours on.
- Offscreen JS heap before and after six passes, MB: on 130→98, off 128→95.
- Against the four 2026-11-06 off (c) sessions over the same tokens unfunded (17.7-21.7 s, 94-110 calls, 63-74 spans), a first sync with funded tokens made more calls and spans: 21.8 s, 129, 87.
- Speculative syncs: every PXE operation the two bridged records hold completed, so none failed with `Speculative syncs failed`. The bridge mode read no log buffer, so the `Speculative sync of` warning count was not made there.

### Caching (D7)

| Pass (n) | Calls | (i) Repeats inside it | (ii) Repeated hash-pinned or content-addressed requests | Tip, freshness and metadata repeats | Spans (mean ms) |
|---|---|---|---|---|---|
| Testnet (b), trained (28) | 42.3 | 7.1 | 0 | 6.9: `getChainTips` 5.6, `getBlockNumber` 1.3 | 28 (149) |
| Testnet (c4) (8) | 99.4 | 42.8 | 0 | 39.3: `getBlockNumber` 19.8, `getChainTips` 14.9, `getNodeInfo` 4.6 | 66 (159) |
| Testnet (c6) (8) | 130.0 | 61.5 | 0 | 58.1: `getBlockNumber` 44.9, `getChainTips` 13.2 | 45 (162) |
| Lab (b), N = 12 (6) | 103 | 11 | 0 | 11: `getChainTips` | 51 |

- No repeated hash-pinned or content-addressed request was observed inside a pass, so (ii) is zero as measured; that fits PXE's own cache sitting above the recorder for those reads (§ The flag), though absence alone does not prove why. Zero in that narrow class is not zero cache opportunity: `getNodeInfo` repeats (4.6 per c4 pass) are node metadata a per-pass memo could probably share, unassessed here, and the tip queries are freshness checks whose reuse would trade staleness for calls. The other repeats are `getPublicLogsByTags` (3.5 per c4 pass, 3.0 per c6), whose reference block a digest cannot show, and a current-instance `getContract` (0.4 per c6 pass); both are conditional.
- Contract-sync reads did not repeat across the observed passes, each at a new anchor (a block about every 60 s): `getContract` (6.9 per pass), `findLeavesIndexes` (9.9), `getPrivateLogsByTags` (14.0). Because the node client is shared with the wallet's polling, call counts also grow with a pass's duration.
- The fast-arm public balances and the fee-juice reads never reached the wrapped node, so they are outside this coverage.
- (iii) A batched read of N balances: a refresh's `executeUtility` makes 5 calls in 4 spans, 1 of them its block sync. One shared block sync for N = 6 removes at most 5 calls and 5 spans, about 0.75 s of a 6.2 s pass. Overlapping every later token's whole sync is a deliberately loose ceiling of 20 of 28 spans, about 3 s, not an achievable target, since distinct tokens still need distinct reads. The flag reaches neither.

### Verdict (D2): closed, no switch ships

**The owner closed it on page 123, item P123-01, signed 2026-11-08 18:29 UTC: A, close**, with no note. The page's recommendation, which the owner accepted: "A switch for a saving nobody can feel costs a UI change, a glossary line and a failure mode a user can hit: a failed speculation fails the person's own operation. The bridged refresh adds nothing to the flag's case, the one first-sync saving stayed at 1.4 s of 18 with no mechanism behind it, and the proofs ran slower with it on." The record as of 2026-11-06 had read **hold** by D2's letter, with a recommendation to close; the owner deferred that call to the bridge leg (P121-04, below).

- **D2's letter reads hold.** (c4) is the only Testnet stage with a median saving of at least 1 s (1.44 s, three of four pairs, calls down 9.4 %), but the lab shows no fewer spans on its nearest workload (66 / 66 in every pair), which ship requires, so the lab fails to corroborate the saving without refuting it. Close's letter fails on the same stage: 1.44 s is not under 0.5 s. Every other paired stage saved under 0.5 s or ran slower, and no paired trained-send comparison survived D3's split.
- **The bridged stages add nothing.** The refresh has no pairs; its ordinal deltas split in sign (median -70 ms over six passes, -114 ms over the four trained ones), node calls are equal in most passes, and the off passes ran under about three times the on passes' host load. The on build's first sync over funded tokens was not measured.
- **Why close.** The one mechanism the lab shows, a trained send's simulation folding contract-sync round trips (20 to 13 in the lab, 13 to 11 in Testnet's second sends), is worth about 0.1-0.3 s on Testnet. (c6) ran slower by about as much as (c4) ran faster, and both proof stages ran slower on the on arm, observed and unexplained.
- **Reopening condition:** an Aztec line that changes the flag's implementation (`ContractSyncService` and `ContractCallGraph` in `@aztec-labs/pxe`), or a user who reports slow first syncs with many tokens.
- **If a stage ever ships**, it ships as a Developer-mode switch marked experimental, off by default (P121-04), and nothing else.

### Bridge leg: the failed funded run, the fix and the funded runs (2026-11-06, 2026-11-08)

**The owner's decision, page 121 item P121-04** (signed 2026-11-08 12:09 UTC): **C, run the bridge leg first, then decide**, with this note, verbatim: "The developer that implemented this is pretty great, so I kinda trust his work, let's test a little bit more before killing the idea. Even if it helps, at starters I'd always set it as experimental on developer mode, and off by default." So the verdict waits for the bridged first sync and refresh, and any ship is Route B only.

**The failed run.** The orchestrator ran the funded leg once, out of band, with an owner-authorized disposable Sepolia key that no lane saw: `bun run --cwd apps/extension test:e2e tests/e2e/_probe-pxe-flag.test.ts --retry=0` at 2c6ca0ad6, the lane's prebuilt off bundle as `EXTENSION_PATH`, `PXE_FLAG_MODE=bridge`, a public Sepolia node. The probe address was funded with 0.75 ETH; `bridge-connected` was recorded at 19:54:36 UTC after the discover, verify and capabilities windows; the first symbol's mint made one L1 transaction (nonce 1, about 3 µETH); `chooseTokenGasPrivate`, `goToReview` and `confirmReview` ran, and `tl-bridge-receipt` never appeared in 60 minutes. The nonce stayed at 1 (no allowance, no deposit), no Nulo window row followed the connect, and the probe closed the browser with no screenshot.

**Cause (reproduced).** A private deposit seals its claim secret before any approval or deposit: the tools app asks the L1 wallet for one or two `personal_sign` signatures over its recovery-key text (two for a wallet it has not seen). The probe's wallet answered `personal_sign` with 4200 (unsupported), so the seal failed with nothing on chain. The wizard then shows its stepper stopped at "Seal failed · phase 1 of 6", and the probe counted any visible stepper as a send that had left, so it waited the full hour for a receipt. An address-only rerun of the old wallet answer on 2026-11-08 showed exactly that state (`seal:failed`, every later phase pending) until the deadline. The token grant was not involved: the connect's capability grant already covered it, and Confirm raised no Nulo window, only silent PXE reads (`balance_of_private`, the PrivateFPC's `balance_of`, one `simulateTx`).

**Fix** (4c4c9013e on the lane branch; the harness is restored from 2c6ca0ad6 for the rerun).
- The wallet signs `personal_sign` only for the tools app's recovery-key text, line for line, naming the armed token's portal and the bridge hub, at most twice per deposit. A permit must use Permit2's domain and the router's witness types field for field, and its amount is at most the measured deposit.
- Each deposit is armed once: one approval per token, one permit, one router call. A mint needs the probe's own request, made only when the address holds less than the deposit. Confirm is never pressed again once anything was signed. So the run never spends more than the deposit it measures.
- After Confirm every wallet request (`seal-signed`, `approve-signed`, `permit-signed`, `deposit-signed`, each refusal or unsupported method), every Nulo window, every PXE operation and every wizard state change is a row with its elapsed time. A failed stepper phase, a refused signature, a review error or a Nulo window left open stops the step. The receipt wait is 15 minutes. Any stop saves full-page screenshots of the tools app and every open Nulo window, URLs cut, under the scratch `testnet/` directory, before it throws.

**Rehearsal row** (address-only: the funded run's own address, which still holds the 100 USDC its mint landed, and a public Sepolia node for reads; the wallet runs every check and then refuses; no funds; the off build on Testnet, smoke lane, retry 0, at 4c4c9013e, load1 26): connected through discover, verify and capabilities; balance 100.0 USDC against 90.0 needed, so no mint; Confirm at +1.2 s; three silent PXE operations; the seal's `personal_sign` at +5.3 s passed every check and was refused; the review showed "Rejected in wallet." at +6.3 s and the step stopped with a screenshot. `agent.sh` cannot run it: it builds and boots a local network and runs only the network lane (F6), so the rehearsal runs as the funded leg does.

**The funded runs (2026-11-08).** The orchestrator ran the fixed harness twice with the owner-authorized disposable key, the same command and variables as the failed run, and the lane's prebuilt off and on bundles.

- **Run 2 (13:05-13:21 UTC) stopped at the EURC mint.** The off build bridged USDC and USDT (Confirm to receipt 118 and 119 s). The on build's EURC mint landed on Sepolia within 20 s by the orchestrator's chain read, but the tools app's balance tile kept its old figure for 10 minutes, since the app's own one-shot receipt wait had failed and only a reload reads the balance again. So `ensureBalance` timed out and the step stopped with a screenshot, before any EURC deposit.
- **Between the runs** the harness got one reload of the tools app when the chain holds the mint but the tile is still stale 45 s later, through an `openBridge` helper shared with its opening sequence, logged as an `l1-tile-stale` row. It was a scratch patch and left with the harness.
- **Run 3 (13:33-13:59 UTC) was green.** Its USDT mint hit the stale tile once (47 s past the chain) and recovered through the reload. Every deposit took the wallet's two seal signatures, one permit and the deposit; no request was refused, and every Nulo window opened was approved. A deposit's time is L1 inclusion, the L1 → L2 message and the claim's own inclusion, not the PXE: the wallet's claim window took 3.4-4.1 s. Two deposits per build characterize the bridge; they do not compare the builds (D9). The refreshes and the first sync that followed are in § Probe.

| Token | Build | Confirm to receipt (s) | PXE operations | Node calls | Spans | Claim window (ms) |
|---|---|---|---|---|---|---|
| USDC | off | 140 | 29 | 358 | 166 | 4098 |
| USDT | off | 112 | 25 | 361 | 171 | 3504 |
| EURC | on | 101 | 26 | 358 | 178 | 3529 |
| GBPC | on | 167 | 33 | 470 | 188 | 3396 |
