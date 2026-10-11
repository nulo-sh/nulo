# Recon: ci-followups-2

Base: `origin/dev` at 27af8d7. One Explore agent (sonnet) swept the capabilities below; the driver read `nightly.yml`, the pins, the docs and the nightly run logs directly. Line numbers are at the base.

## Reuse map

| Capability needed | Existing code | Verdict |
|---|---|---|
| Fail-closed publish gate that enumerates `== 'success'` per need | `nightly.yml:486-518` (`publish-nightly`), pinned generically by `behavior-gating.test.ts:913-917` | reuse-as-is: add the seven needs and their clauses. The textual pin is superseded by the executed one (plan D2) |
| Aggregator loop that tests exactly its needs | `nightly.yml:604-645` (`status`), pinned by `behavior-gating.test.ts:903-911` (`resultsTested`) | reuse-as-is: add the seven needs and loop operands. The textual pin is superseded by the executed one (plan D2) |
| A pin that nightly's Firefox jobs gate nothing | `behavior-gating.test.ts:611-637` (`waitsOnFirefox`, nightly half at :621-624) | delete the nightly half (the `release.yml` half stays); the exact set in `aggregators.test.ts` replaces it (plan D2) |
| A pin that chaos gates nothing | `behavior-gating.test.ts:849-875` (gate half at :867-874) | delete the gate half ("chaos runs only in nightly" stays); the exact set replaces it (plan D2) |
| "Every job is a need or advisory by name" exact set, and running an aggregator's own script | `aggregators.test.ts:37-38, :53, :205-210` (exact set), `:70-80` (`exitCode()` substitutes inline `${{ }}` from a world and runs the script), used for `pr-quick.yml`, `actionlint.yml`, `release.yml` and the smoke lanes | reuse-as-is for nightly's `status` and `publish-nightly` (plan D2). The recon agent first judged it "new machinery"; only `CASES`' `env:`-binding assertion does not fit nightly's inline script, and the plan does not use it |
| Helpers for the rewritten pins | `behavior-gating.test.ts`: `workflow`, `words`, `waitsOnFirefox` (`describe("Firefox lanes")`, :525-637); `laneJobs`, `LANES`, `resultsTested` (`describe("canary lanes")`, :705-917) | reuse-as-is inside their blocks |
| Seed plumbing for the chaos run | `nightly.yml:59-63` (`chaos_seed` input), `:259`, `:381`; `_extension-network-e2e.yml:95-98, :141` (`NULO_E2E_CHAOS_SEED`); `send-chaos.test.ts:135` | adapt: the two caller expressions only (plan D3) |
| Repointing a branch's required checks | `scripts/ci-cd/required-checks.sh` / `.ts` (`print --json`, `--add … --expect`) | reuse-as-is for the owner's `main` runbook; nothing in this lane runs it |
| Measuring chaos cost | `gh run view` job timings and job logs of the five nightly runs since the chaos job landed | reuse-as-is (no local run: a host shared by four other leads would time the host, not the CI runner) |

## Pins that change

- `scripts/ci-cd/behavior-gating.test.ts:623`: `expect(nightly.waiting, "nightly.yml: nothing waits on a Firefox job").toEqual({})`. Breaks; the test title (:611) and the block comment (:519-523, "nightly jobs advisory") change with it.
- `scripts/ci-cd/behavior-gating.test.ts:867-874`: `needs.filter((need) => need.includes("chaos"))` must equal `[]` for `publish-nightly` and `status`. Breaks; the title (:851) and comment (:849-850) change with it.
- Textual and defeatable (an `exit 0` in the loop or `|| true` in the `if:` passes them): `:903-917` (status loop references its needs; publish `if:` contains `success` per need). The plan moves their nightly parts into `aggregators.test.ts`, which runs the gate. Scale without edits: `:639-648` (Firefox jobs mirror Chrome), `:779-797` (nightly runs the PR lane's jobs; filters chaos out). `release-integrity.test.ts:325-344` (`notesJobFindings`) reads only `nightly-notes`.
- `aggregators.test.ts` never reads `nightly.yml` (`grep -n nightly scripts/ci-cd/aggregators.test.ts`: no hit).

## Docs that state the advisory shape

- `.github/workflows/nightly.yml:13-23` (Flow header), `:245-247` (chaos "a lead, not a gate"), `:341-345` ("ADVISORY Firefox lanes").
- `CLAUDE.md:538` ("`nightly.yml` carries advisory Firefox jobs too"; the pin sentence naming only `release.yml`'s waiters), `:539` ("its seeded chaos run advisory").
- `CI.md:89` (nightly's Firefox jobs "outside every aggregator's and publish step's `needs`"; the pin sentence), `:126` ("The seeded `send-chaos` run, `dup-trend`, `rp-host-live` and the Firefox jobs gate nothing"), `:127` (flake policy omits chaos's own retry 0).
- `apps/extension/tests/e2e/FIREFOX.md:84` ("the nightly Firefox jobs stay advisory"; "no Firefox job is in the `needs` of an aggregator or publish step, except …").
- `.claude/skills/e2e-testing/SKILL.md:228-230` (nightly "publishes a prerelease on full green": true, but silent on Firefox and chaos).
- `.claude/skills/e2e-testing/SKILL.md:200-201` (nightly's retry policy, silent on chaos's retry 0); `CI.md:89` ("A red advisory job still turns the *run* red"); `.github/WORKFLOWS.md:23` (the nightly row's gate column). Found by the panel, not the sweep.
- Stay as they are: `nightly.yml:261-264` (`dup-trend`), `:278-281` (`rp-host-live`); `CLAUDE.md:111`, `.claude/skills/aztec-update/SKILL.md:136, :145` and `pr-extension-network-e2e-firefox.yml:1` (all about the PR lane's status on `main`); `CLAUDE.md:744` (the owner's flip criterion for `main`, unchanged in meaning).
- Search trail: `grep -rn -i "advisory\|gate nothing\|gates nothing\|absent from\|not a gate\|a lead, not\|staged-rollout"` over `*.md`, `*.yml`, `*.ts`, `*.sh`, filtered by `firefox|chaos|nightly`; `grep -n -i "nightly\|chaos"` on `SECURITY.md`, `ARCHITECTURE.md`, `apps/extension/tests/e2e/README.md`, `.github/WORKFLOWS.md` and every `.claude/skills/*/SKILL.md` found nothing else to change.

## Measurements (nightly runs 37607270016, 37765624647, 37919470569, 38043372938, 38130969762; 2026-10-07 to 2026-10-11)

| Job | Chrome | Firefox |
|---|---|---|
| chaos job, wall | 3.5-5.1 min (median 3.9) | 4.0-5.1 min (median 4.3) |
| chaos test (fixture + seeded actions) | 125-141 s | 147-162 s |
| seeded actions only (seed log to test end) | 23-30 s | 28-41 s |
| smoke against the artifact (four nights; both skipped on 10-10) | 16.0-21.0 min | 24.8-28.7 min |
| longest network shard (4/5) | 16.0-22.0 min | 19.6-22.0 min |

- Chaos was green on every one of the ten runs (5 nights, 2 browsers), each with a fresh random seed. Every Firefox job that ran was green; on 10-10 both smokes were skipped behind the red `unit-tests`. The three red nights (10-09 `publish-nightly`, 10-10 `unit-tests`, 10-11 Chrome `smoke-against-artifact`) were red on gates that already block, so gating Firefox and chaos would have changed no night in this window.
- PR network lane, four green runs on 2026-10-11: Chrome wall 16.7-20.0 min, 8 suite jobs, 89.6-94.3 runner-minutes; Firefox wall 19.6-22.1 min, 102.4-109.1 runner-minutes.
- The `burstTest` fixture is file-scoped (`fixtures/burst-account.ts:84-121`): it funds and imports an account, deploys ALT and makes five mined sends before the seeded actions start, so it is about four fifths of the test's time.

## Open work and collisions

- **#220** is labelled `lane:send-queue-activity`, and its Pickup names that lane's arc 4. `implementations-plan/send-queue-activity/plan.md:216-221, :647-649` (Phase 4.2) plans an "advisory by default, eligible after 30 green nightlies" row for the chaos jobs, and its `recon.md:36, :54` reuses the pins this lane inverts. The owner's 2026-10-11 call moves #220 here and supersedes that row: send-queue-activity's Phase 4.2 has to drop #220. That is the orchestrator's edit; this lane does not touch another lane's plan.
- **ci-release-supply** `plan.md:107, :393, :460, :497` say "no advisory job (nightly's chaos, Firefox, `dup-trend`, `rp-host-live`) enters any gate". Its D18 (`:485`) closed the per-leg check without a `network-e2e-legs` job, so no job of it lands in `nightly.yml` from arc 1. Its arc 5 (#178, waits on page 5) adds `prune-nightlies` after `publish-nightly` and to `status`'s list: a textual conflict in `status`, resolved by whichever lands second. This plan's exact set takes arc 5's extra `status` need by itself, and `publish-nightly`'s needs exclude it by structure (plan D2; modelled by the Codex leg).
- **e2e-harness-gaps** `recon.md:60` holds `nightly.yml` ahead of ci-release-supply; its open PR #293, and #271, touch none of this lane's files (`gh pr view <n> --json files`).
- #251 and #195 (`owner-decision`, page 5) are out of this lane by the brief.
