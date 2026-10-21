# shard-balance-1: recon

One Sonnet reuse sweep plus the planner's own reads, at `origin/dev` 41ed6c594. The measurement itself is in [plan.md § Measurement](plan.md#measurement).

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A shard override | None. No `sequence` key in any vitest config, `vitest.base.mts` or `apps/extension/vite.shared.ts`. Searched `sequencer\|BaseSequencer\|shard\(` over `*.ts,*.mts,*.json,*.sh,*.yml`, excluding `node_modules`; the only hits are Aztec's `send-sequencer`. | build new: `apps/extension/tests/e2e/shard-sequencer.ts`, beside the other harness modules `vite.shared.ts` imports (`stall-watchdog.ts`, `retry-error-reporter.ts`, `run-limits.ts`) |
| Vitest's own split | `BaseSequencer.shard` (vitest 4.1.10, `node_modules/vitest/dist/chunks/coverage.DM_a_rWm.js:35-46`) sorts by SHA-1 of the root-relative path and slices contiguous ranges. It is called only in the pool's `executeTests` when `config.shard` is set (`cli-api.BK8pd4xc.js:3618-3622`), never by `vitest list`. | reuse: extend `BaseSequencer` from `vitest/node`, override `shard()` only, keep `sort()` |
| Browser selection | `resolveBrowserKind()` (`apps/extension/tests/e2e/fixtures/browser/selection.ts:12-17`). It is free of driver imports and throws on an unknown browser. | reuse as-is |
| Fetching CI data | `scripts/ci-cd/verify-cert-run.sh:90,114,151` (`gh api …/runs`, `…/jobs`, `…/jobs/<id>/logs`); `.claude/skills/e2e-testing/SKILL.md:269` (the suite-envelope one-liner). Nothing fetches per-file durations. | adapt the call pattern into `scripts/ci-cd/e2e-timings.ts` |
| Per-file durations | Vitest's default reporter prints one line per file with its duration, and GitHub timestamps every log line. The json reporter runs only on canary and chaos jobs (`_extension-network-e2e.yml:264`). `test-soak/lib.ts:202` parses unit-test json. | build new: parse the default reporter's file lines (no workflow change, no artifact) |
| A generated record with its rewrite command | `scripts/complexity-baseline/` + `bun run baseline:complexity`; `stored-shapes/snapshot.json` + `bun run baseline:storage`. Committed JSON, tab-indented; a root script rewrites it; a test names the command. | match the convention: `bun run e2e:timings` rewrites `apps/extension/tests/e2e/shard-timings.json` |
| CI-shape pins | `scripts/ci-cd/behavior-gating.test.ts:873-892` pins every shard matrix to `{id:"i/N", label:"i-of-N"}`, keys `["shard"]`, `with.shard: ${{ matrix.shard.id }}`; `:1069-1073` pins the pool's `exclude_files` to the dedicated jobs' `test_files`. | keep green untouched: the sequencer changes neither |
| Test runners | `test:ci-gating` is `bun test scripts/ci-cd/` (root `package.json:32`). `apps/extension/scripts/**/*.test.ts` run in the extension's vitest (`apps/extension/vitest.config.ts:37-42`). | the generator's test under `scripts/ci-cd/`; the sequencer's under `apps/extension/scripts/e2e/` |

## Every caller of a shard expression (all keep working unchanged)

- `_extension-smoke-e2e.yml:178-182`: `test:e2e --shard="$SHARD"`; `NULO_E2E_BROWSER` from `inputs.browser`.
- `_extension-network-e2e.yml:262-290`: `e2e:agent --shard="$SHARD" --exclude …`. A dedicated job passes file names and no shard, so `shard()` never runs there.
- `apps/extension/scripts/e2e/agent.sh` forwards `"$@"` to vitest with `vitest.e2e.network.config.ts`. `proverless-guard.sh` judges `vitest list`'s selection before any shard applies (`proverless-guard.sh:8-9`), so it is unaffected.
- `docker-ci-like.sh:124-129` (`--shard="$SHARD"`, default `5/5`) and `extension-network-e2e-soak.yml` (mode `shard`) pass the expression through.
- `release.yml` and `nightly.yml` call the lane. Their smoke runs are unsharded.

## Docs that state the SHA-1 split

`CI.md:41,52`; `apps/extension/tests/e2e/README.md` § CI sharding; `.claude/skills/e2e-testing/SKILL.md:228-234`; workflow comments at `_extension-network-e2e-lane.yml:47-49,96-97`, `pr-extension-smoke-e2e.yml:129-131`, and `_extension-network-e2e.yml` (`test_files` and `exclude_files` descriptions). `CI.md:52` and the README also give stale counts ("109 of the suite's 121"): the pool holds 121 of 133 today.

## Collisions

- Closed history: #410 (network shard 4 near its 30-minute limit) and #537 (the partition written out by hand) are closed. No open issue overlaps #972.
- block-time-1 (#959) instruments the e2e harness in its own worktree. A textual conflict is possible only if it edits the two e2e vitest configs; a merge of `dev` before the PR shows it. No other lane on this host names CI files (lane brief).
