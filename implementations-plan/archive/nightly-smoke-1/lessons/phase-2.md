# Phase 2: the move and its gate

- Builds: release shape from `env -i HOME PATH`, copied out of `dist/`; armed source build with the four `VITE_NULO_E2E_*` flags. The armed build overwrites `dist/<browser>`, so the release copies live in the scratch dir.
- First lint run failed on formatting only (a long `waitForFunction` line); `biome format --write` fixed it.
- Gate at 2bfcc8e5a: green in both modes on both browsers; numbers in plan.md, Phase 2. S1's after-time on Firefox (15.9 s) sits above its before-time (14.7 s) with fewer steps: one sample each on a shared host, inside noise, and inside #1342's 18.8 s budget.
- Codex loop round 1 (fresh session): clean. Opus diff review beside it: clean, two comment fixes, both applied; Codex round 2 verifies them.
- Codex round 2: clean. Final-head gates green. One Firefox S1 sample read 21.3 s at load1 ≈ 120 with every file about 40 % slower; one rerun read 15.6 s. A single local sample on this shared host is not a runtime figure; the PR's CI per-file time is.
