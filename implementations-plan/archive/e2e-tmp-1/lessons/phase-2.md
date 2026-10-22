# e2e-tmp-1 phase 2: the e2e gates

- 2026-10-22: every run used a scratch `TMPDIR` under `~/.cache/nulo-backlog/e2e-tmp-1/` (53 bytes, short for socket paths). Smoke Chrome 61 passed / 9 skipped in 31 min; smoke Firefox 65 passed / 5 skipped in 50 min at load1 about 140; network Chrome (proverless, the eight caller files) 17 passed in 9 min. No `nulo-e2e-backup-*` dir remained after any run; each smoke run left the three `nulo-stage-log-*` dirs #1071 describes, which confirms that issue's count.
- 2026-10-22: the Opus review's fix re-indented two smoke files while the Chrome run was in flight; both reran green at `4a95e6650` (105 s).
