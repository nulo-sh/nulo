# Phase 3: #306, release's opt-in run is the PR lane leg for job

## Gate (2026-10-11)

- `bun run lint:actions`: exit 0.
- `bun test scripts/ci-cd/behavior-gating.test.ts scripts/ci-cd/aggregators.test.ts`: 134 pass, 0 fail; `aggregators.test.ts` unchanged.
- Base proof A (the new test, `release.yml` from `2a41b1d`): 1 fail, "release's opt-in network run is the PR lane: one leg per PR job, shard and seed, with its inputs".
- Base proof B (the base test, the new `release.yml`): 1 fail, the same comparison under its old name ("one leg per PR job and shard").
- Mutations of the new `release.yml`, each restored after: drop the `chaos / seed 1960252198` leg; change that leg's `chaos_seed` to `1960252199`; remove the chaos file from the first pool leg's `exclude_files`. Each: 1 fail, the leg-for-job comparison, nothing else.
- `bun run test:ci-gating`: 526 pass, 0 fail.

## Notes

- The PR chaos job's `with` holds `${{ matrix.seed }}` in two inputs (`shard_label`, `chaos_seed`) and its name; the pin substitutes the seed in each string input, where the shard expansion sets `shard` and `shard_label` explicitly. Both expansions read the job's own matrix, so a third seed in the PR list reds the pin until `release.yml` gains its leg.
- No other doc said release replays no seed; CI.md § `pr-extension-network-e2e.yml` was the one sentence.
