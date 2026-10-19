# Status: egress-flake-1

- 2026-10-19: recon done (1 sonnet explorer). Probe run on Chrome 152 and Firefox 153: the exact `Invalid InterceptionId.` reproduced for a reply after the worker's stop; Firefox reports no failure. Plan drafted.
- 2026-10-19: audit r1 started (Codex gpt-6.1-sol high, Opus Plan).
- 2026-10-19: audit r1: Codex conditional approve (4), Opus conditional approve (7), all accepted; plan revised (reply pin in the unit cases, pause after arm, D7 gate deviation, wording).
- 2026-10-19: final Codex pass (resume): approve, no findings. Plan committed; auto-continue into arc 1.
- 2026-10-19: phase 1 fast gates green on a4700ea7: lint, typecheck:all, test (860 files; a first run under load 180-370 timed out 12 unrelated tests, green alone and rerun with --maxWorkers=32), test:all; negative control red on the two gone cases.
- 2026-10-19: Codex loop converged (r1 approve + 2 comment fixes, Opus 3 comment fixes, r2 approve none) on b238a08b; smoke e2e next.
- 2026-10-19: Chrome smoke, whole suite, retry 0: 56/58 files green (3107 s); legal-acceptance S9 and account-import-export's duplicate import red on waitForHash timeouts while host load hit 1500-4200 (701 GiB of 752 in use, other leads); both files rerun once: 2/2 green, 18 tests (the rerun began at load 177 after a 300 s wait expired).
- 2026-10-19: Firefox smoke, whole suite, retry 0: 267/267 tests green, 60/61 files (3749 s); imported-account-lifecycle's close timed out reading the CSP record (15 s) while load hit ~890; rerun once at load 138: green. Phase 1 gate passed.
