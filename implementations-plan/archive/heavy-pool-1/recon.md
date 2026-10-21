# heavy-pool-1: recon

One Sonnet sweep plus the planner's own reads and CI pulls, at `origin/dev` 8663cdd15. The numbers are in [plan.md § Measurement](plan.md#measurement).

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Split by recorded time | `assignShards` and `shardSequencer` (`apps/extension/tests/e2e/shard-sequencer.ts:26-59`). A file the record lacks goes last, onto the lightest shard, at the record's median cost (`:35-39`). | reuse as-is |
| The record | `apps/extension/tests/e2e/shard-timings.json` (generated 2026-10-20) holds the 121 pool files per browser. It holds no dedicated file: `snack-placement` and `failed-send-check` are absent. | regenerate, never edit |
| The generator | `scripts/ci-cd/e2e-timings.ts`. It reads only jobs matching `SHARD_JOB = /^Run \/ shard (\d+)\/(\d+) \//` (`:33`, `:136-142`), so a file that ran only in `Run / heavy / …` never gets a cost. `parseJobLog` and `runCosts` (`:69-103`) are job-agnostic; `runCosts` drops a run that names a file in two jobs. | adapt: widen the job filter to the proverless `Run / heavy / …` jobs; canary is prover-ON and the chaos file runs twice, so both stay out |
| Measuring a run | the e2e-testing skill's envelope one-liner (`.claude/skills/e2e-testing/SKILL.md:270-281`); shard-balance-1's method (`implementations-plan/archive/shard-balance-1/lessons/phase-5.md`). | reuse the method; the collector stays a scratch script outside the repo |
| The lane's partition | `.github/workflows/_extension-network-e2e-lane.yml`: the pool's `exclude_files` (`:63`) and the `network-e2e-heavy-long` job (`:94-105`, its comment `:94-95`). | edit only if the fold ships |
| Pins | `scripts/ci-cd/behavior-gating.test.ts:1069-1074` (pool `exclude_files` == union of every dedicated `test_files`); `:294-306` (`verify-cert-run.sh`'s `EXPECTED_NETWORK_JOBS` == the jobs the PR lane produces). Neither names heavy-long. `apps/extension/scripts/e2e/shard-sequencer.test.ts:26-33` reads `exclude_files` from the lane file. | keep untouched; they stay green when both sides move together |
| Cert job list | `scripts/ci-cd/verify-cert-run.sh:50-62`: 11 names, heavy-long's at `:58`, and a comment "5 sharded jobs + 3 heavies" (`:45`). | edit only if the fold ships |

Absence trail: `heavy-long|heavy / snack|snack-placement|failed-send-check|network-e2e-heavy|exclude_files|test_files` over `.github/`, `scripts/`, `CI.md`, `apps/extension/tests/e2e/*.md`, `apps/extension/scripts/e2e/`, `.claude/skills/`, `ARCHITECTURE.md`, `CLAUDE.md`, `SECURITY.md`. `nightly.yml`, `release.yml` and the soak name no lane job; the soak passes its own `test_files`.

## Docs that describe heavy-long (edit only if the fold ships, except where noted)

- `CI.md:52`: "less the twelve files…" and the heavy-long sentence (its reason; a docs-only close rewrites the reason).
- `CI.md:104`: "eleven suite jobs" per browser. `CI.md:133`: "3 heavy jobs". `.github/WORKFLOWS.md:15`: "3 heavy jobs".
- `apps/extension/tests/e2e/README.md:210` ("the twelve with a dedicated job" and the list) and `:217` (the heavy-long reason; a docs-only close rewrites it).
- `.claude/skills/e2e-testing/SKILL.md:233-236`: "the 12 dedicated files", "three heavy lanes" and the list.
- The lane's comment at `_extension-network-e2e-lane.yml:94-95` (the reason; a docs-only close rewrites it).

## Why each dedicated proverless job exists

- **heavy-long** (#433, 2a518c37f): vitest's SHA-1 split put `snack-placement` and `failed-send-check` on one shard, which reached the 30-minute job limit with every test green. Wall time only; the files ran in the pool before. Neither file assumes a fresh sandbox: no `describe.sequential`, no cold-start comment. Both use `accounts[0]` and `finalizeThrough` (`fixtures/aztec.ts:870`), which mines empty L1 blocks on the shard's anvil; it only advances finality. `failed-send-check` sets `{ timeout: 600_000, retry: 0 }` (`:198`, `:313`); `snack-placement` 420, 300 and 480 s.
- **heavy** (`fee-methods` + `selfpay-phase`, lane `:66-68`): a prover queue that pushed the next file past its `waitForPgResult` budgets, and serialized L1 dev-key bridges. The job is proverless now, and #996 gave the bridge fixtures their own anvil account; neither reason is proven obsolete.
- **heavy-concurrent** (`concurrent-sendtx-confirm` + `same-token-concurrent-sends`, lane `:80-82`): `same-token-concurrent-sends` holds the node's block production (`fixtures/mining-hold.ts`), which every file of a shard shares; the pin at `behavior-gating.test.ts:1076-1090` keeps it dedicated. `concurrent-sendtx-confirm` holds T1 at `proving`, away from `fee-methods`' queue. Live.

## Limits

- `timeout-minutes: 30` per job (`_extension-network-e2e.yml:115`). The stall watchdog fails a test silent for 10 minutes (`apps/extension/tests/e2e/run-limits.ts`, `STALL_MS`), sized at twice `failed-send-check`'s 150 s record watch. `fileParallelism: false` (`apps/extension/vite.shared.ts:134`): a shard runs its files one at a time on one sandbox.

## Collisions and closed history

- #1003 (e2e-fixed-cost-1, open) edits `fixtures/extension.ts`, `fixtures/wallet-pages.ts` and the e2e-testing skill. It shortens per-file time, so the measurement pins both arms to one base. A docs edit to the skill merges `dev` first.
- Closed known limits in the area: #977 (a dispatch that sees a push mid-run can split its shards on two records), #990 (node-side levers, measured elsewhere). Closed #410 (shard 4 near its limit). No open issue but #972 covers the fold.
- The repository is public on the Team plan (60 concurrent standard jobs).
