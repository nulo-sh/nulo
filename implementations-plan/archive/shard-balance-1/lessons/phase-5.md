# shard-balance-1: post-implementation review and measurement

## Fix loop, round 1 (2026-10-21)

- Codex `gpt-6.1-sol` at high, session `01a15bd5-a85b-7933-a8b9-31bdb631ad2c`, beside one Opus
  diff review. Both found the same hole: a test can print a fake file line and a fake
  `Test Files` count, and the parser trusted the first summary. Fix: exactly one summary per job.
- Opus also showed, by mutation, that the order test could not see the unknown-file sort, which
  is what keeps a new file in exactly one shard when runners glob in different orders.
- Mutation checks run on the sequencer: shard index ignored, absolute-path keys, shortest-first
  order, unsorted unknown files. Each now fails at least one pin.

## Fix loop, round 2 (2026-10-21)

- Resumed Codex session: clean. The loop converged after two rounds.

## Measure after (2026-10-21)

One `workflow_dispatch` per PR lane at `f6e34b3e4` (the branch after merging `dev`), all four
green at the first attempt. Job durations from GitHub's timestamps, setup included, s.

| Lane | Shards | Slowest | Before (range) | Projected (range) | Spread | Envelope |
|---|---|---|---|---|---|---|
| smoke Chrome | 560 · 599 · 606 | **606** | 761 (687–804) | 590 (535–645) | 282 → 46 | 606 |
| smoke Firefox | 792 · 796 · 801 | **801** | 1105 (859–1142) | 772 (724–806) | 518 → 9 | 801 |
| network Chrome | 870 · 971 · 947 · 956 · 953; heavy-long 866 | **971** | 1090 (924–1115) | 905 (886–954) | 353 → 101 | 974 |
| network Firefox | 1068 · 1121 · 1108 · 1088 · 1101; heavy-long 888 | **1121** | 1143 (1088–1293) | 1028 (956–1104) | 367 → 53 | 1124 |

- File sets: each of the 16 shard jobs ran exactly the files `assignShards` gives its index for
  its browser (network: the pool, less the lane's `exclude_files`). No file was missing from the
  record, so the unknown-file path did not run.
- Record against reality: smoke file time came within 0.7 % of the record on both browsers.
  Network ran 5.8 % (Chrome) and 5.4 % (Firefox) over it, spread across the files (the largest
  single excess +26 s, `type-roles-windows` on Firefox), so the split held and every file ran
  slower. The sum of this run's pool shard jobs: Chrome 4697 s, Firefox 5486 s; the 10 latest green
  runs on other branches: 4267–4726 s and 4829–5410 s. One sample cannot tell runner noise from an
  effect of the new file mix (I1); the PR's own runs are the second sample.
- Network Firefox's 1121 s sits inside its before range: no demonstrated gain on this sample. The
  smoke lanes land within 30 s of the projection.

## The PR's first `quality-status` (2026-10-21)

- Red in `bun audit`, not in this change: five advisories (follow-redirects ×2, vite ×3) had no
  acknowledgement on `dev`. The gate enforces on any PR whose `package.json` changes beyond
  `"version"` lines, and the root `e2e:timings` script was such a line. Fix: drop the script and
  run the generator by path (D7); the PR then touches no dependency file and the gate reports.
