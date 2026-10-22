# e2e-tmp-2 phase 2: the smoke gates

- 2026-10-22: both runs at `425b8a1a8`, retry 0, each under its own scratch `TMPDIR` in `~/.cache/nulo-backlog/e2e-tmp-2/`. Chrome: 61 passed, 9 skipped, 1903 s. Firefox: 65 passed, 5 skipped, 3309 s, at load1 110-150. Neither left a `nulo-stage-log-*` or `nulo-e2e-backup-*` dir. No red, so the flake rule was not used.
- 2026-10-22: the A1 review ran beside the Chrome run (read-only, so it could not disturb it); it was clean, so nothing reran.
