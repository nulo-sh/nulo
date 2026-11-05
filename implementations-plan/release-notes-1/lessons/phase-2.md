# Phase 2: workflow wiring, cliff.toml, docs and the rehearsal

Rehearsal, local, git-cliff v2.14.2 (the action's pinned default; archive SHA-512 checked), the job's arguments over `v1.1.0..v1.2.0`, the compose step run with the `env:` read from the parsed `release.yml` (its `/tmp/` paths mapped to a scratch dir):
- (a) the base `cliff.toml` reproduces the published v1.2.0 body's git-cliff part, equal once trimmed: true.
- (b) `compose` over that output and `release-notes/1.2.0.md` reproduces the whole published v1.2.0 body, equal once blank-line runs collapse: true.
- (c) the new `cliff.toml` renders Install, Verify, Features (17), Bug Fixes (62) for v1.2.0, and a range holding only a `refactor` commit keeps its version and Install text.
- (d) `compose` for 1.2.1, which has no file, exits 1: `release-notes/1.2.1.md is missing: a stable release needs its user-facing notes`.
- `bun scripts/release/release-notes-run.ts check` on this tree (version 1.2.0): exit 0.

## Fix loop

- Round 1, Codex (gpt-6.1-sol, high): findings. (1) Low, demonstrated: a setext heading (`Changes` over `=======`) passed `notesProblems`, so `check` and `compose` both returned 0 on text AMO renders without its heading line. Fixed: a line of only `=` or `-` is refused, with `===` and `---` cases; the committed files still pass. (2) Low: the `composeBody` TSDoc restated its template and the compose step's comment restated the composer. Fixed: the TSDoc removed, the step's comment cut to the one invariant (the tag's own composer runs).
