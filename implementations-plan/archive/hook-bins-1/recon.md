# hook-bins-1: recon

Base: `origin/dev` at `dc94581d`. One Explore agent (sonnet) swept every `bunx`, `bun x`, `npx` and `dlx` call; the driver verified each claim below and ran the probes.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Run an installed CLI on Bun with no Node on `PATH` | `scripts/dup-trend/report.ts:14,135` (`JSCPD` constant + `spawnSync(process.execPath, …)`), `scripts/publish/stage.ts:204`, `scripts/ci-cd/commitlint.test.ts` | reuse the pattern in the hooks and, as a constant per script, in the baseline scripts |
| Throwaway git repositories in a test | `scripts/ci-cd/plans/fixture-repo.ts` (`git`, `writeFiles`, `tempDir`; it forces `core.hooksPath=/dev/null`) | adapt: the hook test needs hooks on, so it builds its own two-level fixture and reuses only the shape |
| A regex for commands that fetch from npm | `INSTALLS` in `scripts/ci-cd/release-integrity.test.ts:197` (installs, `bunx`, `bun x`, `bun create`, `npx`) | not importable (a test file); the new test keeps its own one-line regex for the runners only |
| Walk tracked files | `scripts/ci-cd/workflow-refs.test.ts` (`git ls-files -z`, already includes `.githooks`) | reuse the `git ls-files` approach |
| One `biome lint --reporter=json` spawn | duplicated in `scripts/complexity-baseline/generate.ts:44-60` and `rescore.ts:50-75` | keep the two spawns; change only the runner (plan D4) |
| A hook-content test | none (searched `scripts/**/*.test.ts` for `.githooks`, `pre-commit`, `commit-msg`, `hooksPath`, `bunx`) | build new |

## Call sites (tracked files, `implementations-plan/archive/**` excluded: 46 hits there)

| # | Site | Runs from | Install before it | Verdict |
|---|---|---|---|---|
| 1 | `.githooks/pre-commit:3` `bunx biome check --staged …` | the worktree root, on every commit | none guaranteed | change |
| 2 | `.githooks/commit-msg:2` `bunx commitlint --edit "$1"` | the worktree root, on every commit | none guaranteed | change |
| 3 | `scripts/complexity-baseline/generate.ts:45` `spawnSync("bunx", ["biome", "lint", …])` | root (`bun run baseline:complexity`) | none guaranteed (run by hand) | change |
| 4 | `scripts/complexity-baseline/rescore.ts:51`, same | root (`bun run baseline:rescore`; `scripts/ci-cd/complexity-rescore.test.ts`) | none guaranteed by hand; CI installs | change |
| 5 | `.github/workflows/pr-quick.yml:225` `bunx commitlint --from … --to …` | job root | `./.github/actions/setup-bun` runs `bun install --frozen-lockfile` first (`install` defaults to `"true"`) | keep (D3) |
| 6 | `.github/actions/setup-puppeteer/action.yml:39` `bun x puppeteer browsers install firefox` | `apps/extension`, which declares `puppeteer` | setup-bun's frozen install first | keep (D3) |

Manual commands in docs and comments: `apps/extension/tests/e2e/FIREFOX.md:91` runs `bunx web-ext@10.6.0 lint …` from the root (Mozilla's package, pinned, declared nowhere: a deliberate fetch, kept); `nulo-account.test.ts:10` tells a person to run `bunx aztec-wallet …`, a name no workspace declares (the comment drops its runner). Documentation only (no change): `CLAUDE.md:485`, `SECURITY.md:684`, `.claude/skills/chrome-extension-debug/SKILL.md:63`, `apps/extension/tests/e2e/fixtures/browser/firefox.ts:251` (the harness's message; printed only by an installed e2e run): the Firefox download, run from `apps/extension` once the e2e dependencies are installed. Comments and fixtures: `observability.test.ts:88`, `release-integrity.test.ts` (regex and fixtures), `publish-packages.test.ts:93`. `apps/extension/scripts/e2e/docker-ci-like.sh:78` creates the image's `bunx` link and calls nothing. No `package.json` script uses any runner.

## Probes (Bun 1.4.2, git on this host)

- **bunx looks upward.** A bin placed only in a parent directory's `node_modules/.bin` ran from a child directory: `bun x --no-install <probe-bin>` printed the probe's line, with and without a `package.json` in the child. So `bunx` in a tree with no install runs an enclosing directory's install when one exists, and otherwise falls to its cache or npm.
- **Hook environment.** In a linked worktree, a hook started by `git commit` from a subdirectory ran with its working directory at the worktree root, `GIT_DIR` set to the linked worktree's git dir and `GIT_WORK_TREE` unset; `git rev-parse --show-toplevel` printed the worktree root. In the main checkout `GIT_DIR` was unset.
- **Bun runs both launchers.** `bun node_modules/.bin/biome --version` printed `2.5.13`; `bun node_modules/.bin/commitlint` linted stdin and exited 0. Both bins start with `#!/usr/bin/env node`.
- **The pre-commit's third step needs no install.** `scripts/complexity-baseline/check.ts` and `scan.ts` import only `node:*` modules and each other, and `bunfig.toml` sets `install.auto = "disable"` for any Bun started at the root.

## Conventions to match

- POSIX `sh` hooks (`#!/bin/sh`); pre-commit uses `set -e`. `scripts/check-no-local-paths.sh` is bash.
- `test:ci-gating` is `bun test scripts/ci-cd/`; tests there use `bun:test`, `spawnSync`, and header TSDoc stating what the file pins.
- CLAUDE.md § Working in this repo already states the root-`bunx` rule (line 50, evidence `archive/plans-scaffolding/plan.md#root-bunx`) and describes the hooks (line 54, which omits the complexity scan).

## Overlaps

Open work touching `CLAUDE.md`: #890 and the `migration-rule-1` arcs (around lines 142-144), #743 (around line 214), `unit-flake-1` (around line 267). This lane edits lines 50 and 54 only. No open PR touches `.githooks/` or `scripts/complexity-baseline/`. Every open lane PR touches `implementations-plan/index.md` (one line each).
