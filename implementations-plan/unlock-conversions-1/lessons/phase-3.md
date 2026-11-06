# Phase 3: docs, baselines and the update replay

All runs at retry 0 on this host (load1 about 160 on 188 cores, other leads running), candidates built from 2640d5fd3.

| Run | Result | Wall-clock (vitest Duration) |
|---|---|---|
| v1.1.0 → head, Chrome | 4/4 green | 72.4 s |
| v1.2.0 → head, Chrome | 4/4 green | 71.9 s |
| v1.1.0 → head, Firefox | 4/4 green | 132.8 s |
| v1.2.0 → head, Firefox | 4/4 green | 80.4 s |

- `bun run baseline:storage`: "stored shapes unchanged", no file written.
- `bun run test`: 1000 files passed, 3 skipped (17700 tests). `bun run test:all`: every workspace exited 0.
- The change adds no e2e scenario; network-rename-1's v1.1.0 runs on the same replay took 63-111 s, so the times follow the host's load.
