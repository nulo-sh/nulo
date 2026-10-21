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

## Consults

- **Codex fix round 1** (gpt-6.1-sol, high, read-only): **approve**; one comment-density fix, taken.
- **Opus review** (`general-purpose`): **conditional approve**: the skill's archive path failed `check:plans` at HEAD (demonstrated with `check.ts --report`); comment fixes and a label prefix. All taken.
