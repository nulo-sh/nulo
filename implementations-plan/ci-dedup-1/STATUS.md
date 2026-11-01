# ci-dedup-1 status

- 2026-11-01 recon done (one explorer); plan drafted.
- 2026-11-01 audit round 1: Codex conditional approve, Opus conditional approve; conditions folded (plan § Audit verdicts).
- 2026-11-01 final fresh Codex pass: conditional approve (D8 grammar check), folded; resumed verification: approve.
- 2026-11-01 phase 1 gate green (lint:actions, lint, typecheck:all, test:ci-gating 701 pass); red proof: the new test fails on the base network filters.
- 2026-11-01 phase 2 gate: lint:actions, lint, typecheck:all, test:ci-gating (721 pass), test, test:all exit 0; test:release 7 fail, all `zip` missing on this host (zip-read, zip-reproducible; files this lane does not touch), CI is the authority; red proof: the new checks fail on the base composite and store-check.
