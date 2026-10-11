# Owner asks: ci-followups-2

Two entries. Neither blocks the arc. The arc ships what you asked on 2026-10-11: nightly's Firefox jobs and both send-chaos runs gate the nightly release, and (OA-1) two fixed chaos seeds gate every network PR. No wallet screen changes.

## OA-1: run send-chaos on every PR? (measured) (closed)

**Answered: A, N = 2** (the owner, in chat, 2026-10-11: "a fixed-seed chaos replay becomes a required PR job if one replay measures under ten minutes"; measured 3.5-5.1 minutes). Built in plan.md Phase 3 (D-orch-2, D7-D14). The entry below is the question as it was asked.

**Surface.** The required PR network lanes (`extension-network-e2e-status` and its Firefox twin): what a network PR waits for before it can merge. No wallet screen changes.

**Today, and what ships now (option B).** Chaos runs only in the nightly, on both browsers, with a new seed each night. After this arc a red chaos night publishes no nightly. A red night is replayed through its logged seed, and "Re-run failed jobs" now replays the same seed. Both browsers now run the same seed each night (one action sequence explored per night instead of two), so a red on one browser only points at a browser difference.

**What it costs (five nightly runs, 2026-10-07 to 10-11; recon.md § Measurements).**

| | Chrome | Firefox |
|---|---|---|
| chaos job, wall time | 3.5-5.1 min (median 3.9) | 4.0-5.1 min (median 4.3) |
| of which the test (account setup + 8 seeded actions) | 125-141 s | 147-162 s |
| of which the seeded actions | 23-30 s | 28-41 s |
| the PR lane today: wall time / runner minutes | 16.7-20.0 min / 90-94 | 19.6-22.1 min / 102-109 |

All ten chaos runs (five nights, two browsers, ten different seeds) were green.

**Options.**
- **A. N fixed seeds as a required job in each PR network lane.** One job per seed per browser, beside the shards. Each job takes about 4-5 minutes, shorter than the lane's longest shard (16-22 minutes), so with free runners a PR waits no longer; the extra jobs queue for the same runners as the lanes (CI.md § Firefox lanes says so), so on a busy day they can add wait. Runner cost: about 4.5 minutes × N × 2 browsers per network PR; for N = 2, an estimated 18 more runner minutes on top of today's ~200 (+9 %), not yet observed on a PR. The parity pin makes the Firefox lane carry the same jobs. The test runs at retry 0, so a red job blocks the merge until it is fixed or proven a flake. One caveat: a seed fixes the actions, not their timing. A fixed seed replays the same eight actions, but two runs can still interleave them differently, so a timing-dependent red can appear on a PR that did not cause it. The nightly would keep exploring new seeds.
- **B (ships now). Nightly only.** No PR cost. A regression that only chaos catches is found the next night, before that night's nightly publishes, but after the PR merged.

**What each looks like to you.** A: network PRs show one or two more checks per browser; a chaos red on a PR names its seed. B: nothing changes on PRs; a chaos red shows up as a nightly that did not publish.

**What the record says.** Ten green runs are little evidence. Under a simple model (independent runs, one failure rate) they bound chaos's per-run failure rate only below about 26 % (95 % confidence), and runs across changing commits do not even fit that model. The repository's own promotion bar is to ship advisory, observe, then promote, with 30 consecutive green nightlies for the Firefox network lane on `main` (CLAUDE.md § Staged-rollout switches): a policy bar, not a proven reliability threshold. The count comes from the chaos jobs' own records, not from published nightlies, because a missing nightly can mean any red gate or a quiet day: `gh run list --workflow nightly.yml` and each run's `Run / chaos / sends` and `Firefox / Run / chaos / sends` conclusions. A night counts when both succeeded; a night where either was skipped or cancelled neither counts nor resets; a failure resets the count.

**Recommendation.** B now, and A with N = 2 once chaos has 30 consecutive green nights on both browsers, by the same bar the repository uses elsewhere. The panel split: Codex found A with N = 2 a reasonable choice today; Opus recommended waiting for the record. You can choose A at any time; it is built only on your answer.

## OA-2: the `main` Firefox-network flip (prepared, nothing run)

**Surface.** Branch protection on `main`: whether `extension-network-e2e-firefox-status` blocks a promote or release PR. Today it is advisory on `main` and required on `dev`. Nothing in this lane edits protection or a ruleset.

**What ships now.** Nothing changes on `main`. CLAUDE.md § Staged-rollout switches keeps its criterion: 30 consecutive green nightlies of the four `network-e2e-*-firefox` jobs, or earlier by your call.

**The runbook, for the day you choose** (needs a `gh` login with admin rights; run from the repository root):

```bash
# 1. Snapshot the live protection and review it: strict true, and exactly quality-status,
#    extension-network-e2e-status, extension-smoke-e2e-status and extension-smoke-e2e-firefox-status,
#    each with app_id 15368 (GitHub Actions).
scripts/ci-cd/required-checks.sh print --branch main --json > ~/main-checks.json

# 2. Add the Firefox network aggregator. It refuses if the live protection differs from the
#    snapshot (a check of drift since your review, not an atomic compare-and-swap with the write),
#    touches only required_status_checks, verifies the write and prints a rollback.
scripts/ci-cd/required-checks.sh --add extension-network-e2e-firefox-status --branch main --expect ~/main-checks.json

# 3. Read it back: five checks.
scripts/ci-cd/required-checks.sh print --branch main
```

**Docs to change in the PR that records the flip** (they say advisory on `main` today): `CLAUDE.md` § Branching (the "`main` requires four status gates" sentence), § Account-address freeze (the canary bullet), § Quality gates (the Firefox aggregators bullet) and the § Staged-rollout switches row; `CI.md` § Firefox lanes and § Check names; `apps/extension/tests/e2e/FIREFOX.md` § CI; `.github/WORKFLOWS.md` (the `pr-extension-network-e2e-firefox.yml` row's "Required on" column); the header of `.github/workflows/pr-extension-network-e2e-firefox.yml`; `.claude/skills/aztec-update/SKILL.md` (the two "advisory" lines).

**Recommendation.** None needed now. Flip when you are satisfied with the Firefox network lane's record; from this arc on, a nightly that published is also a night on which every Firefox network job was green.
