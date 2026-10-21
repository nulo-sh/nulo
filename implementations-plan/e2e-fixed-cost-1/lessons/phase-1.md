# e2e-fixed-cost-1, phase 1: the first-run settle and the liveness poll

All runs on this host, retry 0, load1 logged at each run's start; raw data in the scratch run directory.

## Asserting relaunch probe

Scratch spec (never committed): five fresh launches, then one registered profile and five relaunches over it, each launch timed; asserts no page target on the popup document right after each relaunch's settle and 3 s later, and relaunch median ≤ fresh median + 1 s. Base = the fixture diff reverted with `git apply -R`.

| Run | load1 | Fresh median | Relaunch median | Popups left | Result |
|---|---:|---:|---:|---:|---|
| Chrome, branch | 156 | 4841 ms | 4059 ms | 0 of 10 | pass |
| Chrome, base | 189 | 4886 ms | 8542 ms | 10 of 10 | fails, as required |
| Firefox, branch | 177 | 6410 ms | 6165 ms | 0 of 10 | pass |
| Firefox, base | 219 | 7333 ms | 10962 ms | 10 of 10 | fails, as required |

A relaunch over a completed profile drops by about 4.5 s on each browser and no longer leaves a `#/popup/auth` window open.

## Gate runs

- Smoke, Chrome (load1 187): `migration`, `legal-acceptance`, `restore-outcome`, `backup-roundtrip`, `import-dead-rpc`, `import-errors-scroll`, `registration`, `onboarding-tab`: 8 files, 42 tests green; `Duration 482.56s (transform 2.82s, import 10.28s, tests 470.14s)`.
- Smoke, Firefox (load1 126), the same files: 8 files green, 38 tests passed, 4 skipped by the spec on Firefox; `Duration 601.27s (transform 4.88s, import 14.82s, tests 584.16s)`.
- Network, Chrome (load1 277): `backup-restore-integrity`, `restore-again`, `account-balance-orphans`, `backup-migration-roundtrip`, `wallet-locked-mid-session`, `holdings`: 6 files, 11 tests green; `Duration 440.99s (transform 31.99s, import 21.30s, tests 306.63s)`.
- Network, Firefox (load1 195), the same files: 6 files, 11 tests green; `Duration 566.72s (transform 64.76s, import 10.11s, tests 406.79s)`.
- Full smoke, Chrome, at `d0f786889` (load1 101): 59 of 60 files green, 265 tests passed; `import-dead-rpc`'s three interception tests red (`expected 0 to be greater than 0`: the interception saw no call). Cause: the Chrome `e2e:agent` gate run before it had rebuilt `dist/chrome` as its network-stamped build at 10:43, and the smoke run loaded that build (its stamp check passed). Rebuilt the armed smoke build (`global-setup-smoke.ts`'s command) at the merged head `c64780792`: `import-dead-rpc` 8 of 8 green. Rule kept for the rest of the arc: rebuild the armed build after any `e2e:agent` run and before any smoke run.
- Full smoke, Firefox, at the merged head `c64780792` on the armed build (load1 165): 62 of 63 files green, 267 tests passed; one red, `migration` › "a crash mid-migration converges", `Test timed out in 60000ms`, with no location (its fourth launch never started). Not reproduced: `migration` alone 2 of 2 green while the suite ran, then that test alone 4 of 4 green.
- That test's step times on Firefox, four runs each, branch vs base (base = the fixture diff reverted), scratch instrumentation: branch 31.1-32.4 s at load1 172-222, base 34.7-49.9 s at load1 161-254. On base its second and third relaunches each wait the full 5 s first-run read; on the branch the read takes 44-1287 ms. The change shortens the test; the full run's timeout is unexplained but not traced to it, and the PR's Firefox smoke lane runs the suite again.
- Final head `c64780792`, Chrome and Firefox full smoke run side by side from separate dist copies (load1 113): Chrome 60 files green, 268 tests (`Duration 2126.47s`: transform 5.77, import 52.92, tests 2056.61); Firefox 63 files green, 268 tests (`Duration 3445.06s`: transform 8.91, import 64.85, tests 3361.99). The earlier Firefox timeout did not recur.
- Final head, network gate files, Chrome (load1 241): 6 files, 11 tests green (`Duration 489.73s`).

## Paired measurement

`migration` + `legal-acceptance`, three interleaved base/branch pairs per browser (order base, branch, branch, base, base, branch; base = the fixture diff reverted, no rebuild), at the merged head on the armed build. Medians, seconds; load1 at each run's start.

| | Chrome base | Chrome branch | Firefox base | Firefox branch |
|---|---:|---:|---:|---:|
| `migration` | 54.7 | 48.8 | 116.0 | 91.4 |
| `legal-acceptance` | 169.4 | 160.5 | 229.6 | 214.9 |
| vitest `Duration` total | 242.2 | 211.8 | 361.6 | 315.4 |
| transform / import / tests | 15.8 / 17.8 / 224.4 | 4.6 / 4.2 / 206.8 | 4.1 / 4.5 / 356.3 | 2.1 / 3.3 / 306.3 |
| load1 at start | 239, 134, 127 | 153, 154, 116 | 131, 124, 184 | 99, 118, 109 |

The base samples ran at higher load on average on both browsers, so the gaps overstate the change somewhat. The traced saving is about 5 s per relaunch over a completed profile (the asserting probe: 4.5 s Chrome, 4.8 s Firefox), which Firefox pays on six `migration` launches and Chrome on fewer.

## Consults

- **Codex fix round 1** (gpt-6.1-sol, high, read-only): **approve**; one comment-density fix, taken.
- **Opus review** (`general-purpose`): **conditional approve**: the skill's archive path failed `check:plans` at HEAD (demonstrated with `check.ts --report`); comment fixes and a label prefix. All taken.
- **Codex fix round 2** (resumed): **approve**, no findings; the loop converged.
