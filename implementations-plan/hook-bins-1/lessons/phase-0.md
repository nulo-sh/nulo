# hook-bins-1: phase 0 (recon and plan audits)

## Probes

- `bun x --no-install <bin>` from a child directory ran a bin placed only in a parent directory's `node_modules/.bin` (Bun 1.4.2). `bunx` looks upward before anything else.
- A `pre-commit` hook started by `git commit` from a linked worktree's subdirectory printed `pwd` = the worktree root, `GIT_DIR` = the linked worktree's git dir, `GIT_WORK_TREE` unset, and `git rev-parse --show-toplevel` = the worktree root.
- `bun node_modules/.bin/biome --version` printed `2.5.13`; `echo 'fix: x' | bun node_modules/.bin/commitlint` exited 0.

## Consults
- **Round 1, Codex** (gpt-6.1-sol, high, session 01a156ad, CLI 0.160.0): conditional approve, six findings: an incomplete sweep (FIREFOX.md's `web-ext` check), D3's "another gate fails first" is detection not prevention, I2 misstated (the launcher honours `BIOME_BINARY` and runs `ldd`), `--no-install` on the new launcher calls, a missing case for a failing tool (a dropped `set -e` would pass every planned case), and a static pin narrower than its claim (`bun create`, options, continuations). Dispositions in `plan.md` § Audit verdicts.
- Probe for its runtime-resolution remark: `bun y.ts` importing `is-number` from a directory with no `node_modules`, `package.json` or `bunfig.toml` anywhere above it, registry pointed at a dead port, printed `Cannot find package` at once, with no fetch attempt (Bun 1.4.2). Runtime resolution stays outside this lane (not a runner).
- **Round 1, Opus Plan leg** (opus, Plan): conditional approve, eight findings: raw cache listings in the PR body would name what they hold (hashes only now); commit-msg's refusal row could not pass behind pre-commit (one hook per fixture); `generate.ts` stamps today's date (gate reworded); two missed manual commands; the parent decoy was unreachable in every row (dropped; sentinel-only `PATH`); a helper module where the repo's precedent is a constant per script (D4); backticks inside a double-quoted refusal would run `bun install` (single quotes, no backticks); propagation to older branches (an Outcome line). It doubted F4; re-probed with a `package.json` in the child directory: `bunx` still took the parent's bin.
- **Driver's calls after round 1:** every Opus finding taken; Codex #1-#6 taken, with D3 kept on an explicit assumption (both CI sites run after a frozen install, read-only token, and the Puppeteer change would trip all four e2e lanes) and D4 settled for the precedent over Codex's shared helper.
- **Final pass, Codex** (fresh session 01a156bc, gpt-6.1-sol, high): conditional approve. It ran both proposed hook blocks under dash (syntax, the exact refusal line, `[ -f ]` on a dangling link, `exec`, `set -e`). Two validation fixes, both taken: private `TMPDIR`, `BUN_TMPDIR` and `BUN_INSTALL_CACHE_DIR` for the proof instead of hashing shared caches, and a pin that each hook names `bun --no-install ./node_modules/.bin/<tool>`.
- **Final pass resumed** (verification): approve, no remaining finding.

## Arc 1 notes

- Biome's `files.includes` (`apps/**`, `infra/**`, `packages/**`, `scripts/**`, `vitest.base.mts`) skips a root-level `.ts`: a proof file at the root reads `Checked 0 files` and passes whatever its content. The proof's format refusal used a file under `scripts/`.
