# e2e-clocks-1, phase 3: the review loop and the measurement

- 2026-10-21 ~16:20Z: arc review round 1. Codex (gpt-6.1-sol, high, session 01a15f3f): conditional approve, three findings, all accepted. Opus (general-purpose): conditional approve, five findings, four accepted, one kept with its reason (plan § Review verdicts). Both found the extension-form import past the Biome restriction (probed: `.ts` and `.js`, alias and relative, all passed it). Opus found the arrival case's lost never-locked popup.
- 2026-10-21 ~16:44Z: arc review round 2, Codex resumed: approve; one comment overstated the helper's cleanup, fixed. Converged after two rounds.
- 2026-10-21 17:01Z: arms frozen, F `815283273` (`e2e-clocks-1-a1`), P `7dd6deaa5` (`e2e-clocks-1-p`, F plus the agent.sh arm switch). `vars.NULO_E2E_DISABLE_PRESTO` unset before slot 1. Twelve slots, order P F F P P F F P P F F P, dispatched by a scratch loop that waits for both runs of a slot before the next.
- 2026-10-21 17:40Z: projection after pair 1 (slots 1-2): target savings Chrome snack-placement 303 s, failed-send-check 59 s, incoming-arrival 159 s (sum 520 s, rule 225 s); Firefox 263, 46, 120 s (sum 430 s, rule 205 s). P's proverless jobs all print the absence line and read final at 54-56 s; F's at 3.5-6 s, its install runs 1.5-1.7 s. Continuing all twelve slots.
- 2026-10-21 20:58Z: all twelve slots done, 24 runs, every run green with its full job set. `vars.NULO_E2E_DISABLE_PRESTO` unset after slot 12 as before slot 1. Queue 4-7 s per run; runner images 20261012.601 and 20261015.610 mixed within runs of both arms. One exit-86 infra retry: slot 11 (F) Chrome `shard 5/5`, first attempt `[e2e-setup] FATAL: local Aztec node failed to become healthy` before any test ran, retry 24 of 24 files green; parsed from the retry's banner. No test failure in either arm.
- Gate (b) holds on both browsers (tables below), (a) holds (no F failure), (c) holds: no other file slower in all three pairs of either block by more than max(10 % of its P median, 10 s). Verdict: ship.
- The run envelope moves little (Chrome median 1011 → 1000 s, Firefox 1156 → 1116 s): it ends with shards 2-5, which hold none of the three target files, while the saving lands in the heavy job and shard 1. `shard-timings.json` is left alone (recon); the e2e-testing skill's refresh trigger (a harness change, a file moving by over a minute) applies once green post-merge runs exist, and `scripts/ci-cd/e2e-timings.ts` reads dispatch runs too, so `e2e-clocks-1-p`'s newest green run per lane, on the production cadence, counts until it ages out.


**Chrome** (6 pairs)

| File | P median (s) | F median (s) | Paired saving, median (s) | Pair savings (s) |
|---|---:|---:|---:|---|
| `snack-placement` | 488 | 216 | 272 | 303, 238, 271, 298, 270, 273 |
| `failed-send-check` | 261 | 211 | 50 | 59, 41, 48, 58, 52, 48 |
| `incoming-arrival` | 322 | 167 | 159 | 159, 159, 159, 145, 147, 163 |
| **Sum of the three** | | | **481** | |

Run envelope (first job start to last job end), median: P 1011 s, F 1000 s. Summed file time, median: P 6261 s, F 5622 s.
F `wallet final`: 3514-6029 ms (P 53731-56299 ms). F `[install-run]`: 1445-1751 ms.
Runs (slot arm id): 1P 39639985854, 2F 39642980367, 3F 39645728994, 4P 39648613303, 5P 39651545817, 6F 39654525827, 7F 39657451306, 8P 39660222979, 9P 39663120596, 10F 39666365419, 11F 39669379640, 12P 39672083895

**Firefox** (6 pairs)

| File | P median (s) | F median (s) | Paired saving, median (s) | Pair savings (s) |
|---|---:|---:|---:|---|
| `snack-placement` | 513 | 241 | 271 | 263, 301, 274, 262, 270, 271 |
| `failed-send-check` | 268 | 218 | 50 | 46, 60, 52, 48, 51, 50 |
| `incoming-arrival` | 297 | 164 | 133 | 120, 136, 138, 147, 129, 126 |
| **Sum of the three** | | | **454** | |

Run envelope (first job start to last job end), median: P 1156 s, F 1116 s. Summed file time, median: P 6942 s, F 6553 s.
F `wallet final`: 3528-6129 ms (P 53388-56429 ms). F `[install-run]`: 1450-2073 ms.
Runs (slot arm id): 1P 39639992271, 2F 39642985583, 3F 39645733191, 4P 39648617830, 5P 39651549498, 6F 39654530512, 7F 39657456222, 8P 39660225202, 9P 39663125466, 10F 39666369701, 11F 39669384446, 12P 39672087543
