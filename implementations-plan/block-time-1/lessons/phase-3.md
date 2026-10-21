# block-time-1, phase 3: the sweep

Runs live under `~/.cache/nulo-backlog/block-time-1/runs/<id>/`; every run is Chrome unless named, proverless, retry 0, through `agent.sh`, with the scratch instruments armed (patch `instruments-v10`).

## Pre-check: assertions that need a tx still un-included

Before any pool age below 2000 ms is timed (3d), the network suite was searched for assertions that need a submitted tx to still be outside a block. Every one sits in `same-token-concurrent-sends.test.ts` (eight assertion groups: B's estimate ready or queued while A is Pending, the `queued` journal row and awaiting card, the pending-count read), and each runs between `waitForEmptyMempool` + `holdMining` and `afterEach(releaseMining)`; `holdMining` sets `minTxsPerBlock` to 2, which the pool age does not touch. The other in-flight windows (`concurrent-sendtx-*`, `tx-sendTx-noFrom`, `in-flight-send-guard`, `cancel-mid-prove`, `failed-send-check`'s first case, …) are held before the submit, by the proof gate or an open approval window. Unprotected: none, so a shorter pool age adds no file to the timed set.

## 3a, the probe

Each boot runs one slot pair at one pool age (plan D12): nine sequential script mints, nine overlapping pairs (second tx released 500, 1000 or 1500 ms after the first, three each), ten sends through the default `waitForTx`. Arrival and build times come from the node log; the pool age from the node's own config dump.

### What boots

| Pair | Default timing | Smallest change that boots | Per-tx DA gas the node admits |
|---|---|---|---|
| 72/12 | boots | n/a | 55,836 |
| 12/12 | boots | n/a | 271,200 |
| 6/6 | refused: "derived 0 blocks per checkpoint" (`p3a-6-6-a2000-boot`) | `SEQ_BLOCK_DURATION_MS=1000` | 271,200 |
| 4/1 | refused: −1 blocks (`p3a-4-1-a2000-boot`) | `SEQ_BLOCK_DURATION_MS=500` | 271,200 |
| 2/2 | refused: −2 blocks (`p3a-2-2-a2000-boot`) | `SEQ_BLOCK_DURATION_MS=500`, `SEQ_ATTESTATION_PROPAGATION_TIME=0`, `SEQ_CHECKPOINT_PROPOSAL_PREPARE_TIME=0` | 271,200 |
| 1/1 | refused: −2 blocks (`p3a-1-1-a2000-r1`) | none: the timetable needs slot ≥ 1 s (hard-coded init) + 2 × block duration | n/a |

The refusal comes from the tx pool's gas validator, which builds the proposer timetable at boot (`getNetworkTxGasLimits` → `ProposerTimetable`, `<aztec>/stdlib/dest/timetable/proposer_timetable.js`); below an 8 s L1 slot the timetable caps propagation and prepare at 0.5 s each, which is why 6/6 needs only a shorter block. The same timetable sets the per-tx gas limits: the DA limit is the checkpoint's blob budget over the blocks that fit in a slot, times 1.5, capped at 271,200, so a slot that fits fewer blocks admits bigger txs. At 72/12 the node admits 55,836 DA gas per tx; at every short pair that boots it admits the cap, 4.9 times more: a sandbox on a short slot accepts a tx a 72 s network refuses. The reverse also bites: a 72/12 boot with 2/2's companions derives 141 blocks per checkpoint and an 8030 DA limit, below the 17,184 of the local network's own setup tx, and fails at boot (`p3a-72-12-short-a2000-r1`), so the companions have no 72/12 control; computed for every geometry with the toolchain's own `getNetworkTxGasLimits`.

### Arrival to build (node log), Chrome, retry 0

Sequential sends at the 2000 ms default, per boot: 72/12 2036, 2032, 2028 ms; 2/2 2025, 2017, 2019; 12/12 2031 (and 2030 in V-boot); 6/6 2020; 4/1 2027. Pool age 500: 530 (72/12), 516 (2/2). Pool age 0: 23 (72/12), 19 (2/2), the automine's 50 ms poll. Build to published: 460-630 ms everywhere.

Overlapping pairs, the second tx's arrival to build, median of the pooled runs (n = 9 at 72/12 and 2/2 age 2000, else 3), with the date provider's move between its arrival and its build:

| Pair | Chain clock vs wall | Second sent +500 ms | +1000 ms | +1500 ms | Clock move |
|---|---|---:|---:|---:|---:|
| 72/12 | +1.5 to +2.3 ks ahead | 2097 | 1573 | 1088 | +67.6 s |
| 12/12 | +0.7 to +0.9 ks | 2141 | 1566 | 1090 | +19.6 to +19.9 s |
| 6/6 | +0.3 to +0.4 ks | 2077 | 1536 | 1038 | +7.4 to +8.1 s |
| 2/2 | +9 to +73 s | 2248 | 2617 | 2151 | −0.12 to −0.57 s |
| 4/1 | −10 to −25 s behind | 2676 | 2550 | 2563 | −0.55 to −0.67 s |

A script send through the default `waitForTx` (simulate, send, 1 s receipt polls to checkpointed): 4007-4411 ms at 72/12 and 3978-4082 ms at 2/2 at age 2000; 2372 / 2235 ms at age 500; 1969 / 1992 ms at age 0.

### H1 and R1

- **H1 holds.** A sequential send waits the pool age at every slot (spread 17 ms against M = 250). An overlapping send waits less where chain time leads the wall clock, because the first tx's publish jumps the date provider forward and the second turns eligible at once (72/12, 12/12, 6/6: 1.0-1.6 s at +1000 and +1500), and more where it lags, because the publish pulls the clock back (4/1: 2.55-2.68 s; 2/2, with the chain near the wall clock, up to 4.0 s). At pool age 0 the slot has no effect (23 vs 19 ms).
- **H4a holds.** The chain clock leads by the slot's step per build at 72/12, 12/12 and 6/6, and lags at 4/1, where blocks are rarer than the 4 s slot.
- **R1.** 12/12 and 6/6 sit inside M in every arm: screens only. 2/2 and 4/1 differ only in the overlap arms, and there they are slower: a timing cell would measure a predicted loss on the only arm the slot reaches, so no matched e2e cells run for them (plan D14); 3b's per-file times are reported as indicative.
- **The node-level lever is the pool age**, not the slot: 2.0 s → 0.5 s → 0.02 s per inclusion, about 2 s off each `waitForTx` at age 0.

## 3b, the mechanism screen

P-mech (whole files) once per pair that boots, Chrome, and 2/2 on Firefox (D13), each with the companions of § What boots. Every node log was searched for propose failures, slot mismatches, prunes, rollbacks, drops and fee refusals, outside the boot config dump.

| File time, s | 72/12 Chrome (phase 1) | 12/12 Chrome | 6/6 Chrome | 2/2 Chrome | 72/12 Firefox (phase 1) | 2/2 Firefox |
|---|---:|---:|---:|---:|---:|---:|
| `wait-for-tx-mined` | 12 | 9 | 9 | 9 | 11 | 9 |
| `tx-sendTx-sponsoredFpc` | 26 | 23 | 19 | 24 | 58 | 25 |
| `imported-account-execution` | 102 | 85 | 73 | 79 | 130 | 96 |
| `incoming-transfers` | 43 | 44 | 40 | 43 | 75 | 45 |
| `incoming-arrival` | 350 | 358 | 369 | 360 | 341 | 363 |
| `authwit-lifecycle` | 115 | 71 | 71 | 70 | 114 | 83 |
| `concurrent-sendtx-confirm` | 43 | 38 | 32 | 35 | 66 | 39 |
| `sim-from-selfpay` | 60 | 38 | 34 | 37 | 57 | 42 |
| `failed-send-check` | 257 | 261 | 257 | 258 | 282 | 270 |
| **Sum** | 1008 | 927 | 904 | 915 | 1134 | 972 |
| Chain clock at teardown | +11.0 ks (256 blocks) | +0.5 ks | −0.23 ks | −0.74 ks | +4.0 ks (109) | −0.80 ks |
| load1 start → end | 106 → (2 h run) | 70 → 97 | 97 → 46 | 46 → 117 | ~220 | 117 → 37 |

- **Every file green at every pair, both browsers.** No propose failure, slot mismatch, prune, rollback, drop or fee refusal. The one node error class, a `getCheckpoint` read that reverts with `Rollup__UnavailableTempCheckpointLog` while a publish lands and succeeds on retry, shows once or twice in six boots at 72/12, 6/6 and 2/2 alike: a publish-time read race, not a slot effect.
- **H4b holds.** No wallet or test code broke with the chain clock from 11 ks ahead of the wall clock (72/12) to 0.8 ks behind it (2/2). The wallet reads expiry and finality against chain time, not the wall clock.
- The time differences against phase 1 are unmatched (phase 1 ran at load1 106-220, inside a 2 h run) and the short pairs agree with 12/12 within noise; per R1 and D14 they are not a gain. The phase-1 Chrome P-mech sum (1008 s) is the same selection's time in a long, loaded run; 3d's matched pairs answer the timing question at the default slot.
- The plan's short-slot break predictions did not occur: at L2 slot = L1 slot no stray L1 block pushed a propose into the next slot (the automine pre-sets the next timestamp and publishes in place), and no proof window was missed at 2/2.
