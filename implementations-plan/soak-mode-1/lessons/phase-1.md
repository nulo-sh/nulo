# soak-mode-1: phase 1 (arc A1)

- 2026-10-21 red/green: the six new soak tests and the suite pin fail against the `cef87d9de` copies of
  the soak, the suite and `assert-canary-results.ts`, and pass on the arc; the builds-iterations success
  control passes on both, as a control should.
- 2026-10-21 review r1. Codex (gpt-6.1-sol, high, session `01a16010`): changes needed, one finding; it
  swapped the CLI for one that drops listed titles in memory and the title test still passed, because
  it called `allowUnlisted` directly. Fixed: the test drives the CLI. Opus 5.5 (general-purpose):
  changes needed, five findings. `Status` named a cancel as a refusal or a flake (fixed: the flake
  clause only on `failure`, prep's line says "if prep refused"); CI.md sent readers to paste a red
  shard's list that can hold a file that cannot soak green (fixed); CI.md Layer 3 overstated the
  read-back (fixed); the claim that no lane label starts with `soak` was only partly pinned (fixed: a
  pin over every suite call, checked by renaming a lane label to `Soak-heavy`, which reds it); the
  header comment restated the YAML (trimmed).
