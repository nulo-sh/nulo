---
plan: ci-shards-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: origin/dev at 6bab0009e
trunk: dev
issues: none (decision page 210, P210-01 = A, signed by the owner 2026-11-24T18:29:07Z)
post_implementation_hardening: not scheduled
---

# ci-shards-1: seven network shards, four smoke shards, the unit tests three ways

One arc (A1, branch `ci-shards-1-a1`), one **draft** PR against `dev` that is never marked ready. The owner picked option A of page 210: "Rebalance the network shards and go from five to seven, split smoke into four and the unit tests into three. Forecast: a PR's slowest lane from 26 to about 16 minutes and the quick checks from 14 to about 6, for $0 and nobody new to trust." This plan builds that shape and measures it; nothing beside it.

## Before (medians of the last 20 green runs that ran their suites, 2026-11-24)

| lane | run wall p50 | slowest job p50 | jobs |
|---|---|---|---|
| pr-quick | 14.1 min | Unit tests 13.5 min (`test:all` 707 s, `test:release` 22 s, `test:ci-gating` 51 s) | 9 |
| smoke Chrome | 11.9 | shard 2/3 11.4 | 5 |
| smoke Firefox | 17.1 | shard 1/3 16.4 | 5 |
| network Chrome | 21.3 | pool shard 2/5 19.4 | 13 |
| network Firefox | 26.0 | pool shard 2/5 24.9 | 13 |

Network pool shard 2/5 runs 300–700 s longer than its siblings on every one of the 7 runs the refreshed record read: the record was a month old (2026-10-20). The refreshed record splits the pool to within 9 s at seven shards (Chrome 675–683 s, Firefox 748–757 s of file time) and smoke to within 6 s at four (Chrome 417–419, Firefox 635–641).

## Shape

1. **Timings record** refreshed by `bun scripts/ci-cd/e2e-timings.ts`. gh 2.103 refuses to print a job log holding escape codes without `--allow-escape-sequences`, so the script passes it (D5); `classify()` already strips them.
2. **Network pool: `1/7`…`7/7`** in `_extension-network-e2e-lane.yml`, the one file every caller shares. The dedicated jobs and `exclude_files` stay byte-identical.
3. **Smoke: `1/4`…`4/4`** in both PR smoke lanes.
4. **Unit tests: three legs** of one matrix job in `_unit-tests.yml` (D1–D4). Each leg runs `bun run --cwd apps/extension test -- --shard=<i>/3`, then exactly one other piece: leg 1 every other workspace (`bun run --filter '@nulo/*' --filter '!@nulo/extension' --if-present test`, the 17 workspaces `test:all` runs beside the extension), leg 2 `test:release`, leg 3 the live move-approval label and `test:ci-gating`, adjacent as today. Every leg sets up Node 24 after the workspace suites and before the script suites, today's order (C3). Same Bun, same configs, same guards; `fail-fast: false`; `timeout-minutes` stays 25.
5. **Every count that moves**: workflow comments and input examples, `verify-cert-run.sh`'s Quality and smoke job names (now derived and pinned like its network list, C4), `CI.md`, `.github/WORKFLOWS.md`, the e2e README § CI sharding (heading without its count, artifact names), `docker-ci-like.sh`'s default shard, the `e2e-testing` skill, `behavior-gating.test.ts`, `aggregators.test.ts`, `shard-sequencer.test.ts`.

## Invariants and their proofs

- **Each e2e file once per lane.** `shard-sequencer.test.ts` drives each config's own sequencer over the real smoke, network and pool lists on both browsers at the counts it now reads from the workflows (D7), and proves the shards disjoint, non-empty and their union the selection. `behavior-gating.test.ts` keeps pinning each matrix `1/N…N/N` once and the pool/dedicated partition.
- **Each unit test once.** Vitest's own split sorts the files by path hash and slices contiguous ranges, a partition of one file list; every leg checks out one SHA. Proof at one clean commit after `bun install --frozen-lockfile`: `cli.ts soak --runtime script --runs 1` on `apps/extension` unsplit and on each `-- --shard=i/3`; the union of the three leg inventories equals the unsplit inventory, id and status alike (an existing skip or todo stays one), no id in two legs (C5); and the other-workspaces command runs exactly the 17 workspaces `test:all` runs beside the extension. A pin holds every step's kind, order and condition whole, the job to no `if` and no `continue-on-error`, the matrix to `1/3…3/3`, and the other-workspaces filter to `test:all`'s filter less `@nulo/extension`. "Once" is per suite invocation: the extension's config deliberately re-runs six packages' tests under jsdom beside their own suites, as today.
- **No gate changes.** The five aggregators keep their names and scripts. A failed or cancelled leg reaches the caller as the called workflow's one result: the network lane already has this shape (a matrix inside a called workflow, read as one `needs` result; run 43076832385: one failed pool shard, its aggregator red) and `aggregators.test.ts` fails `quality-status` on any `unit-tests` result but `success`. No `continue-on-error`, retry, timeout or skip added.
- **Runtime unchanged**: neither of CLAUDE.md's two test-runtime bars applies (D3); the inventory leg of the same-engine bar does, and is met above.
- **Untouched**: actions and their pins, permissions, secrets, events, labels, Presto, the prover-ON canary, `workflow_dispatch`.
- **Callers**: nightly and release call the same lane and `_unit-tests.yml`, so each runs 7 network pool shards per browser it runs and three unit legs; their smoke against the built artifact stays one unsharded job, and their gates read the same `needs` results as before.

## Measure (Phase 3)

After: the PR's own runs, CI's job envelopes, at least two green first-attempt runs per lane at the final head (a `workflow_dispatch` of a lane on the branch counts), n stated. Per lane: run wall, slowest job, every shard's duration and the spread. A shard more than 2 minutes off its siblings sends the record or the split back for another look. A lane no faster than its before is left out and goes to `OWNER_ASKS:`; faster but short of the forecast is kept and the gap stated. A red is diagnosed, never re-rolled; the cold-shard note in the e2e README is the first place to look for a file red only where the new split puts it.

## Security & Adversarial Considerations

- No permission, token, secret, event or action changes; three unit legs hold what one job held (`pull-requests: read` from the caller for the live label read). The legs restore the same Bun install cache key, as the e2e shards already do; credentialed and release-build jobs keep no shared cache (untouched, pinned by `release-integrity.test.ts`).
- The attack surface is a gate that passes without running something: a file in no shard, a skipped leg read as success, an extra step that never matches its leg. Each is pinned (above). A called workflow whose only job skips reads as success to its caller, so `_unit-tests.yml`'s job takes no `if`.
- The record is a reviewed diff of paths and seconds; a skewed record costs balance, never coverage (`shard-balance-1`'s threat note holds unchanged).

## Assumptions

- **Facts**: F1 vitest 4.1.12 `BaseSequencer.shard` hashes `resolve(root, moduleId).slice(root.length)` (a truncation, not a relative path, for the `../../packages` files) and slices `calculateShardRange` (`coverage.DM_a_rWm.js:35-88`): a partition of one list whatever the keys, and CI's legs share one root and one SHA. Codex ran it on the selection: 1,062 files, 354 per leg, disjoint, unchanged by reversed order or a moved checkout. F2 `bun run --filter '!@nulo/extension'` excludes it (run locally: 17 workspaces, exit 0). F3 `bun run --filter` starts a workspace's script after its dependencies' (the CI log: the extension started at 11:56:07, one second after `aztec-runtime` ended); the split drops that ~58 s wait.
- **Inferences**: I1 the hash split stays near-balanced: on today's log, modelling a file as its reported test time plus 1.1 s, the three legs carry 663 / 673 / 545 worker-seconds against 627 for a time-based split, so at most ~25 s of wall. Phase 3 measures it. I2 the forecasts (network ~14 / ~16, smoke Firefox ~13.5, quick ~6 min) add ~85 s of fixed cost per shard to the record's file time.
- **Asks** (working assumption): A1 the unit legs are named `Vitest (shard i/3)`, matching the network suite's `(shard i/n)`.

## UI impact

None. CI only; no screen changes.

## Phases (arc A1)

**Phase 1: record and shape.** Steps 1–5 above. Gate: `bun run lint`; `bun run typecheck:all`; `bun run test:ci-gating`; `bun run test:release`; `bun run lint:actions`; `cd apps/extension && bun --bun vitest run scripts/e2e/shard-sequencer.test.ts`; `bun run check:plans` after staging.
**Phase 2: the unit inventory proof.** The soak runs above, `bun run test`, `bun run test:all`. Pass: counts stated here, union equal, disjoint, all green.
**Phase 3: review, PR, measure.** One Codex pass (below), fixes, then the draft PR and its runs; the table goes in the PR body and the Outcome.

## Post-implementation and delivery

Execution contract: this plan plus `implementations-plan/README.md` § Post-implementation standard at 6bab0009e, bounded-work variant: one Codex pass (`gpt-6.1-sol`, high, read-only) over this plan and `git diff origin/dev...HEAD`, adversarial on a file in no shard or two, a unit test or workspace dropped, an aggregator passing a failed or cancelled leg, a stale count, a caller changed by accident, a permission or event context moved, a measurement comparing unlike things; then targeted verification of material fixes. No local e2e run and no build: the PR's own runs are the measurement. PR title `ci: seven network shards, four smoke shards and a three-way unit test split`, opened as a draft without labels; it closes no issue. Close-out commits on the PR before its last push, then `git mv` into `archive/`.

## Decision ledger

- D1 vitest's own `--shard` on the extension suite over a recorded-time split: 1,059 files, the modelled gap is ~25 s of a ~4-minute leg (I1), and a time split needs a second record, a generator and a sequencer for the unit config.
- D2 the split lives in `_unit-tests.yml` for all three callers: one definition of the unit suite, and each caller still reads one `needs.unit-tests.result`. A PR-only split would be a second copy to drift.
- D3 the test-runtime bar: neither the engine bar (no Bun or runner change, the stopgap untouched) nor the same-engine dependency bar (no dependency moves). The split changes which job runs which file, so the inventory equality is the bar that applies.
- D4 one extra piece per leg, by step `if: matrix.shard == 'i/3'`, rather than a fourth job (the pick is three) or a shard of every workspace (`bun test` workspaces and one-file suites cannot be cut three ways). Node 24 setup unconditional in each leg, at today's place, rather than on legs 2 and 3 only: one condition fewer, the same runtime for every suite.
- D5 `--allow-escape-sequences` in `e2e-timings.ts`: without it the record cannot be refreshed with today's gh.
- D6 the README heading becomes `CI sharding`, so the count lives in the text it describes, not in an anchor four files link.
- D7 `shard-sequencer.test.ts` reads each lane's count from its workflow, so the proof follows the matrix.

## Audit verdicts

**Plan consult, Codex (`gpt-6.1-sol`, high, session `01a20ee6`): agree on D1 and D2, three changes.** All verified and adopted:
- C1 (none) the vitest split partitions the selection (its run, F1); F1's wording corrected; I1 is a model estimate, not a bound.
- C2 (none) `_unit-tests.yml` for all callers: they read `needs.unit-tests.result`, never leaf names; release-integrity's traversal still sees the job.
- C3 (medium) `test:ci-gating` spawns Node (`test-soak/cli.test.ts`), so leg 3 must get Node 24 too, not only leg 2: adopted as D4's unconditional setup.
- C4 (low) `verify-cert-run.sh`'s Quality and smoke names were hand-kept: now derived from the workflows and pinned.
- C5 (medium) compare statuses as well as ids, and scope "once" per suite invocation: adopted.
- C6 (low) comments: the unit job states why it stays unconditional; the rewritten step comments are cut to their guard. Its trims of untouched files (`shard-sequencer.ts`, `aggregators.test.ts`' header) are out of this change.

## Seeds (drafts, not run: the orchestrator owns execution)

```
/goal implementations-plan/ci-shards-1/plan.md phases 1–3 each with its gate green; one Codex pass verified; draft PR open with the before/after table; close-out commits pushed.
/loop 20m Drive implementations-plan/ci-shards-1 per plan.md: check STATUS.md and the PR's runs; never merge; stop when the PR carries two green runs per lane and the close-out.
```
