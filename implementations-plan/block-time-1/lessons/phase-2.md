# block-time-1, phase 2: the knob inventory

`<aztec>/` is the pinned toolchain's `node_modules/@aztec-labs/` (6.0.0-rc.3, compiled JS). "Honoured" means `aztec start --local-network` applies a value set in the env; "V-boot" marks a cell the boot run confirmed.

## Node and L1 knobs

| Knob | Default | Read at | Governs | Constraints | When | Honoured |
|---|---|---|---|---|---|---|
| `AZTEC_SLOT_DURATION` | 72 s | `<aztec>/ethereum/dest/config.js:18-20` | L2 slot length, so chain time per build; the fee provider's slot step | integer (`parseSafeInteger`, `<aztec>/foundation/dest/config/index.js:223-228`), > 0, multiple of the L1 slot (`ethereum/dest/config.js:191-203`) | deploy (`checkConfigMatchesRollup`, `<aztec>/aztec-node/dest/factory.js:553`) | yes (code; V-boot) |
| `ETHEREUM_SLOT_DURATION` | 12 s | `<aztec>/ethereum/dest/config.js:13-15` | anvil's timestamp step (`anvil_setBlockTimestampInterval`, `deploy_aztec_l1_contracts.js:329-336`), so chain time per settle | integer, > 0 | deploy | yes (code; V-boot) |
| `P2P_MIN_TX_POOL_AGE_MS` | 2000 ms | `<aztec>/p2p/dest/config.js:341-345` | a tx's age, on the node's date provider, before a build may take it (`tx_pool_v2_impl.js:775-785`) | ≥ 0 | boot only: `server.js:988-1009` would forward it to the pool (`tx_pool_v2_impl.js:823-824`), but the admin `setConfig` input schema (`<aztec>/stdlib/dest/interfaces/aztec-node-admin.js:11-32`) has no P2P key, so the RPC parse strips it | boot: yes (config dump). Runtime: no (V-boot: arms set to 0, 500 and 2000 through `aztecAdmin_setConfig` all waited 2002-2051 ms) |
| `SEQ_MIN_TX_PER_BLOCK` | harness sets 0 | `automine_sequencer.js:351` | txs a mempool build waits for | floored at 1 | boot, runtime | inert (floor) |
| Automine mempool poll | 50 ms | `automine_sequencer.js:117` (`deps.pollIntervalMs ?? 50`; the factory passes none) | the lag between a tx turning eligible and its build | hard-coded | n/a | n/a |
| Automine settler | 200 ms | `automine_sequencer.js:154` | proven tip, one `evm_mine` per settle | hard-coded | n/a | n/a |
| `AZTEC_EPOCH_DURATION`, `AZTEC_PROOF_SUBMISSION_EPOCHS` | 4, 2 | forced by `createLocalNetwork` (`<aztec>/aztec/dest/local-network/local-network.js:77-110`) | epoch and proof window | n/a | deploy | ignored |
| `ARCHIVER_POLLING_INTERVAL_MS`, `P2P_BLOCK_CHECK_INTERVAL_MS`, `WS_BLOCK_CHECK_INTERVAL_MS`, `ARCHIVER_VIEM_POLLING_INTERVAL_MS`, `SEQ_TX_POLLING_INTERVAL_MS` | 500 ms | exported unguarded by `<aztec>/aztec/scripts/aztec.sh:40-60` | archiver and block-stream polls | fixed: the harness spawns the CLI wrapper (`global-setup.ts:536-541`), whose `aztec.sh` exports them unconditionally, so a value in the env is overwritten | boot | yes, at 500 (V-boot config dump: `blockCheckIntervalMS` and `worldStateBlockCheckIntervalMS` 500 against defaults of 100, `archiverPollingIntervalMS` and `sequencerPollingIntervalMS` 500; `viemPollingIntervalMS` reads 1000, another mapping of the key wins, not traced) |
| `RPC_UNSEEN_BLOCK_BY_NUMBER_WAIT_MS` | 2 × `blockDurationMs` (3000 ms → 6 s) | `<aztec>/stdlib/dest/config/node-rpc-config.js:53-57` | how long a read of a block one past the tip is held | ≥ 0 | boot | yes |
| `RPC_UNSEEN_BLOCK_BY_HASH_WAIT_MS` | 3000 ms | `node-rpc-config.js:58-61` | the same for an unknown hash | ≥ 0 | boot | yes |
| anvil `--block-time` | unset | the harness's anvil args (`global-setup.ts:406`) | interval mining | cancelled when automine starts (`automine_sequencer.js:134-139`: interval 0, automine on) | boot | cancelled (code; V-boot: 31 L1 blocks before and after 15 s idle with the node up) |
| anvil `--slots-in-an-epoch` | harness sets 1 | `global-setup.ts:406` | L1 `finalized` offset | n/a | boot | yes (V-boot: L1 `finalized` = latest − 2; the L2 finalized tip trails the proven one by one block) |

## Mechanisms that are not knobs

- **The date provider.** A tx's `receivedAt` and the age check both read the node's `TestDateProvider`, which `runBuild` replaces with the mined L1 timestamp after every publish (`automine_sequencer.js:496-499`, `setTime` replaces the offset) and `reconcileDateProvider` only moves forward (`:300-309`). At 72/12 every build and settle push chain time ahead of the wall clock, so a tx that arrives while a build runs can turn eligible early; at short slots chain time falls behind the wall clock whenever blocks are rarer than the slot, and `setTime` pulls the clock back, so such a tx waits longer than the pool age.
- **Slot targeting.** A build targets the slot of anvil's next timestamp, or the slot after the last one built, and pre-sets the next L1 timestamp to that boundary (`automine_sequencer.js:356-370`). It publishes in place (`sendRequests`, `:478-481`), never waiting for a slot; a mined slot that differs from the target only warns (`:502-508`).
- **The fee provider** prices the next block at the later of the slot after the last checkpoint and the date provider's next L1 slot (`<aztec>/sequencer-client/dest/global_variable_builder/fee_provider.js:184-196`), so the minimum fee steps by slot, not by wall clock.
- **The PXE** syncs on demand and anchors on the proposed tip (`<aztec>/pxe/dest/block_synchronizer/block_synchronizer.js`); no timer.
- **Orphan pruning** is off on the local network (`skipOrphanProposedBlockPruning: true` in the node's config dump, `bt-st-02/node.log`); a failed publish rolls back its optimistic insert locally (`automine_sequencer.js:482-491`).
- **`aztecDebug_*`** (`mineBlock`, `prove`, `warpL2TimeAtLeastTo|By`) is served on the main port (`<aztec>/stdlib/dest/interfaces/aztec-node-debug.js`); `mineBlock` builds with `allowEmpty` through the same serial queue.

## The wallet's clocks (production; none overridable by a build flag)

| Clock | Value | Where | On which path |
|---|---|---|---|
| Receipt worker | 1000 ms | `src/wallet/services/transaction/service.ts:405-424` | Pending → mined |
| Finality re-read | 60 000 ms | `src/wallet/services/transaction/inclusion.ts:13` (`FINALITY_READ_INTERVAL_MS`) | mined → Finalized (found in phase 1, missing from recon) |
| Dropped grace, resurrection window | 60 s, 30 min | `transaction/service.ts:54, 59` | a receipt the node does not know |
| Balance queue tick | 1000 ms | `token-balance/balance-job-queue.ts:37` | refresh after a tx update |
| Incoming scanner | 30 000 ms tick, a forced scan every 4th, 5 000 ms tips TTL | `incoming-transfer/service.ts:55, 60, 63` | receives |
| Send sequencer | 500 ms | `execution/send-sequencer.ts:28` | back-to-back sends |
| Chain-tip gate recheck | 1000 ms | `execution/chain-tip-gate.ts:21` | sends behind a settled send |
| Send-check | 5000 ms for 2 min, then 15 s | `operation-journal/send-check.ts:18` | failed submits only |
| `estimateWhenClear` | 2000 ms | `src/utils/estimate-when-clear.ts:7` | queued estimates |

## V-boot (`p2-vboot`: 12/12, Chrome, proverless, anvil `--block-time 1`, a 15 s idle probe after the node's boot)

| Check | Result |
|---|---|
| Slot readback | `node_getL1Constants`: `slotDuration` 12, `ethereumSlotDuration` 12, `epochDuration` 4, `proofSubmissionEpochs` 2 (the forced values hold) |
| H2: `--block-time` cancelled | holds: anvil sat at 31 blocks through 15 s of idle with the node up |
| H3: no sub-second slot | decided by code (`parseSafeInteger`); not run |
| `aztecDebug_mineBlock`, `aztecDebug_prove` on the main port | `mineBlock` built block 6 in 627 ms (height 5 → 6); `prove` returned 6, and the proven tip reached 6 |
| Finality under `--slots-in-an-epoch 1` | L1 `finalized` = latest − 2; L2 finalized = proven − 1 |
| Listeners | anvil on 127.0.0.1; the node's main and admin ports on every interface, the admin port with no API key (`--disable-admin-api-key`); no TCP listener on the P2P port |
| Chain clock | +163 s ahead of the wall clock at boot, +864 s at teardown after 43 blocks: at 12/12 each build and each settle still advance L1 by a full 12 s step, faster than the wall clock |
| Pool age at runtime | not honoured (table above); 3a sets it per boot instead (plan D12) |

The probe's 18 submits at 12/12, all at the effective 2000 ms age: sequential arrival-to-build 2024-2047 ms; the second tx of a pair released 1000 or 1500 ms after the first waited 1090-1576 ms, because the first tx's build moved the date provider about 19.7 s forward (H1's overlap prediction at a slot where chain time leads); released after 500 ms it waited 2080-2106 ms; build to published 485-667 ms; a script send with the default `waitForTx` resolved in a median 4258 ms.

**Gate.** Every honoured or ignored cell cites code or V-boot; H2 holds; H3 decided by code. Met.
