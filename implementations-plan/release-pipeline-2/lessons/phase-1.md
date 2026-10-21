# release-pipeline-2: phase 1 (arc 1) log

- 2026-10-21 Phase 1 gate green: `lint:actions` 0; `test:ci-gating` 660 pass; `test:release` 351 pass; `typecheck:all` 0; `test:all` 0 (extension 14816 pass). Red proof (a), the four workflows at base: exactly six "outside release-app" plus the two callers' App-secret reads. Red proof (b), only the callers at base: exactly two reads plus two "without secrets: inherit".
- 2026-10-21 review round 1: Codex (gpt-6.1-sol high, session 01a15f24) approve with changes (3); Opus general-purpose approve with fixes (6). All accepted as recorded in plan.md § Audit verdicts. The branch was unpushed, so its history was rebuilt so that no commit carries the plan text the review flagged.
- 2026-10-21 Biome's formatter wraps a long `test.each` row: run `biome format --write` on the file before `biome check`.
