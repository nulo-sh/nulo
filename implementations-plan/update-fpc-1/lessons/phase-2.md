# update-fpc-1: phase 2 (builds and the four runs)

Candidates built with `build-update-candidate.sh` (11 s each), version `1.1.0.1`. Retry 0, no rerun, no recording rewritten (`NULO_E2E_UPDATE_RECORD` unset). Firefox 158.0; Chrome from Puppeteer 25.14.0.

## At `C` = `72d73236b` (2026-11-04, UTC)

| Run | Window | Outcome | Wall-clock |
|---|---|---|---|
| Live, Chrome | 16:40:15-16:43:18 | passed | test 100.1 s, vitest 169.5 s |
| Live, Firefox | 16:43:25-16:47:40 | passed | test 156.0 s, vitest 240.2 s |
| Replay, Chrome | 16:47:58-16:48:57 | 4 passed: 24.1 s, 12.4 s, 8.6 s, 10.5 s | vitest 59.2 s |
| Replay, Firefox | 16:48:57-16:50:16 | 4 passed: 31.0 s, 18.1 s, 12.1 s, 13.3 s | vitest 77.6 s |

Before, at `040334f53` (red, lessons/phase-0.md): live Chrome test 146.5 s, red on the lost sponsor row. The aztec node's "Address already in use" at boot is the expected second anvil the setup names; Firefox's internal `JavaScript error` lines are browser noise present on green runs.

## At `M` = `002cb69ac`, `C` merged with `origin/dev` at `de27b3840` (2026-11-04, UTC)

`origin/dev` moved after the runs at `C` with a build input (`packages/legal/src/manifest.ts`, `legal/*.md`), so the gate and all four runs were repeated at the merged head. `M` replaces `C` as the tested commit.

| Run | Window | Outcome | Wall-clock |
|---|---|---|---|
| Live, Chrome | 16:58:19-17:01:11 | passed | test 97.2 s, vitest 159.8 s |
| Live, Firefox | 17:01:11-17:05:09 | passed | test 161.9 s, vitest 225.6 s |
| Replay, Chrome | 17:05:15-17:06:14 | 4 passed: 23.0 s, 12.9 s, 8.6 s, 11.1 s | vitest 58.9 s |
| Replay, Firefox | 17:06:14-17:07:35 | 4 passed: 31.5 s, 17.1 s, 12.4 s, 14.5 s | vitest 79.8 s |

Gate at `M`: `bun run lint` 0, `bun run typecheck:all` 0, `bun run test` 0, `bun run test:all` 0, `bun run check:plans` 0 findings.
