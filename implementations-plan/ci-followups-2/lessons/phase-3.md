# Phase 3: two fixed chaos seeds in the PR network lanes

## Design consults (2026-10-11)

- Codex gpt-6.1-sol, high, read-only (session 01a12b96…): **revise before approval**: the matrix is sound; close the silent-skip hole now; two literal seed lists are two places (a small data file through a control job's outputs, or an exception); omit the caller's `retry: "0"`; keep the explicit same-seeds line; narrow the release normalization to the exact job and file; it found the `verify-cert-run.sh` pin, which derives names from `matrix.shard` only.
- Opus 5.5 Plan lens, in parallel: **conditionally approve**: the same matrix; key the results check on `inputs.chaos`, not a label; pass `retry: "0"` (the lane's convention); rely on parity for the seeds (two pins of one fact); release normalization acceptable, an exception to edit `release.yml` better; it also found the cert-run pin and noted vitest excludes before sharding, so release's legs now split the pool differently. It corrected a fact in the brief: the zero-proofs check never runs on a proverless job.
- Every disposition is in plan.md D7-D14. The split calls: D9 (one place) and D10 (retry) went to Opus, D11's key to Opus, D12 (explicit same-seeds line) to Codex, as the orchestrator asked.

## Seeds

The nightly chaos jobs' logs (`gh api repos/nulo-sh/nulo/actions/jobs/<id>/logs`, `[send-chaos] seed=…`), five nights 2026-10-07 to 10-11: Chrome 1057491084, 1960252198, 1073168283, 1986290948, 1522739922; Firefox 1095865833, 989949067, 1224135748, 847398520, 1970869881. Only runs 37607270016 (10-07) and 37765624647 (10-08) ended green. From those, 1095865833 (10-07 Firefox) and 1960252198 (10-08 Chrome) together cover all four TST transfer types, an ALT send, an abandoned estimate, five dApp sends and all three fee methods.

## Proofs (one at a time, tree restored after each)

- a. Base PR lanes (`git show c638bd7:<lane>` over both): exit 1; fails the cert-run names test, the exact-needs test, the one-chaos-job test and the seeds test.
- b. One seed dropped from the Firefox list only: exit 1; fails the Firefox parity test and the seeds test.
- c. `network-e2e-chaos` dropped from the Chrome `status` loop only: exit 1; fails the result-loop test.
- d. The arming condition back to `canary*` labels only: exit 1; fails the step pin.
- e. `chaos: false` on the Chrome chaos job: exit 1; fails parity, the nightly mirror, the release pin, the one-chaos-job test and the seeds test.

## Deviation from the change map

- The Firefox lane's header is unchanged: the twin carries every job of its Chrome lane by the parity pin, so naming one job there adds nothing.
- The doc counts were stale before this arc: the network directory holds 118 test files, not 116, so the pool is 108 of 118 now.

## Gate (2026-10-11, commits 826776d and 73b5e34)

- `bun run lint:actions`: exit 0. The three pin files: 142 pass. `bun run test:ci-gating`: 524 pass. `bun run test:release`: exit 0. `bun run lint`: exit 0. `bun run typecheck:all`: exit 0. `bun run test:all`: exit 0 (extension 11233 passed, 4 skipped, 7 todo).
- E2e: no local run (D5). The four seed/browser legs run on the PR, retry 0; their first-attempt result is recorded in the PR body and below once the PR's checks finish.
