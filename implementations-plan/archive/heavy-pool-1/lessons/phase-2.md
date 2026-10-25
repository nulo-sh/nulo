# heavy-pool-1: Phase 2, the measurement

Base `6e2593b88` (origin/dev at 9057e1e0d, #1003 included). A = `heavy-pool-1-measure-a` at a3da01032 (the widened generator and the network record it wrote; smoke tables untouched). B = `heavy-pool-1-measure-b` at 1218eec4c (A plus the fold). Both pushed once and never moved.

## Rounds 1 and 2 (2026-10-21)

Before each dispatch the helper listed both network workflows' queued and in-progress runs: no other lane's measurement ran at any point. Round 1, Chrome, A then B, dispatched 15:49Z; round 2, Firefox, B then A, dispatched 16:09Z. Job durations from GitHub's timestamps, setup included; file time by `parseJobLog`'s gap rule; seconds.

| Browser | Arm | Run | SHA | Slowest job | Shard jobs | Max shard file time | Pool file time | Runner-s | snack-placement / failed-send-check |
|---|---|---|---|---|---|---|---|---|---|
| Chrome | A | 39629158674 | a3da01032 | 970 | 943 · 838 · 925 · 749 · 970 | 855 | 3884 | 7443 | 488 / 261 in heavy-long (874 s job) |
| Chrome | B | 39629193473 | 1218eec4c | 1102 | 1047 · 1102 · 1016 · 1084 · 1054 | 986 | 4755 | 7451 | 475 / 258 on shards 1 and 3 |
| Firefox | B | 39632256909 | 1218eec4c | 1285 | 1230 · 1240 · 1285 · 1213 · 1224 | 1169 | 5613 | 8471 | 513 / 264 on shards 1 and 3 |
| Firefox | A | 39632308349 | a3da01032 | 1170 | 884 · 1151 · 1170 · 1086 · 862 | 1056 | 4608 | 8223 | 513 / 269 in heavy-long (907 s job) |

- Checks before the threshold: all four runs green at retry 0; no red to settle; each arm's runs on one SHA; every shard ran exactly `assignShards`' files for its commit, browser and index, and each pool held exactly the suite less its `exclude_files`; no shard over 1500 s of file time (highest 1169).
- B minus A: Chrome **+132 s**, Firefox **+115 s**. Both exceed 60 s, so D9's futility stop applies: no rounds 3–6; Phase 3b.
- Against the replay (paired medians +139 / +162 s): Chrome inside its range, Firefox 27 s under its range's floor. One pair per browser cannot say more.
- I1 holds on this sample: each folded file cost within 13 s of its own-job cost.
- I4 is not settled: the pool's other files took 138 s (Chrome, 3.6 %) and 228 s (Firefox, 4.9 %) longer in B than in A. One sample cannot separate that from run-to-run noise.
- Runner time did not fall: B used 8 s (Chrome) and 248 s (Firefox) more than A. The heavy-long job's setup it saved (about 110 s) was outweighed by the slower pool on this sample.
- Collector and dispatch helper: scratch scripts under the lane's cache dir, logs parsed in memory, nothing kept but the numbers above.
