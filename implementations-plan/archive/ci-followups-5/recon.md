# ci-followups-5 recon

Base `116974dc` (origin/dev when the worktree was cut; dev has since gained `479ba56d`, the Aztec rc.3 bump, which touches none of the files below except `implementations-plan/index.md`). One Sonnet explorer ran the reuse sweep; the planner verified every claim it relied on, and two external facts against the pinned sources.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| A write-scoped job that runs nothing it fetched (no action, no checkout, inputs through `env:`, fork and Dependabot guard) | `.github/workflows/pr-supersede.yml` (whole file); its shape pinned at `scripts/ci-cd/behavior-gating.test.ts:190-213` | adapt: the new workflow copies the shape, not the file |
| List a workflow's runs for one head and one pull request | `pr-supersede.yml:86-100` lists by branch and status and keeps `any(.pull_requests[]?; .number == $pr)`; `scripts/ci-cd/verify-cert-run.sh:90` lists by `head_sha` | adapt: `GET actions/workflows/<file>/runs` with `event=pull_request` and `head_sha`, the same PR filter, highest `id` |
| Cancel a run | `pr-supersede.yml:104-120` (POST `/cancel`, HTTP 409 = already finished) | adapt |
| Wait for a run to complete; re-run a run | none: searched `gh run (watch\|rerun)`, `/rerun`, `force-cancel`, `run_attempt` over `.github scripts .claude/skills CI.md SECURITY.md`; only prose in `.claude/skills/{aztec-update,e2e-testing}/SKILL.md` | build new |
| `gh api` with one retry on 403, 429, 5xx or no HTTP code | two unshared copies: `scripts/ci-cd/live-labels.sh:14-32`, `pr-supersede.yml:45-60` | adapt (copy inline; see plan D2) |
| Run a step's inline script under a fake `gh` | `scripts/ci-cd/supersede.test.ts:46-113` (shim + `sweep()`, local to the file); different harnesses at `aggregators.test.ts:61-80`, `nightly-resolve.test.ts:56` | adapt: extract the shim runner from `supersede.test.ts` into a helper both tests use (plan D7) |
| Pins on `actions: write` | `behavior-gating.test.ts:215-224` allows only `pr-supersede.yml`; `:188` comment "The one job in the repository that may cancel runs" | adapt |
| The four lane files as one list | `behavior-gating.test.ts:242-247` (`LANES`, inside `describe("live labels")`); `AGGREGATOR_CHECKS` at `:90-96` adds `pr-quick.yml` | reuse `LANES` (hoisted to module scope) |
| Test and lint wiring | `package.json:32` `test:ci-gating` = `bun test scripts/ci-cd/` (picks up any new `*.test.ts`); `:24` `lint:actions` = `actionlint`, no config file | reuse as is |

## Facts the plan rests on

1. The four lanes subscribe to `opened, reopened, synchronize, labeled, unlabeled, ready_for_review` (`pr-extension-smoke-e2e.yml:13`, `-smoke-e2e-firefox.yml:8`, `-network-e2e.yml:19`, `-network-e2e-firefox.yml:14`); `pr-quick.yml:30` adds no label types; no workflow subscribes to `edited` (`grep -n edited .github/workflows/*.yml`: comments only).
2. Each lane's `Detect changes` runs `scripts/ci-cd/live-labels.sh`, which reads `.base.ref` from `repos/$REPO/pulls/$PR` (live) and writes `base` and `read-attempt=$GITHUB_RUN_ATTEMPT`; `Decide` reads only `needs.changes.outputs.base` and force-runs on `main` (`pr-extension-smoke-e2e.yml:107-141`); the aggregator refuses a skip read in another attempt (`:194-197`). So "Re-run all jobs" re-decides on the live base.
3. `dorny/paths-filter` at the pinned `ceb8a2b8` takes changed files from `pulls.listFiles` (live) on a `pull_request` event when a token is set (`src/main.ts:93-107`), and its `token` defaults to `github.token` (`action.yml:5-8`); no lane overrides it. The explorer's "stale paths filter on re-run" claim does not hold.
4. A re-run keeps its original event payload. `pr-quick.yml` reads the base from it (`commitlint` `BASE_REF: github.base_ref` at `:197`, `launch-legal`'s `if` at `:367`, the aggregator's `BASE_REF` at `:395`, `audit-mode`'s `base.sha` at `:153`), so re-running `pr-quick.yml` re-decides nothing; `pr-quick.yml:362-364` already says auto-unstick repeats `launch-legal`.
5. A cancelled run still runs its `if: always()` aggregator (`CI.md:102`, lessons "always() also runs after a cancel"). It posts FAILURE when `Detect changes`, `Decide` or a suite was cancelled, but the skip's success when only the aggregator was left (`pr-extension-smoke-e2e.yml:170-205`: no cancellation check); a run cancelled while waiting in its group posts nothing (`CI.md:100`).
6. The lanes queue per pull request and head; "a re-run replaces the waiting run" (`CI.md:100`).
7. No pull request in the repository's history came from a fork (`gh pr list --state all --limit 500 --json isCrossRepository`: 0).
8. Closed known limits in the area: #375 (pr-supersede's cancel race on a force-push rewind); none on retarget.

## Docs that change

- `CI.md:104` "A retarget still starts no run (...); close and reopen the pull request, or push, to re-decide on the new base." False for the lanes once the job lands.
- `.github/WORKFLOWS.md:16`, `behavior-gating.test.ts:188`, `supersede.test.ts:2`: "the one (job | script) with `actions: write`". (`CI.md:102` says "The job holds", about supersede alone, and stays.)
- `.github/WORKFLOWS.md` triggers cheat-sheet (`:53-62`): no retarget line.
- Still true, unchanged: `pr-quick.yml:24-29` (its own gap), `pr-quick.yml:362-364`, `CI.md:35`, `CI.md:48`.

## Collisions

- No open issue besides #251 touches these files (`gh issue list --label ci`: #405, #382, #21, #251).
- `workflow-refs.test.ts` refuses review-provenance words in `.github/**` comments.
