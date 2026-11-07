# Phase 1: the marker and its rule

- `bun run baseline:storage -- --additive "<reason>"` appended stamp 4 and printed its pin; the goldens carry `"stamp": 4` before the run. Re-serialising `goldens.json` with a JSON library reflows its arrays: insert entries textually.
- Gate: lint 0 (23 warnings, as on the base), `typecheck:all` 0, the targeted vitest run 134 passed, `bun run test` 17598 passed.
