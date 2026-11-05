# Phase 2: workflow wiring, cliff.toml, docs and the rehearsal

Rehearsal, local, git-cliff v2.14.2 (the action's pinned default; archive SHA-512 checked), the job's arguments over `v1.1.0..v1.2.0`, the compose step run with the `env:` read from the parsed `release.yml` (its `/tmp/` paths mapped to a scratch dir):
- (a) the base `cliff.toml` reproduces the published v1.2.0 body's git-cliff part, equal once trimmed: true.
- (b) `compose` over that output and `release-notes/1.2.0.md` reproduces the whole published v1.2.0 body, equal once blank-line runs collapse: true.
- (c) the new `cliff.toml` renders Install, Verify, Features (17), Bug Fixes (62) for v1.2.0, and a range holding only a `refactor` commit keeps its version and Install text.
- (d) `compose` for 1.2.1, which has no file, exits 1: `release-notes/1.2.1.md is missing: a stable release needs its user-facing notes`.
- `bun scripts/release/release-notes-run.ts check` on this tree (version 1.2.0): exit 0.
