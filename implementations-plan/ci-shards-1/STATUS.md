# ci-shards-1 status

- 2026-11-24: plan written; Codex plan consult agreed on the unit split (vitest `--shard`, all three callers), three changes adopted.
- 2026-11-24: record refreshed, shape built; lint, typecheck:all, lint:actions, test:ci-gating green; test:release 381/388 locally (7 zip tests: this host has no `zip`).
- 2026-11-24: unit inventory proof at 6eaa143ea: 19,140 tests (19,126 passed, 7 skipped, 7 todo) in 1,062 files; legs 354 files each (6,746 / 6,165 / 6,229 tests), disjoint, union equal to the unsplit run in ids and statuses once two skipped tests whose names carry a per-run random seed are normalised. `test:all` green (18 workspaces).
- 2026-11-24: Codex diff pass: four findings (R1–R4), fixed in 31f261f9f.
