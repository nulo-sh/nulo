# ruleset-hygiene-1: recon

One Explore agent (sonnet) swept seven capabilities; the planner checked each claim it relied on. Base: `origin/dev` at 36c43155.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Outcome line validation | `scripts/ci-cd/plans/structure.ts:42` `OUTCOME_FIELDS` requires `Date:`, `Status:`, `Shipped:`/`Delivered:`, `Seeds retired:`; `outcomeState` (`:138-142`) tests `every` regex and reads no other line. No test pins the line set. | reuse as is: `Known limits:` is already accepted and optional; no gate change |
| Restated Post-implementation text in the gate | none: `no-over-engineering`, `comment-quality`, `Post-implementation` searched in `scripts/` and `.github/` (`*.ts`, `*.yml`, `*.sh`), zero hits | nothing to change |
| Link checking of moved docs | `scripts/ci-cd/plans/links.ts:34-40` `LIVE_DOCS` covers root `*.md`, `.claude/skills/**`, `.github/WORKFLOWS.md`; `resolveHref` (`:157-168`) drops `#fragment`, so only file existence is checked | reuse: the gate proves the skill's repo links resolve; anchors are checked by hand |
| A json report per network shard | `apps/extension/vite.shared.ts:77-95` adds vitest's `json` reporter only when `NULO_E2E_RESULTS_FILE` is set; `_extension-network-e2e.yml:264` sets it only for chaos and `canary*` lanes; `behavior-gating.test.ts:968` pins that expression exactly | no reuse for pool shards: see the plan's D1 |
| Json report parser | `scripts/ci-cd/assert-canary-results.ts` (`canaryProblems`, private `readReport`); reads no `startTime`/`endTime` | not needed (D1) |
| Step summary in the e2e job | one: "Assert presto activity" (`_extension-network-e2e.yml:393`) | — |
| Pins on the shard job | `behavior-gating.test.ts:955-979` finds steps by name; no step-count or order pin on the shard job (`aggregators.test.ts:48-49` pins only the aggregator jobs) | an appended step would pass the pins; the env change would not |
| Skill front matter | the four project skills carry `name` and `description` only | reuse the shape |
| Per-browser suite wall-clock | none in the repo; GitHub records each job's `startedAt`/`completedAt`: `gh run view <id> --attempt 1 --json jobs` over the jobs named `Run / …` of a first-attempt-green run gives 21 min (Chrome network, 38364426588), 23 min (Firefox network, 38373410977), 9 min (Chrome smoke, 38391403979); a rerun mixes attempts (38373410688: 50 min) | reuse: a documented one-liner, no script |
| E2E growth rule | none: CLAUDE.md, CI.md, the e2e skill, `tests/e2e/README.md`, `scripts/ci-cd` searched for `file count`, `wall-clock`, `new e2e`, `budget`; only descriptive counts (`CI.md:51`, 118 network files) | build new (docs) |

## References to the release runbook (`CLAUDE.md:555-751`, 31,874 bytes of 115,423)

- Anchors: `CLAUDE.md:541` `#staged-rollout-switches` (outside the runbook); `CLAUDE.md:553` `#release-runbook`; `CI.md:113` `#release-runbook` and `#after-a-stable-cut-promotes-to-main`. Every other anchor is inside the runbook and moves with it.
- Prose: `CLAUDE.md:41` (routing row), `CI.md:34`, `CI.md:91`, `CI.md:175`, `.github/workflows/release-prerelease.yml:16`, `.github/workflows/pr-extension-{smoke,network}-e2e-firefox.yml:1-2`, `apps/extension/tests/e2e/FIREFOX.md:84` ("root `CLAUDE.md`, staged-rollout switches"; found by the Codex audit), `scripts/release/auto-unstick-run.ts:124` (pinned only by `toContain("Troubleshooting")`, `auto-unstick-run.test.ts:215`), `scripts/release/open-sync-pr-run.ts:91` (no pin).
- Repo-relative links inside the runbook: four (`.github/workflows/release.yml`, `.github/release-please-config.json`, two archived plans); each needs `../../../` from `.claude/skills/release/`.
- One runbook sentence describes itself as "still living in CLAUDE.md" (`CLAUDE.md:559`).
- No test reads CLAUDE.md's text. Archived plans name the runbook in prose only, with no anchor.

## Path filters (what a touched file costs CI)

The four e2e PR workflows filter on `apps/extension/**`, `packages/*/src/**`, `patches/**`, their own workflow files and `_extension-{network,smoke}-e2e.yml`. `CLAUDE.md`, `CI.md`, `implementations-plan/**`, `.claude/skills/**`, `scripts/release/**` and `release-prerelease.yml` trigger no e2e lane; `apps/extension/**` (FIREFOX.md included) triggers all four. `_extension-network-e2e.yml` triggers both network lanes; each Firefox caller triggers its own lane.

## Collisions

- `ci-release-supply` (active): its runbook lines merged as #263 and its ignore shapes as #265 (its index line is stale); arc 5 is planned and may add runbook lines later, which then go to the skill. No open PR touches a file this lane edits (checked against #347 and #348).
- E2E file counts at base: smoke 55 (`git ls-files ':(glob)apps/extension/tests/e2e/*.test.ts'`), network 118. Without `:(glob)`, git's `*` crosses `/` and the smoke count reads 173.
- Labels: `known-limit` does not exist yet (`gh label list`).
- Open issues: no twin for any scope item (`gh issue list --state all --search` on runbook, known limits, e2e file count, step summary, proportion).
