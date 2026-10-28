# docs-3 — arc 1 (phases 1 and 2)

- Phase 1 rebuilt SECURITY.md from the base's own line ranges (`sed -n` slices of `git show 210d02f1f:SECURITY.md`),
  so the move is the gate's expected file by construction; `cmp` then proves it. A hand cut-and-paste would have
  needed the same check anyway.
- Codex review round 1 (fresh session 01a1820f, gpt-6.1-sol, high, read-only): clean.
- Opus diff review (opus, general-purpose): clean; one needs-unsupported-conditions race (the profile lock's watchdog
  releasing inside `open()`'s last milliseconds while a strict toggle lands) filed as a closed known-limit at
  close-out; one wording nit rejected.
- Final-head gates at 90280264c: typecheck:all 0; test:all 0 (extension 947 files / 16148 tests); lint 0;
  test:ci-gating 691 pass (phase 1); the three cited profile test files 163 pass.
