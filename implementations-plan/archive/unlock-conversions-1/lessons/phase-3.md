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

## Review loop

- **Round 1** (Codex new session over d250ab26f..a2b9c4838, Opus diff review beside it): both 0 material; twelve nits between them, all accepted (plan § Audit verdicts). The guard's follow rule changed from "a sole `this.m` delegation" to "every same-file method the handler calls": a local `renameTokens(row)` inside `convertRows` now reds it (restored). Fix commit 67c376c4f.
- **Round 2** (Codex resumed over the fix diff): 0 material, approve; it verified the inside-`convertRows`, aliased-import and repeated no-op write mutations red.

## Final gates (962b967eb, then the `dev` merge)

| Run | Result | Wall-clock |
|---|---|---|
| v1.1.0 → head, Chrome | 4/4 green | 60.6 s |
| v1.2.0 → head, Chrome | 4/4 green | 59.2 s |
| v1.1.0 → head, Firefox | 4/4 green | 81.5 s |
| v1.2.0 → head, Firefox | 4/4 green | 79.2 s |

- `bun run lint`, `bun run typecheck:all`, `bun run test:all` exit 0 at 962b967eb (extension 17701 passed). After merging `origin/dev` (#1722): lint, `typecheck:all` and the unlock, network and guard tests (341) green again.
