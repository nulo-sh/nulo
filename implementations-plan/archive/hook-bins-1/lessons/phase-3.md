# hook-bins-1: phase 3 and the arc's review loop

## Proof

- Fresh detached worktree outside the clone, no `node_modules` above it. Pre-commit and commit-msg each printed their one line and exited 1; `strace -f -e trace=execve,connect` recorded only `git` and the hook (or `sh`), no `connect`; private `TMPDIR`, `BUN_TMPDIR` and `BUN_INSTALL_CACHE_DIR` stayed empty.
- After `bun install --frozen-lockfile` (998 packages, 5 s): Biome 2.5.13, `@commitlint/cli` 21.2.2. A file under `scripts/` passed, a badly formatted one was refused by Biome's formatter, `fix: Handle PXE` was refused by `subject-case`.

## Review loop

- **Round 1, Codex** (gpt-6.1-sol, high, session 01a156cf): findings, comments only. The baseline scripts' "the copy `bun.lock` pins" overstated what a path proves (reworded); the hook comments repeated the guard and missed why relative paths hold (git starts a hook at the worktree root, now said); two test helper docstrings narrated their bodies (one removed, one now states why a fixture holds one hook). It ran the suite (11 pass) and found no confidential detail in the diff.
- **Round 1, Opus diff review** (opus, general-purpose): findings, minor. The runner check missed `"bun", "x"` passed as spawn arguments while its name claimed "no runner" (pattern extended, with a control listing the spellings it must and must not match); CLAUDE.md:50 said every script passes `--no-install`, which `dup-trend/report.ts` and `publish/stage.ts` do not (narrowed to the hooks); "else fetches npm `@latest`" skipped bunx's own cache (now "installs npm `@latest` into its own cache", as `bunx --help` says). It mutated the hooks in a scratch copy: base hooks red all ten hook rows; dropping `set -e` reds only the failing-tool row; a `-L` guard reds the dangling and run rows; calling the launcher without `bun` reds the run rows. Not taken: rewording an earlier commit body (the squash replaces it).
- **Round 2, Codex** (resumed 01a156cf): the round-1 fixes verified; one gap: a spawn whose arguments Biome splits across lines (`[\n\t"x",`) escaped the extended pattern. Fixed with `(\[\s*)?` (the bracket separates the two whitespace runs, so no ReDoS-prone adjacency) and the multiline form added to the control.
- **Round 3, Codex** (resumed 01a156cf): clean. All ten runner spellings match; the multiline control fails against the round-2 pattern, so it proves the fix; no ReDoS-prone adjacency.
