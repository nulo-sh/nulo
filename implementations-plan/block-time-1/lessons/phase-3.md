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

- **H1 holds.** A sequential send waits the pool age at every slot (2017-2036 ms, a spread of 19 ms against M = 250). An overlapping send waits less where chain time leads the wall clock, because the first tx's publish jumps the date provider forward and the second turns eligible at once (72/12, 12/12, 6/6: 1.0-1.6 s at +1000 and +1500), and more where it lags, because the publish pulls the clock back (4/1: 2.55-2.68 s; 2/2, with the chain near the wall clock, up to 4.0 s). At pool age 0 the slot has no effect (23 vs 19 ms).
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

## 3c, cadence: a forced block every 1 s and every 0.5 s at 2/2

P-mech once per browser and period, at 2/2 with its companions (`SEQ_BLOCK_DURATION_MS=500`, propagation and prepare 0, D13), with the scratch pump in `global-setup.ts` (`NULO_E2E_BLOCK_PUMP_MS`): it awaits each `aztecDebug_mineBlock`, sleeps the rest of the period, never has two calls outstanding, and logs every block's height and time and every failure. Compared with 3b's unpumped 2/2 runs (the same nine files, one run each, not matched pairs).

| Run | Blocks | Achieved period (gap p50 / p90) | `mineBlock` call p50 | Pump failures | Files | Wall | load1 start → end |
|---|---:|---|---:|---:|---|---:|---|
| Chrome, 1 s | 940 | 1004 ms (1001 / 1001) | 511 ms | 1 | 9 / 9 green | 1052 s | 142 → 66 |
| Firefox, 1 s | 1050 | 1004 ms (1001 / 1001) | 526 ms | 1 | 9 / 9 green | 1133 s | 66 → 122 |
| Chrome, 0.5 s | 1651 | 593 ms (556 / 742) | 556 ms | 2 | 9 / 9 green | 1072 s | 122 → 53 |
| Firefox, 0.5 s | 1925 | 527 ms (501 / 596) | 448 ms | 1 | 9 / 9 green | 1091 s | 53 → 89 |

Tx latency through the run, by thirds (script and wallet txs; "wallet mined" from the Tx transitions):

| Run | arrival → build | arrival → published | arrival → wallet mined |
|---|---|---|---|
| 2/2 unpumped (3b, Chrome) | 2027, 2032, 2021 ms | 2541, 2582, 2576 ms | –, 2482, 2836 ms |
| Chrome, 1 s | 810, 734, 309 ms | 1400, 1239, 804 ms | –, 1288, 753 ms |
| Firefox, 1 s | 803, 292, 570 ms | 1374, 975, 1149 ms | –, 1463, 887 ms |
| Chrome, 0.5 s | 404, 100, 86 ms | 1006, 664, 573 ms | –, 791, 483 ms |
| Firefox, 0.5 s | 417, 373, 70 ms | 887, 854, 585 ms | –, 749, 780 ms |

(The first third holds only script txs, so no wallet transition.)

- **H6 holds at 1 s and at 0.5 s, on both browsers, bounded to P-mech's workload:** every file green in all four runs, the achieved period within the plan's 20 % (1004 ms against 1000; 593 ms on Chrome, 18.6 % over 500 under load1 122, and 527 ms on Firefox), and no latency growth through any run: arrival to published falls from the first third to the last in all four. P-mech's file times sit within noise of 3b's unpumped 2/2 runs (single runs, not matched). Serial `mineBlock` calls take 0.45-0.56 s at the median on this host, so 0.5 s is about the fastest cadence this pump can reach.
- **The pump shortens the pool age, as the plan expected.** Each forced block moves the chain clock at least a slot (2 s), faster than the wall clock, so chain time leads at teardown by 3.0 / 3.3 ks at 1 s and 5.7 / 6.8 ks at 0.5 s (Chrome / Firefox) against −0.74 / −0.80 ks unpumped, and a tx turns eligible 0.3-0.8 s after arrival instead of 2.0 s. The result measures a cadence plus a shorter effective pool age, not empty blocks alone.
- **One pump failure in each 1 s run and in the Firefox 0.5 s run, the same mechanism each time: an L1 nonce race.** `bridgeFeeJuice` signs its L1 deposit with anvil's account 0, the same account the sandbox publishes every block from. During `sim-from-selfpay`'s bridge, the node read its nonce while preparing a publish (about 0.4 s before it sends), the fixture's mint, approve and deposit were mined in that window and took the next three nonces (the node's own went 968 → 972 on Chrome and 1050 → 1054 on Firefox at 1 s), and the node's send failed ("nonce too low", "All available publishers exhausted (tried 1)"), rolled back its optimistic block ("Automine propose did not succeed"), pruned it (empty, nothing returned to the pool), and the next build 0.4-0.6 s later carried on. The pump's call failed with "runBuild returned undefined". Tests green. Seen in no other run of the lane; any lever that adds blocks makes it likely, and if the fixture loses instead the file fails on an L1 error (filed as an issue).
- **At 0.5 s the same bridge breaks a publish in two other ways, both self-healing.** On Chrome, during `sim-from-selfpay`'s bridge, the bridge's L1 transactions were mined between the node's build and its send (the node's clock then jumped 8 s, four 2 s L1 slots), and the publish failed ("Publishing checkpoint at slot 3160 failed with no error message"). The rebuild at slot 3164 then reverted in the bundle simulation with `Rollup__UnconsumedInboxMessages(1)`: the deposit's L1→L2 message reached the inbox after the build. The third build, 0.3 s later, published. Two pump calls failed; tests green. Neither depends on the signing account, so a separate fixture account would not remove them; they cost a rebuild each.
- **Retried publish-time reads grow with the publish rate:** the `getCheckpoint` read retries (`Rollup__UnavailableTempCheckpointLog`) 20 and 17 times over about a thousand publishes at 1 s (about 2 %, 3b's rate) and 133 and 93 times over 1660 and 1934 at 0.5 s (8 % and 5 %); the retry absorbs every one.
- **A forced L1 block during a publish moves the checkpoint's slot.** On Firefox at 0.5 s, `failed-send-check`'s `finalizeThrough` mined empty L1 blocks while a publish was in flight; checkpoint 1062, built for slot 2130, landed in slot 2133 ("Automine checkpoint mined in slot 2133 but targeted 2130"). The rollup accepted it and nothing rolled back.
- **The Firefox late fee estimate again**, in the 1 s run: one duplicate-nullifier rejection during `authwit-lifecycle`'s first grant, the 3d mechanism, exposed here by the pump's shortened pool age.

## 3d, the levers: matched pairs at the default slot

Arm B combines the levers phase 1 ranked: the pool age at 0 (`P2P_MIN_TX_POOL_AGE_MS=0`, read back from the node's dump), the script's receipt polls every 0.1 s instead of 1 s (`E2E_TX_WAIT`), and the bridge waits forcing blocks through `aztecDebug_mineBlock` with 250 ms polls instead of a sponsored mint every 1.5 s. Both arms ran with the same files, order and instruments, interleaved Chrome A, B, Firefox A, B, three rounds; a validation run first (`p3d-val-chrome-B`: pool age 0 read back, a bridge claimable in 1.4 s). Every file green in all twelve runs. A−B is positive when B is faster; M is 10 % of A's median.

### chrome: 3 matched pairs

| File | A (s) | B (s) | A−B per pair (s) | median | M | verdict | pool wait A→B (s) | node path A→B (s) |
|---|---|---|---|---:|---:|---|---|---|
| `authwit-lifecycle` | 72.5, 64.3, 70.8 | 47.4, 69.3, 58.7 | 25.1, -5.0, 12.1 | 12.1 | 7.1 | inconclusive | 14.2 → 0.1 | 18.1 → 4.1 |
| `concurrent-sendtx-confirm` | 32.7, 32.1, 31.6 | 23.8, 36.0, 43.8 | 8.9, -3.9, -12.2 | -3.9 | 3.2 | inconclusive | 6.1 → 0.0 | 7.7 → 2.1 |
| `failed-send-check` | 258.5, 258.9, 266.5 | 264.3, 259.0, 256.7 | -5.8, -0.1, 9.8 | -0.1 | 25.9 | inconclusive | 4.1 → 0.0 | 5.2 → 1.2 |
| `imported-account-execution` | 85.7, 76.5, 76.8 | 66.3, 80.0, 82.3 | 19.4, -3.5, -5.5 | -3.5 | 7.7 | inconclusive | 8.1 → 0.1 | 10.3 → 2.3 |
| `incoming-arrival` | 346.7, 345.6, 364.0 | 352.6, 348.0, 351.4 | -5.9, -2.4, 12.6 | -2.4 | 34.7 | inconclusive | 26.4 → 0.3 | 33.1 → 7.7 |
| `incoming-transfers` | 46.6, 38.2, 43.7 | 30.2, 41.2, 42.6 | 16.4, -3.0, 1.1 | 1.1 | 4.4 | inconclusive | 6.1 → 0.1 | 7.9 → 2.0 |
| `sim-from-selfpay` | 36.2, 32.2, 34.8 | 22.7, 30.6, 31.3 | 13.5, 1.5, 3.6 | 3.6 | 3.5 | gain | 6.1 → 0.0 | 7.5 → 1.2 |
| `tx-sendTx-sponsoredFpc` | 21.9, 19.6, 18.9 | 16.1, 27.6, 27.0 | 5.8, -8.0, -8.2 | -8.0 | 2.0 | inconclusive | 2.0 → 0.0 | 2.6 → 0.8 |
| `wait-for-tx-mined` | 9.6, 9.2, 9.2 | 4.2, 7.2, 6.8 | 5.4, 2.0, 2.3 | 2.3 | 0.9 | gain | 4.0 → 0.0 | 5.0 → 1.3 |
| **Sum** | 910.3, 876.5, 916.2 | 827.5, 898.9, 900.7 | 82.8, -22.5, 15.5 | 15.5 | 91.0 | | | |

### firefox: 3 matched pairs

| File | A (s) | B (s) | A−B per pair (s) | median | M | verdict | pool wait A→B (s) | node path A→B (s) |
|---|---|---|---|---:|---:|---|---|---|
| `authwit-lifecycle` | 79.6, 87.4, 90.9 | 92.8, 86.3, 77.2 | -13.2, 1.1, 13.7 | 1.1 | 8.7 | inconclusive | 14.2 → 0.1 | 17.9 → 4.9 |
| `concurrent-sendtx-confirm` | 47.0, 45.9, 40.8 | 40.2, 42.6, 36.7 | 6.8, 3.3, 4.1 | 4.1 | 4.6 | faster, < M | 6.1 → 0.1 | 7.9 → 2.0 |
| `failed-send-check` | 267.5, 282.2, 268.1 | 275.0, 276.8, 270.2 | -7.6, 5.4, -2.1 | -2.1 | 26.8 | inconclusive | 4.1 → 0.1 | 5.1 → 1.4 |
| `imported-account-execution` | 89.8, 130.8, 90.7 | 101.1, 101.1, 99.9 | -11.3, 29.7, -9.2 | -9.2 | 9.1 | inconclusive | 8.1 → 0.1 | 10.0 → 2.7 |
| `incoming-arrival` | 329.5, 321.5, 358.8 | 299.4, 332.3, 282.6 | 30.2, -10.8, 76.1 | 30.2 | 33.0 | inconclusive | 24.4 → 0.3 | 31.8 → 7.1 |
| `incoming-transfers` | 54.7, 47.8, 52.2 | 63.0, 57.5, 50.2 | -8.3, -9.7, 2.0 | -8.3 | 5.2 | inconclusive | 6.1 → 0.1 | 7.7 → 2.0 |
| `sim-from-selfpay` | 47.6, 44.0, 38.0 | 34.6, 37.0, 35.9 | 13.1, 7.0, 2.1 | 7.0 | 4.4 | gain | 6.1 → 0.1 | 7.7 → 1.3 |
| `tx-sendTx-sponsoredFpc` | 29.7, 28.6, 26.2 | 30.8, 33.3, 33.8 | -1.2, -4.7, -7.6 | -4.7 | 2.9 | REGRESSION | 2.0 → 0.0 | 2.6 → 0.7 |
| `wait-for-tx-mined` | 9.5, 9.3, 9.1 | 5.5, 5.1, 7.6 | 4.0, 4.3, 1.5 | 4.0 | 0.9 | gain | 4.1 → 0.1 | 5.0 → 1.3 |
| **Sum** | 954.9, 997.5, 974.7 | 942.3, 972.0, 894.2 | 12.5, 25.6, 80.5 | 25.6 | 97.5 | | | |

Category moves, summed over the nine files, median of the three pairs (A−B, s; exclusive time, each instant to the deepest active span): script-side setup +56.0 (Chrome) / +60.0 (Firefox), script waits on chain +11.9 / +11.6; browser launch −8.0 / −5.2, onboarding −16.2 / −14.6, navigation and UI driving −3.1 / −4.9.

Load1 at start → end: Chrome A 47→84, 151→42, 146→59; B 84→49, 42→181, 59→195. Firefox A 49→98, 181→76, 195→51; B 98→151, 76→146, 51→155.

- **The mechanism shows on both browsers and in every file:** pool wait falls to about 0 and the node path by 70-80 %, and the categories the levers reach shrink by 68-72 s per run.
- **By the rule, a gain on two files per browser** (`wait-for-tx-mined`, `sim-from-selfpay`), inconclusive elsewhere, and on Firefox one regression by the numbers, `tx-sendTx-sponsoredFpc` (B slower by 1.2, 4.7 and 7.6 s, M = 2.9 s). Its spans put the excess in onboarding (+1.7, +2.9, +5.1 s) and browser launch (about +1 s), while its node path fell 2.6 → 0.7 s and its script setup fell 1-2 s. Load is the plausible cause, not an established one: onboarding includes PXE and account warm-up, which a different chain history could touch indirectly. The flag stands, its cause unresolved.
- **The design confounds order with treatment.** Every pair ran A before B, and on this host (188 cores, load1 40-195 from other agents' runs) the B arms of rounds 2 and 3 ran while load rose and the A arms while it fell; the load-sensitive categories (launch, onboarding, navigation and UI driving) grew by 27 s (Chrome) and 25 s (Firefox) in B, more than a third of what the levers saved. Interleaving does not neutralise a drift that keeps its phase; balanced or randomised order would.
- **A pre-existing Firefox behaviour, exposed by the lever:** in both Firefox B runs the node rejected a public simulation with a duplicate-nullifier collision during `authwit-lifecycle`'s first grant. The execute window's fee estimate keeps simulating after Confirm (its fire-and-forget cancel is lost as the window closes) and reaches the node about 0.5-0.7 s after the send; at pool age 0 the grant's block, which inserted the account's initialization nullifier, has already landed. Firefox A2 shows the same late simulation succeeding before the block. The result goes to a closed window and no state changes, but one or two private simulations hold the PXE queue on a first send.
- **A fidelity limit of a forced block:** `aztecDebug_mineBlock` builds with `allowEmpty`, which sets the build's minimum to 0 and so bypasses `holdMining`'s `minTxsPerBlock: 2`; a forced block during a hold would include the held tx. No held window today overlaps a bridge wait, so it is a condition on any future use, not a failure. Forced empty blocks also remove the sponsored mints the bridge waits used to send, which changes the chain history those files run on.

### The arc-2 decision (Codex consult, `gpt-6.1-sol`, high, session 01a15d42)

Asked: (a) "does not hold" by the plan's letter, docs-only close; (b) run arc 2 anyway with CI as the decisive layer; (c) re-run 3d differently. **Verdict (a), high confidence:** the candidate fails the agreed local gate (seven targeted files without a qualifying gain on both browsers, 3e unrun); picking the two winning files afterwards would change the acceptance criterion, and the right wording is "does not hold under this protocol", not "does not accelerate". Accepted in full, with its corrections: the attribution double-counted concurrent spans (fixed, phase-1 tables corrected), the regression's cause stays unresolved, the fixed A-then-B order is a confound, the collision is pre-existing but exposed by the lever, and a forced block bypasses a mining hold. A separately specified CI experiment with balanced order is a follow-up for the owner (plan D15), not this lane.
