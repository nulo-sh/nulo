# soak-mode-1: recon

Read at `origin/dev` `cef87d9de` on 2026-10-21 by the planner and one Sonnet explorer. Paths are
repo-relative; line numbers are at that commit.

## The two runs the brief cites

| Run | What it was | What happened |
|---|---|---|
| 39642793500 | soak, `mode=full`, 5 repeats, retry 0, branch `encryption-at-rest-1-a1` | iterations 1 and 2 `cancelled` at 30:20 and 30:18 (the suite job's `timeout-minutes: 30`); iteration 3 ended `cancelled` at 7:48 with the run; `Status` red |
| 39652968832 | `nightly.yml`, `dry_run=true`, `force=true`, same branch | **`resolve` failed in 10 s**: "a nightly builds dev only; dispatch it with --ref dev (this run is on refs/heads/encryption-at-rest-1-a1)" (`nightly.yml:108-111`); every gate skipped |

Earlier soak runs (38461936523, 38464845247, 38966662666, 38970779100, 38972587282) were `files` or
`shard` workloads of 3 to 12 minutes, all green.

## Where the whole suite can run, and how

| Instrument | Partition | Retry | Refs | Repeats |
|---|---|---|---|---|
| soak `mode=full` | one job, whole suite (`_extension-network-e2e.yml:285`) under 30 min (`:115`) | input, default 0 | any | cannot pass |
| soak `mode=shard`/`files` with an empty value | the same whole-suite branch | input | any | cannot pass |
| `pr-extension-network-e2e.yml` and its Firefox twin, `workflow_dispatch` | the lane (`_extension-network-e2e-lane.yml`): 5 proverless shards, 3 heavy jobs, prover-ON canary, 2 fixed chaos seeds | `"0"` | any | one run per dispatch; a second dispatch on the same sha cancels the first (`pr-extension-network-e2e.yml:21-25`) |
| `nightly.yml` | the lane on both browsers, plus builds, smoke, notes | config default (3 attempts; `nightly.yml:39-45`) | `dev` only | one; `concurrency: nightly` cancels a run in flight (`:71-79`) |

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Refuse a bad dispatch input in a bash step | `_extension-network-e2e.yml:166-173` (`case` + `::error::… got '$X'` + `exit 1`); `publish-packages.yml:81-83`; `nightly.yml:108-111` | adapt: same idiom in the soak's `prep` |
| Inputs reach the script only through `env:` | the soak's `prep` already passes `REPEATS` by `env:` (`extension-network-e2e-soak.yml:63-64`) | reuse |
| Run a workflow step's script in a test | `scripts/ci-cd/nightly-resolve.test.ts` (step by `id`, temp `GITHUB_OUTPUT`, `Bun.spawnSync(["bash", …])`); `scripts/ci-cd/aggregators.test.ts:70-82` | reuse the pattern |
| Workflow-shape pins | `scripts/ci-cd/behavior-gating.test.ts`: `workflowOf` (`:129`), "nothing calls the suite but the lane, the soak and nightly's in-browser leg" (`:998-1006`) | reuse; the caller-list pin stays as is (the soak keeps its one suite caller) |
| Fan the suite out per iteration | the lane; its callers' keys are pinned to `if,name,needs,uses,with` (`behavior-gating.test.ts:986`), `legsOf` throws on a non-literal matrix (`:183-190`), `LANE_INPUTS` (`:900-908`) says "the partition, its labels and the fixed seeds are the lane's alone"; fixed `shard_label`s collide in `network-e2e-logs-…` (`_extension-network-e2e.yml:416`) across iterations | not taken (plan § Decision) |
| Docs that name the soak | `.github/WORKFLOWS.md:41` (callers table), `.claude/skills/e2e-testing/SKILL.md:257` (one sentence), `CI.md:62` (Layer 3, `shard_label: soak-N`) | adapt; `CI.md` has no soak section; the `release` skill never names the soak; "one green soak" appears nowhere in the tree |

Absence trail: `grep -rniE "soak|mode=full|one green soak|dry.run"` over the tree (excluding
`node_modules`, `.git`, `.claude/worktrees`, `bun.lock`, `CHANGELOG.md`), then each of `CI.md`,
`CLAUDE.md`, `.github/WORKFLOWS.md`, `apps/extension/tests/e2e/README.md`,
`implementations-plan/lessons.md` and `.claude/skills/*/SKILL.md` by hand. `CLAUDE.md`'s "soak" is the
unrelated unit-runtime soak (`scripts/ci-cd/test-soak/`).

## Other facts the plan rests on

- `prep` clamps `repeats` silently (non-numeric → 5, above 25 → 25: `extension-network-e2e-soak.yml:67-70`)
  while `status` prints the raw input as the iteration count (`:112`), and prints "zero retries
  consumed" whatever `retry` was.
- An unexcluded `--shard k/5` (the soak's `mode=shard`) is not the PR pool's partition: the twelve
  dedicated files join the pool at the median recorded cost (`apps/extension/tests/e2e/shard-sequencer.ts:23,38`;
  they are absent from `shard-timings.json`), and run proverless by default.
- Closed known limit #977 covers the soak checking out `github.ref` (a mid-run push); its reopening
  condition has not occurred.
- Closed #537 (the partition written out per workflow) is resolved by the lane; nothing here
  re-opens it.

## Open work

`gh issue list --state all --search soak`: #987 (the unit soak's Node reference, unrelated), #977
(above). No issue owns the soak's `full` mode; the plan files one.
