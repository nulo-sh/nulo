# pxe-limits-1 recon

Base: origin/dev at `cef87d9de`. Aztec `6.0.0-rc.3`. `<pxe>` is `@aztec-labs/pxe/dest` as the extension bundles it (identical to the installed toolchain's but for a Nulo patch to account-key healing). Two Sonnet explorers plus the planner's own reads; every line here was read in code or, where marked *run*, observed. Pattern and baseline: [block-time-1](../archive/block-time-1/plan.md).

## The offscreen PXE

- **Where:** the offscreen document on Chrome, an iframe of the background page on Firefox (`apps/extension/src/offscreen/index.ts:95-105`, `apps/extension/tests/e2e/FIREFOX.md:35`); one runtime per (profile, chain) (`packages/aztec-runtime/src/pxe/chain-runtime.ts:284`).
- **Config:** `{...getPXEConfig(), dataDirectory, proverEnabled}` only (`chain-runtime.ts:182-185`): `syncChainTip` "proposed", `autoSync` true, `concurrentContractSyncEnabled` false (`<pxe>/config/index.js:26-41`).
- **Store:** encrypted SQLite on OPFS, `AztecSQLiteOPFSStore.open(…, "pxe_data", …)` in `pxe/<profileId>/<chainId>` (`packages/aztec-runtime/src/pxe/opfs-store.ts:63,125`; `chain-coordinates.ts:15,35`); the manifest grants `unlimitedStorage`.
- **Sync is on demand, header only.** `BlockSynchronizer.sync()` runs inside `OperationQueue.runSynced` before `proveTx`, `simulateTx`, `executeUtility`, `getPrivateEvents` and `debug.getNotes` (`<pxe>/operation_queue.js:87`, `<pxe>/pxe.js:577,708,814,874`); the block stream is `tipsOnly` and never started as a poller (`<pxe>/block_synchronizer/block_synchronizer.js:39,157`): one `getChainTips` plus one header per sync, so the chain part does not scale with blocks mined.
- **What an anchor move costs:** it calls `contractSyncService.wipe()` and `node.wipeCache()` (`block_synchronizer.js:142-145`), so every (contract, scope) re-runs its `sync_state` on next use: tagged-log sync over one secret per known sender plus every own account (handshake secrets twice), `findLeavesIndexes` for note nullifiers, receipt lookups for pending txs (`<pxe>/logs/log_service.js:145,190-206`, `<pxe>/tagging/recipient_sync/sync_tagged_private_logs.js:73`).
- **Bounds:** unfinalized tag window 84 (`MAX_PRIVATE_LOGS_PER_TX` 64 + 20, `<pxe>/tagging/constants.js:19`); constrained probe 2, doubling to 84 (`:38`); 100 tags per node call, 20 logs per tag page (`stdlib/dest/interfaces/api_limit.js:1,6`); 5 concurrent scope syncs (`<pxe>/contract/contract_sync_service.js:11`); `l2BlockBatchSize` 50 is unused in tips-only mode.
- **Timings already returned:** `proveTx` returns `timings {total, sync, proving, perFunction, unaccounted}` and `simulateTx` `{total, sync, publicSimulation, validation, perFunction}`, each with `nodeRPCCalls` from the operation's own node recording (`<pxe>/pxe.js:598-610,778-794`); the wallet records none. `sync` is the header step only (`<pxe>/operation_queue.js:85-89`): a contract's `sync_state` runs inside execution, so it lands in `perFunction` or `unaccounted`. `PrestoProver` emits `onPhase("proved", {durationMs})` for WASM proofs; the wallet's `onPhase` drops the second argument (`chain-runtime.ts:206`). The journal stamps `proving.enteredProveAt` but no prove end (`execution-coordinator.ts:335`).

## The wallet's loops on top

| Loop | Clock | Cost per firing |
|---|---|---|
| Incoming scanner (`incoming-transfer/service.ts:55,59,63`) | 30 s per (network, account) and per (network, contract); full scan every 4th tick; tips cache 5 s; skips when the proposed hash is unchanged (`:1519`) | per watched token, `getNotesRaw` → `pxeService.getNotes` under the PXE write lock (a full `sync_state`); public side up to 5 pages of 20 logs per contract |
| Receipt worker (`transaction/service.ts:400-418`) | 1 s | `node.getTxReceipt` per pending tx |
| Finality re-read (`transaction/inclusion.ts:13`) | 60 s | `getBlockData(finalized)` + `findLeavesIndexes` (node only) |
| Balance queue (`token-balance/balance-job-queue.ts:37`) | 1 s, batches of 12 | public prefix by node; private remainder by `pxe.simulateTx` / `executeUtility` (syncs) |

## Proving

- **Selection:** production and local runs use `PrestoProver`: the Presto desktop app over HTTPS on `127.0.0.1:59834` when present, else in-browser bb.js WASM. CI's prover-ON jobs stamp `VITE_NULO_PRESTO_REQUIRED=1` and prove through a native `presto-server` 1.1.3 on the runner (`CI.md:56-64`). This host runs no Presto, so a local prover-ON run proves in WASM.
- **Threads:** extension pages are cross-origin isolated (`apps/extension/manifest/manifest.config.ts:62-67`); bb.js sizes its pool from `navigator.hardwareConcurrency`, at most 32 (`@aztec-foundation/bb.js/dest/browser/barretenberg_wasm/barretenberg_wasm_main/index.js:11`); the wallet sets no cap. This host gives WASM 32 threads, a 4-vCPU runner 4.
- **Flows as e2e files** (`apps/extension/tests/e2e/network/`): private→private, public→private and private→public in `transfers.test.ts:97-150` (canary, prover-ON on CI); a dApp call with a private authwit in `tx-sendTx-delegated-authwit.test.ts`; a PrivateFPC fee-paid send in `selfpay-phase.test.ts`; a dApp send in `tx-sendTx-default.test.ts` (canary). Only the five canary files run prover-ON on CI.
- **CI runner:** `ubuntu-latest` (`_extension-network-e2e.yml:111`), public repository; no workflow prints a core count. GitHub documents 4 vCPU for public-repository standard Linux runners; the lane brief's "2-core" is unverified.
- **First numbers** (*run*, CI logs, test time per file, s):

| Canary file | Chrome native (PR run 39655767369 / nightly 39571470226) | Chrome WASM (nightly) | Firefox native (nightly) |
|---|---:|---:|---:|
| `frozen-account-canary` | — / 78.7 | 99.2 | 81.6 |
| `tx-sendTx-default` (2 tests) | 84.1 / 67.6 | 96.4 | 73.1 |
| `transfers` | — / 84.9 | 114.3 | 87.1 |
| `passkey-execution-canary` | — / 57.3 | 82.4 | 73.5 |
| `delete-after-prove` | 39.2 / 31.6 | 44.1 | 35.9 |
| vitest duration, 5 files | 470 / 384 | 500 | 413 |

  Presto-server served 13 proofs in the PR run's canary job. The log carries no per-proof time on a green run (no artifact uploaded).

## The wallet's ceilings

- **Every list read loads the whole storage area.** `EntityStorage.scopedRows` is `prefixedEntries(await this.storage.get(), root@)` (`packages/wallet-core/src/storage/entity_storage.ts:226`), then one JSON and zod decode per row; scope (`profileId`, `networkId`, account) is filtered after. A list's cost therefore includes every other family's rows.
- **dApp sessions pay crypto per row, serially, twice.** `DappSessionMacStorage.getValues` awaits `verifyOrDrop` per row (`dapp-session/mac-storage.ts:41-48`), each deriving the MAC key by HKDF from the master and DEK with no cache (`profile/service.ts:1042-1056`); `getDappSessions` runs `deleteExpired()` first, a second pass (`dapp-session/service.ts:136,470`). A row without a valid `mac` is deleted on read (`mac-storage.ts:87-90`). `addDappSession` is an RPC; each insert runs `deleteExpired`, so seeding n sessions costs O(n²) derivations (`service.ts:77,222,467-470`).
- **No list is virtualized or paginated** (searched `virtual|useVirtualList|IntersectionObserver|loadMore|pageSize|PAGE_SIZE` over `popup`, `components`, `composables`, `utils`). Home caps tokens at 3 and recent activity at 5 rows; Contacts, Connected apps, Holdings, the Send token picker (`SelectTokenPopup.vue:153`), the recipient picker (`RecipientField.vue`, `recipient-search.ts:12-18`, per keystroke) and History (`activity.vue`, `TransactionsList.vue:58-64`) render every row.
- **Caps on live storage:** terminal journal rows 50 per (profile, account) (`operation-journal/gc.ts:48`); none on contacts, sessions, tokens, transactions or incoming records (searched `MAX_|LIMIT|CAP|slice(` in their services). Sessions expire after 7 days.
- **Seeding:** `tests/e2e/helpers/activity-seeds.ts` writes transaction, token, receipt and journal rows directly; contacts are written directly in `tests/e2e/send-keyboard.test.ts:34`; sessions need a valid MAC, which the storage-baseline generator already signs with a fixed key in a vitest process (`stored-shapes/baseline.ts:82-127`). Holdings reads balance rows, which no seeder writes. Seeds go on top of a profile production code created: the integrity coordinator re-derives the account set (`account-integrity/coordinator.ts:111-135`).
- **The per-profile seal (#924, open; head `21a6c47e` on 2026-10-21, it moves):** each contact and session row becomes `{profileId, sealed}` under AES-256-GCM with keys derived once per profile open; a list still reads the whole area and opens every row concurrently. Its spec `tests/e2e/sealed-storage.test.ts` times `getContacts` at 2,000 contacts: CI Firefox 182-255 ms, CI Chrome 41-62 ms; sealing 2,000 rows after unlock Chrome 1.8-6.6 s, Firefox 7-16 s locally, 9.8 s on CI (the PR body). One count, contacts only.

## Held

One section of this recon is held.

## The sandbox

- **Boot and data:** `aztec start --local-network` with its own anvil, data dir under `$NULO_E2E_DATA_ROOT` (`tests/e2e/global-setup.ts:530-583`, `sandbox-ownership.ts:28-38`); node stdout is filtered to lines matching `Aztec|ready|error` (`:567-577`); nothing records the data dir's size. Every network job has `timeout-minutes: 30` (`_extension-network-e2e.yml:115`).
- **Throughput mechanics** (block-time-1 F1-F3): the AutomineSequencer builds as soon as one tx has aged 2 s; per tx at 72/12, arrival to build p50 2034 ms, build to published p50 633 ms.
- **Growth inside a run** (*run*, re-read of block-time-1's node logs): build to published by quarter of the run, p50 565 / 594 / 654 / 721 ms over 256 builds (Chrome full proverless set, load1 about 106 to 220) and 628 / 703 / 751 / 719 ms over 109 (Firefox). Load varied over both runs, so the rise is not attributed.
- **Sender limits:** an app entrypoint carries at most 5 calls per tx (`@aztec-labs/entrypoints/dest/encoding.js:9`); a sender's PXE refuses a tag index at or past its finalized index + 84 per secret (`<pxe>/storage/tagging_store/sender_tagging_store.js:111-113`), so one sender emits about 84 notes to one recipient between finality advances.
- **Senders the wallet registers:** imported contacts become PXE senders (`popup/components/modules/settings/contacts/useContactImportExport.ts:401` → `account-state/service.ts:132`); dApps may register 32 per app and 128 per chain, "a policy figure, … not a measured threshold" (`dapp-session/registration-allowance.ts:7-14`).
- **Block contents:** automine builds one block per checkpoint with no tx-count cap (`maxTxsPerBlock` unset, `sequencer-client/dest/sequencer/automine/automine_sequencer.js:714-719`); the checkpoint's gas budgets bound it, and the processor logs skips ("N skipped due to block gas limit").
- **Script senders:** `createTestWallet` is a Node PXE, proverless, over the local network's Schnorr accounts, fees by the sponsored FPC (`tests/e2e/fixtures/aztec.ts:137,211`); `mintPrivateTokens`, `transferPrivateTokens` and the public variants (`:239-402`); `holdMining` queues txs into one block (`fixtures/mining-hold.ts:44-56`); `aztecDebug_mineBlock` builds an empty block on the main port (block-time-1 D3). No N-tx batch helper and no `forceBlock` fixture exist.
- **CI instrument:** `extension-network-e2e-soak.yml` dispatches `mode=files`, `repeats` 1-25, `proverless`, `disable_presto`, `retry` 0, on Chrome only; one job per iteration (#1014 concerns only its `full` mode). Its concurrency group is per ref with `cancel-in-progress` (`:46-48`), so a second dispatch on one branch cancels the first. The reusable workflow fails a run whose bundle holds `PROBE|nulo:probe:|VITE_E2E_PROBE` unless its `probe` input is `1` (`_extension-network-e2e.yml:35-40,329-345`); the soak does not pass it.

## Reuse map

| Capability | Existing | Verdict |
|---|---|---|
| Port claim, sandbox, teardown | `apps/extension/scripts/e2e/agent.sh`, `global-setup.ts` | reuse as is |
| Spans, node-log tee, wallet transition recorder | block-time-1's scratch `instruments-v11.diff` (applies with `--3way` at `cef87d9de`) and its `attrib.ts` | adapt, scratch |
| Proof and sync times | `timings` from `proveTx` / `simulateTx`; `onPhase("proved", {durationMs})` | adapt: record at the wallet call site, scratch |
| PXE store size | the OPFS walk in `tests/e2e/network/opfs-storage.test.ts:27-45` | adapt: sum file sizes, add `navigator.storage.estimate()` |
| Offscreen heap (Chrome) | the offscreen CDP session in `tests/e2e/fixtures/browser/chrome.ts:12-27` | adapt: `Performance.getMetrics` |
| Offscreen heap (Firefox) | none (no CDP; searched `performance.memory|getMetrics|memoryReporter`) | not measured (D5) |
| Timed service read in a browser | #924's `listLoadMs` (`callService(page, …)` + `performance.now()`) | adapt, scratch |
| Row seeding | `activity-seeds.ts`, direct contact writes, `baseline.ts` session signing | reuse; build a balance-row seeder, scratch |
| Pure list helpers | `token-order.ts`, `token-fold.ts`, `token-search.ts`, `activity-rows.ts`, `recipient-search.ts` | reuse as is from a Bun timing script |
| Gated probe spec | `tests/e2e/network/_probe-warmup-effect.test.ts` (`NULO_E2E_PROBE=1`) | adapt, scratch |
| CI log parsing | `scripts/ci-cd/e2e-timings.ts` (`parseJobLog`) | reuse as is |
| CI proving runs | `extension-network-e2e-soak.yml` (`mode=files`) | reuse as is |

## Open work and collisions

- Searched `PXE sync`, `OPFS`, `limit`, `seal`, `proving time`, `throughput` (all states) and closed `known-limit` on `sync`: no issue measures these ceilings. Related: #522 and #924 (plaintext at rest, the seal), #990 to #992 (block-time-1's follow-ups), #1006 (warm-stack-1).
- **Collisions:** e2e-clocks-1 (#992, the two wallet clocks in e2e builds) and warm-stack-1 (#1006) measure on CI now with `*-measure-*` and `*-p` branches; this lane queues its CI dispatches behind theirs. #924 rewrites the contacts and session read paths, so the ceilings sweep names its base for every number.
